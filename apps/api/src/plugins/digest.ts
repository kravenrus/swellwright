import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What a plugin may weigh. A plugin is a few files; more than this is not one (and hashing it is not free). */
export const MAX_PLUGIN_FILES = 2000;
export const MAX_PLUGIN_BYTES = 32 * 1024 * 1024;
const MAX_DEPTH = 12;

export type DigestResult =
  | { readonly ok: true; readonly digest: string; readonly files: number; readonly bytes: number }
  | { readonly ok: false; readonly problem: string };

interface Entry {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

type Walk =
  | { readonly ok: true; readonly entries: readonly Entry[] }
  | { readonly ok: false; readonly problem: string };

async function walk(root: string): Promise<Walk> {
  const entries: Entry[] = [];
  let bytes = 0;
  const visit = async (relative: string, depth: number): Promise<string | undefined> => {
    if (depth > MAX_DEPTH) {
      return `"${relative}" is nested more than ${String(MAX_DEPTH)} directories deep`;
    }
    const found = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of found) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      // The history of a plugin kept in git is not part of the plugin.
      if (relative === '' && entry.name === '.git') {
        continue;
      }
      if (entry.isSymbolicLink()) {
        return `"${path}" is a link; a plugin may not contain links`;
      }
      if (entry.isDirectory()) {
        const problem = await visit(path, depth + 1);
        if (problem !== undefined) {
          return problem;
        }
        continue;
      }
      if (!entry.isFile()) {
        return `"${path}" is neither a file nor a directory`;
      }
      const info = await lstat(join(root, path));
      bytes += info.size;
      if (entries.length >= MAX_PLUGIN_FILES || bytes > MAX_PLUGIN_BYTES) {
        return `is larger than a plugin may be (${String(MAX_PLUGIN_FILES)} files, ${String(MAX_PLUGIN_BYTES / 1024 / 1024)} MiB)`;
      }
      entries.push({ path, size: info.size, mtimeMs: info.mtimeMs });
    }
    return undefined;
  };
  const problem = await visit('', 0);
  if (problem !== undefined) {
    return { ok: false, problem };
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, entries };
}

/**
 * What was hashed last, per directory, so that an unchanged plugin is not read again each time the list is
 * asked for. The key is what the file system says (names, sizes, modification times); the value is the digest.
 */
const cache = new Map<string, { readonly signature: string; readonly result: DigestResult }>();

/**
 * A SHA-256 over every file of the plugin: the path, the size and the hash of the content of each, in order of
 * path. This is what an administrator approves (ADR 0027), so a changed, added or removed file is a different
 * plugin. Links are refused anywhere inside: a link could lead a plugin's reads outside its directory.
 */
export async function digestPlugin(directory: string): Promise<DigestResult> {
  const found = await walk(directory);
  if (!found.ok) {
    return found;
  }
  const signature = createHash('sha256')
    .update(
      found.entries.map((e) => `${e.path}\0${String(e.size)}\0${String(e.mtimeMs)}`).join('\n'),
    )
    .digest('hex');
  const cached = cache.get(directory);
  if (cached?.signature === signature) {
    return cached.result;
  }
  const outer = createHash('sha256');
  let bytes = 0;
  for (const entry of found.entries) {
    const content = await readFile(join(directory, entry.path));
    bytes += content.length;
    const inner = createHash('sha256').update(content).digest('hex');
    outer.update(`${entry.path}\0${String(content.length)}\0${inner}\n`);
  }
  const result: DigestResult = {
    ok: true,
    digest: outer.digest('hex'),
    files: found.entries.length,
    bytes,
  };
  cache.set(directory, { signature, result });
  return result;
}
