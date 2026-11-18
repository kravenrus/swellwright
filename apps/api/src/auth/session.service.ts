import { Inject, Injectable } from '@nestjs/common';
import { type Database, SessionStage } from '@swellwright/db';

import { type AppConfig } from '../config.js';
import { CONFIG, DATABASE } from '../tokens.js';
import { type AuthContext, type RequestMeta, requireDatabase } from './context.js';
import { hashToken, newSessionToken } from './tokens.js';

/** The password step is valid for this long. Finishing the sign-in starts a real session. */
export const PENDING_TTL_MS = 10 * 60_000;
/** The idle expiry is moved forward at most this often, so a busy page does not write on every request. */
const EXTEND_AFTER_MS = 60_000;

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Browser sessions. The cookie holds a random token; the table holds its SHA-256 hash, so a database copy
 * cannot be turned into a cookie. A session that gains privileges is replaced, never upgraded in place.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Starts a session. `elevated` marks it as freshly verified for the step-up window: the sign-in has just
   * proved the second factor.
   */
  async create(
    userId: string,
    stage: SessionStage,
    meta: RequestMeta,
    options: { readonly elevated?: boolean } = {},
  ): Promise<IssuedSession> {
    const db = requireDatabase(this.database).client;
    const now = Date.now();
    const token = newSessionToken();
    const absolute = new Date(
      stage === SessionStage.active ? now + this.config.sessionMaxMs : now + PENDING_TTL_MS,
    );
    const idle = new Date(
      stage === SessionStage.active
        ? Math.min(now + this.config.sessionIdleMs, absolute.getTime())
        : now + PENDING_TTL_MS,
    );
    const elevatedUntil =
      options.elevated === true
        ? new Date(Math.min(now + this.config.stepUpMs, absolute.getTime()))
        : null;
    await db.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        stage,
        expiresAt: idle,
        absoluteExpiresAt: absolute,
        elevatedUntil,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
    // Expired rows are removed here, on the way in, so no scheduler is needed for it.
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
    return { token, expiresAt: idle };
  }

  /** The session behind a cookie value, or null when it is unknown, expired or its user is disabled. */
  async authenticate(token: string): Promise<AuthContext | null> {
    const db = requireDatabase(this.database).client;
    const row = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const now = Date.now();
    if (!row) {
      return null;
    }
    if (row.expiresAt.getTime() <= now || row.absoluteExpiresAt.getTime() <= now) {
      await db.session.deleteMany({ where: { id: row.id } });
      return null;
    }
    if (row.user.status !== 'active') {
      return null;
    }
    let expiresAt = row.expiresAt;
    if (row.stage === SessionStage.active && now - row.lastSeenAt.getTime() > EXTEND_AFTER_MS) {
      expiresAt = new Date(
        Math.min(now + this.config.sessionIdleMs, row.absoluteExpiresAt.getTime()),
      );
      await db.session.update({
        where: { id: row.id },
        data: { lastSeenAt: new Date(now), expiresAt },
      });
    }
    return {
      sessionId: row.id,
      stage: row.stage,
      user: row.user,
      expiresAt,
      elevatedUntil: row.elevatedUntil,
      via: 'session',
      tokenId: null,
      grants: null,
    };
  }

  /** Marks a session as freshly verified for the step-up window, never beyond the end of the session. */
  async elevate(sessionId: string): Promise<Date> {
    const db = requireDatabase(this.database).client;
    const row = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    const until = new Date(
      Math.min(Date.now() + this.config.stepUpMs, row.absoluteExpiresAt.getTime()),
    );
    await db.session.update({ where: { id: sessionId }, data: { elevatedUntil: until } });
    return until;
  }

  async revokeToken(token: string): Promise<void> {
    await requireDatabase(this.database).client.session.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }

  async revokeSession(id: string): Promise<void> {
    await requireDatabase(this.database).client.session.deleteMany({ where: { id } });
  }

  /** Ends every session of a user, for example after the account was locked. */
  async revokeAllOf(userId: string): Promise<void> {
    await requireDatabase(this.database).client.session.deleteMany({ where: { userId } });
  }
}
