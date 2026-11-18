import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Database, DatabaseNotReadyError } from '@swellwright/db';

import { DatabaseCheck, reasonOf, ReadinessService, ValkeyCheck } from './readiness.js';

describe('readiness', () => {
  it('maps failures to short reasons without raw driver text', () => {
    assert.equal(reasonOf(new Error('timeout')), 'timeout');
    assert.equal(
      reasonOf(Object.assign(new Error('password=hunter2'), { code: 'ECONNREFUSED' })),
      'ECONNREFUSED',
    );
    assert.equal(reasonOf(new Error('password=hunter2')), 'error');
    assert.equal(reasonOf('weird'), 'error');
  });

  it('is ready with no configured dependencies', async () => {
    assert.deepEqual(await new ReadinessService([]).run(), { status: 'ready', checks: {} });
  });

  it('marks a hanging check as down with a timeout, without waiting forever', async () => {
    const hang = { name: 'hang', run: () => new Promise<void>(() => undefined) };
    const started = performance.now();
    const result = await new ReadinessService([hang]).run();
    assert.equal(result.status, 'not_ready');
    assert.equal(result.checks['hang']?.error, 'timeout');
    assert.ok(performance.now() - started < 4000);
  });

  it('reports pending migrations and a database ahead of the code as short reason codes', async () => {
    for (const code of ['MIGRATIONS_PENDING', 'SCHEMA_AHEAD'] as const) {
      const probe = {
        assertReady: () => Promise.reject(new DatabaseNotReadyError(code, 'detail')),
      };
      const result = await new ReadinessService([new DatabaseCheck(probe)]).run();
      assert.equal(result.status, 'not_ready');
      assert.deepEqual(result.checks['postgres']?.error, code);
    }
  });

  it('closes every check on shutdown', async () => {
    let closed = 0;
    const check = {
      name: 'c',
      run: () => Promise.resolve(),
      close: () => ((closed += 1), Promise.resolve()),
    };
    await new ReadinessService([check, check]).close();
    assert.equal(closed, 2);
  });
});

// Real dependencies: run in CI (service containers) or against `docker compose up`.
const databaseUrl = process.env['SW_TEST_DATABASE_URL'];
const valkeyUrl = process.env['SW_TEST_VALKEY_URL'];

describe('readiness against real dependencies', () => {
  it('reaches a migrated Postgres', { skip: !databaseUrl }, async () => {
    const database = new Database({ url: databaseUrl ?? '', poolSize: 1 });
    try {
      const result = await new ReadinessService([new DatabaseCheck(database)]).run();
      assert.deepEqual(
        { status: result.status, postgres: result.checks['postgres']?.status },
        { status: 'ready', postgres: 'up' },
      );
    } finally {
      await database.close();
    }
  });

  it('reports an unreachable Postgres as down quickly', async () => {
    const database = new Database({
      url: 'postgresql://sw:nope@127.0.0.1:1/swellwright',
      poolSize: 1,
      connectTimeoutMs: 500,
    });
    try {
      const started = performance.now();
      const result = await new ReadinessService([new DatabaseCheck(database)]).run();
      assert.equal(result.status, 'not_ready');
      assert.equal(result.checks['postgres']?.status, 'down');
      assert.ok(performance.now() - started < 4000);
    } finally {
      await database.close();
    }
  });

  it('reaches Valkey', { skip: !valkeyUrl }, async () => {
    await new ValkeyCheck(valkeyUrl ?? '').run();
  });

  it('reports a closed port as down quickly', async () => {
    const result = await new ReadinessService([new ValkeyCheck('redis://127.0.0.1:1')]).run();
    assert.equal(result.status, 'not_ready');
    assert.equal(result.checks['valkey']?.status, 'down');
  });
});
