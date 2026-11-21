// Which addresses may a connection be made to. The inventory stores whatever an administrator typed; before the API
// connects it asks this module, so that a server entry cannot be used to reach the host the API itself runs on, the
// cloud metadata service or a link-local interface (SSRF, `05-security.md` section 7).
//
// The check is a pure function of the text. A host NAME can still resolve to a forbidden address, so the caller
// either uses `resolveTargetAddress` (resolve, check every answer, connect to the checked address: the pinned host
// key then proves who answers) or refuses names. Private ranges (RFC 1918, unique local, shared address space) are
// allowed by default because the fleet usually lives there; loopback, link-local and metadata addresses are not.

import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

import { SshInputError } from './errors.js';

export type AddressKind =
  | 'public'
  | 'private'
  | 'documentation'
  | 'loopback'
  | 'link_local'
  | 'metadata'
  | 'unspecified'
  | 'multicast'
  | 'reserved'
  | 'hostname'
  | 'invalid';

export interface TargetAddressPolicy {
  /** Allow 127.0.0.0/8, ::1 and `localhost`. Default false. */
  allowLoopback?: boolean;
  /** Allow 169.254.0.0/16 and fe80::/10 (the metadata addresses are separate). Default false. */
  allowLinkLocal?: boolean;
  /** Allow the cloud metadata addresses (169.254.169.254, fd00:ec2::254, 100.100.100.200, ...). Default false. */
  allowMetadata?: boolean;
  /** Allow RFC 1918, 100.64.0.0/10 and fc00::/7. Default true; set false for a fleet that must be on public addresses. */
  allowPrivate?: boolean;
  /** Allow host names (which this function cannot resolve). Default true. */
  allowHostnames?: boolean;
}

export type TargetAddressCheck =
  | { allowed: true; kind: AddressKind; address: string }
  | { allowed: false; kind: AddressKind; address: string; reason: string };

const METADATA_NAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
]);
const LOOPBACK_NAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);
const HOSTNAME_LABEL = /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/u;

