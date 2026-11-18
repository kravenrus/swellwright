import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from './config.js';

describe('configuration', () => {
  it('has safe defaults: loopback only, no dependencies, response validation on', () => {
    const c = loadConfig({}, '1.2.3');
    assert.equal(c.host, '127.0.0.1');
    assert.equal(c.port, 3000);
    assert.equal(c.databaseUrl, undefined);
    assert.equal(c.valkeyUrl, undefined);
    assert.equal(c.validateResponses, true);
    assert.equal(c.version, '1.2.3');
  });

  it('turns response validation off in production unless asked for', () => {
    assert.equal(loadConfig({ NODE_ENV: 'production' }, 'v').validateResponses, false);
    assert.equal(
      loadConfig({ NODE_ENV: 'production', SW_VALIDATE_RESPONSES: 'true' }, 'v').validateResponses,
      true,
    );
  });

  it('treats empty values as not set', () => {
    const c = loadConfig({ SW_DATABASE_URL: '', SW_VALKEY_URL: '' }, 'v');
    assert.equal(c.databaseUrl, undefined);
    assert.equal(c.valkeyUrl, undefined);
  });

  it('prefers SW_VERSION and reads the commit', () => {
    const c = loadConfig({ SW_VERSION: '9.9.9', SW_COMMIT: 'abc1234' }, '1.2.3');
    assert.equal(c.version, '9.9.9');
    assert.equal(c.commit, 'abc1234');
  });

  it('rejects an invalid port and a malformed URL with a readable message', () => {
    assert.throws(() => loadConfig({ SW_HTTP_PORT: '70000' }, 'v'), /SW_HTTP_PORT/u);
    assert.throws(() => loadConfig({ SW_DATABASE_URL: 'not a url' }, 'v'), /SW_DATABASE_URL/u);
  });
});

describe('sign-in configuration', () => {
  const DB = 'postgresql://sw:pw@127.0.0.1:5432/sw';
  const KEY = Buffer.alloc(32, 9).toString('base64');

  it('makes a temporary authentication key outside production and says so', () => {
    const a = loadConfig({}, 'v');
    const b = loadConfig({}, 'v');
    assert.equal(a.authKey.length, 32);
    assert.equal(a.authKeyEphemeral, true);
    assert.notDeepEqual(a.authKey, b.authKey);
  });

  it('reads a configured key', () => {
    const c = loadConfig({ SW_AUTH_KEY: KEY }, 'v');
    assert.equal(c.authKeyEphemeral, false);
    assert.deepEqual(c.authKey, Buffer.alloc(32, 9));
  });

  it('rejects a key of the wrong size without printing it', () => {
    const short = Buffer.alloc(16, 9).toString('base64');
    assert.throws(() => loadConfig({ SW_AUTH_KEY: short }, 'v'), /SW_AUTH_KEY must be 32/u);
    try {
      loadConfig({ SW_AUTH_KEY: short }, 'v');
    } catch (error) {
      assert.ok(!(error as Error).message.includes(short));
    }
  });

  it('requires the key in production when a database is configured', () => {
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production', SW_DATABASE_URL: DB }, 'v'),
      /SW_AUTH_KEY is required/u,
    );
    assert.doesNotThrow(() =>
      loadConfig({ NODE_ENV: 'production', SW_DATABASE_URL: DB, SW_AUTH_KEY: KEY }, 'v'),
    );
    assert.doesNotThrow(
      () => loadConfig({ NODE_ENV: 'production' }, 'v'),
      'no database, no sign-in',
    );
  });

  it('marks the cookie Secure in production by default and lets the setting override it', () => {
    assert.equal(loadConfig({}, 'v').cookieSecure, false);
    assert.equal(loadConfig({ NODE_ENV: 'production' }, 'v').cookieSecure, true);
    assert.equal(
      loadConfig({ NODE_ENV: 'production', SW_COOKIE_SECURE: 'false' }, 'v').cookieSecure,
      false,
    );
    assert.equal(loadConfig({ SW_COOKIE_SECURE: 'true' }, 'v').cookieSecure, true);
  });

  it('has session and lockout defaults and bounds them', () => {
    const c = loadConfig({}, 'v');
    assert.equal(c.sessionIdleMs, 120 * 60_000);
    assert.equal(c.sessionMaxMs, 12 * 3_600_000);
    assert.equal(c.lockoutAttempts, 5);
    assert.equal(c.lockoutMs, 15 * 60_000);
    assert.equal(c.stepUpMs, 5 * 60_000, 'the elevation window is five minutes by default');
    assert.equal(loadConfig({ SW_STEP_UP_MINUTES: '30' }, 'v').stepUpMs, 30 * 60_000);
    assert.deepEqual(c.vaultKdf, { memoryKib: 256 * 1024, passes: 3, parallelism: 1 });
    assert.equal(
      loadConfig({ SW_VAULT_KDF_MEMORY_MIB: '1024', SW_VAULT_KDF_PASSES: '4' }, 'v').vaultKdf
        .passes,
      4,
    );
    for (const bad of [{ SW_VAULT_KDF_MEMORY_MIB: '8' }, { SW_VAULT_KDF_PASSES: '0' }]) {
      assert.throws(() => loadConfig(bad, 'v'), /SW_VAULT_KDF/u);
    }
    for (const bad of ['0', '31', 'soon']) {
      assert.throws(() => loadConfig({ SW_STEP_UP_MINUTES: bad }, 'v'), /SW_STEP_UP_MINUTES/u);
    }
    assert.throws(() => loadConfig({ SW_LOCKOUT_ATTEMPTS: '1' }, 'v'), /SW_LOCKOUT_ATTEMPTS/u);
    assert.throws(
      () => loadConfig({ SW_SESSION_IDLE_MINUTES: '1' }, 'v'),
      /SW_SESSION_IDLE_MINUTES/u,
    );
  });

  it('takes allowed origins as a comma-separated list of origins only', () => {
    const c = loadConfig(
      { SW_ALLOWED_ORIGINS: 'https://a.example.com, http://localhost:5173' },
      'v',
    );
    assert.deepEqual(c.allowedOrigins, ['https://a.example.com', 'http://localhost:5173']);
    assert.deepEqual(loadConfig({}, 'v').allowedOrigins, []);
    assert.throws(
      () => loadConfig({ SW_ALLOWED_ORIGINS: 'https://a.example.com/path' }, 'v'),
      /origins like/u,
    );
    assert.throws(() => loadConfig({ SW_ALLOWED_ORIGINS: 'a.example.com' }, 'v'), /origins like/u);
  });

  it('wants a long fixed setup token or none', () => {
    assert.equal(loadConfig({ SW_SETUP_TOKEN: 'x'.repeat(16) }, 'v').setupToken, 'x'.repeat(16));
    assert.equal(loadConfig({ SW_SETUP_TOKEN: '' }, 'v').setupToken, undefined);
    assert.throws(() => loadConfig({ SW_SETUP_TOKEN: 'short' }, 'v'), /SW_SETUP_TOKEN/u);
  });
});
