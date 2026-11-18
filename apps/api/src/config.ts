import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { AUTH_KEY_BYTES } from './auth/secret-box.js';

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
  };
}
