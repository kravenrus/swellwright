import { Inject, Injectable } from '@nestjs/common';
import { type CheckResult, type ReadyResponse } from '@swellwright/contracts';
import { Redis } from 'iovalkey';
import pg from 'pg';

export const READINESS_CHECKS = Symbol('READINESS_CHECKS');
const CHECK_TIMEOUT_MS = 2000;

/** A dependency probe. `run` resolves when the dependency answers and rejects otherwise. */
export interface ReadinessCheck {
  readonly name: string;
  run(): Promise<void>;
  close?(): Promise<void>;
}

/** Short, secret-free reason for a failed check. Raw driver messages can contain hosts and credentials. */
export function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message === 'timeout') {
    return 'timeout';
  }
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{2,32}$/u.test(code) ? code : 'error';
}

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timeout'));
    }, ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('error'));
      },
    );
  });
}

@Injectable()
export class ReadinessService {
  constructor(@Inject(READINESS_CHECKS) private readonly checks: readonly ReadinessCheck[]) {}

  async run(): Promise<ReadyResponse> {
    const entries = await Promise.all(
      this.checks.map(async (check): Promise<[string, CheckResult]> => {
        const started = performance.now();
        try {
          await withTimeout(check.run(), CHECK_TIMEOUT_MS);
          return [check.name, { status: 'up', latencyMs: Math.round(performance.now() - started) }];
        } catch (error) {
          return [
            check.name,
            {
              status: 'down',
              latencyMs: Math.round(performance.now() - started),
              error: reasonOf(error),
            },
          ];
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    const down = entries.some(([, result]) => result.status === 'down');
    return { status: down ? 'not_ready' : 'ready', checks };
  }

  async close(): Promise<void> {
    await Promise.all(
      this.checks.map(async (c) => {
        await c.close?.();
      }),
    );
  }
}

export class PostgresCheck implements ReadinessCheck {
  readonly name = 'postgres';
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: CHECK_TIMEOUT_MS,
    });
    // An idle client can fail between probes; the next probe reports it.
    this.pool.on('error', () => undefined);
  }

  async run(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Opens a short-lived connection per probe, so a failed probe leaves no half-open client behind. */
export class ValkeyCheck implements ReadinessCheck {
  readonly name = 'valkey';

  constructor(private readonly url: string) {}

  async run(): Promise<void> {
    const client = new Redis(this.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: CHECK_TIMEOUT_MS,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  }
}
