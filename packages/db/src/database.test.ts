import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, describe, it } from 'node:test';

import {
  Database,
  DatabaseNotReadyError,
  Prisma,
  schemaProblem,
  SessionStage,
  shippedMigrations,
  UserRole,
} from './index.js';
import { createIsolatedDatabase } from './testing.js';

describe('shipped migrations', () => {
  it('lists the migrations of this package, oldest first', async () => {
    const names = await shippedMigrations();
    assert.ok(names.includes('20261118130000_create_users'));
    assert.deepEqual(names, [...names].sort());
  });

  it('ignores files and directories that are not migrations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sw-migrations-'));
    try {
      await mkdir(join(dir, '20260101000000_first'));
      await mkdir(join(dir, 'not_a_migration'));
      await mkdir(join(dir, '2026_bad'));
      const names = await shippedMigrations(new URL(`${pathToFileURL(dir).href}/`));
      assert.deepEqual(names, ['20260101000000_first']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('schema problem', () => {
  const shipped = ['20260101000000_a', '20260102000000_b'];

  it('is none when every shipped migration is applied and nothing else', () => {
    assert.equal(schemaProblem(shipped, new Set(shipped)), undefined);
  });

  it('reports pending migrations', () => {
    const problem = schemaProblem(shipped, new Set(['20260101000000_a']));
    assert.ok(problem instanceof DatabaseNotReadyError);
    assert.equal(problem.code, 'MIGRATIONS_PENDING');
  });

  it('reports an empty database as pending', () => {
    assert.equal(schemaProblem(shipped, new Set())?.code, 'MIGRATIONS_PENDING');
  });

  it('reports a database that is ahead of the code', () => {
    const problem = schemaProblem(shipped, new Set([...shipped, '20260103000000_c']));
    assert.equal(problem?.code, 'SCHEMA_AHEAD');
  });
});

// Real PostgreSQL with the migrations applied: CI (service container) or a local server, see CONTRIBUTING.md.
const databaseUrl = process.env['SW_TEST_DATABASE_URL'];

describe('users against a migrated database', { skip: !databaseUrl }, () => {
  const prefix = `t${randomBytes(4).toString('hex')}`;
  let db: Database;

  before(() => {
    db = new Database({ url: databaseUrl ?? '', poolSize: 2 });
  });

  after(async () => {
    await db.client.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.close();
  });

  it('is ready: the schema matches the shipped migrations', async () => {
    await db.assertReady();
  });

  it('applies the documented defaults and a time-ordered UUID v7 id', async () => {
    const user = await db.client.user.create({
      data: { username: `${prefix}-defaults`, role: UserRole.operator },
    });
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(user.status, 'active');
    assert.equal(user.language, 'en');
    assert.equal(user.theme, 'dark');
    assert.equal(user.email, null);
    assert.equal(user.lastLoginAt, null);
    assert.ok(user.createdAt instanceof Date);
  });

  it('moves updatedAt forward on update', async () => {
    const user = await db.client.user.create({
      data: { username: `${prefix}-updated`, role: UserRole.observer },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const changed = await db.client.user.update({
      where: { id: user.id },
      data: { displayName: 'Changed' },
    });
    assert.ok(changed.updatedAt.getTime() > user.updatedAt.getTime());
    assert.equal(changed.createdAt.getTime(), user.createdAt.getTime());
  });

  it('rejects a duplicate username and a duplicate email', async () => {
    const name = `${prefix}-unique`;
    const email = `${name}@example.invalid`;
    await db.client.user.create({ data: { username: name, email, role: UserRole.auditor } });
    const isUnique = (error: unknown): boolean =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    await assert.rejects(
      db.client.user.create({ data: { username: name, role: UserRole.auditor } }),
      isUnique,
    );
    await assert.rejects(
      db.client.user.create({
        data: { username: `${name}-other`, email, role: UserRole.auditor },
      }),
      isUnique,
    );
  });

  it('removes the credential, recovery codes and sessions together with the user', async () => {
    const isolated = await createIsolatedDatabase(databaseUrl ?? '');
    try {
      const { client } = isolated.database;
      const user = await client.user.create({
        data: {
          username: `${prefix}-cascade`,
          role: UserRole.owner,
          credential: { create: { passwordHash: '$argon2id$placeholder' } },
          recoveryCodes: { create: [{ codeHash: 'a'.repeat(64) }, { codeHash: 'b'.repeat(64) }] },
          sessions: {
            create: [
              {
                tokenHash: 'c'.repeat(64),
                stage: SessionStage.active,
                expiresAt: new Date(Date.now() + 60_000),
                absoluteExpiresAt: new Date(Date.now() + 120_000),
              },
            ],
          },
        },
      });
      assert.equal(await client.credential.count(), 1);
      assert.equal(await client.recoveryCode.count(), 2);
      assert.equal(await client.session.count(), 1);
      await client.user.delete({ where: { id: user.id } });
      assert.equal(await client.credential.count(), 0);
      assert.equal(await client.recoveryCode.count(), 0);
      assert.equal(await client.session.count(), 0);
    } finally {
      await isolated.drop();
    }
  });

  it('keeps one recovery code hash per user, and one session per token hash', async () => {
    const isolated = await createIsolatedDatabase(databaseUrl ?? '');
    try {
      const { client } = isolated.database;
      const user = await client.user.create({
        data: { username: `${prefix}-unique2`, role: UserRole.operator },
      });
      await client.recoveryCode.create({ data: { userId: user.id, codeHash: 'd'.repeat(64) } });
      await assert.rejects(
        client.recoveryCode.create({ data: { userId: user.id, codeHash: 'd'.repeat(64) } }),
      );
      const session = {
        userId: user.id,
        tokenHash: 'e'.repeat(64),
        stage: SessionStage.password_verified,
        expiresAt: new Date(),
        absoluteExpiresAt: new Date(),
      };
      await client.session.create({ data: session });
      await assert.rejects(client.session.create({ data: session }));
    } finally {
      await isolated.drop();
    }
  });

  it('keeps the role set closed at the database level', async () => {
    await assert.rejects(
      db.client.$executeRaw`
        INSERT INTO users (id, username, role, updated_at)
        VALUES (gen_random_uuid(), ${`${prefix}-badrole`}, 'root'::user_role, now())`,
    );
  });
});
