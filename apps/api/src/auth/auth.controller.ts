import { Body, Controller, Inject, Req, Res } from '@nestjs/common';
import {
  loginRoute,
  logoutRoute,
  meRoute,
  type LoginRequest,
  type PendingSession,
  type SessionInfo,
  totpConfirmRoute,
  totpEnrollmentRoute,
  totpRoute,
  type TotpCodeRequest,
  type TotpConfirmed,
  type TotpEnrollment,
} from '@swellwright/contracts';
import type { Request, Response } from 'express';

import { type AppConfig } from '../config.js';
import { ContractRoute } from '../contract-route.js';
import { CONFIG } from '../tokens.js';
import { AuthService } from './auth.service.js';
import { type AuthedRequest, requestMeta, toUserSummary } from './context.js';
import { clearSessionCookie, readCookie, SESSION_COOKIE, setSessionCookie } from './cookies.js';
import { SessionService } from './session.service.js';

@Controller()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @ContractRoute(loginRoute)
  async login(
    @Body() body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PendingSession> {
    const { session, next } = await this.auth.login(body.username, body.password, requestMeta(req));
    setSessionCookie(res, session.token, this.config);
    return { next };
  }

  @ContractRoute(totpRoute)
  async totp(
    @Body() body: TotpCodeRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionInfo> {
    const { session, user } = await this.auth.verifySecondStep(
      requireAuth(req),
      body.code,
      requestMeta(req),
    );
    setSessionCookie(res, session.token, this.config);
    return { user: toUserSummary(user), expiresAt: session.expiresAt.toISOString() };
  }

  @ContractRoute(totpEnrollmentRoute)
  enrollment(@Req() req: AuthedRequest): Promise<TotpEnrollment> {
    return this.auth.startEnrollment(requireAuth(req));
  }

  @ContractRoute(totpConfirmRoute)
  async confirm(
    @Body() body: TotpCodeRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TotpConfirmed> {
    const { session, user, recoveryCodes } = await this.auth.confirmEnrollment(
      requireAuth(req),
      body.code,
      requestMeta(req),
    );
    setSessionCookie(res, session.token, this.config);
    return {
      user: toUserSummary(user),
      expiresAt: session.expiresAt.toISOString(),
      recoveryCodes: [...(recoveryCodes ?? [])],
    };
  }

  @ContractRoute(logoutRoute)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req.header('cookie'), SESSION_COOKIE);
    if (token) {
      await this.sessions.revokeToken(token);
    }
    clearSessionCookie(res, this.config);
  }

  @ContractRoute(meRoute)
  me(@Req() req: AuthedRequest): SessionInfo {
    const auth = requireAuth(req);
    return { user: toUserSummary(auth.user), expiresAt: auth.expiresAt.toISOString() };
  }
}

/** The guard has resolved the session by the time a handler runs; this narrows the type. */
function requireAuth(req: AuthedRequest): NonNullable<AuthedRequest['auth']> {
  if (!req.auth) {
    throw new Error('The authentication guard did not run for this route.');
  }
  return req.auth;
}
