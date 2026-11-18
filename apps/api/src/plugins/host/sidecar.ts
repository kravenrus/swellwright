import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { PLUGIN_LIMITS, type Sidecar } from '@swellwright/plugin-api';
import { stringify } from 'yaml';

/**
 * Sidecars (ADR 0031): the code of a plugin by others runs in a container of its own, which Swellwright never
 * starts itself (it has no access to the container engine). The administrator applies a compose fragment; the
 * core and the container talk over HTTP on an internal network, each proving itself with a token.
 */

const TOKEN_CONTEXT = 'swellwright:plugin-sidecar:v1';

/**
 * The token of a plugin's sidecar: an HMAC over the plugin id and the digest of its files, with a key derived from
 * `SW_AUTH_KEY`. It is not stored. It is valid only for the plugin as it was approved: change a file and it is
 * another token, so a sidecar built for the old plugin proves nothing to the new one.
 */
export function sidecarToken(authKey: Buffer, id: string, digest: string): string {
  const key = Buffer.from(hkdfSync('sha256', authKey, Buffer.alloc(0), TOKEN_CONTEXT, 32));
  return createHmac('sha256', key).update(`${id}\0${digest}`).digest('hex');
}

/** True when the `Authorization` header carries the expected token. Constant time in the length of the token. */
export function tokenMatches(expected: string, header: string | undefined): boolean {
  const given = /^Bearer ([0-9a-f]{64})$/u.exec(header ?? '')?.[1];
  const a = Buffer.from(given ?? '0'.repeat(64));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) && given !== undefined;
}

/** Where the core reaches a sidecar, from the template of the configuration. */
export function sidecarUrl(template: string, id: string, port: number): string {
  return template.replaceAll('{id}', id).replaceAll('{port}', String(port)).replace(/\/$/u, '');
}

export class SidecarError extends Error {
  constructor(
    message: string,
    readonly reason: 'unreachable' | 'timeout' | 'invalid',
  ) {
    super(message);
    this.name = 'SidecarError';
  }
}

export interface Described {
  readonly modules: readonly { readonly kind: string; readonly methods: readonly string[] }[];
}

/** What a sidecar answers to a call: a value, or why not. */
export type Answered =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string };

const MAX_ANSWER_BYTES = PLUGIN_LIMITS.responseBytes + 1024 * 1024;

/** A JSON request to a sidecar. Plain HTTP on an internal network; the answer is bounded and redirects are not followed. */
async function exchange(
  base: string,
  path: string,
  token: string,
  method: 'GET' | 'POST',
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const url = new URL(path, `${base}/`);
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise<unknown>((resolve, reject) => {
    const request = send(
      url,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(payload === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
        },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_ANSWER_BYTES) {
            request.destroy(new SidecarError('The sidecar answered with too much.', 'invalid'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode !== 200) {
            reject(
              new SidecarError(
                response.statusCode === 401 || response.statusCode === 403
                  ? 'The sidecar refused the token of the plugin: apply the fragment for the plugin as it is now.'
                  : `The sidecar answered ${String(response.statusCode ?? 0)}.`,
                'invalid',
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as unknown);
          } catch {
            reject(new SidecarError('The sidecar did not answer with JSON.', 'invalid'));
          }
        });
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      request.destroy(new SidecarError('The sidecar did not answer in time.', 'timeout'));
    });
    request.on('error', (error) => {
      if (error instanceof SidecarError) {
        reject(error);
      } else {
        reject(
          new SidecarError(
            `The sidecar cannot be reached: ${error.message}. Is its container running?`,
            'unreachable',
          ),
        );
      }
    });
    request.end(payload);
  });
}

/** What the sidecar offers: `GET /describe` → `{ modules: [{ kind, methods }] }`. */
export async function describeSidecar(
  base: string,
  token: string,
  timeoutMs: number,
): Promise<Described> {
  const value = (await exchange(base, 'describe', token, 'GET', undefined, timeoutMs)) as {
    modules?: unknown;
  } | null;
  const modules = value?.modules;
  if (
    !Array.isArray(modules) ||
    !modules.every(
      (m: unknown) =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as { kind?: unknown }).kind === 'string' &&
        Array.isArray((m as { methods?: unknown }).methods) &&
        (m as { methods: unknown[] }).methods.every((x) => typeof x === 'string'),
    )
  ) {
    throw new SidecarError(
      'The sidecar does not describe its modules the way it should.',
      'invalid',
    );
  }
  return { modules: modules as Described['modules'] };
}

/** A call: `POST /call` with `{ kind, method, params, config }` → `{ ok: true, value }` or `{ ok: false, message }`. */
export async function callSidecar(
  base: string,
  token: string,
  call: { kind: string; method: string; params: unknown; config: unknown },
  timeoutMs: number,
): Promise<Answered> {
  const value = (await exchange(base, 'call', token, 'POST', call, timeoutMs)) as {
    ok?: unknown;
    value?: unknown;
    message?: unknown;
  } | null;
  if (value?.ok === true) {
    return { ok: true, value: value.value ?? null };
  }
  if (value?.ok === false) {
    return {
      ok: false,
      message: (typeof value.message === 'string' ? value.message : 'The sidecar refused.').slice(
        0,
        300,
      ),
    };
  }
  throw new SidecarError('The sidecar did not answer the way it should.', 'invalid');
}

/**
 * The compose fragment that runs a sidecar (ADR 0031): on a network with no way out (`internal`), read-only, without
 * privileges, no new privileges, limited in memory, cpu and processes, from an image pinned by digest. The core
 * joins the same network to reach it, and the sidecar reaches the world only through the core's gateway.
 */
export function composeFragment(options: {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
  readonly sidecar: Sidecar;
  readonly token: string;
  readonly coreUrl: string;
  readonly network: string;
  readonly coreService: string;
}): string {
  const { id, sidecar } = options;
  const service = `plugin-${id}`;
  const document = {
    services: {
      [service]: {
        image: sidecar.image,
        restart: 'unless-stopped',
        read_only: true,
        user: '65532:65532',
        cap_drop: ['ALL'],
        security_opt: ['no-new-privileges:true'],
        networks: [options.network],
        environment: {
          SW_PLUGIN_ID: id,
          SW_PLUGIN_PORT: String(sidecar.port),
          SW_CORE_URL: options.coreUrl,
          SW_PLUGIN_TOKEN: options.token,
        },
        mem_limit: `${String(sidecar.memoryMiB)}m`,
        memswap_limit: `${String(sidecar.memoryMiB)}m`,
        cpus: sidecar.cpus,
        pids_limit: 128,
        tmpfs: ['/tmp:size=16m,mode=1777'],
      },
      // Swellwright joins the network of the sidecars to reach them.
      [options.coreService]: { networks: [options.network] },
    },
    networks: { [options.network]: { internal: true } },
  };
  const header = [
    `# Swellwright plugin ${id} ${options.version}, files ${options.digest.slice(0, 12)}.`,
    '# Generated for the plugin as approved. It holds the token the sidecar proves itself with: keep it like a secret.',
    '# Add it to the stack next to your compose file and bring the sidecar up:',
    `#   docker compose -f docker-compose.yml -f plugin-${id}.yml up -d ${service} ${options.coreService}`,
    `# The service "${options.coreService}" must already list its networks (it joins "${options.network}" here).`,
    '',
  ].join('\n');
  return header + stringify(document, { lineWidth: 0 });
}
