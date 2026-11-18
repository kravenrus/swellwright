import { randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CreateSecretRequest,
  RevealedSecret,
  SecretList,
  SecretView,
  UnsealVaultRequest,
  UpdateSecretRequest,
  VaultInitialized,
  VaultStatus,
} from '@swellwright/contracts';
import { type Database, Prisma, type Secret } from '@swellwright/db';

import { AuditService } from '../audit/audit.service.js';
import { type RequestMeta, requireDatabase } from '../auth/context.js';
import { WindowLimiter } from '../auth/rate-limit.js';
import { RateLimitedException, VaultSealedException } from '../http.js';
import { DATABASE, VAULT_KDF } from '../tokens.js';
import { deriveKey, KDF_SALT_BYTES, type KdfParams } from './kdf.js';
import {
  decryptSecret,
  encryptSecret,
  formatRecoveryKey,
  newKek,
  newRecoveryKey,
  parseRecoveryKey,
  unwrapKekWithPassphraseKey,
  unwrapKekWithRecoveryKey,
  wrapKekUnderPassphraseKey,
  wrapKekUnderRecoveryKey,
} from './keys.js';

/** An arbitrary constant: one transaction at a time may set the vault up. */
const VAULT_LOCK_KEY = 7_761_237;
const UNSEAL_ATTEMPTS = 10;
const UNSEAL_WINDOW_MS = 15 * 60_000;

/** Who did it. The vault has no server command: every caller is a signed-in user. */
export interface Actor {
  readonly id: string;
  readonly name: string;
}

