import { BlockList, isIP } from 'node:net';

/** `::ffff:203.0.113.9` is the IPv4 address 203.0.113.9 as an IPv6 socket reports it; a zone (`%eth0`) is dropped. */
function normalize(address: string): string {
  const bare = (address.split('%')[0] ?? address).toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(bare);
  return mapped?.[1] ?? bare;
}

const typeOf = (family: number): 'ipv4' | 'ipv6' => (family === 4 ? 'ipv4' : 'ipv6');

/**
 * Whether an address is inside any of the ranges (`203.0.113.0/24`, `2001:db8::/32` or a single address). No
 * ranges means no restriction. An address that is not an address, or an unknown one, is outside every range.
 */
export function ipInRanges(address: string | undefined, ranges: readonly string[]): boolean {
  if (ranges.length === 0) {
    return true;
  }
  if (!address) {
    return false;
  }
  const ip = normalize(address);
  const family = isIP(ip);
  if (family === 0) {
    return false;
  }
  const list = new BlockList();
  for (const range of ranges) {
    const [base = '', prefix] = range.split('/');
    const baseFamily = isIP(base);
    if (baseFamily === 0) {
      continue;
    }
    if (prefix === undefined) {
      list.addAddress(base, typeOf(baseFamily));
    } else {
      list.addSubnet(base, Number(prefix), typeOf(baseFamily));
    }
  }
  return list.check(ip, typeOf(family));
}
