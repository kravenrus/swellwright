import type { CookieOptions, Response } from 'express';

import type { AppConfig } from '../config.js';
import { API_PREFIX } from '../contract-route.js';

export const SESSION_COOKIE = 'sw_session';

function cookieOptions(config: AppConfig): CookieOptions {
  // A session cookie (no expiry): the server decides how long a session lives. Scoped to the API path and
  // never sent cross-site.
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: `/${API_PREFIX}`,
  };
}

export function setSessionCookie(res: Response, token: string, config: AppConfig): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions(config));
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

/** Reads one cookie from a `Cookie` header. Invalid pairs are skipped; the first occurrence wins. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) {
      continue;
    }
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value.length > 0 && value.length <= 256 ? value : undefined;
    }
  }
  return undefined;
}