function inCidr4(value: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function ipv4ToNumber(address: string): number {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  return (
    (((parts[0] ?? 0) << 24) |
      ((parts[1] ?? 0) << 16) |
      ((parts[2] ?? 0) << 8) |
      (parts[3] ?? 0)) >>>
    0
  );
}

function classify4(address: string): AddressKind {
  const value = ipv4ToNumber(address);
  const is = (base: string, bits: number): boolean => inCidr4(value, ipv4ToNumber(base), bits);
  if (
    value === ipv4ToNumber('169.254.169.254') ||
    value === ipv4ToNumber('100.100.100.200') ||
    value === ipv4ToNumber('192.0.0.192')
  ) {
    return 'metadata';
  }
  if (is('0.0.0.0', 8)) return 'unspecified';
  if (is('127.0.0.0', 8)) return 'loopback';
  if (is('169.254.0.0', 16)) return 'link_local';
  if (is('10.0.0.0', 8) || is('172.16.0.0', 12) || is('192.168.0.0', 16) || is('100.64.0.0', 10))
    return 'private';
  if (is('224.0.0.0', 4)) return 'multicast';
  if (is('240.0.0.0', 4)) return 'reserved';
  if (is('192.0.0.0', 24) || is('198.18.0.0', 15)) return 'reserved';
  if (is('192.0.2.0', 24) || is('198.51.100.0', 24) || is('203.0.113.0', 24))
    return 'documentation';
  return 'public';
}

/** Expands an IPv6 literal to eight 16-bit groups, or undefined when it is not one. */
function groups6(address: string): number[] | undefined {
  let text = address;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/u.exec(text)?.[1];
  if (dotted !== undefined) {
    if (!isIPv4(dotted)) return undefined;
    const value = ipv4ToNumber(dotted);
    text = `${text.slice(0, text.length - dotted.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const parse = (part: string): number[] | undefined => {
    if (part === '') return [];
    const out: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/iu.test(group)) return undefined;
      out.push(Number.parseInt(group, 16));
    }
    return out;
  };
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  if (head === undefined || tail === undefined) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return undefined;
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function embeddedV4(high: number, low: number): string {
  return `${String(high >> 8)}.${String(high & 0xff)}.${String(low >> 8)}.${String(low & 0xff)}`;
}

function classify6(groups: readonly number[]): AddressKind {
  const g = (index: number): number => groups[index] ?? 0;
  const firstFiveZero = g(0) === 0 && g(1) === 0 && g(2) === 0 && g(3) === 0 && g(4) === 0;
  if (firstFiveZero && g(5) === 0 && g(6) === 0 && g(7) === 0) return 'unspecified';
  if (firstFiveZero && g(5) === 0 && g(6) === 0 && g(7) === 1) return 'loopback';
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address.
  if (firstFiveZero && (g(5) === 0xffff || g(5) === 0)) return classify4(embeddedV4(g(6), g(7)));
  if (g(0) === 0x64 && g(1) === 0xff9b && g(2) === 0 && g(3) === 0 && g(4) === 0 && g(5) === 0) {
    return classify4(embeddedV4(g(6), g(7)));
  }
  if (
    g(0) === 0xfd00 &&
    g(1) === 0x0ec2 &&
    g(2) === 0 &&
    g(3) === 0 &&
    g(4) === 0 &&
    g(5) === 0 &&
    g(6) === 0 &&
    g(7) === 0x254
  ) {
    return 'metadata';
  }
  if ((g(0) & 0xffc0) === 0xfe80) return 'link_local';
  if ((g(0) & 0xfe00) === 0xfc00) return 'private';
  if ((g(0) & 0xff00) === 0xff00) return 'multicast';
  if (g(0) === 0x2001 && g(1) === 0x0db8) return 'documentation';
  return 'public';
}

/** What an address or host name is. Pure: it does no resolution. */
export function classifyAddress(host: string): AddressKind {
  let text = host.trim();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  if (text.length === 0 || text.length > 253) return 'invalid';
  if (isIPv4(text)) return classify4(text);
  if (text.includes(':')) {
    if (!isIPv6(text)) return 'invalid';
    const groups = groups6(text);
    return groups === undefined ? 'invalid' : classify6(groups);
  }
  const name = text.toLowerCase().replace(/\.$/u, '');
  // The system resolver also accepts shorthand numbers ("127.1", "2130706433", "0x7f.1"): a name made only of
  // decimal or 0x-hex numbers separated by dots, that is not a canonical dotted quad, is refused whatever address
  // it would mean.
  if (/^(0x[0-9a-f]+|[0-9]+)(\.(0x[0-9a-f]+|[0-9]+))*$/iu.test(name)) return 'invalid';
  if (LOOPBACK_NAMES.has(name) || name.endsWith('.localhost')) return 'loopback';
  if (METADATA_NAMES.has(name)) return 'metadata';
  const labels = name.split('.');
  if (!labels.every((label) => HOSTNAME_LABEL.test(label))) return 'invalid';
  return 'hostname';
}

const DESCRIPTION: Partial<Record<AddressKind, string>> = {
  loopback: 'a loopback address (the host Swellwright itself runs on)',
  link_local: 'a link-local address',
  metadata: 'a cloud metadata address',
  unspecified: 'an unspecified address',
  multicast: 'a multicast address',
  reserved: 'a reserved address',
  invalid: 'not a valid host name or IP address (or an ambiguous numeric form)',
  private: 'a private address, which this installation does not allow',
  hostname: 'a host name, which this installation does not allow',
};

/**
 * Judges the address of a connection target before anything connects. Loopback, link-local and metadata addresses,
 * unspecified, multicast and reserved addresses and malformed or ambiguous input are refused unless the policy
 * allows the first three; private ranges and host names are allowed unless the policy says otherwise.
 */
export function validateTargetAddress(
  host: string,
  policy: TargetAddressPolicy = {},
): TargetAddressCheck {
  const kind = classifyAddress(host);
  const allowed = ((): boolean => {
    switch (kind) {
      case 'public':
      case 'documentation':
        return true;
      case 'private':
        return policy.allowPrivate ?? true;
      case 'hostname':
        return policy.allowHostnames ?? true;
      case 'loopback':
        return policy.allowLoopback ?? false;
      case 'link_local':
        return policy.allowLinkLocal ?? false;
      case 'metadata':
        return policy.allowMetadata ?? false;
      default:
        return false;
    }
  })();
  if (allowed) return { allowed: true, kind, address: host };
  return {
    allowed: false,
    kind,
    address: host,
    reason: `The address is ${DESCRIPTION[kind] ?? kind}.`,
  };
}

/** Like `validateTargetAddress` but throws `SshInputError`. */
export function assertTargetAddress(host: string, policy: TargetAddressPolicy = {}): void {
  const check = validateTargetAddress(host, policy);
  if (!check.allowed) throw new SshInputError(check.reason);
}

export interface ResolvedTarget {
  /** An address that passed the policy: connect to this, not to the name, so that the answer cannot change. */
  address: string;
  /** Every address the name resolved to (all of them passed). */
  addresses: string[];
}

/**
 * Resolves a host name, checks every address it resolves to, and returns one to connect to. A literal address is
 * only checked. If any answer is forbidden the whole name is refused, so a name that resolves to both a public and
 * an internal address is not usable. Connect to `address` and keep the pinned host key: that is what proves who
 * answers.
 */
export async function resolveTargetAddress(
  host: string,
  policy: TargetAddressPolicy = {},
): Promise<ResolvedTarget> {
  assertTargetAddress(host, policy);
  const kind = classifyAddress(host);
  if (kind !== 'hostname' && kind !== 'loopback' && kind !== 'metadata') {
    return { address: host.replace(/^\[|\]$/gu, ''), addresses: [host.replace(/^\[|\]$/gu, '')] };
  }
  let answers: { address: string }[];
  try {
    answers = await lookup(host.trim().replace(/\.$/u, ''), { all: true, order: 'verbatim' });
  } catch (error) {
    throw new SshInputError(
      `The host name cannot be resolved (${(error as { code?: string }).code ?? 'unknown error'}).`,
    );
  }
  if (answers.length === 0) throw new SshInputError('The host name resolves to no address.');
  for (const answer of answers)
    assertTargetAddress(answer.address, { ...policy, allowHostnames: false });
  const addresses = answers.map((answer) => answer.address);
  const first = addresses[0];
  if (first === undefined) throw new SshInputError('The host name resolves to no address.');
  return { address: first, addresses };
}
