import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreatedToken,
  type CreateTokenRequest,
  hasPermission,
  PERMISSIONS,
  type Permission,
  STEP_UP_PERMISSIONS,
  TOKEN_MAX_ACTIVE,
  TOKEN_PATTERN,
  TOKEN_PREFIX,
  type TokenList,
  type TokenListQuery,
  type TokenState,
  type TokenView,
} from '@swellwright/contracts';
import { type Database, type User } from '@swellwright/db';

import { AuditService } from '../audit/audit.service.js';
import { RateLimitedException } from '../http.js';
import { DATABASE } from '../tokens.js';
import { ipInRanges } from './cidr.js';
import { type AuthContext, type RequestMeta, requireDatabase } from './context.js';
import { WindowLimiter } from './rate-limit.js';
import { hashToken } from './tokens.js';

/** The most tokens one listing returns. */
const LIST_LIMIT = 500;
/** `lastUsedAt` moves forward at most this often, so a busy integration does not write on every request. */
const TOUCH_AFTER_MS = 60_000;
/** Revoked and expired tokens stay listed this long, then they are removed. */
const KEEP_AFTER_END_MS = 30 * 24 * 3_600_000;
/** Wrong tokens per address and window: guessing 256 random bits cannot work, but it should not be free. */
const FAILURES_PER_ADDRESS = 30;
const FAILURE_WINDOW_MS = 10 * 60_000;
/** A dead token that keeps being used fills the audit chain, which is never pruned: cap it per token. */
const DENIED_NOTES_PER_TOKEN = 5;

interface Row {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly prefix: string;
  readonly permissions: string[];
  readonly ipAllowlist: string[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date | null;
  readonly lastUsedIp: string | null;
  readonly revokedAt: Date | null;
  readonly user: { readonly username: string };
}

const PERMISSION_SET = new Set<string>(PERMISSIONS);

function stateOf(row: Row, now: number): TokenState {
  if (row.revokedAt) {
    return 'revoked';
  }
  return row.expiresAt.getTime() <= now ? 'expired' : 'active';
}

function toView(row: Row, now: number): TokenView {
  return {
    id: row.id,
    userId: row.userId,
    username: row.user.username,
    name: row.name,
    prefix: row.prefix,
    permissions: row.permissions.filter((p): p is Permission => PERMISSION_SET.has(p)),
    ipAllowlist: row.ipAllowlist,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    state: stateOf(row, now),
  };
}

/** What a token may do right now: what it carries, as far as the role of its owner still allows it. */
export function grantsOf(row: { permissions: string[] }, user: Pick<User, 'role'>): Permission[] {
  return row.permissions.filter(
    (p): p is Permission =>
      PERMISSION_SET.has(p) &&
      !STEP_UP_PERMISSIONS.includes(p as Permission) &&
      hasPermission(user.role, p as Permission),
  );
}

/**
 * API tokens (ADR 0023): bearer credentials for the CLI and integrations, issued in the name of a user. Only the
 * hash is stored. A token carries a subset of its owner's permissions, never one that needs a second factor,
 * and what it may do is checked against the owner's role on every request, so a demoted or disabled owner
 * takes the token's power away at once.
 */
@Injectable()
export class TokenService {
  private readonly failures = new WindowLimiter(FAILURES_PER_ADDRESS, FAILURE_WINDOW_MS);
  private readonly deniedNotes = new WindowLimiter(DENIED_NOTES_PER_TOKEN, FAILURE_WINDOW_MS);

