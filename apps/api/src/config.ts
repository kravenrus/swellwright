import { z } from 'zod';

/** An empty variable (`SW_X=`) means "not set", as in most env files. */
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.url().optional());

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
  return {
    host: e.SW_HTTP_HOST,
    port: e.SW_HTTP_PORT,
    databaseUrl: e.SW_DATABASE_URL,
    valkeyUrl: e.SW_VALKEY_URL,
    validateResponses: e.SW_VALIDATE_RESPONSES ?? e.NODE_ENV !== 'production',
    silent: e.SW_LOG_LEVEL === 'silent',
    version: e.SW_VERSION ?? packageVersion,
    commit: e.SW_COMMIT,
  };
}
