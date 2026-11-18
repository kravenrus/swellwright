import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PluginPermissions } from './manifest.js';
import { permissionDiff, widensPermissions } from './permissions.js';

const base: PluginPermissions = {
  network: ['api.nic.ru:443'],
  secrets: ['dns-oauth'],
  panel: ['hosts:read'],
  ssh: false,
};

describe('permission diff', () => {
  it('shows everything as added for a new plugin', () => {
    const diff = permissionDiff(undefined, { ...base, ssh: true });
    assert.deepEqual(diff.network.added, ['api.nic.ru:443']);
    assert.deepEqual(diff.secrets.added, ['dns-oauth']);
    assert.deepEqual(diff.panel.added, ['hosts:read']);
    assert.equal(diff.ssh, 'granted');
    assert.equal(widensPermissions(diff), true);
  });

  it('is empty when nothing changes', () => {
    const diff = permissionDiff(base, { ...base });
    assert.deepEqual(diff.network, { added: [], removed: [] });
    assert.equal(diff.ssh, 'unchanged');
    assert.equal(widensPermissions(diff), false);
  });

  it('does not ask again for less', () => {
    const diff = permissionDiff(base, { network: [], secrets: [], panel: [], ssh: false });
    assert.deepEqual(diff.network.removed, ['api.nic.ru:443']);
    assert.deepEqual(diff.secrets.removed, ['dns-oauth']);
    assert.equal(widensPermissions(diff), false);
  });

  it('asks again for one more host, one more secret kind, one more scope or SSH', () => {
    assert.equal(
      widensPermissions(
        permissionDiff(base, { ...base, network: [...base.network, 'api.example.org:443'] }),
      ),
      true,
    );
    assert.equal(
      widensPermissions(permissionDiff(base, { ...base, secrets: [...base.secrets, 'dns-token'] })),
      true,
    );
    assert.equal(
      widensPermissions(permissionDiff(base, { ...base, panel: [...base.panel, 'nodes:write'] })),
      true,
    );
    assert.equal(widensPermissions(permissionDiff(base, { ...base, ssh: true })), true);
  });

  it('reports a revoked SSH permission and sorts the lists', () => {
    const diff = permissionDiff({ ...base, ssh: true }, { ...base, panel: ['z:read', 'a:read'] });
    assert.equal(diff.ssh, 'revoked');
    assert.deepEqual(diff.panel.added, ['a:read', 'z:read']);
    assert.deepEqual(diff.panel.removed, ['hosts:read']);
  });
});
