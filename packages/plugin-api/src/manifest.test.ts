import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PluginManifestSchema,
  isNetworkTarget,
  isSafeRelativePath,
  referencedFiles,
} from './manifest.js';

const VALID = {
  id: 'dns-rucenter',
  version: '1.0.0',
  name: 'RU-CENTER (NIC.RU) DNS',
  engines: { swellwright: '>=1.0 <2' },
  provides: [{ kind: 'DnsProvider', entry: './dist/provider.js' }],
  permissions: { network: ['api.nic.ru:443'], secrets: ['dns-oauth'], panel: [], ssh: false },
  config: { schema: './config.schema.json' },
  ui: { settings: './ui/settings.json' },
  storage: { namespace: 'dns-rucenter' },
  license: 'AGPL-3.0-only',
} as const;

function problems(manifest: unknown): string[] {
  const result = PluginManifestSchema.safeParse(manifest);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function withChange(change: Record<string, unknown>): unknown {
  return { ...VALID, ...change };
}

describe('the plugin manifest', () => {
  it('accepts the example of the design document', () => {
    assert.deepEqual(problems(VALID), []);
  });

  it('needs only the essentials: permissions default to none', () => {
    const minimal = {
      id: 'notify-webhook',
      version: '0.1.0',
      name: 'Webhooks',
      engines: { swellwright: '*' },
      provides: [{ kind: 'NotificationChannel', driver: './driver.yaml' }],
      license: 'AGPL-3.0-only',
    };
    const parsed = PluginManifestSchema.parse(minimal);
    assert.deepEqual(parsed.permissions, { network: [], secrets: [], panel: [], ssh: false });
  });

  it('refuses a key it does not know, so a misspelled permission is an error', () => {
    assert.ok(problems(withChange({ permisions: {} })).length > 0);
    assert.ok(
      problems(withChange({ permissions: { network: [], secret: ['dns-oauth'] } })).length > 0,
    );
  });

  it('checks the id', () => {
    for (const id of [
      'DNS',
      'dns_rucenter',
      'dns--x',
      '-dns',
      'ab',
      'a'.repeat(49),
      'dns rucenter',
    ]) {
      assert.ok(problems(withChange({ id })).length > 0, id);
    }
    assert.deepEqual(
      problems(withChange({ id: 'dns-rucenter-2' })).filter((p) => p.startsWith('id')),
      [],
    );
  });

  it('checks the version', () => {
    for (const version of ['1', '1.0', 'v1.0.0', '01.0.0', '1.0.0.beta', '']) {
      assert.ok(problems(withChange({ version })).length > 0, version);
    }
    for (const version of ['0.0.1', '1.2.3-rc.1', '2.0.0+build.5']) {
      assert.deepEqual(problems(withChange({ version })), [], version);
    }
  });

  it('wants one way to provide an extension, and a declarative one only where it is allowed', () => {
    assert.ok(problems(withChange({ provides: [{ kind: 'DnsProvider' }] })).length > 0);
    assert.ok(
      problems(withChange({ provides: [{ kind: 'DnsProvider', entry: 'a.js', driver: 'a.yaml' }] }))
        .length > 0,
    );
    assert.ok(
      problems(withChange({ provides: [{ kind: 'NodeFlavor', driver: 'a.yaml' }] })).length > 0,
    );
    assert.ok(problems(withChange({ provides: [] })).length > 0);
    assert.ok(problems(withChange({ provides: [{ kind: 'Toaster', entry: 'a.js' }] })).length > 0);
  });

  describe('a sidecar', () => {
    const DIGEST = 'a'.repeat(64);
    const sidecar = { image: `ghcr.io/example/plugin:1.2@sha256:${DIGEST}`, port: 8080 };
    const provides = [{ kind: 'NotificationChannel', sidecar: true }];

    it('is a container the manifest describes, with the image pinned by digest', () => {
      assert.deepEqual(problems(withChange({ provides, sidecar })), []);
      const parsed = PluginManifestSchema.parse(withChange({ provides, sidecar }));
      assert.deepEqual(parsed.sidecar, { ...sidecar, memoryMiB: 256, cpus: 0.5 });
      for (const image of [
        'ghcr.io/example/plugin:1.2',
        'ghcr.io/example/plugin@sha256:abc',
        `ghcr.io/example/plugin@sha1:${DIGEST}`,
        `UPPER/case@sha256:${DIGEST}`,
        `@sha256:${DIGEST}`,
        `ghcr.io/example/plugin @sha256:${DIGEST}`,
      ]) {
        assert.ok(
          problems(withChange({ provides, sidecar: { ...sidecar, image } })).length > 0,
          image,
        );
      }
    });

    it('needs the description when a sidecar is provided, and only then', () => {
      assert.ok(problems(withChange({ provides })).length > 0, 'provided but not described');
      assert.ok(problems(withChange({ sidecar })).length > 0, 'described but not provided');
    });

    it('is one way of providing an extension, not combined with code or a driver for the same entry', () => {
      assert.ok(
        problems(
          withChange({
            provides: [{ kind: 'DnsProvider', sidecar: true, entry: 'a.js' }],
            sidecar,
          }),
        ).length > 0,
      );
      assert.ok(
        problems(withChange({ provides: [{ kind: 'DnsProvider', sidecar: false }], sidecar }))
          .length > 0,
      );
    });

    it('keeps its limits: a port a container may bind, memory and cpu in a sane range', () => {
      for (const change of [
        { port: 80 },
        { port: 70000 },
        { memoryMiB: 8 },
        { memoryMiB: 100000 },
        { cpus: 0 },
        { cpus: 64 },
        { extra: true },
      ]) {
        assert.ok(
          problems(withChange({ provides, sidecar: { ...sidecar, ...change } })).length > 0,
        );
      }
    });
  });

  it('keeps every file inside the plugin', () => {
    for (const bad of [
      '../x.js',
      '/etc/passwd',
      'a/../../x',
      'a\\b.js',
      'C:/x.js',
      'a//b.js',
      'a/./b.js',
      '',
      'sp ace.js',
    ]) {
      assert.equal(isSafeRelativePath(bad), false, bad);
    }
    for (const good of [
      './dist/provider.js',
      'dist/provider.js',
      'ui/settings.json',
      'a-b_c/d.e.yaml',
    ]) {
      assert.equal(isSafeRelativePath(good), true, good);
    }
    assert.ok(problems(withChange({ config: { schema: '../secret.json' } })).length > 0);
    assert.ok(problems(withChange({ ui: { settings: '/abs.json' } })).length > 0);
  });

  it('lets a plugin name only public hosts', () => {
    for (const bad of [
      'localhost:443',
      '127.0.0.1:443',
      '10.0.0.5:22',
      'api.nic.ru',
      'api.nic.ru:0',
      'api.nic.ru:65536',
      'api.nic.ru:https',
      '*.nic.ru:443',
      'host.local:443',
      'db.internal:5432',
      'nic:443',
      'API.nic.ru:443',
      '[::1]:443',
      'a..b.ru:443',
    ]) {
      assert.equal(isNetworkTarget(bad), false, bad);
    }
    for (const good of ['api.nic.ru:443', 'api.cloudflare.com:443', 'a.b.c.example.org:8443']) {
      assert.equal(isNetworkTarget(good), true, good);
    }
    assert.ok(problems(withChange({ permissions: { network: ['localhost:80'] } })).length > 0);
  });

  it('names secrets and scopes as lower-case words', () => {
    assert.deepEqual(
      problems(withChange({ permissions: { secrets: ['dns-oauth'], panel: ['hosts:read'] } })),
      [],
    );
    assert.ok(problems(withChange({ permissions: { secrets: ['DNS_OAUTH'] } })).length > 0);
    assert.ok(problems(withChange({ permissions: { panel: ['*'] } })).length > 0);
  });

  it('never shares a storage namespace', () => {
    assert.ok(problems(withChange({ storage: { namespace: 'other-plugin' } })).length > 0);
  });

  it('lists the files it names once, without the leading ./', () => {
    const parsed = PluginManifestSchema.parse(
      withChange({
        provides: [
          { kind: 'DnsProvider', entry: './dist/provider.js' },
          { kind: 'NotificationChannel', entry: 'dist/provider.js' },
        ],
      }),
    );
    assert.deepEqual(referencedFiles(parsed), [
      'dist/provider.js',
      'config.schema.json',
      'ui/settings.json',
    ]);
  });
});