  constructor(
    @Inject(DATABASE) private readonly database: Database | undefined,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db(): Database['client'] {
    return requireDatabase(this.database).client;
  }

  async create(
    auth: AuthContext,
    input: CreateTokenRequest,
    meta: RequestMeta,
  ): Promise<CreatedToken> {
    const missing = input.permissions.filter((p) => !hasPermission(auth.user.role, p));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Your role does not have: ${missing.join(', ')}. A token cannot carry more than you can do.`,
      );
    }
    const now = new Date();
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
    const row = await this.db.$transaction(async (tx) => {
      const active = await tx.apiToken.count({
        where: { userId: auth.user.id, revokedAt: null, expiresAt: { gt: now } },
      });
      if (active >= TOKEN_MAX_ACTIVE) {
        throw new ConflictException(
          `You already have ${String(TOKEN_MAX_ACTIVE)} active tokens. Revoke one first.`,
        );
      }
      const cutoff = new Date(now.getTime() - KEEP_AFTER_END_MS);
      await tx.apiToken.deleteMany({
        where: {
          userId: auth.user.id,
          OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
        },
      });
      const created = await tx.apiToken.create({
        data: {
          userId: auth.user.id,
          name: input.name,
          tokenHash: hashToken(token),
          prefix: token.slice(0, 8),
          permissions: input.permissions,
          ipAllowlist: input.ipAllowlist,
          expiresAt,
        },
        include: { user: { select: { username: true } } },
      });
      await this.audit.record(
        {
          action: 'token.created',
          outcome: 'success',
          actor: { id: auth.user.id, name: auth.user.username },
          object: { type: 'token', id: created.id },
          details: {
            name: input.name,
            prefix: created.prefix,
            days: input.expiresInDays,
            permissions: input.permissions.length,
            restricted: input.ipAllowlist.length > 0,
          },
          meta,
        },
        tx,
      );
      return created;
    });
    return { token, view: toView(row, now.getTime()) };
  }

  async listOwn(auth: AuthContext): Promise<TokenList> {
    const rows = await this.db.apiToken.findMany({
      where: { userId: auth.user.id },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    const now = Date.now();
    return { tokens: rows.map((row) => toView(row, now)) };
  }

  async listAll(query: TokenListQuery): Promise<TokenList> {
    const rows = await this.db.apiToken.findMany({
      where: query.userId ? { userId: query.userId } : {},
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    const now = Date.now();
    return { tokens: rows.map((row) => toView(row, now)) };
  }

  /** Revokes a token. `own` limits it to the caller's tokens: someone else's is "not found". Idempotent. */
  async revoke(
    auth: AuthContext,
    id: string,
    scope: 'own' | 'any',
    meta: RequestMeta,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.apiToken.findUnique({
        where: { id },
        include: { user: { select: { username: true } } },
      });
      if (!row || (scope === 'own' && row.userId !== auth.user.id)) {
        throw new NotFoundException('There is no such token.');
      }
      if (row.revokedAt) {
        return;
      }
      await tx.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record(
        {
          action: 'token.revoked',
          outcome: 'success',
          actor: { id: auth.user.id, name: auth.user.username },
          object: { type: 'token', id },
          details: {
            scope: row.userId === auth.user.id ? 'own' : 'user',
            user: row.user.username,
            name: row.name,
          },
          meta,
        },
        tx,
      );
    });
  }

  /**
   * The context of a request that carries a bearer token, or null when the token is unknown, malformed, revoked,
   * expired, used from an address it is not allowed from, or its owner is disabled. Too many wrong tokens from
   * one address answer 429.
   */
  async authenticate(raw: string, meta: RequestMeta): Promise<AuthContext | null> {
    if (!TOKEN_PATTERN.test(raw)) {
      return this.failed(meta);
    }
    const row = await this.db.apiToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });
    if (!row) {
      return this.failed(meta);
    }
    const now = Date.now();
    const deny = async (reason: 'revoked' | 'expired' | 'address'): Promise<null> => {
      if (this.deniedNotes.hit(row.id)) {
        await this.audit.note({
          action: 'auth.token.denied',
          outcome: 'denied',
          actor: { id: row.user.id, name: row.user.username },
          object: { type: 'token', id: row.id },
          details: { reason, prefix: row.prefix },
          meta,
        });
      }
      return null;
    };
    if (row.revokedAt) {
      return deny('revoked');
    }
    if (row.expiresAt.getTime() <= now) {
      return deny('expired');
    }
    if (row.user.status !== 'active') {
      return null;
    }
    if (!ipInRanges(meta.ip, row.ipAllowlist)) {
      return deny('address');
    }
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
      await this.db.apiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date(now), lastUsedIp: meta.ip?.slice(0, 64) ?? null },
      });
    }
    return {
      sessionId: '',
      stage: 'active',
      user: row.user,
      expiresAt: row.expiresAt,
      elevatedUntil: null,
      via: 'token',
      tokenId: row.id,
      grants: grantsOf(row, row.user),
    };
  }

  private failed(meta: RequestMeta): null {
    if (!this.failures.hit(meta.ip ?? 'unknown')) {
      throw new RateLimitedException(Math.ceil(FAILURE_WINDOW_MS / 1000));
    }
    return null;
  }
}
