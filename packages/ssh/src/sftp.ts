// SFTP: streamed transfers with SHA-256 verification, atomic replacement, and a deadline on everything.

import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';

import type { SshConnection } from './connection.js';
import {
  SshAbortError,
  SshConnectionLostError,
  SshError,
  SshExecError,
  SshHashMismatchError,
  SshInputError,
  SshSftpError,
  SshTimeoutError,
  messageOf,
} from './errors.js';
import { assertRemotePath, shellQuote } from './shell.js';
import type { SFTPWrapper, Stats } from './ssh2.js';

const STATUS_NO_SUCH_FILE = 2;
const STATUS_FILE_ALREADY_EXISTS = 11;

const DEFAULT_OPERATION_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_READ_BYTES = 16 * 1024 * 1024;

export type SftpVerify = 'auto' | 'exec' | 'readback' | 'none';

export interface SftpStat {
  size: number;
  mode: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

export interface SftpTransferResult {
  bytes: number;
  /** The SHA-256 (hex) of what arrived: computed on the server when `verify` is `exec` or `auto`, else of what was sent. */
  sha256: string;
}

export interface SftpPutOptions {
  /** File mode for the new file (default 0o644). */
  mode?: number;
  /** Refuse the upload (and leave no file at the destination) unless the data hashes to this hex SHA-256. */
  expectedSha256?: string;
  /**
   * How to confirm what arrived. `exec`: run `sha256sum` on the server. `readback`: read the file back over SFTP.
   * `auto` (default): `exec`, falling back to `readback` when the server has no `sha256sum`. `none`: trust the
   * transfer. A mismatch deletes the temporary file and raises `SshHashMismatchError`.
   */
  verify?: SftpVerify;
  /** Abort when no byte moved for this long. Default 60000. */
  idleTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface SftpGetOptions {
  expectedSha256?: string;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
}

function sftpError(error: unknown, what: string): SshError {
  if (error instanceof SshError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  return new SshSftpError(
    `${what} failed: ${messageOf(error)}`,
    typeof code === 'number' ? code : undefined,
    { cause: error },
  );
}

function statOf(stats: Stats): SftpStat {
  return {
    size: stats.size,
    mode: stats.mode,
    mtimeMs: stats.mtime * 1000,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
  };
}

function isHexSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

/** Aborts a transfer that stopped moving. `touch()` on every chunk; `expired` rejects when the deadline passes. */
class IdleGuard {
  readonly expired: Promise<never>;
  #timer: NodeJS.Timeout | undefined;
  readonly #ms: number;
  #onExpire: () => void = () => undefined;
  #reject: (error: Error) => void = () => undefined;

  constructor(ms: number) {
    this.#ms = ms;
    this.expired = new Promise<never>((_resolve, reject) => {
      this.#reject = reject;
    });
    // Whoever races against `expired` handles its rejection; this keeps an unobserved one from crashing the process.
    this.expired.catch(() => undefined);
  }

  start(onExpire: () => void): void {
    this.#onExpire = onExpire;
    this.touch();
  }

  touch(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#onExpire();
      this.#reject(new SshTimeoutError('sftp', this.#ms));
    }, this.#ms);
  }

  stop(): void {
    clearTimeout(this.#timer);
  }
}

async function* chunksOf(source: Buffer | Readable): AsyncGenerator<Buffer> {
  if (Buffer.isBuffer(source)) {
    const size = 64 * 1024;
    for (let offset = 0; offset < source.length; offset += size)
      yield source.subarray(offset, offset + size);
    return;
  }
  for await (const chunk of source) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
  }
}

/** An SFTP session. Obtain it from `SshConnection.sftp()`. */
export class SftpClient {
  readonly #connection: SshConnection;
  readonly #sftp: SFTPWrapper;
  readonly #onClose: (client: SftpClient) => void;
  #closed = false;

  constructor(connection: SshConnection, sftp: SFTPWrapper, onClose: (client: SftpClient) => void) {
    this.#connection = connection;
    this.#sftp = sftp;
    this.#onClose = onClose;
    sftp.on('close', () => {
      this.#markClosed();
    });
    sftp.on('error', () => {
      this.#markClosed();
    });
  }

  get closed(): boolean {
    return this.#closed;
  }

