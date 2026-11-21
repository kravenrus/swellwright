import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

import {
  type ArtifactManifest,
  ArtifactManifestSchema,
  type ArtifactState,
} from '@swellwright/contracts';
import semver from 'semver';

/** A manifest is a few kilobytes; anything near this is not one. */
export const MAX_MANIFEST_BYTES = 256 * 1024;
const MANIFEST_FILE = 'manifest.json';

/** One directory of the catalogue as the server found it. */
export interface CatalogueEntry {
  /** The directory name: the only name a malformed manifest leaves. */
  readonly directory: string;
  /** Absolute path of the directory. */
  readonly path: string;
  readonly manifest: ArtifactManifest | undefined;
  readonly state: ArtifactState;
  readonly problem: string | undefined;
  /** The problem is not about the file, so looking at the file again cannot mend it (two directories claim it). */
  readonly structural?: true;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** The bytes and the SHA-256 of a regular file, read as a stream; stops reading at `limit + 1` bytes. */
export async function hashFile(
  path: string,
  limit: number,
): Promise<{ readonly sha256: string; readonly size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) {
      break;
    }
    hash.update(chunk);
  }
  return { sha256: hash.digest('hex'), size };
}

export const sha256Of = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/**
 * Checks the file an artifact names against its manifest: a plain file inside its own directory, the size the manifest
 * says, not bigger than the limit, and the SHA-256 the manifest says. Returns the problem, or undefined when it is
 * intact. Never throws for what is wrong with the file; only for what is wrong with the machine.
 */
export async function fileProblem(
  directory: string,
  manifest: ArtifactManifest,
  maxBytes: number,
): Promise<string | undefined> {
  const path = join(directory, manifest.file);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) {
      return `The file "${manifest.file}" that the manifest names is missing.`;
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    return `"${manifest.file}" is a link; an artifact is a plain file.`;
  }
  if (!info.isFile()) {
    return `"${manifest.file}" is not a regular file.`;
  }
  const realDirectory = await realpath(directory);
  if (!(await realpath(path)).startsWith(realDirectory + sep)) {
    return `"${manifest.file}" leads outside the directory of the artifact.`;
  }
  if (manifest.size > maxBytes) {
    return `The artifact is ${String(manifest.size)} bytes, more than the ${String(maxBytes)} bytes SW_ARTIFACT_MAX_BYTES allows.`;
  }
  if (info.size !== manifest.size) {
    return `The file is ${String(info.size)} bytes, the manifest says ${String(manifest.size)}.`;
  }
  const actual = await hashFile(path, maxBytes);
  if (actual.size !== manifest.size) {
    return `The file is ${String(actual.size)} bytes, the manifest says ${String(manifest.size)}.`;
  }
  if (actual.sha256 !== manifest.sha256) {
    return `The SHA-256 of the file is ${actual.sha256}, the manifest says ${manifest.sha256}.`;
  }
  return undefined;
}

/** What is wrong with a manifest as text, in one line; undefined when it is sound. */
function manifestProblem(text: string): { manifest: ArtifactManifest } | { problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { problem: 'The manifest is not valid JSON.' };
  }
  const parsed = ArtifactManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    return { problem: `The manifest is malformed (${where}${issue?.message ?? 'invalid'}).` };
  }
  return { manifest: parsed.data };
}

async function readManifest(
  path: string,
): Promise<{ manifest: ArtifactManifest } | { problem: string } | undefined> {
  const file = join(path, MANIFEST_FILE);
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
  if (!info.isFile()) {
    return { problem: 'The manifest is not a regular file.' };
  }
  if (info.size > MAX_MANIFEST_BYTES) {
    return { problem: 'The manifest is too big to be one.' };
  }
  return manifestProblem(await readFile(file, 'utf8'));
}

/** Two directories that declare the same name and version cannot both be the artifact: neither is trusted. */
function markDuplicates(entries: readonly CatalogueEntry[]): CatalogueEntry[] {
  const owners = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.manifest) {
      const key = `${entry.manifest.name}@${entry.manifest.version}`;
      owners.set(key, [...(owners.get(key) ?? []), entry.directory]);
    }
  }
  return entries.map((entry) => {
    if (!entry.manifest) {
      return entry;
    }
    const sharing = owners.get(`${entry.manifest.name}@${entry.manifest.version}`) ?? [];
    if (sharing.length < 2) {
      return entry;
    }
    const others = sharing.filter((directory) => directory !== entry.directory).join(', ');
    return {
      ...entry,
      state: 'broken',
      problem: `${entry.manifest.name} ${entry.manifest.version} is declared by more than one directory (also: ${others}).`,
      structural: true,
    };
  });
}

/**
 * Reads the catalogue: every directory of `root` that has a `manifest.json`. Each manifest is parsed strictly and its
 * file is hashed; whatever is wrong makes that artifact `broken` with the reason, and never stops the others or the
 * server. A directory without a manifest is not an artifact and is left out.
 */
export async function loadCatalogue(root: string, maxBytes: number): Promise<CatalogueEntry[]> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
  const entries: CatalogueEntry[] = [];
  for (const directory of names) {
    const path = join(root, directory);
    let read;
    try {
      read = await readManifest(path);
    } catch (error) {
      read = {
        problem: `The manifest could not be read (${error instanceof Error ? error.message : 'unknown error'}).`,
      };
    }
    if (read === undefined) {
      continue;
    }
    if ('problem' in read) {
      entries.push({
        directory,
        path,
        manifest: undefined,
        state: 'broken',
        problem: read.problem,
      });
      continue;
    }
    let problem: string | undefined;
    try {
      problem = await fileProblem(path, read.manifest, maxBytes);
    } catch (error) {
      problem = `The file could not be checked (${error instanceof Error ? error.message : 'unknown error'}).`;
    }
    entries.push({
      directory,
      path,
      manifest: read.manifest,
      state: problem === undefined ? 'ok' : 'broken',
      problem,
    });
  }
  return markDuplicates(entries);
}

/** Highest version first; a pre-release sorts below its release. */
export const byVersionDescending = (a: string, b: string): number => semver.rcompare(a, b);
