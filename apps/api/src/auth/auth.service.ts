import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthNextStep, TotpEnrollment } from '@swellwright/contracts';
import { type Credential, type Database, SessionStage } from '@swellwright/db';

import { type AppConfig } from '../config.js';
import { RateLimitedException } from '../http.js';
import { CONFIG, DATABASE, PASSWORD_HASHER, SECRET_BOX } from '../tokens.js';
import { type AuthContext, type RequestMeta, requireDatabase } from './context.js';
import { PasswordHasher } from './password.js';
import { WindowLimiter } from './rate-limit.js';
import { SecretBox } from './secret-box.js';
import { type IssuedSession, SessionService } from './session.service.js';
import { base32Encode, generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';
import {
  looksLikeTotpCode,
  newRecoveryCodes,
  normalizeRecoveryCode,
  recoveryCodeHash,
} from './tokens.js';

const ISSUER = 'Swellwright';
const LOGIN_ATTEMPTS_PER_ADDRESS = 30;
const LOGIN_WINDOW_MS = 5 * 60_000;

export interface Completed {
  readonly session: IssuedSession;
  readonly user: AuthContext['user'];
  readonly recoveryCodes?: readonly string[];
}

/** The context that binds a sealed TOTP secret to its owner and purpose. */
const totpContext = (userId: string): string => `swellwright:totp:v1:${userId}`;

/**
 * Sign-in in two steps: a password makes a session that can only finish the sign-in; a TOTP code (or a
 * recovery code) replaces it with a real one. Failures of either step count towards one lockout.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');
  private readonly loginLimiter = new WindowLimiter(LOGIN_ATTEMPTS_PER_ADDRESS, LOGIN_WINDOW_MS);

  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  /** Step one. Wrong credentials and unknown users answer alike, after the same amount of work. */
  async login(
    username: string,
    password: string,
    meta: RequestMeta,
  ): Promise<{ session: IssuedSession; next: AuthNextStep }> {
    if (!this.loginLimiter.hit(meta.ip ?? 'unknown')) {
      throw new RateLimitedException(Math.ceil(LOGIN_WINDOW_MS / 1000));
    }
    const user = await this.db.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      include: { credential: true },
    });
    const credential = user?.credential;
    if (!user || !credential || user.status !== 'active') {
      await this.hasher.verifyDummy(password);
      this.logger.warn('sign-in refused: unknown or disabled account');
      throw new UnauthorizedException('Invalid credentials.');
    }
    this.assertNotLocked(credential.lockedUntil);
    if (!(await this.hasher.verify(credential.passwordHash, password))) {
      await this.registerFailure(user.id);
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (this.hasher.needsRehash(credential.passwordHash)) {
      await this.db.credential.update({
        where: { userId: user.id },
        data: { passwordHash: await this.hasher.hash(password) },
      });
    }
    const session = await this.sessions.create(user.id, SessionStage.password_verified, meta);
    return { session, next: credential.totpConfirmedAt ? 'totp' : 'totp_enrollment' };
  }

  /** Starts a password-verified session for an account created in the setup. */
  async startPending(userId: string, meta: RequestMeta): Promise<IssuedSession> {
    return this.sessions.create(userId, SessionStage.password_verified, meta);
  }

  /** Step two: an authenticator code, or one recovery code. */
  async verifySecondStep(ctx: AuthContext, code: string, meta: RequestMeta): Promise<Completed> {
    const credential = await this.credentialOf(ctx);
    if (!credential.totpSecret || !credential.totpConfirmedAt) {
      // The authenticator was never confirmed: this session has to enroll, not verify.
      throw new ConflictException('The authenticator is not set up yet.');
    }
    this.assertNotLocked(credential.lockedUntil);
    const accepted = looksLikeTotpCode(code)
      ? await this.acceptTotp(ctx.user.id, credential.totpSecret, credential.totpLastStep, code)
      : await this.acceptRecoveryCode(ctx.user.id, code);
    if (!accepted) {
      await this.registerFailure(ctx.user.id);
      throw new UnauthorizedException('Invalid code.');
    }
    return this.complete(ctx, meta);
  }

  /** The secret to add to an authenticator. The same secret is returned until it is confirmed. */
  async startEnrollment(ctx: AuthContext): Promise<TotpEnrollment> {
    const credential = await this.credentialOf(ctx);
    if (credential.totpConfirmedAt) {
      throw new ConflictException('The authenticator is already set up.');
    }
    let secret: Buffer;
    if (credential.totpSecret) {
      secret = this.box.open(credential.totpSecret, totpContext(ctx.user.id));
    } else {
      secret = generateTotpSecret();
      await this.db.credential.update({
        where: { userId: ctx.user.id },
        // Prisma wants a plain Uint8Array for bytea; Buffer's backing store type is wider.
        data: { totpSecret: new Uint8Array(this.box.seal(secret, totpContext(ctx.user.id))) },
      });
    }
    return {
      secret: base32Encode(secret),
      otpauthUri: otpauthUri(ISSUER, ctx.user.username, secret),
    };
  }

  /** Proves the user holds the authenticator, creates the recovery codes and finishes the sign-in. */
  async confirmEnrollment(ctx: AuthContext, code: string, meta: RequestMeta): Promise<Completed> {
    const credential = await this.credentialOf(ctx);
    if (credential.totpConfirmedAt) {
      throw new ConflictException('The authenticator is already set up.');
    }
    if (!credential.totpSecret) {
      throw new ConflictException('Start the enrollment first.');
    }
    this.assertNotLocked(credential.lockedUntil);
    const accepted = await this.acceptTotp(
      ctx.user.id,
      credential.totpSecret,
      credential.totpLastStep,
      code,
    );
    if (!accepted) {
      await this.registerFailure(ctx.user.id);
      throw new UnauthorizedException('Invalid code.');
    }
    const recoveryCodes = newRecoveryCodes();
    await this.db.$transaction([
      this.db.credential.update({
        where: { userId: ctx.user.id },
        data: { totpConfirmedAt: new Date() },
      }),
      this.db.recoveryCode.deleteMany({ where: { userId: ctx.user.id } }),
      this.db.recoveryCode.createMany({
        data: recoveryCodes.map((c) => ({
          userId: ctx.user.id,
          codeHash: recoveryCodeHash(normalizeRecoveryCode(c) ?? c),
        })),
      }),
    ]);
    return { ...(await this.complete(ctx, meta)), recoveryCodes };
  }

  private async credentialOf(ctx: AuthContext): Promise<Credential> {
    const credential = await this.db.credential.findUnique({ where: { userId: ctx.user.id } });
    if (!credential) {
      throw new UnauthorizedException('Invalid session.');
    }
    return credential;
  }

  /** True when the code matches a later time step than the last one accepted. Records the step atomically. */
  private async acceptTotp(
    userId: string,
    sealed: Uint8Array,
    lastStep: number | null,
    code: string,
  ): Promise<boolean> {
    const secret = this.box.open(sealed, totpContext(userId));
    const step = verifyTotp({ secret, code, nowMs: Date.now(), lastStep });
    if (step === null) {
      return false;
    }
    // Two requests with the same code race here; only one may move the step forward.
    const claimed = await this.db.credential.updateMany({
      where: { userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return claimed.count === 1;
  }

  private async acceptRecoveryCode(userId: string, input: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(input);
    if (!normalized) {
      return false;
    }
    const used = await this.db.recoveryCode.updateMany({
      where: { userId, codeHash: recoveryCodeHash(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1;
  }

  private async complete(ctx: AuthContext, meta: RequestMeta): Promise<Completed> {
    const now = new Date();
    await this.db.credential.update({
      where: { userId: ctx.user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const user = await this.db.user.update({
      where: { id: ctx.user.id },
      data: { lastLoginAt: now },
    });
    // The password-verified session is replaced by a new one: nothing carries over.
    const session = await this.sessions.create(ctx.user.id, SessionStage.active, meta);
    await this.sessions.revokeSession(ctx.sessionId);
    this.logger.log(`sign-in completed for user ${ctx.user.id}`);
    return { session, user };
  }

  private assertNotLocked(lockedUntil: Date | null): void {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new RateLimitedException(
        Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
        'Too many failed attempts. Try again later.',
      );
    }
  }

  /** Counts a failed step; at the limit the account locks and every session of the user ends. */
  private async registerFailure(userId: string): Promise<void> {
    const updated = await this.db.credential.update({
      where: { userId },
      data: { failedAttempts: { increment: 1 } },
    });
    this.logger.warn(`sign-in step failed for user ${userId} (${String(updated.failedAttempts)})`);
    if (updated.failedAttempts >= this.config.lockoutAttempts) {
      await this.db.credential.update({
        where: { userId },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + this.config.lockoutMs) },
      });
      await this.sessions.revokeAllOf(userId);
      this.logger.warn(`account of user ${userId} locked`);
    }
  }
}
