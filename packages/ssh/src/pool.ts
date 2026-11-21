// A small connection pool: reuse connections per (host, port, user, credentials, host key policy), cap them per
// host, close idle ones, replace dead ones, and never hang a caller.

import { randomBytes, scryptSync } from 'node:crypto';

import { SshConnection } from './connection.js';
import { SshInputError, SshPoolClosedError, SshTimeoutError } from './errors.js';
import { normalizePolicy } from './host-key.js';
import type { SshTarget } from './types.js';

export interface SshPoolOptions {
  /** Connections open at once per pool entry (one entry per host, port, user, credentials and policy). Default 2. */
  maxPerHost?: number;
  /** An idle connection is closed after this long. Default 30000. */
  idleMs?: number;
  /** How long `withConnection` waits for a free connection before it gives up. Default 60000. */
  acquireTimeoutMs?: number;
}

interface Waiter {
  target: SshTarget;
  resolve: (connection: SshConnection) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  done: boolean;
}

interface IdleConnection {
  connection: SshConnection;
  timer: NodeJS.Timeout;
}

interface Slot {
  key: string;
  idle: IdleConnection[];
  leased: Set<SshConnection>;
  creating: number;
  /** Waiters that are being served by a connection that is still opening. */
  connecting: Set<Waiter>;
  waiters: Waiter[];
}

export interface SshPoolStats {
  entries: number;
  idle: number;
  leased: number;
  connecting: number;
  waiting: number;
}

export class SshPool {
  readonly #maxPerHost: number;
  readonly #idleMs: number;
  readonly #acquireTimeoutMs: number;
  // The pool key contains a salted, slow hash of the credentials (scrypt, a random salt per process), not the
  // credentials. It only tells credentials apart inside this process. The result is remembered per `auth` object, so
  // a caller that reuses its target pays for the hash once.
  readonly #salt = randomBytes(16);
  readonly #credentialIds = new WeakMap<object, string>();
  readonly #slots = new Map<string, Slot>();
  readonly #watched = new WeakSet<SshConnection>();

