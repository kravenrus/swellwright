import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { z } from 'zod';

import { AUTH_KEY_BYTES } from './auth/secret-box.js';
import type { PluginRoot } from './plugins/discovery.js';
import type { KdfParams } from './vault/kdf.js';

/** An empty variable (`SW_X=`) means "not set", as in most env files. */
const unsetIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);
const optionalUrl = z.preprocess(unsetIfEmpty, z.url().optional());
const optionalString = z.preprocess(unsetIfEmpty, z.string().optional());

const EnvSchema = z.object({
  SW_HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  SW_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  SW_DATABASE_URL: optionalUrl,
  SW_VALKEY_URL: optionalUrl,
  /** Check every response against its contract. Defaults to on outside production. */
  SW_VALIDATE_RESPONSES: z.stringbool().optional(),
  SW_LOG_LEVEL: z.enum(['normal', 'silent']).default('normal'),
  SW_VERSION: z.string().min(1).optional(),
  SW_COMMIT: z.string().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Base64 of 32 random bytes. Seals the TOTP secrets in the database (ADR 0014). */
  SW_AUTH_KEY: optionalString,
  /** Optional fixed setup token; without it a random one is printed to the log on first run. */
  SW_SETUP_TOKEN: z.preprocess(unsetIfEmpty, z.string().min(16).max(128).optional()),
  /** The session cookie gets the Secure attribute. Defaults to on in production. */
  SW_COOKIE_SECURE: z.stringbool().optional(),
  /** Comma-separated origins allowed to send state-changing requests. Default: the request's own host. */
  SW_ALLOWED_ORIGINS: optionalString,
  SW_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
  SW_SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  SW_LOCKOUT_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  SW_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** How long a session counts as freshly verified after the second factor (ADR 0017). */
  SW_STEP_UP_MINUTES: z.coerce.number().int().min(1).max(30).default(5),
  /** The directory with the built console. When set, the API serves it at `/` (one image, ADR 0019). */
  SW_WEB_DIR: optionalString,
  /**
   * Which proxies in front of the API may say who the client is (`X-Forwarded-For`): a number of hops, or a
   * comma-separated list of addresses, CIDR ranges and the names `loopback`, `linklocal`, `uniquelocal`.
   * Not set: nobody is trusted and the address of the connection is the client.
   */
  SW_TRUSTED_PROXIES: optionalString,
  /** Argon2id cost of the vault passphrase (ADR 0018). Raising it only affects vaults set up afterwards. */
  SW_VAULT_KDF_MEMORY_MIB: z.coerce.number().int().min(64).max(4096).default(256),
  SW_VAULT_KDF_PASSES: z.coerce.number().int().min(1).max(10).default(3),
  /** Plugins that ship with Swellwright (trust `official`), one directory per plugin (ADR 0021). */
  SW_PLUGINS_OFFICIAL_DIR: optionalString,
  /** Plugins of this instance (trust `local`): the administrator's own responsibility (ADR 0008). */
  SW_PLUGINS_LOCAL_DIR: optionalString,
  /** The heap limit of a plugin's process, in MiB (ADR 0028). */
  SW_PLUGIN_MEMORY_MIB: z.coerce.number().int().min(32).max(1024).default(128),
  /** How long one call to a plugin may take before its process is ended, in seconds. */
  SW_PLUGIN_CALL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(300).default(10),
  /** How long a plugin's process may sit idle before it is stopped, in minutes. */
  SW_PLUGIN_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
});

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string | undefined;
  readonly valkeyUrl: string | undefined;
  readonly validateResponses: boolean;
  readonly silent: boolean;
  readonly version: string;
  readonly commit: string | undefined;
  readonly production: boolean;
  readonly authKey: Buffer;
  /** True when no key was configured and a random one was made for this process (development only). */
  readonly authKeyEphemeral: boolean;
  readonly setupToken: string | undefined;
  readonly cookieSecure: boolean;
  readonly allowedOrigins: readonly string[];
  readonly sessionIdleMs: number;
  readonly sessionMaxMs: number;
  readonly lockoutAttempts: number;
  readonly lockoutMs: number;
  /** How long a session stays elevated after sign-in or a step-up. */
  readonly stepUpMs: number;
  /** The built console to serve, or undefined when a reverse proxy serves it. */
  readonly webDir: string | undefined;
  /** What Express is told about trusted proxies: a hop count, a list, or false (nobody). */
  readonly trustProxy: number | string[] | false;
  /** The cost with which a new vault passphrase is hardened. */
  readonly vaultKdf: KdfParams;
  /** Where plugins are looked for, the more trusted first. Empty: no plugins. */
  readonly pluginRoots: readonly PluginRoot[];
  /** What every plugin process is held to (ADR 0028). */
  readonly pluginLimits: {
    readonly memoryMiB: number;
    readonly callTimeoutMs: number;
    readonly idleMs: number;
  };
}

function decodeAuthKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== AUTH_KEY_BYTES) {
    throw new Error(
      `Invalid configuration: SW_AUTH_KEY must be ${String(AUTH_KEY_BYTES)} random bytes in base64 (try: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))").`,
    );
  }
  return key;
}

/** `2` is two hops; anything else is a list Express understands. A typo must not silently trust everyone. */
function parseTrustedProxies(value: string | undefined): number | string[] | false {
  if (value === undefined) {
    return false;
  }
  const text = value.trim();
  if (/^\d+$/u.test(text)) {
    const hops = Number(text);
    if (hops < 1 || hops > 10) {
      throw new Error('Invalid configuration: SW_TRUSTED_PROXIES as a number must be 1 to 10.');
    }
    return hops;
  }
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const named = new Set(['loopback', 'linklocal', 'uniquelocal']);
  for (const entry of entries) {
    const address = entry.split('/')[0] ?? '';
    if (
      !named.has(entry) &&
      !z.ipv4().safeParse(address).success &&
      !z.ipv6().safeParse(address).success
    ) {
      throw new Error(
        `Invalid configuration: SW_TRUSTED_PROXIES entries must be addresses, CIDR ranges, loopback, linklocal or uniquelocal, got "${entry}".`,
      );
    }
  }
  if (entries.length === 0) {
    throw new Error('Invalid configuration: SW_TRUSTED_PROXIES is empty.');
  }
  return entries;
}

export function loadConfig(
  env: Record<string, string | undefined>,
  packageVersion: string,
): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production && e.SW_DATABASE_URL && !e.SW_AUTH_KEY) {
    throw new Error('Invalid configuration: SW_AUTH_KEY is required in production.');
  }
  const origins = (e.SW_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  for (const origin of origins) {
    if (!z.url().safeParse(origin).success || new URL(origin).origin !== origin) {
      throw new Error(
        `Invalid configuration: SW_ALLOWED_ORIGINS entries must be origins like https://console.example.com, got "${origin}".`,
      );
    }
  }
  return {
    host: e.SW_HTTP_HOST,
    port: e.SW_HTTP_PORT,
    databaseUrl: e.SW_DATABASE_URL,
    valkeyUrl: e.SW_VALKEY_URL,
    validateResponses: e.SW_VALIDATE_RESPONSES ?? !production,
    silent: e.SW_LOG_LEVEL === 'silent',
    version: e.SW_VERSION ?? packageVersion,
    commit: e.SW_COMMIT,
    production,
    authKey: e.SW_AUTH_KEY ? decodeAuthKey(e.SW_AUTH_KEY) : randomBytes(AUTH_KEY_BYTES),
    authKeyEphemeral: !e.SW_AUTH_KEY,
    setupToken: e.SW_SETUP_TOKEN,
    cookieSecure: e.SW_COOKIE_SECURE ?? production,
    allowedOrigins: origins,
    sessionIdleMs: e.SW_SESSION_IDLE_MINUTES * 60_000,
    sessionMaxMs: e.SW_SESSION_MAX_HOURS * 3_600_000,
    lockoutAttempts: e.SW_LOCKOUT_ATTEMPTS,
    lockoutMs: e.SW_LOCKOUT_MINUTES * 60_000,
    stepUpMs: e.SW_STEP_UP_MINUTES * 60_000,
    webDir: e.SW_WEB_DIR,
    trustProxy: parseTrustedProxies(e.SW_TRUSTED_PROXIES),
    vaultKdf: {
      memoryKib: e.SW_VAULT_KDF_MEMORY_MIB * 1024,
      passes: e.SW_VAULT_KDF_PASSES,
      parallelism: 1,
    },
    pluginRoots: [
      ...(e.SW_PLUGINS_OFFICIAL_DIR
        ? [{ directory: resolve(e.SW_PLUGINS_OFFICIAL_DIR), trust: 'official' as const }]
        : []),
      ...(e.SW_PLUGINS_LOCAL_DIR
        ? [{ directory: resolve(e.SW_PLUGINS_LOCAL_DIR), trust: 'local' as const }]
        : []),
    ],
    pluginLimits: {
      memoryMiB: e.SW_PLUGIN_MEMORY_MIB,
      callTimeoutMs: e.SW_PLUGIN_CALL_TIMEOUT_SECONDS * 1000,
      idleMs: e.SW_PLUGIN_IDLE_MINUTES * 60_000,
    },
  };
}
