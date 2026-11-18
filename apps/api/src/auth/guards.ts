import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { hasPermission, type RouteDef } from '@swellwright/contracts';

import { AuditService } from '../audit/audit.service.js';
import { type AppConfig } from '../config.js';
import { ROUTE_METADATA } from '../contract-route.js';
import { StepUpRequiredException } from '../http.js';
import { CONFIG } from '../tokens.js';
import { type AuthedRequest, requestMeta } from './context.js';
import { readCookie, SESSION_COOKIE } from './cookies.js';
import { WindowLimiter } from './rate-limit.js';
import { SessionService } from './session.service.js';

/** A user who keeps calling what they may not call fills the audit chain, which is never pruned: cap it. */
const DENIED_EVENTS_PER_USER = 20;
const DENIED_WINDOW_MS = 10 * 60_000;

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function routeOf(context: ExecutionContext): RouteDef | undefined {
  return Reflect.getMetadata(ROUTE_METADATA, context.getHandler()) as RouteDef | undefined;
}

/**
 * CSRF defence for cookie sessions, on top of `SameSite=Strict`: a state-changing request that carries an
 * `Origin` must come from an allowed origin (the configured list, or the host the request was sent to).
 * Without an `Origin`, a browser still announces `Sec-Fetch-Site`. Requests with neither are not browsers.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!UNSAFE_METHODS.has(req.method)) {
      return true;
    }
    const origin = req.header('origin');
    const site = req.header('sec-fetch-site');
    let allowed = true;
    if (origin !== undefined) {
      allowed =
        this.config.allowedOrigins.length > 0
          ? this.config.allowedOrigins.includes(origin)
          : hostOf(origin) === req.header('host');
    } else if (site !== undefined) {
      allowed = site === 'same-origin' || site === 'none';
    }
    if (!allowed) {
      throw new ForbiddenException('The request comes from another origin.');
    }
    return true;
  }
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

/** Resolves the session cookie and enforces the `auth` level the route declares in the contract. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = routeOf(context);
    if (!route || route.auth === 'none') {
      return true;
    }
    if (route.auth === 'token') {
      // Swellwright API tokens do not exist yet; refuse rather than treat the route as open.
      throw new UnauthorizedException('Authentication required.');
    }
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req.header('cookie'), SESSION_COOKIE);
    const auth = token ? await this.sessions.authenticate(token) : null;
    const wanted = route.auth === 'pending' ? 'password_verified' : 'active';
    if (auth?.stage !== wanted) {
      throw new UnauthorizedException('Authentication required.');
    }
    req.auth = auth;
    return true;
  }
}

/**
 * Enforces `stepUp` (ADR 0017): the session must have proved the second factor within the step-up window.
 * Runs after the permission guard, so someone who may not do this at all hears 403 `forbidden`, not a request
 * for a code. A cookie session only: the guard refuses anything without one.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const route = routeOf(context);
    if (!route?.stepUp) {
      return true;
    }
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) {
      throw new UnauthorizedException('Authentication required.');
    }
    if (!auth.elevatedUntil || auth.elevatedUntil.getTime() <= Date.now()) {
      throw new StepUpRequiredException();
    }
    return true;
  }
}

/**
 * Enforces the `permission` a route declares (ADR 0015) against the role of the signed-in user, read from the
 * user row on this request, so a changed role or a disabled user takes effect at once. Runs after
 * `AuthGuard`. A refusal is recorded in the audit chain and answers 403.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly deniedEvents = new WindowLimiter(DENIED_EVENTS_PER_USER, DENIED_WINDOW_MS);

  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const route = routeOf(context);
    if (!route?.permission) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.auth;
    if (!auth) {
      // A permission on a route nobody signed in can reach is a mistake in the contract: refuse, do not allow.
      throw new UnauthorizedException('Authentication required.');
    }
    if (hasPermission(auth.user.role, route.permission)) {
      return true;
    }
    if (this.deniedEvents.hit(auth.user.id)) {
      await this.audit.note({
        action: 'authz.denied',
        outcome: 'denied',
        actor: { id: auth.user.id, name: auth.user.username },
        object: { type: 'route', id: route.operationId },
        details: { permission: route.permission },
        meta: requestMeta(req),
      });
    }
    throw new ForbiddenException('Your role does not allow this.');
  }
}
