import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);

export interface PasswordParams {
  /** Memory in KiB. */
  readonly memory: number;
  /** Passes (time cost). */
  readonly passes: number;
  readonly parallelism: number;
}

/** Argon2id with 64 MiB and 3 passes: about 130 ms on a current server core. */
export const DEFAULT_PASSWORD_PARAMS: PasswordParams = { memory: 65536, passes: 3, parallelism: 1 };

const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;
const MAX_CONCURRENT = 4;
const PHC =
  /^\$argon2id\$v=19\$m=(\d{1,9}),t=(\d{1,4}),p=(\d{1,3})\$([A-Za-z0-9+/]{8,})\$([A-Za-z0-9+/]{16,})$/u;

const b64 = (data: Uint8Array): string => Buffer.from(data).toString('base64').replace(/=+$/u, '');
const unb64 = (text: string): Buffer => Buffer.from(text, 'base64');

interface Parsed {
  readonly params: PasswordParams;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function parse(phc: string): Parsed | null {
  const match = PHC.exec(phc);
  if (!match) {
    return null;
  }
  const [, memory, passes, parallelism, salt, hash] = match;
  return {
    params: { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
    salt: unb64(salt ?? ''),
    hash: unb64(hash ?? ''),
  };
}

/**
 * Password hashing with Argon2id from `node:crypto` (no dependency). Hashes are PHC strings, so they carry
 * their own salt and parameters and old hashes keep verifying after the parameters are raised.
 * The number of hashes in flight is capped: every one needs tens of MiB, and logins are unauthenticated.
 */
export class PasswordHasher {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private dummy: Promise<string> | undefined;

  constructor(private readonly params: PasswordParams = DEFAULT_PASSWORD_PARAMS) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await this.derive(password, salt, this.params, TAG_BYTES);
    const { memory, passes, parallelism } = this.params;
    return `$argon2id$v=${String(ARGON2_VERSION)}$m=${String(memory)},t=${String(passes)},p=${String(parallelism)}$${b64(salt)}$${b64(tag)}`;
  }

  /** False for a wrong password and for a stored value that is not an Argon2id PHC string. */
  async verify(phc: string, password: string): Promise<boolean> {
    const parsed = parse(phc);
    if (!parsed) {
      return false;
    }
    const tag = await this.derive(password, parsed.salt, parsed.params, parsed.hash.length);
    return tag.length === parsed.hash.length && timingSafeEqual(tag, parsed.hash);
  }

  /** True when the stored hash was made with weaker parameters than the current ones. */
  needsRehash(phc: string): boolean {
    const parsed = parse(phc);
    return (
      !parsed ||
      parsed.params.memory < this.params.memory ||
      parsed.params.passes < this.params.passes ||
      parsed.params.parallelism !== this.params.parallelism
    );
  }

  /**
   * Spends the time of a real verification against a throwaway hash. Used for unknown users, so the answer
   * does not reveal whether a login name exists.
   */
  async verifyDummy(password: string): Promise<void> {
    this.dummy ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummy, password);
  }

  private async derive(
    password: string,
    salt: Buffer,
    params: PasswordParams,
    length: number,
  ): Promise<Buffer> {
    await this.acquire();
    try {
      const out = await argon2Async('argon2id', {
        message: Buffer.from(password.normalize('NFKC'), 'utf8'),
        nonce: salt,
        parallelism: params.parallelism,
        tagLength: length,
        memory: params.memory,
        passes: params.passes,
      });
      return Buffer.from(out);
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.active -= 1;
    }
  }
}