  close(): void {
    if (this.#closed) return;
    this.#markClosed();
    try {
      this.#sftp.end();
    } catch {
      // Already gone.
    }
  }

  /** Metadata of a path, or null when it does not exist. */
  async stat(path: string): Promise<SftpStat | null> {
    assertRemotePath(path);
    try {
      return statOf(
        await this.#call<Stats>('stat', (done) => {
          this.#sftp.stat(path, done);
        }),
      );
    } catch (error) {
      if (error instanceof SshSftpError && error.sftpStatus === STATUS_NO_SUCH_FILE) return null;
      throw error;
    }
  }

  /** Creates a directory; with `recursive` (the default) also its parents, like `mkdir -p`. */
  async mkdir(path: string, options: { recursive?: boolean; mode?: number } = {}): Promise<void> {
    assertRemotePath(path);
    const recursive = options.recursive ?? true;
    const mode = options.mode ?? 0o755;
    const segments = path.split('/').filter((segment) => segment.length > 0);
    const prefixes = recursive
      ? segments.map(
          (_, index) =>
            `${path.startsWith('/') ? '/' : ''}${segments.slice(0, index + 1).join('/')}`,
        )
      : [path];
    for (const prefix of prefixes) {
      const existing = await this.stat(prefix);
      if (existing !== null) {
        if (!existing.isDirectory)
          throw new SshSftpError(`"${prefix}" exists and is not a directory.`);
        if (prefix === path && !recursive)
          throw new SshSftpError(`"${prefix}" already exists.`, STATUS_FILE_ALREADY_EXISTS);
        continue;
      }
      try {
        await this.#call<undefined>('mkdir', (done) => {
          this.#sftp.mkdir(prefix, { mode }, (error) => {
            done(error, undefined);
          });
        });
      } catch (error) {
        // Somebody else may have created it in the meantime.
        const again = await this.stat(prefix);
        if (again?.isDirectory !== true) throw error;
      }
    }
  }

  /** Renames a path; with `overwrite` (the default) an existing destination is replaced, atomically when the server supports it. */
  async rename(from: string, to: string, options: { overwrite?: boolean } = {}): Promise<void> {
    assertRemotePath(from);
    assertRemotePath(to);
    const overwrite = options.overwrite ?? true;
    if (overwrite) {
      try {
        await this.#call<undefined>('rename', (done) => {
          this.#sftp.ext_openssh_rename(from, to, (error) => {
            done(error, undefined);
          });
        });
        return;
      } catch (error) {
        // Without the posix-rename extension (ssh2 throws at once) or when the server refuses it, fall back to
        // removing the destination first, which is not atomic. A missing source, a timeout or a dead connection
        // are not about the extension and are reported as they are.
        if (!(error instanceof SshSftpError) || error.sftpStatus === STATUS_NO_SUCH_FILE)
          throw error;
      }
      if ((await this.stat(to)) !== null) await this.remove(to);
    }
    await this.#call<undefined>('rename', (done) => {
      this.#sftp.rename(from, to, (error) => {
        done(error, undefined);
      });
    });
  }

  /** Removes a file or symbolic link; `ignoreMissing` makes an absent path a no-op. */
  async remove(path: string, options: { ignoreMissing?: boolean } = {}): Promise<void> {
    assertRemotePath(path);
    try {
      await this.#call<undefined>('remove', (done) => {
        this.#sftp.unlink(path, (error) => {
          done(error, undefined);
        });
      });
    } catch (error) {
      if (
        options.ignoreMissing === true &&
        error instanceof SshSftpError &&
        error.sftpStatus === STATUS_NO_SUCH_FILE
      )
        return;
      throw error;
    }
  }

  /** Removes an empty directory. */
  async rmdir(path: string): Promise<void> {
    assertRemotePath(path);
    await this.#call<undefined>('rmdir', (done) => {
      this.#sftp.rmdir(path, (error) => {
        done(error, undefined);
      });
    });
  }

  /** Reads a whole (small) file. Larger than `maxBytes` (default 16 MiB) is an error: use `get` for big files. */
  async readFile(
    path: string,
    options: { maxBytes?: number; idleTimeoutMs?: number } = {},
  ): Promise<Buffer> {
    assertRemotePath(path);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_READ_BYTES;
    const chunks: Buffer[] = [];
    let size = 0;
    await this.#download(
      path,
      (chunk) => {
        size += chunk.length;
        if (size > maxBytes)
          throw new SshSftpError(`The file is larger than ${String(maxBytes)} bytes.`);
        chunks.push(chunk);
      },
      options.idleTimeoutMs,
    );
    return Buffer.concat(chunks);
  }

  /** Writes text or bytes to a file (atomically, see `put`). */
  async writeFile(
    path: string,
    data: string | Buffer,
    options: SftpPutOptions = {},
  ): Promise<SftpTransferResult> {
    return this.put(typeof data === 'string' ? Buffer.from(data, 'utf8') : data, path, options);
  }

  /**
   * Uploads a local file (when `source` is a string path), a buffer or a stream to `remotePath`.
   *
   * The data is streamed into a temporary file next to the destination, hashed on the way, confirmed according to
   * `verify`, and only then renamed over the destination: a failed, truncated or mismatching upload never leaves
   * a partial file at `remotePath`. Memory use does not depend on the file size.
   */
  async put(
    source: string | Buffer | Readable,
    remotePath: string,
    options: SftpPutOptions = {},
  ): Promise<SftpTransferResult> {
    assertRemotePath(remotePath);
    if (options.expectedSha256 !== undefined && !isHexSha256(options.expectedSha256)) {
      throw new SshInputError('expectedSha256 must be 64 lowercase hex characters.');
    }
    const verify = options.verify ?? 'auto';
    const temporary = `${remotePath}.swellwright-${randomBytes(6).toString('hex')}.part`;
    const input = typeof source === 'string' ? createReadStream(source) : source;

    let sent: { bytes: number; sha256: string };
    try {
      sent = await this.#upload(
        input,
        temporary,
        options.mode ?? 0o644,
        options.idleTimeoutMs,
        options.signal,
      );
    } catch (error) {
      await this.remove(temporary, { ignoreMissing: true }).catch(() => undefined);
      throw sftpError(error, 'The upload');
    }

    try {
      if (options.expectedSha256 !== undefined && sent.sha256 !== options.expectedSha256) {
        throw new SshHashMismatchError(options.expectedSha256, sent.sha256);
      }
      let arrived = sent.sha256;
      if (verify !== 'none') {
        arrived = await this.#remoteSha256(temporary, verify, options.idleTimeoutMs);
        if (arrived !== sent.sha256) throw new SshHashMismatchError(sent.sha256, arrived);
      }
      await this.rename(temporary, remotePath);
      return { bytes: sent.bytes, sha256: arrived };
    } catch (error) {
      await this.remove(temporary, { ignoreMissing: true }).catch(() => undefined);
      throw sftpError(error, 'The upload');
    }
  }

  /**
   * Downloads `remotePath` to a local file (a string path, written atomically through a `.part` file) or into a
   * writable stream. Returns the byte count and the SHA-256 of what was received.
   */
  async get(
    remotePath: string,
    destination: string | Writable,
    options: SftpGetOptions = {},
  ): Promise<SftpTransferResult> {
    assertRemotePath(remotePath);
    if (options.expectedSha256 !== undefined && !isHexSha256(options.expectedSha256)) {
      throw new SshInputError('expectedSha256 must be 64 lowercase hex characters.');
    }
    const hash = createHash('sha256');
    let bytes = 0;
    const partial =
      typeof destination === 'string'
        ? `${destination}.${randomBytes(4).toString('hex')}.part`
        : undefined;
    const sink =
      typeof destination === 'string'
        ? createWriteStream(partial ?? destination, { mode: 0o600 })
        : destination;
    const sinkFailed = new Promise<never>((_resolve, reject) => {
      sink.once('error', reject);
    });
    sinkFailed.catch(() => undefined);

    try {
      await this.#download(
        remotePath,
        async (chunk) => {
          hash.update(chunk);
          bytes += chunk.length;
          if (!sink.write(chunk)) await Promise.race([once(sink, 'drain'), sinkFailed]);
        },
        options.idleTimeoutMs,
        options.signal,
      );
      const sha256 = hash.digest('hex');
      if (options.expectedSha256 !== undefined && sha256 !== options.expectedSha256) {
        throw new SshHashMismatchError(options.expectedSha256, sha256);
      }
      if (typeof destination === 'string') {
        sink.end();
        await Promise.race([once(sink, 'close'), sinkFailed]);
        if (partial !== undefined) await rename(partial, destination);
      }
      return { bytes, sha256 };
    } catch (error) {
      if (typeof destination === 'string') {
        sink.destroy();
        if (partial !== undefined) await rm(partial, { force: true });
      }
      throw sftpError(error, 'The download');
    }
  }

  // --- internals ---------------------------------------------------------------------------------------------

  async #upload(
    input: Buffer | Readable,
    path: string,
    mode: number,
    idleTimeoutMs: number | undefined,
    signal?: AbortSignal,
  ): Promise<{ bytes: number; sha256: string }> {
    const hash = createHash('sha256');
    let bytes = 0;
    const guard = new IdleGuard(idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
    const writer = this.#sftp.createWriteStream(path, { flags: 'w', mode });
    const closed = new Promise<void>((resolve, reject) => {
      writer.once('close', resolve);
      writer.once('error', reject);
    });
    closed.catch(() => undefined);
    const loss = this.#watchLoss();
    const onAbort = (): void => {
      writer.destroy();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    guard.start(() => {
      writer.destroy();
      if (input instanceof Readable) input.destroy();
    });
    const work = (async (): Promise<{ bytes: number; sha256: string }> => {
      for await (const chunk of chunksOf(input)) {
        if (signal?.aborted === true) throw new SshAbortError();
        guard.touch();
        hash.update(chunk);
        bytes += chunk.length;
        if (!writer.write(chunk)) await once(writer, 'drain');
      }
      writer.end();
      await closed;
      return { bytes, sha256: hash.digest('hex') };
    })();
    try {
      return await Promise.race([work, guard.expired, loss.lost]);
    } catch (error) {
      writer.destroy();
      if (input instanceof Readable) input.destroy();
      work.catch(() => undefined);
      throw error;
    } finally {
      guard.stop();
      loss.dispose();
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async #download(
    path: string,
    onChunk: (chunk: Buffer) => void | Promise<void>,
    idleTimeoutMs: number | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const guard = new IdleGuard(idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS);
    const reader = this.#sftp.createReadStream(path);
    const loss = this.#watchLoss();
    guard.start(() => {
      reader.destroy();
    });
    const work = (async (): Promise<void> => {
      for await (const chunk of reader as AsyncIterable<Buffer>) {
        if (signal?.aborted === true) throw new SshAbortError();
        guard.touch();
        await onChunk(chunk);
      }
    })();
    try {
      await Promise.race([work, guard.expired, loss.lost]);
    } catch (error) {
      reader.destroy();
      work.catch(() => undefined);
      throw sftpError(error, 'The download');
    } finally {
      guard.stop();
      loss.dispose();
    }
  }

  /** A promise that rejects when the connection dies, so a transfer never waits on a dead socket. */
  #watchLoss(): { lost: Promise<never>; dispose: () => void } {
    let dispose: () => void = () => undefined;
    const lost = new Promise<never>((_resolve, reject) => {
      dispose = this.#connection.watch((error) => {
        reject(error);
      });
    });
    lost.catch(() => undefined);
    return { lost, dispose };
  }

  async #remoteSha256(
    path: string,
    verify: SftpVerify,
    idleTimeoutMs: number | undefined,
  ): Promise<string> {
    if (verify === 'exec' || verify === 'auto') {
      try {
        const result = await this.#connection.exec(`sha256sum -- ${shellQuote(path)}`, {
          timeoutMs: 120_000,
        });
        const hash = /^([0-9a-f]{64})\s/u.exec(result.stdout)?.[1];
        if (result.code === 0 && hash !== undefined) return hash;
        if (verify === 'exec') {
          throw new SshExecError(
            'The server could not hash the uploaded file (is sha256sum installed?).',
          );
        }
      } catch (error) {
        // `auto` falls back to reading the file back when the server cannot run commands at all.
        if (verify === 'exec' || !(error instanceof SshExecError)) throw error;
      }
    }
    const hash = createHash('sha256');
    await this.#download(
      path,
      (chunk) => {
        hash.update(chunk);
      },
      idleTimeoutMs,
    );
    return hash.digest('hex');
  }

  /** One SFTP request with a deadline and without hanging when the connection dies. */
  #call<T>(
    what: string,
    start: (done: (error: Error | null | undefined, value: T) => void) => void,
  ): Promise<T> {
    if (this.#closed)
      return Promise.reject(new SshConnectionLostError('The SFTP session is closed.'));
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unwatch();
        action();
      };
      const unwatch = this.#connection.watch((error) => {
        finish(() => {
          reject(error);
        });
      });
      const timer = setTimeout(() => {
        finish(() => {
          reject(new SshTimeoutError('sftp', DEFAULT_OPERATION_TIMEOUT_MS));
        });
      }, DEFAULT_OPERATION_TIMEOUT_MS);
      try {
        start((error, value) => {
          finish(() => {
            if (error === null || error === undefined) resolve(value);
            else reject(sftpError(error, what));
          });
        });
      } catch (error) {
        finish(() => {
          reject(
            new SshSftpError(`SFTP ${what} is not available: ${messageOf(error)}`, undefined, {
              cause: error,
            }),
          );
        });
      }
    });
  }

  #markClosed(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#onClose(this);
  }
}
