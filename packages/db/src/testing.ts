import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import pg from 'pg';

import { Database } from './database.js';
import { shippedMigrations } from './migrations.js';

const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url);

export interface IsolatedDatabase {
  readonly database: Database;
  /**
   * The name of the schema. Queries made through Prisma are qualified with it; raw SQL is not, so a test that
   * writes its own SQL must qualify table names with it.
   */
  readonly schema: string;
  /** Closes the client and drops the schema with everything in it. */
  drop(): Promise<void>;
}

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * A database of its own for one test file: a fresh PostgreSQL schema with every shipped migration applied.
 * Tests that need an empty database (the first-run setup) cannot share the one the other tests use.
 * For tests only: it needs permission to create schemas.
 */
export async function createIsolatedDatabase(url: string): Promise<IsolatedDatabase> {
  const schema = `sw_test_${randomBytes(6).toString('hex')}`;
  await withClient(url, async (client) => {
    // One transaction with a local search path: the setting ends with the transaction and cannot leak into
    // other work on the same database, and a failing migration leaves no half-made schema behind.
    await client.query('BEGIN');
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      for (const name of await shippedMigrations()) {
        await client.query(
          await readFile(new URL(`${name}/migration.sql`, MIGRATIONS_DIR), 'utf8'),
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
  // SW_TEST_DATABASE_POOL=1 serializes everything for a server that cannot run transactions of several
  // connections side by side (an embedded PostgreSQL stand-in); a real server takes the default.
  const poolSize = Number(process.env['SW_TEST_DATABASE_POOL'] ?? '3');
  const database = new Database({ url, schema, poolSize });
  return {
    database,
    schema,
    async drop() {
      await database.close();
      await withClient(url, async (client) => {
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      });
    },
  };
}
