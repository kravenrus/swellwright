import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_PAGE_DEFAULT,
  type AuditAction,
  type AuditDetails,
  type AuditEvent,
  type AuditOutcome,
  type AuditPage,
  type AuditQuery,
  type ChainVerification,
} from '@swellwright/contracts';
import type { AuditEvent as AuditRow, Database, PrismaClient } from '@swellwright/db';

import { type RequestMeta, requireDatabase } from '../auth/context.js';
import { DATABASE } from '../tokens.js';
import {
  canonicalDetails,
  chainHash,
  type ChainCursor,
  checkEvent,
  GENESIS_HASH,
  START_OF_CHAIN,
} from './chain.js';

/** An arbitrary constant: one transaction at a time may append to the chain. */
const AUDIT_LOCK_KEY = 7_761_235;
/** Events read per round trip while verifying. */
const VERIFY_BATCH = 1000;

/** What a caller says about an event; the service adds the number, the time and the hashes. */
export interface AuditInput {
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  readonly actor?: { readonly id: string; readonly name: string } | null;
  readonly object?: { readonly type: string; readonly id: string } | null;
  readonly details?: AuditDetails;
  readonly meta: Pick<RequestMeta, 'ip' | 'requestId'>;
}

/** The part of a Prisma client that can take part in a transaction the caller already has. */
export type AuditWriter = Pick<PrismaClient, 'auditEvent' | '$executeRaw'>;

/** A column's width, so what is hashed is exactly what the database keeps. */
const fit = (value: string | undefined | null, width: number): string | null =>
  value === undefined || value === null || value === '' ? null : value.slice(0, width);

/** The sequence number as a JSON number. A chain will not reach 2^53, but a silent loss would be a lie. */
function seqNumber(seq: bigint): number {
  if (seq > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The audit sequence number is too large for a JSON number.');
  }
  return Number(seq);
}

export function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    seq: seqNumber(row.seq),
    occurredAt: row.occurredAt.toISOString(),
    actor: row.actorId ? { id: row.actorId, name: row.actorName ?? '' } : null,
    action: row.action,
    outcome: row.outcome,
    object: row.objectType && row.objectId ? { type: row.objectType, id: row.objectId } : null,
    ip: row.ip,
    requestId: row.requestId,
    details: JSON.parse(row.details) as AuditDetails,
    prevHash: row.prevHash,
    hash: row.hash,
  };
}

/**
 * The append-only audit chain (ADR 0015). Every event is numbered and hashed together with the hash of the
 * one before it, inside a short transaction under an advisory lock, so numbers have no gaps and no two
 * events share a predecessor.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(DATABASE) private readonly database: Database | undefined) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  /**
   * Appends an event. A failure propagates: use it for records of something that changed. Pass the
   * transaction when the change and its record must stand or fall together.
   */
  async record(input: AuditInput, within?: AuditWriter): Promise<void> {
    if (within) {
      await this.append(within, input);
      return;
    }
    await this.db.$transaction((tx) => this.append(tx, input));
  }

  /**
   * Appends an event and swallows a failure (it is logged). For records of something that was refused: a
   * failing audit store must not turn a 401 into a 500.
   */
  async note(input: AuditInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      this.logger.error(
        `could not record ${input.action}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async append(tx: AuditWriter, input: AuditInput): Promise<void> {
    // $executeRaw: the function returns void, which a $queryRaw result cannot represent.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
    const head = await tx.auditEvent.findFirst({
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    const fields = {
      seq: head ? head.seq + 1n : 1n,
      occurredAt: new Date(),
      actorId: input.actor?.id ?? null,
      actorName: fit(input.actor?.name, 64),
      action: input.action,
      outcome: input.outcome,
      objectType: fit(input.object?.type, 32),
      objectId: fit(input.object?.id, 64),
      ip: fit(input.meta.ip, 64),
      requestId: fit(input.meta.requestId, 64),
      details: canonicalDetails(input.details ?? {}),
      prevHash: head?.hash ?? GENESIS_HASH,
    };
    await tx.auditEvent.create({ data: { ...fields, hash: chainHash(fields) } });
  }

  /** One page of the log, newest first. */
  async list(query: AuditQuery): Promise<AuditPage> {
    const limit = query.limit ?? AUDIT_PAGE_DEFAULT;
    const rows = await this.db.auditEvent.findMany({
      where: {
        ...(query.cursor === undefined ? {} : { seq: { lt: BigInt(query.cursor) } }),
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
        ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
      },
      orderBy: { seq: 'desc' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      events: page.map(toAuditEvent),
      nextCursor: rows.length > limit && last ? seqNumber(last.seq) : null,
    };
  }

  /**
   * Walks the whole chain from the start up to the event that was last when the check began (events that
   * arrive meanwhile only extend the chain) and reports the first thing that does not check out.
   */
  async verify(): Promise<ChainVerification> {
    const db = this.db;
    const head = await db.auditEvent.findFirst({ orderBy: { seq: 'desc' } });
    if (!head) {
      return { ok: true, checked: 0, head: null, problem: null };
    }
    const summary = { seq: seqNumber(head.seq), hash: head.hash };
    let at: ChainCursor = START_OF_CHAIN;
    let checked = 0;
    let after = 0n;
    while (after < head.seq) {
      const batch = await db.auditEvent.findMany({
        where: { seq: { gt: after, lte: head.seq } },
        orderBy: { seq: 'asc' },
        take: VERIFY_BATCH,
      });
      const last = batch[batch.length - 1];
      if (!last) {
        // The rows after the last one checked are gone.
        return {
          ok: false,
          checked,
          head: summary,
          problem: { seq: seqNumber(at.nextSeq), reason: 'missing' },
        };
      }
      for (const row of batch) {
        const reason = checkEvent(row, at);
        if (reason) {
          // A missing number is reported at the place it should have been.
          const seq = reason === 'missing' ? at.nextSeq : row.seq;
          return { ok: false, checked, head: summary, problem: { seq: seqNumber(seq), reason } };
        }
        checked += 1;
        at = { nextSeq: row.seq + 1n, prevHash: row.hash };
      }
      after = last.seq;
    }
    return { ok: true, checked, head: summary, problem: null };
  }
}