export function toSecretView(row: Secret): SecretView {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    version: row.version,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    valueChangedAt: row.valueChangedAt.toISOString(),
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * The secrets vault (ADR 0018). The key-encryption key lives only in this process's memory, and only while the
 * vault is open; the database holds it wrapped twice and every value encrypted under a data key of its own.
 */
@Injectable()
export class VaultService implements OnApplicationShutdown {
  private readonly logger = new Logger('Vault');
  private readonly attempts = new WindowLimiter(UNSEAL_ATTEMPTS, UNSEAL_WINDOW_MS);
  private kek: Buffer | null = null;

  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(VAULT_KDF) private readonly kdf: KdfParams,
  ) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  onApplicationShutdown(): void {
    this.wipe();
  }

  private wipe(): void {
    this.kek?.fill(0);
    this.kek = null;
  }

  /** The key, or the answer a caller gets when there is none: no vault yet (409) or a sealed one (423). */
  private openKey(): Buffer {
    if (!this.kek) {
      throw new VaultSealedException();
    }
    return this.kek;
  }

  async status(): Promise<VaultStatus> {
    const [meta, secretCount] = await Promise.all([
      this.db.vaultMeta.findUnique({ where: { id: 1 } }),
      this.db.secret.count(),
    ]);
    return {
      state: !meta ? 'uninitialized' : this.kek ? 'unsealed' : 'sealed',
      secretCount,
      kekVersion: meta?.kekVersion ?? null,
      createdAt: meta?.createdAt.toISOString() ?? null,
    };
  }

  /** Sets the vault up once and leaves it open. The recovery key is returned here and never stored. */
  async initialize(actor: Actor, passphrase: string, meta: RequestMeta): Promise<VaultInitialized> {
    const kek = newKek();
    const recoveryKey = newRecoveryKey();
    const salt = randomBytes(KDF_SALT_BYTES);
    const passphraseKey = await deriveKey(passphrase, salt, this.kdf);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VAULT_LOCK_KEY})`;
        if ((await tx.vaultMeta.count()) > 0) {
          throw new ConflictException('The vault is already set up.');
        }
        await tx.vaultMeta.create({
          data: {
            id: 1,
            kdfSalt: new Uint8Array(salt),
            kdfMemoryKib: this.kdf.memoryKib,
            kdfPasses: this.kdf.passes,
            kdfParallelism: this.kdf.parallelism,
            passphraseWrappedKek: new Uint8Array(wrapKekUnderPassphraseKey(kek, passphraseKey)),
            recoveryWrappedKek: new Uint8Array(wrapKekUnderRecoveryKey(kek, recoveryKey)),
            createdById: actor.id,
          },
        });
        await this.audit.record(
          {
            action: 'vault.initialized',
            outcome: 'success',
            actor,
            details: { kek_version: 1 },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      kek.fill(0);
      throw error;
    } finally {
      passphraseKey.fill(0);
    }
    this.wipe();
    this.kek = kek;
    const formatted = formatRecoveryKey(recoveryKey);
    recoveryKey.fill(0);
    return { status: await this.status(), recoveryKey: formatted };
  }

  /** Opens the vault with the passphrase or the recovery key. Failures are recorded and rate-limited. */
  async unseal(actor: Actor, request: UnsealVaultRequest, meta: RequestMeta): Promise<VaultStatus> {
    if (!this.attempts.hit('vault')) {
      throw new RateLimitedException(Math.ceil(UNSEAL_WINDOW_MS / 1000));
    }
    const stored = await this.db.vaultMeta.findUnique({ where: { id: 1 } });
    if (!stored) {
      throw new ConflictException('There is no vault yet.');
    }
    const method = request.passphrase === undefined ? 'recovery_key' : 'passphrase';
    let kek: Buffer | null;
    if (request.passphrase !== undefined) {
      const key = await deriveKey(request.passphrase, Buffer.from(stored.kdfSalt), {
        memoryKib: stored.kdfMemoryKib,
        passes: stored.kdfPasses,
        parallelism: stored.kdfParallelism,
      });
      kek = unwrapKekWithPassphraseKey(stored.passphraseWrappedKek, key);
      key.fill(0);
    } else {
      const key = parseRecoveryKey(request.recoveryKey ?? '');
      kek = key ? unwrapKekWithRecoveryKey(stored.recoveryWrappedKek, key) : null;
      key?.fill(0);
    }
    if (!kek) {
      await this.audit.note({
        action: 'vault.unseal.failed',
        outcome: 'failure',
        actor,
        details: { method },
        meta,
      });
      throw new UnauthorizedException('Invalid passphrase or recovery key.');
    }
    try {
      await this.audit.record({
        action: 'vault.unsealed',
        outcome: 'success',
        actor,
        details: { method },
        meta,
      });
    } catch (error) {
      kek.fill(0);
      throw error;
    }
    this.wipe();
    this.kek = kek;
    return this.status();
  }

  async seal(actor: Actor, meta: RequestMeta): Promise<VaultStatus> {
    if (!(await this.db.vaultMeta.findUnique({ where: { id: 1 } }))) {
      throw new ConflictException('There is no vault yet.');
    }
    this.wipe();
    await this.audit.record({ action: 'vault.sealed', outcome: 'success', actor, meta });
    return this.status();
  }

  async list(): Promise<SecretList> {
    const rows = await this.db.secret.findMany({ orderBy: { name: 'asc' } });
    return { secrets: rows.map(toSecretView) };
  }

  /** Needs the vault open. The value is encrypted before it reaches the database and is not returned again. */
  async create(actor: Actor, request: CreateSecretRequest, meta: RequestMeta): Promise<SecretView> {
    const kek = this.openKey();
    const id = randomUUID();
    const blobs = encryptSecret(kek, { id, version: 1, type: request.type }, request.value);
    try {
      const row = await this.db.$transaction(async (tx) => {
        const created = await tx.secret.create({
          data: {
            id,
            name: request.name,
            type: request.type,
            ciphertext: new Uint8Array(blobs.ciphertext),
            wrappedDek: new Uint8Array(blobs.wrappedDek),
            createdById: actor.id,
            ...(request.description === undefined ? {} : { description: request.description }),
            ...(request.expiresAt === undefined ? {} : { expiresAt: new Date(request.expiresAt) }),
          },
        });
        await this.audit.record(
          {
            action: 'secret.created',
            outcome: 'success',
            actor,
            object: { type: 'secret', id },
            details: { secret_type: request.type, version: 1 },
            meta,
          },
          tx,
        );
        return created;
      });
      return toSecretView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A secret with that name exists already.');
      }
      throw error;
    }
  }

  /** Renames, changes the details or replaces the value (a new version under a new data key). */
  async update(
    actor: Actor,
    id: string,
    body: UpdateSecretRequest,
    meta: RequestMeta,
  ): Promise<SecretView> {
    const kek = body.value === undefined ? null : this.openKey();
    try {
      const row = await this.db.$transaction(async (tx) => {
        const current = await tx.secret.findUnique({ where: { id } });
        if (!current) {
          throw new NotFoundException('There is no such secret.');
        }
        const data: Prisma.SecretUpdateInput = {};
        const changed: string[] = [];
        if (body.name !== undefined && body.name !== current.name) {
          data.name = body.name;
          changed.push('name');
        }
        if (body.description !== undefined && body.description !== current.description) {
          data.description = body.description;
          changed.push('description');
        }
        if (body.expiresAt !== undefined) {
          const expiresAt = body.expiresAt === null ? null : new Date(body.expiresAt);
          if (expiresAt?.getTime() !== current.expiresAt?.getTime()) {
            data.expiresAt = expiresAt;
            changed.push('expires_at');
          }
        }
        let version = current.version;
        if (body.value !== undefined && kek) {
          version = current.version + 1;
          const blobs = encryptSecret(kek, { id, version, type: current.type }, body.value);
          data.version = version;
          data.ciphertext = new Uint8Array(blobs.ciphertext);
          data.wrappedDek = new Uint8Array(blobs.wrappedDek);
          data.valueChangedAt = new Date();
          changed.push('value');
        }
        if (changed.length === 0) {
          return current;
        }
        // The version is part of what the blobs are bound to: a second writer must not slip in between.
        const written = await tx.secret.updateMany({
          where: { id, version: current.version },
          data,
        });
        if (written.count !== 1) {
          throw new ConflictException('The secret was changed meanwhile. Try again.');
        }
        await this.audit.record(
          {
            action: 'secret.updated',
            outcome: 'success',
            actor,
            object: { type: 'secret', id },
            details: { changed: changed.join(','), version },
            meta,
          },
          tx,
        );
        return tx.secret.findUniqueOrThrow({ where: { id } });
      });
      return toSecretView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A secret with that name exists already.');
      }
      throw error;
    }
  }

  /** Works while the vault is sealed: nothing is decrypted. */
  async remove(actor: Actor, id: string, meta: RequestMeta): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const current = await tx.secret.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('There is no such secret.');
      }
      await tx.secret.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'secret.deleted',
          outcome: 'success',
          actor,
          object: { type: 'secret', id },
          details: { secret_type: current.type, version: current.version },
          meta,
        },
        tx,
      );
    });
  }

  /** The only way a value leaves. Recorded first: no record, no value. */
  async reveal(actor: Actor, id: string, meta: RequestMeta): Promise<RevealedSecret> {
    const kek = this.openKey();
    const row = await this.db.secret.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('There is no such secret.');
    }
    let value: string;
    try {
      value = decryptSecret(kek, { id, version: row.version, type: row.type }, row);
    } catch {
      // The key is right (the vault opened), so a blob that does not open was altered or moved.
      this.logger.error(
        `secret ${id} did not decrypt: the stored blobs do not match their context`,
      );
      throw new InternalServerErrorException('The secret could not be decrypted.');
    }
    await this.audit.record({
      action: 'secret.revealed',
      outcome: 'success',
      actor,
      object: { type: 'secret', id },
      details: { secret_type: row.type, version: row.version },
      meta,
    });
    return { id, name: row.name, type: row.type, version: row.version, value };
  }
}
