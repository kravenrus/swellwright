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
