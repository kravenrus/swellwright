import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client.js';
import { appliedMigrations, schemaProblem, shippedMigrations } from './migrations.js';

export interface DatabaseOptions {
  /** PostgreSQL connection string. */
  readonly url: string;
  /** Upper bound of the connection pool. */
  readonly poolSize?: number;
  /** How long to wait for a connection before giving up, in milliseconds. */
  readonly connectTimeoutMs?: number;
}

/**
 * The application's connection to PostgreSQL: one Prisma client over one connection pool.
 * Create it once per process and share it.
 */
export class Database {
  readonly client: PrismaClient;

  constructor(options: DatabaseOptions) {
    const adapter = new PrismaPg({
      connectionString: options.url,
      max: options.poolSize ?? 10,
      connectionTimeoutMillis: options.connectTimeoutMs ?? 2000,
    });
    this.client = new PrismaClient({ adapter });
  }

  /** Resolves when the server answers a trivial query. */
  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  /**
   * Resolves when the server answers and the schema matches the migrations shipped with this build.
   * Rejects with a `DatabaseNotReadyError` when migrations are pending or the database is ahead of the code.
   */
  async assertReady(): Promise<void> {
    await this.ping();
    const problem = schemaProblem(await shippedMigrations(), await appliedMigrations(this.client));
    if (problem) {
      throw problem;
    }
  }

  async close(): Promise<void> {
    await this.client.$disconnect();
  }
}
