import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type Database, SessionStage } from '@swellwright/db';

import { AuditService } from '../audit/audit.service.js';
import { type RequestMeta, requireDatabase } from '../auth/context.js';
import { PasswordHasher } from '../auth/password.js';
import { WindowLimiter } from '../auth/rate-limit.js';
import { type IssuedSession, SessionService } from '../auth/session.service.js';
import { hashToken } from '../auth/tokens.js';
import { RateLimitedException } from '../http.js';
import { DATABASE, PASSWORD_HASHER } from '../tokens.js';

const ACCEPT_ATTEMPTS = 10;
const ACCEPT_WINDOW_MS = 15 * 60_000;

/** Turns an invitation token into a password and a session that still has to set up the authenticator. */
@Injectable()
export class InvitationService {
  private readonly attempts = new WindowLimiter(ACCEPT_ATTEMPTS, ACCEPT_WINDOW_MS);

  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * An unknown, used or expired token, and a disabled user, all answer the same 401. The token is claimed by
   * deleting its row, so two requests with the same token cannot both succeed. The token is never logged.
   */
  async accept(
    token: string,
    password: string,
    meta: RequestMeta,
  ): Promise<{ session: IssuedSession }> {
    const db = requireDatabase(this.database).client;
    if (!this.attempts.hit(meta.ip ?? 'unknown')) {
      throw new RateLimitedException(Math.ceil(ACCEPT_WINDOW_MS / 1000));
    }
    const invitation = await db.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !invitation ||
      invitation.expiresAt.getTime() <= Date.now() ||
      invitation.user.status !== 'active'
    ) {
      throw new UnauthorizedException('This invitation is not valid.');
    }
    const passwordHash = await this.hasher.hash(password);
    const { user } = invitation;
    await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.deleteMany({ where: { id: invitation.id } });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('This invitation is not valid.');
      }
      // A fresh start: whatever credential there was belongs to the person the invitation replaces.
      await tx.credential.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.credential.create({ data: { userId: user.id, passwordHash } });
      await this.audit.record(
        {
          action: 'auth.invitation.accepted',
          outcome: 'success',
          actor: { id: user.id, name: user.username },
          object: { type: 'user', id: user.id },
          details: { purpose: invitation.purpose },
          meta,
        },
        tx,
      );
    });
    return { session: await this.sessions.create(user.id, SessionStage.password_verified, meta) };
  }
}
