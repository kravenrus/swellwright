import { ServiceUnavailableException } from '@nestjs/common';
import type { UserSummary } from '@swellwright/contracts';
import type { Database, User } from '@swellwright/db';
import type { Request } from 'express';

/** The session a request came with, resolved by the authentication guard. */
export interface AuthContext {
  readonly sessionId: string;
  readonly stage: 'password_verified' | 'active';
  readonly user: User;
  /** When the session ends if it stays idle. */
  readonly expiresAt: Date;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export interface RequestMeta {
  readonly ip: string | undefined;
  readonly userAgent: string | undefined;
}

export function requestMeta(req: Request): RequestMeta {
  const userAgent = req.get('user-agent');
  return { ip: req.ip, userAgent: userAgent?.slice(0, 256) };
}

/** The sign-in routes need the database; without one the API answers 503 like a failing readiness probe. */
export function requireDatabase(database: Database | undefined): Database {
  if (!database) {
    throw new ServiceUnavailableException('The database is not configured.');
  }
  return database;
}

export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    language: user.language,
    theme: user.theme,
  };
}
