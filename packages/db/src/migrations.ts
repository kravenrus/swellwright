import { readdir } from 'node:fs/promises';

import { DatabaseNotReadyError } from './errors.js';
import type { PrismaClient } from './generated/client.js';

const MIGRATIONS_DIR = new URL('../prisma/migrations/', import.meta.url);
const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+$/u;

/** Names of the migrations shipped with this build, oldest first. */
export async function shippedMigrations(dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

interface MigrationRow {
  migration_name: string;
}

/** Names of the migrations the database has finished applying. An unmigrated database has none. */
export async function appliedMigrations(client: PrismaClient): Promise<Set<string>> {
  const table = await client.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present`;
  if (table[0]?.present !== true) {
    return new Set();
  }
  const rows = await client.$queryRaw<MigrationRow[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  return new Set(rows.map((row) => row.migration_name));
}

/**
 * Compares the migrations shipped with this build with those the database has applied.
 * Returns `undefined` when they match.
 */
export function schemaProblem(
  shipped: readonly string[],
  applied: ReadonlySet<string>,
): DatabaseNotReadyError | undefined {
  const pending = shipped.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    return new DatabaseNotReadyError(
      'MIGRATIONS_PENDING',
      `${String(pending.length)} migration(s) not applied`,
    );
  }
  const known = new Set(shipped);
  if ([...applied].some((name) => !known.has(name))) {
    return new DatabaseNotReadyError(
      'SCHEMA_AHEAD',
      'the database has migrations this build lacks',
    );
  }
  return undefined;
}
