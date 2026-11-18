import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { RouteDef } from '@swellwright/contracts';

import { type AppConfig } from '../config.js';
import { ROUTE_METADATA } from '../contract-route.js';
import { CONFIG } from '../tokens.js';
import { type AuthedRequest } from './context.js';
import { readCookie, SESSION_COOKIE } from './cookies.js';
import { SessionService } from './session.service.js';

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
