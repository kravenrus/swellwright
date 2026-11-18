import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Shared by the tests of the plugin host: a plugin written to a temporary directory. Not part of the application. */

/** A plugin's module as text: every method a test needs, written the way a plugin author would. */
export const FIXTURE_MODULE = `
export default {
  methods: {
    echo: (params) => params,
    pid: () => process.pid,
    throws: () => { throw new Error('nope'); },
    loop: () => { for (;;) { /* never returns */ } },
    hog: () => { const keep = []; for (;;) keep.push({ n: keep.length, text: 'x'.repeat(100) }); },
    viaCore: async (params, context) => {
      const response = await context.fetch(params.url, params.init);
      return { status: response.status, ok: response.ok, body: await response.text() };
    },
    refused: async (params, context) => {
      try { await context.fetch(params.url); return 'allowed'; } catch (error) { return error.message; }
    },
    probe: async (params) => {
      const results = {};
      const attempt = async (name, fn) => {
        try { results[name] = { ok: true, value: String(await fn()).slice(0, 60) }; }
        catch (error) { results[name] = { ok: false, code: error.code ?? (error.cause && error.cause.code) ?? error.name }; }
      };
      const fs = await import('node:fs');
      const cp = await import('node:child_process');
      const wt = await import('node:worker_threads');
      await attempt('readOwn', () => fs.readFileSync(new URL(import.meta.url)).length);
      await attempt('readOutside', () => fs.readFileSync(params.outside, 'utf8'));
      await attempt('writeOwn', () => fs.writeFileSync(new URL('./written.txt', import.meta.url), 'x'));
      await attempt('spawn', () => cp.spawnSync(process.execPath, ['-v']));
      await attempt('worker', () => new wt.Worker(new URL(import.meta.url)));
      await attempt('fetch', async () => (await fetch('http://127.0.0.1:' + params.port + '/')).status);
      await attempt('eval', () => eval('1 + 1'));
      await attempt('newFunction', () => new Function('return 1')());
      await attempt('binding', () => process.binding('fs'));
      results.envKeys = Object.keys(process.env);
      return results;
    },
  },
};
`;

export const FIXTURE_MANIFEST = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  version: '1.0.0',
  name: `The ${id} plugin`,
  engines: { swellwright: '>=0.0.0-0 <1' },
  provides: [{ kind: 'DnsProvider', entry: './dist/entry.js' }],
  permissions: { network: ['api.example.com:443'] },
  license: 'AGPL-3.0-only',
  ...extra,
});

export async function writeFixture(
  root: string,
  id: string,
  module: string = FIXTURE_MODULE,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const directory = join(root, id);
  await mkdir(join(directory, 'dist'), { recursive: true });
  await writeFile(
    join(directory, 'swellwright.plugin.json'),
    JSON.stringify(FIXTURE_MANIFEST(id, extra)),
  );
  await writeFile(join(directory, 'dist', 'entry.js'), module);
  return directory;
}
