import { argon2 } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

/** Argon2id parameters of the vault, stored next to the wrapped key so they can be raised later. */
export interface KdfParams {
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
}

/** 256 MiB and three passes: about a second on a current core, and expensive to guess against (ADR 0018). */
export const DEFAULT_KDF_PARAMS: KdfParams = { memoryKib: 262_144, passes: 3, parallelism: 1 };

export const KDF_SALT_BYTES = 16;
export const DERIVED_KEY_BYTES = 32;

/** One derivation at a time: each takes a quarter of a gibibyte, and the callers are few. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * Derives a 256-bit key from a passphrase. The passphrase is NFKC-normalized like a password, so the same
 * words typed on another keyboard give the same key.
 */
export function deriveKey(passphrase: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  const run = async (): Promise<Buffer> => {
    const out = await argon2Async('argon2id', {
      message: Buffer.from(passphrase.normalize('NFKC'), 'utf8'),
      nonce: salt,
      parallelism: params.parallelism,
      tagLength: DERIVED_KEY_BYTES,
      memory: params.memoryKib,
      passes: params.passes,
    });
    return Buffer.from(out);
  };
  const result = tail.then(run, run);
  tail = result.catch(() => undefined);
  return result;
}
