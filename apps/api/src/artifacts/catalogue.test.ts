import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { artifactsCheck } from '../admin.js';
import { loadConfig } from '../config.js';
import { fileProblem, loadCatalogue } from './catalogue.js';

const MAX = 1024 * 1024;
const sha = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** The manifest of a file, as the generator would write it. */
function manifestFor(
  content: string | Buffer,
  more: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    manifestVersion: 1,
    name: 'demo',
    version: '1.0.0',
    description: 'A demo artifact.',
    file: 'run.sh',
    interpreter: 'sh',
    sha256: sha(content),
    size: Buffer.byteLength(content),
    minOs: 'debian 12',
    steps: [],
    params: {},
    ...more,
  };
}

describe('the artifact catalogue on disk', () => {
  let root: string;
  let counter = 0;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'sw-catalogue-'));
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** A catalogue directory of its own for each test. */
  function fresh(): string {
    counter += 1;
    const directory = join(root, `c${String(counter)}`);
    mkdirSync(directory);
    return directory;
  }

  /** One artifact directory: the file and its manifest. */
  function artifact(
    catalogue: string,
    directory: string,
    content: string | Buffer,
    more: Record<string, unknown> = {},
    manifestText?: string,
  ): string {
    const path = join(catalogue, directory);
    mkdirSync(path, { recursive: true });
    const manifest = manifestFor(content, more);
    const file = typeof manifest['file'] === 'string' ? manifest['file'] : 'run.sh';
    if (!file.includes('/') && !file.includes('\\') && !file.includes('..')) {
      writeFileSync(join(path, file), content);
    }
    writeFileSync(join(path, 'manifest.json'), manifestText ?? JSON.stringify(manifest));
    return path;
  }

  it('accepts an artifact whose file is what the manifest says', async () => {
    const catalogue = fresh();
    artifact(catalogue, 'demo', '#!/bin/sh\necho hello\n');
    const [entry, ...rest] = await loadCatalogue(catalogue, MAX);
    assert.equal(rest.length, 0);
    assert.equal(entry?.state, 'ok');
    assert.equal(entry.problem, undefined);
    assert.equal(entry.manifest?.name, 'demo');
  });

  it('marks a file that was changed after the manifest was made as broken, with both hashes', async () => {
    const catalogue = fresh();
    const path = artifact(catalogue, 'demo', '#!/bin/sh\necho hello\n');
    // The same size, different bytes: only the hash can tell.
    writeFileSync(join(path, 'run.sh'), '#!/bin/sh\necho HELLO\n');
    const [entry] = await loadCatalogue(catalogue, MAX);
    assert.equal(entry?.state, 'broken');
    assert.match(entry.problem ?? '', /SHA-256 of the file is [0-9a-f]{64}, the manifest says/u);
    assert.ok(entry.manifest, 'the manifest is still shown');
  });

  it('marks a file of another size as broken', async () => {
    const catalogue = fresh();
    const path = artifact(catalogue, 'demo', '#!/bin/sh\necho hello\n');
    appendFileSync(join(path, 'run.sh'), 'more');
    const [entry] = await loadCatalogue(catalogue, MAX);
    assert.equal(entry?.state, 'broken');
    assert.match(entry.problem ?? '', /bytes, the manifest says/u);
  });

  it('marks an artifact whose file is missing as broken', async () => {
    const catalogue = fresh();
    const path = artifact(catalogue, 'demo', 'x');
    rmSync(join(path, 'run.sh'));
    const [entry] = await loadCatalogue(catalogue, MAX);
    assert.equal(entry?.state, 'broken');
    assert.match(entry.problem ?? '', /missing/u);
  });

  it('marks a malformed manifest as broken and keeps the others working', async () => {
    const catalogue = fresh();
    artifact(catalogue, 'good', 'x', { name: 'good' });
    artifact(catalogue, 'not-json', 'x', {}, '{ this is not json');
    artifact(catalogue, 'unknown-key', 'x', { surprise: true });
    artifact(catalogue, 'bad-hash', 'x', { sha256: 'xyz' });
    artifact(catalogue, 'wrong-type', 'x', { size: 'ten' });
    const entries = await loadCatalogue(catalogue, MAX);
    const by = (directory: string) => entries.find((entry) => entry.directory === directory);
    assert.equal(by('good')?.state, 'ok');
    for (const directory of ['not-json', 'unknown-key', 'bad-hash', 'wrong-type']) {
      assert.equal(by(directory)?.state, 'broken', directory);
      assert.equal(by(directory)?.manifest, undefined, directory);
      assert.match(by(directory)?.problem ?? '', /manifest/iu, directory);
    }
    assert.match(by('not-json')?.problem ?? '', /not valid JSON/u);
  });

  it('refuses a file name that leaves the directory, however it is spelled', async () => {
    const catalogue = fresh();
    mkdirSync(join(catalogue, 'outside'));
    writeFileSync(join(catalogue, 'secret.txt'), 'not an artifact');
    for (const [directory, file] of [
      ['up', '../secret.txt'],
      ['absolute', '/etc/passwd'],
      ['nested', 'a/b.sh'],
      ['backslash', 'a\\b.sh'],
      ['dots', '..'],
      ['hidden', '.hidden'],
    ] as const) {
      artifact(catalogue, directory, 'x', { name: directory, file });
    }
    const entries = await loadCatalogue(catalogue, MAX);
    for (const directory of ['up', 'absolute', 'nested', 'backslash', 'dots', 'hidden']) {
      const entry = entries.find((candidate) => candidate.directory === directory);
      assert.equal(entry?.state, 'broken', directory);
      assert.equal(
        entry.manifest,
        undefined,
        `${directory}: a manifest with such a file is malformed`,
      );
    }
  });

  it('refuses a file that is a link, even when the target has the right bytes', async (context) => {
    const catalogue = fresh();
    const real = join(catalogue, 'real.sh');
    writeFileSync(real, 'x');
    const path = join(catalogue, 'linked');
    mkdirSync(path);
    writeFileSync(join(path, 'manifest.json'), JSON.stringify(manifestFor('x')));
    try {
      symlinkSync(real, join(path, 'run.sh'));
    } catch {
      // Windows without the right to make links: the same rule is covered where links are allowed.
      context.skip('this machine cannot make a symbolic link');
      return;
    }
    const [entry] = await loadCatalogue(catalogue, MAX);
    assert.equal(entry?.state, 'broken');
    assert.match(entry.problem ?? '', /link/u);
  });

  it('marks both directories broken when two declare the same name and version, and allows another version', async () => {
    const catalogue = fresh();
    artifact(catalogue, 'one', 'first');
    artifact(catalogue, 'two', 'second');
    artifact(catalogue, 'later', 'third', { version: '1.1.0' });
    const entries = await loadCatalogue(catalogue, MAX);
    const by = (directory: string) => entries.find((entry) => entry.directory === directory);
    assert.equal(by('one')?.state, 'broken');
    assert.equal(by('two')?.state, 'broken');
    assert.match(by('one')?.problem ?? '', /declared by more than one directory \(also: two\)/u);
    assert.equal(by('one')?.structural, true);
    assert.equal(
      by('later')?.state,
      'ok',
      'a different version of the same name is not a duplicate',
    );
  });

  it('marks an artifact bigger than the limit as broken without reading it all', async () => {
    const catalogue = fresh();
    artifact(catalogue, 'big', Buffer.alloc(4096, 1));
    const [entry] = await loadCatalogue(catalogue, 1024);
    assert.equal(entry?.state, 'broken');
    assert.match(entry.problem ?? '', /SW_ARTIFACT_MAX_BYTES/u);
  });

  it('leaves out what is not an artifact and survives a catalogue that is not there', async () => {
    const catalogue = fresh();
    mkdirSync(join(catalogue, 'no-manifest'));
    writeFileSync(join(catalogue, 'README.md'), 'a file, not a directory');
    mkdirSync(join(catalogue, '.hidden'));
    writeFileSync(join(catalogue, '.hidden', 'manifest.json'), '{}');
    assert.deepEqual(await loadCatalogue(catalogue, MAX), []);
    assert.deepEqual(await loadCatalogue(join(root, 'there-is-no-such-directory'), MAX), []);
  });

  it('checks a file again by itself: what was mended is intact, what was spoiled is not', async () => {
    const catalogue = fresh();
    const path = artifact(catalogue, 'demo', 'original');
    const [entry] = await loadCatalogue(catalogue, MAX);
    assert.ok(entry?.manifest);
    assert.equal(await fileProblem(path, entry.manifest, MAX), undefined);
    writeFileSync(join(path, 'run.sh'), 'spoiled!');
    assert.match((await fileProblem(path, entry.manifest, MAX)) ?? '', /SHA-256/u);
    writeFileSync(join(path, 'run.sh'), 'original');
    assert.equal(await fileProblem(path, entry.manifest, MAX), undefined);
  });

  it('is listed by the server command, which fails when something is broken or nothing is there', async () => {
    const run = async (directory: string) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = await artifactsCheck(loadConfig({ SW_ARTIFACTS_DIR: directory }, 'v'), {
        out: (line) => out.push(line),
        err: (line) => err.push(line),
      });
      return { code, out, err };
    };
    const catalogue = fresh();
    artifact(catalogue, 'demo', 'fine');
    const fine = await run(catalogue);
    assert.equal(fine.code, 0);
    assert.match(fine.out[0] ?? '', /^demo +1\.0\.0 +ok +[0-9a-f]{12} 4 bytes$/u);

    const path = artifact(catalogue, 'spoiled', 'fine', { name: 'spoiled' });
    writeFileSync(join(path, 'run.sh'), 'evil');
    const broken = await run(catalogue);
    assert.equal(broken.code, 1);
    assert.ok(broken.out.some((line) => /^spoiled +1\.0\.0 +broken /u.test(line)));
    assert.ok(broken.out.some((line) => /^ {2}The SHA-256 of the file is/u.test(line)));

    const none = await run(fresh());
    assert.equal(none.code, 1);
    assert.match(none.err[0] ?? '', /There is no artifact in/u);
  });
});