  constructor(options: SshPoolOptions = {}) {
    this.#maxPerHost = options.maxPerHost ?? 2;
    this.#idleMs = options.idleMs ?? 30_000;
    this.#acquireTimeoutMs = options.acquireTimeoutMs ?? 60_000;
    if (!Number.isInteger(this.#maxPerHost) || this.#maxPerHost < 1)
      throw new SshInputError('maxPerHost must be a positive integer.');
    if (!Number.isFinite(this.#idleMs) || this.#idleMs < 0)
      throw new SshInputError('idleMs must be a non-negative number.');
    if (!Number.isFinite(this.#acquireTimeoutMs) || this.#acquireTimeoutMs < 1) {
      throw new SshInputError('acquireTimeoutMs must be a positive number.');
    }
  }

  /**
   * Runs `fn` with a connection to `target` that nobody else uses meanwhile, and gives it back afterwards. A free
   * connection is reused; otherwise a new one is opened (up to `maxPerHost`); otherwise the call waits its turn.
   * A pooled connection that died while idle is dropped and replaced without the caller noticing. `fn` is never
   * run twice: if the connection dies during `fn`, `fn`'s own error reaches the caller.
   */
  async withConnection<T>(
    target: SshTarget,
    fn: (connection: SshConnection) => Promise<T>,
  ): Promise<T> {
    const key = this.#keyOf(target);
    const connection = await this.#acquire(key, target);
    try {
      return await fn(connection);
    } finally {
      this.#release(key, connection);
    }
  }

  /** Closes every connection (idle and in use) and rejects everybody who waits. The pool can be used again. */
  closeAll(): void {
    const slots = [...this.#slots.values()];
    this.#slots.clear();
    for (const slot of slots) {
      // Those who wait for a free connection, and those whose connection is still being opened.
      for (const waiter of [...slot.waiters.splice(0), ...slot.connecting]) {
        if (waiter.done) continue;
        waiter.done = true;
        clearTimeout(waiter.timer);
        waiter.reject(new SshPoolClosedError());
      }
      slot.connecting.clear();
      for (const idle of slot.idle.splice(0)) {
        clearTimeout(idle.timer);
        idle.connection.close();
      }
      for (const connection of slot.leased) connection.close();
    }
  }

  stats(): SshPoolStats {
    const stats: SshPoolStats = {
      entries: this.#slots.size,
      idle: 0,
      leased: 0,
      connecting: 0,
      waiting: 0,
    };
    for (const slot of this.#slots.values()) {
      stats.idle += slot.idle.length;
      stats.leased += slot.leased.size;
      stats.connecting += slot.creating;
      stats.waiting += slot.waiters.length;
    }
    return stats;
  }

  #keyOf(target: SshTarget): string {
    const policy = normalizePolicy(target.hostKey);
    const credentialId = this.#credentialId(target.auth);
    const hostKey =
      policy.mode === 'pinned' ? `pinned:${[...policy.fingerprints].sort().join(',')}` : 'discover';
    return [
      target.host.trim().toLowerCase(),
      String(target.port ?? 22),
      target.username,
      credentialId,
      hostKey,
      JSON.stringify(target.algorithms ?? null),
    ].join('|');
  }

  #credentialId(auth: SshTarget['auth']): string {
    const known = this.#credentialIds.get(auth);
    if (known !== undefined) return known;
    const material = JSON.stringify(
      auth.kind === 'password'
        ? ['password', auth.password]
        : ['key', auth.privateKey, auth.passphrase ?? ''],
    );
    // Cheap for a hash of a password (N=1024) because it is not stored or compared across processes.
    const id = scryptSync(material, this.#salt, 16, { N: 1024, r: 8, p: 1 }).toString('hex');
    this.#credentialIds.set(auth, id);
    return id;
  }

  #slot(key: string): Slot {
    let slot = this.#slots.get(key);
    if (slot === undefined) {
      slot = { key, idle: [], leased: new Set(), creating: 0, connecting: new Set(), waiters: [] };
      this.#slots.set(key, slot);
    }
    return slot;
  }

  #acquire(key: string, target: SshTarget): Promise<SshConnection> {
    const slot = this.#slot(key);
    return new Promise<SshConnection>((resolve, reject) => {
      const waiter: Waiter = {
        target,
        resolve,
        reject,
        done: false,
        timer: setTimeout(() => {
          if (waiter.done) return;
          waiter.done = true;
          const index = slot.waiters.indexOf(waiter);
          if (index >= 0) slot.waiters.splice(index, 1);
          reject(new SshTimeoutError('pool', this.#acquireTimeoutMs));
          this.#dropIfEmpty(slot);
        }, this.#acquireTimeoutMs),
      };
      slot.waiters.push(waiter);
      this.#pump(slot);
    });
  }

  /** Serves waiters from idle connections, then by opening new ones while there is room. */
  #pump(slot: Slot): void {
    while (slot.waiters.length > 0) {
      const idle = this.#takeIdle(slot);
      if (idle !== undefined) {
        const waiter = slot.waiters.shift();
        if (waiter === undefined) break;
        this.#give(slot, waiter, idle);
        continue;
      }
      if (slot.leased.size + slot.creating >= this.#maxPerHost) break;
      const waiter = slot.waiters.shift();
      if (waiter === undefined) break;
      slot.creating += 1;
      slot.connecting.add(waiter);
      SshConnection.connect(waiter.target).then(
        (connection) => {
          slot.creating -= 1;
          slot.connecting.delete(waiter);
          if (this.#slots.get(slot.key) !== slot) {
            // closeAll() ran while this connection was being opened (it has already rejected the waiter).
            connection.close();
            return;
          }
          this.#watch(slot, connection);
          this.#give(slot, waiter, connection);
          this.#pump(slot);
        },
        (error: unknown) => {
          slot.creating -= 1;
          slot.connecting.delete(waiter);
          if (!waiter.done) {
            waiter.done = true;
            clearTimeout(waiter.timer);
            waiter.reject(error instanceof Error ? error : new Error('connect failed'));
          }
          this.#pump(slot);
          this.#dropIfEmpty(slot);
        },
      );
    }
  }

  #takeIdle(slot: Slot): SshConnection | undefined {
    for (;;) {
      const entry = slot.idle.pop();
      if (entry === undefined) return undefined;
      clearTimeout(entry.timer);
      if (!entry.connection.closed) return entry.connection;
    }
  }

  #give(slot: Slot, waiter: Waiter, connection: SshConnection): void {
    if (waiter.done) {
      // The caller gave up while the connection was being opened: it is still a good connection.
      this.#store(slot, connection);
      return;
    }
    waiter.done = true;
    clearTimeout(waiter.timer);
    slot.leased.add(connection);
    waiter.resolve(connection);
  }

  #release(key: string, connection: SshConnection): void {
    const slot = this.#slots.get(key);
    if (!slot?.leased.delete(connection)) {
      // The pool was closed while the connection was leased.
      connection.close();
      return;
    }
    connection.closeSessions();
    if (connection.closed) {
      this.#pump(slot);
      this.#dropIfEmpty(slot);
      return;
    }
    this.#store(slot, connection);
    this.#pump(slot);
  }

  /** Parks a healthy connection as idle, or hands it straight to somebody waiting. */
  #store(slot: Slot, connection: SshConnection): void {
    if (connection.closed) return;
    const idle: IdleConnection = {
      connection,
      timer: setTimeout(() => {
        const index = slot.idle.indexOf(idle);
        if (index >= 0) slot.idle.splice(index, 1);
        connection.close();
        this.#dropIfEmpty(slot);
      }, this.#idleMs),
    };
    idle.timer.unref();
    slot.idle.push(idle);
  }

  /** A connection that dies while idle leaves the list; one that dies while leased is dropped at release. */
  #watch(slot: Slot, connection: SshConnection): void {
    if (this.#watched.has(connection)) return;
    this.#watched.add(connection);
    connection.on('close', () => {
      const index = slot.idle.findIndex((entry) => entry.connection === connection);
      if (index >= 0) {
        const [entry] = slot.idle.splice(index, 1);
        if (entry !== undefined) clearTimeout(entry.timer);
        this.#dropIfEmpty(slot);
      }
    });
  }

  #dropIfEmpty(slot: Slot): void {
    if (
      slot.idle.length === 0 &&
      slot.leased.size === 0 &&
      slot.creating === 0 &&
      slot.waiters.length === 0
    ) {
      if (this.#slots.get(slot.key) === slot) this.#slots.delete(slot.key);
    }
  }
}
