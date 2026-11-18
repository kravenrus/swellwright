import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIPv4, isIPv6 } from 'node:net';

import { PLUGIN_LIMITS, type PluginFetchInit } from '@swellwright/plugin-api';

/** An answer the plugin gets: text, with the headers in lower case. */
export interface NetworkResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** Why the core refused a request, in words the plugin author can act on. It reaches the plugin as an error. */
export class NetworkRefused extends Error {
  constructor(
    message: string,
    readonly reason: 'not_allowed' | 'address' | 'invalid' | 'limit',
  ) {
    super(message);
    this.name = 'NetworkRefused';
  }
}

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'expect',
]);

const REQUEST_TIMEOUT_MS = 15_000;

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

/** The parts of an IPv4 address, or undefined if it is not one. */
function octets(address: string): number[] | undefined {
  if (!isIPv4(address)) {
    return undefined;
  }
  return address.split('.').map(Number);
}

/**
 * True for an address a plugin may be sent to: a public one. Everything that is local, private, shared,
 * reserved or for documentation is refused, so a plugin cannot be used to reach the network the core sits in.
 */
export function isPublicAddress(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(lower);
  if (mapped?.[1] !== undefined) {
    return isPublicAddress(mapped[1]);
  }
  const v4 = octets(lower);
  if (v4 !== undefined) {
    const [a = 0, b = 0, c = 0] = v4;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (!isIPv6(lower)) {
    return false;
  }
  const first = Number.parseInt(lower.split(':')[0] || '0', 16);
  return !(
    lower === '::' ||
    lower === '::1' ||
    (first & 0xfe00) === 0xfc00 || // fc00::/7, unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10, link local
    (first & 0xff00) === 0xff00 || // ff00::/8, multicast
    lower.startsWith('2001:db8:') // documentation
  );
}

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/** What the transport is asked to do, after every rule has been applied. */
export interface TransportRequest {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
  /** The address to connect to, already checked. The name is only for the certificate and the Host header. */
  readonly address: ResolvedAddress;
}

export type Transport = (request: TransportRequest) => Promise<NetworkResponse>;

export interface NetworkOptions {
  readonly resolve?: (host: string) => Promise<readonly ResolvedAddress[]>;
  readonly transport?: Transport;
  /** Tests only: let an address through that the rule would refuse (a server on this machine). */
  readonly allowAddress?: (address: string) => boolean;
  /** Tests only: talk plain HTTP to a server on this machine. */
  readonly plain?: boolean;
}

async function systemResolve(host: string): Promise<readonly ResolvedAddress[]> {
  const found = await lookup(host, { all: true });
  return found.map((f) => ({ address: f.address, family: f.family === 6 ? 6 : 4 }));
}

function realTransport(plain: boolean): Transport {
  return (r) =>
    new Promise<NetworkResponse>((resolve, reject) => {
      const send = plain ? httpRequest : httpsRequest;
      const request = send(
        {
          host: r.host,
          port: r.port,
          path: r.path,
          method: r.method,
          headers: { ...r.headers, host: r.port === 443 ? r.host : `${r.host}:${String(r.port)}` },
          servername: r.host,
          // The connection goes to the address that was checked, whatever the name resolves to later.
          lookup: (_host, options, callback) => {
            const answer = { address: r.address.address, family: r.address.family };
            if ((options as { all?: boolean }).all === true) {
              (callback as unknown as (e: null, a: unknown[]) => void)(null, [answer]);
            } else {
              callback(null, answer.address, answer.family);
            }
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > PLUGIN_LIMITS.responseBytes) {
              request.destroy(new NetworkRefused('The response is too large.', 'limit'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const headers: Record<string, string> = {};
            for (const [name, value] of Object.entries(response.headers)) {
              if (value !== undefined) {
                headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
              }
            }
            resolve({
              status: response.statusCode ?? 0,
              headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
          response.on('error', reject);
        },
      );
      request.on('timeout', () => request.destroy(new Error('The request timed out.')));
      request.on('error', reject);
      request.end(r.body);
    });
}

/**
 * The core's door for a plugin (ADR 0028): the only way out of its process. A request goes through only if
 * its `host:port` is one the administrator approved, the name resolves to public addresses only, and the
 * request and the answer are of a bounded size. The connection is made to the address that was checked, so
 * a name that changes its answer between the check and the connection gains nothing. Redirects are not followed.
 */
export class PluginNetwork {
  private readonly resolve: (host: string) => Promise<readonly ResolvedAddress[]>;
  private readonly transport: Transport;
  private readonly allowAddress: (address: string) => boolean;
  private readonly plain: boolean;
  private readonly inFlight = new Map<string, number>();

  constructor(options: NetworkOptions = {}) {
    this.resolve = options.resolve ?? systemResolve;
    this.transport = options.transport ?? realTransport(options.plain === true);
    this.allowAddress = options.allowAddress ?? isPublicAddress;
    this.plain = options.plain === true;
  }

  /** `allowed` is the approved `network` list of the plugin: `host:port` entries. */
  async fetch(
    pluginId: string,
    allowed: readonly string[],
    url: string,
    init: PluginFetchInit = {},
  ): Promise<NetworkResponse> {
    const target = this.check(allowed, url, init);
    const active = this.inFlight.get(pluginId) ?? 0;
    if (active >= PLUGIN_LIMITS.concurrentFetches) {
      throw new NetworkRefused('Too many requests at once.', 'limit');
    }
    this.inFlight.set(pluginId, active + 1);
    try {
      const addresses = await this.resolve(target.host);
      const [address] = addresses;
      if (address === undefined) {
        throw new NetworkRefused(`${target.host} does not resolve.`, 'address');
      }
      if (!addresses.every((a) => this.allowAddress(a.address))) {
        throw new NetworkRefused(
          `${target.host} resolves to an address that is not public; the request is refused.`,
          'address',
        );
      }
      return await this.transport({ ...target, address });
    } finally {
      this.inFlight.set(pluginId, (this.inFlight.get(pluginId) ?? 1) - 1);
    }
  }

  private check(allowed: readonly string[], url: string, init: PluginFetchInit) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new NetworkRefused('That is not a URL.', 'invalid');
    }
    if (parsed.protocol !== 'https:' && !(this.plain && parsed.protocol === 'http:')) {
      throw new NetworkRefused('Only https is allowed.', 'invalid');
    }
    if (parsed.username !== '' || parsed.password !== '') {
      throw new NetworkRefused('A URL with a name and password is refused.', 'invalid');
    }
    const port = parsed.port === '' ? (parsed.protocol === 'https:' ? 443 : 80) : Number(parsed.port);
    const host = parsed.hostname.toLowerCase();
    if (!allowed.includes(`${host}:${String(port)}`)) {
      throw new NetworkRefused(
        `${host}:${String(port)} is not among the hosts this plugin was approved to call.`,
        'not_allowed',
      );
    }
    const method = (init.method ?? 'GET').toUpperCase();
    if (!METHODS.has(method)) {
      throw new NetworkRefused(`The method ${method} is not allowed.`, 'invalid');
    }
    if (init.body !== undefined && Buffer.byteLength(init.body) > PLUGIN_LIMITS.requestBytes) {
      throw new NetworkRefused('The request body is too large.', 'limit');
    }
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(init.headers ?? {})) {
      const lower = name.toLowerCase();
      if (!HOP_BY_HOP.has(lower) && typeof value === 'string' && /^[\w-]+$/u.test(lower)) {
        headers[lower] = value;
      }
    }
    headers['user-agent'] ??= 'Swellwright-plugin';
    return {
      host,
      port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      body: init.body,
    };
  }
}
