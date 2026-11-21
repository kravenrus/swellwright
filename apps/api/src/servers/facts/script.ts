import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** The read-only script that collects the facts of a server, and the hash that is stored with every result. */
export interface FactsScript {
  readonly text: string;
  /** SHA-256 of `text`, in lower-case hex. */
  readonly sha256: string;
}

let loaded: FactsScript | undefined;

/**
 * Reads `collect-facts.sh` (it sits next to this file, in `src` and, copied by the build, in `dist`). Line endings are
 * made LF first, so a checkout with Windows line endings runs and hashes the same script. A missing file is an error at
 * start, not at the first refresh.
 */
export function loadFactsScript(): FactsScript {
  if (loaded) {
    return loaded;
  }
  const text = readFileSync(new URL('./collect-facts.sh', import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );
  loaded = { text, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
  return loaded;
}
