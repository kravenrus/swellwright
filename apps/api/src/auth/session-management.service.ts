import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  SessionList,
  SessionListQuery,
  SessionsRevoked,
  SessionSummary,
} from '@swellwright/contracts';
import { type Database, SessionStage } from '@swellwright/db';

import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../tokens.js';
import { type AuthContext, type RequestMeta, requireDatabase } from './context.js';

/** The most sessions one listing returns. A person has a handful; an instance has few people. */
const LIST_LIMIT = 500;

const activeNow = () => {
  const now = new Date();
  return {
    stage: SessionStage.active,
    expiresAt: { gt: now },
    absoluteExpiresAt: { gt: now },
  } as const;
};

interface Row {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly elevatedUntil: Date | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly user: { readonly username: string };
}

function toSummary(row: Row, currentId: string, now: number): SessionSummary {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user.username,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    absoluteExpiresAt: row.absoluteExpiresAt.toISOString(),
    ip: row.ip,
    userAgent: row.userAgent,
    current: row.id === currentId,
    elevated: row.elevatedUntil !== null && row.elevatedUntil.getTime() > now,
  };
}

/**
 * Listing and ending sessions (ADR 0022). Everyone may see and end the other sessions of their own account;
 * ending someone else's needs `sessions:revoke` and a fresh second factor. The session in use is never ended
 * here, so a request cannot cut the branch it sits on: signing out is the way to end it.
 */
@Injectable()
export class SessionManagementService {
  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  async listOwn(auth: AuthContext): Promise<SessionList> {
    const rows = await this.db.session.findMany({
      where: { userId: auth.user.id, ...activeNow() },
      include: { user: { select: { username: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: LIST_LIMIT,
    });
    const now = Date.now();
    return { sessions: rows.map((row) => toSummary(row, auth.sessionId, now)) };
  }

  async listAll(auth: AuthContext, query: SessionListQuery): Promise<SessionList> {
    const rows = await this.db.session.findMany({
      where: { ...(query.userId ? { userId: query.userId } : {}), ...activeNow() },
      include: { user: { select: { username: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: LIST_LIMIT,
    });
    const now = Date.now();
    return { sessions: rows.map((row) => toSummary(row, auth.sessionId, now)) };
  }

  /** Ends one session. `own` limits it to the caller's account: a session of someone else is "not found". */
  async revoke(
    auth: AuthContext,
    id: string,
    scope: 'own' | 'any',
    meta: RequestMeta,
  ): Promise<void> {
    if (id === auth.sessionId) {
      throw new ConflictException('This is the session you are using. Sign out to end it.');
    }
    await this.db.$transaction(async (tx) => {
      const row = await tx.session.findUnique({
        where: { id },
        include: { user: { select: { username: true } } },
      });
      if (!row || (scope === 'own' && row.userId !== auth.user.id)) {
        throw new NotFoundException('There is no such session.');
      }
      await tx.session.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'session.revoked',
          outcome: 'success',
          actor: { id: auth.user.id, name: auth.user.username },
          object: { type: 'session', id },
          details: { scope: row.userId === auth.user.id ? 'own' : 'user', user: row.user.username },
          meta,
        },
        tx,
      );
    });
  }

  /** Ends every other session of the caller's account. */
  revokeOthers(auth: AuthContext, meta: RequestMeta): Promise<SessionsRevoked> {
    return this.endAll(auth, auth.user.id, auth.user.username, 'others', meta, auth.sessionId);
  }

  /** Ends every session of a user. For your own account use `revokeOthers`. */
  async revokeUser(auth: AuthContext, userId: string, meta: RequestMeta): Promise<SessionsRevoked> {
    if (userId === auth.user.id) {
      throw new ConflictException(
        'That is your own account: end your other sessions instead, or sign out.',
      );
    }
    const target = await this.db.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!target) {
      throw new NotFoundException('There is no such user.');
    }
    return this.endAll(auth, userId, target.username, 'user', meta);
  }

  private endAll(
    auth: AuthContext,
    userId: string,
    username: string,
    scope: 'others' | 'user',
    meta: RequestMeta,
    except?: string,
  ): Promise<SessionsRevoked> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.session.deleteMany({
        where: { userId, ...(except ? { id: { not: except } } : {}) },
      });
      if (count > 0) {
        await this.audit.record(
          {
            action: 'session.revoked',
            outcome: 'success',
            actor: { id: auth.user.id, name: auth.user.username },
            object: { type: 'user', id: userId },
            details: { scope, user: username, count },
            meta,
          },
          tx,
        );
      }
      return { revoked: count };
    });
  }
}
