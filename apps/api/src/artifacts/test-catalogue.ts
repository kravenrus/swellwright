import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A catalogue directory for a test, with artifacts written the way the generator writes them. */

export const sha256Hex = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

export interface TestCatalogue {
  readonly directory: string;
  /** Writes `<directory>/<dir>/<file>` and its manifest; returns the path of the artifact directory. */
  add: (dir: string, content: string | Buffer, more?: Record<string, unknown>) => string;
  cleanup: () => void;
}

export function testCatalogue(): TestCatalogue {
  const directory = mkdtempSync(join(tmpdir(), 'sw-art-catalogue-'));
  return {
    directory,
    add: (dir, content, more = {}) => {
      const path = join(directory, dir);
      mkdirSync(path, { recursive: true });
      const manifest = {
        manifestVersion: 1,
        name: dir,
        version: '1.0.0',
        description: `The ${dir} artifact of a test.`,
        file: 'run.sh',
        interpreter: 'sh',
        sha256: sha256Hex(content),
        size: Buffer.byteLength(content),
        minOs: 'debian 12',
        steps: [
          {
            id: 'check',
            title: 'Check the server',
            readOnly: true,
            needsRoot: false,
            inFull: false,
            params: ['MODE'],
            requires: [],
          },
        ],
        params: {
          MODE: {
            group: 'installer',
            description: 'How to check.',
            required: false,
            secret: false,
            default: 'quick',
            enum: ['quick', 'full'],
          },
        },
        ...more,
      };
      const file = typeof manifest.file === 'string' ? manifest.file : 'run.sh';
      writeFileSync(join(path, file), content);
      writeFileSync(join(path, 'manifest.json'), JSON.stringify(manifest, null, 2));
      return path;
    },
    cleanup: () => {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
