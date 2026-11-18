import { z } from 'zod';

import { AuditPageSchema, AuditQuerySchema, ChainVerificationSchema } from './audit.js';
import {
  LoginRequestSchema,
  PendingSessionSchema,
  SessionInfoSchema,
  SetupOwnerRequestSchema,
  SetupStatusSchema,
  TotpCodeRequestSchema,
  TotpConfirmedSchema,
  TotpEnrollmentSchema,
} from './auth.js';
import { ApiErrorSchema } from './errors.js';
import { type Permission, RoleCatalogSchema } from './roles.js';
import { HealthResponseSchema, ReadyResponseSchema, VersionResponseSchema } from './system.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Who may call a route.
 * - `none`: anyone (probes, the API description, the sign-in entry points).
 * - `pending`: a session whose password was accepted and whose second step is still open.
 * - `session`: a fully signed-in session.
 * - `token`: a Swellwright API token.
 */
export type RouteAuth = 'none' | 'pending' | 'session' | 'token';

export interface ResponseDef {
  readonly description: string;
  readonly schema: z.ZodType;
  /** The response has no body (for example 204). */
  readonly empty?: boolean;
}

export interface RouteDef {
  readonly operationId: string;
  readonly method: HttpMethod;
  /** Relative to the API base path (`/api/v1`), OpenAPI style: `/runs/{id}`. */
  readonly path: string;
  readonly tags: readonly string[];
  readonly summary: string;
  readonly description?: string;
  readonly auth: RouteAuth;
  /**
   * What the caller's role must allow (ADR 0015). Required for a signed-in route, except the few that every
   * signed-in user may call (`ROUTES_OPEN_TO_ANY_SESSION`).
   */
  readonly permission?: Permission;
  readonly request?: {
    readonly params?: z.ZodObject<Record<string, z.ZodType>>;
    readonly query?: z.ZodObject<Record<string, z.ZodType>>;
    readonly body?: z.ZodType;
  };
  /** Successful and expected non-successful responses by HTTP status. */
  readonly responses: Readonly<Record<number, ResponseDef>>;
}

/** Keeps the literal types of a definition so handlers can be typed from it. */
export const defineRoute = <const T extends RouteDef>(route: T): T => route;

const ERROR = { description: 'Error envelope.', schema: ApiErrorSchema } as const;

export const healthRoute = defineRoute({
  operationId: 'getHealth',
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Liveness probe',
  description: 'Answers while the process serves requests. It does not check dependencies.',
  auth: 'none',
  responses: { 200: { description: 'The process is alive.', schema: HealthResponseSchema } },
});

export const readyRoute = defineRoute({
  operationId: 'getReady',
  method: 'get',
  path: '/ready',
  tags: ['system'],
  summary: 'Readiness probe',
  description:
    'Checks every configured dependency. Answers 503 with the same body shape when one is down.',
  auth: 'none',
  responses: {
    200: { description: 'Every configured dependency answers.', schema: ReadyResponseSchema },
    503: { description: 'At least one dependency is down.', schema: ReadyResponseSchema },
  },
});

export const versionRoute = defineRoute({
  operationId: 'getVersion',
  method: 'get',
  path: '/version',
  tags: ['system'],
  summary: 'Build and API version',
  auth: 'none',
  responses: { 200: { description: 'Version information.', schema: VersionResponseSchema } },
});

export const openApiRoute = defineRoute({
  operationId: 'getOpenApi',
  method: 'get',
  path: '/openapi.json',
  tags: ['system'],
  summary: 'This API description',
  description: 'The OpenAPI 3.1 document generated from the route registry.',
  auth: 'none',
  responses: {
    200: { description: 'The OpenAPI document.', schema: z.record(z.string(), z.unknown()) },
  },
});

export const getSetupStatusRoute = defineRoute({
  operationId: 'getSetupStatus',
  method: 'get',
  path: '/setup/status',
  tags: ['setup'],
  summary: 'Whether the instance owner exists',
  description: 'Lets the console choose between the first-run setup and the sign-in page.',
  auth: 'none',
  responses: { 200: { description: 'Setup state.', schema: SetupStatusSchema } },
});

export const createOwnerRoute = defineRoute({
  operationId: 'createOwner',
  method: 'post',
  path: '/setup/owner',
  tags: ['setup'],
  summary: 'Create the instance owner',
  description:
    'Works once, with the setup token the server printed to its log at start. Starts a session that still needs the authenticator to be set up (`/auth/totp/enrollment`).',
  auth: 'none',
  request: { body: SetupOwnerRequestSchema },
  responses: {
    200: { description: 'The owner was created.', schema: PendingSessionSchema },
  },
});

export const loginRoute = defineRoute({
  operationId: 'login',
  method: 'post',
  path: '/auth/login',
  tags: ['auth'],
  summary: 'Sign in with a password',
  description:
    'The first of two steps. On success a session cookie is set that is not yet usable for anything except finishing the sign-in. Wrong credentials and unknown users answer the same 401; repeated failures lock the account for a while (429).',
  auth: 'none',
  request: { body: LoginRequestSchema },
  responses: { 200: { description: 'The password was accepted.', schema: PendingSessionSchema } },
});

export const totpRoute = defineRoute({
  operationId: 'verifyTotp',
  method: 'post',
  path: '/auth/totp',
  tags: ['auth'],
  summary: 'Finish signing in with an authenticator code or a recovery code',
  description:
    'A recovery code works once. The session cookie is replaced by a new one when the sign-in completes.',
  auth: 'pending',
  request: { body: TotpCodeRequestSchema },
  responses: { 200: { description: 'Signed in.', schema: SessionInfoSchema } },
});

export const totpEnrollmentRoute = defineRoute({
  operationId: 'startTotpEnrollment',
  method: 'post',
  path: '/auth/totp/enrollment',
  tags: ['auth'],
  summary: 'Get the authenticator secret',
  description:
    'Only before the authenticator was confirmed. Repeated calls return the same secret until it is confirmed.',
  auth: 'pending',
  responses: {
    200: { description: 'The secret to add to an authenticator.', schema: TotpEnrollmentSchema },
  },
});

export const totpConfirmRoute = defineRoute({
  operationId: 'confirmTotpEnrollment',
  method: 'post',
  path: '/auth/totp/confirm',
  tags: ['auth'],
  summary: 'Confirm the authenticator and finish signing in',
  description: 'Returns the recovery codes. They are shown once and only their hashes are kept.',
  auth: 'pending',
  request: { body: TotpCodeRequestSchema },
  responses: { 200: { description: 'Signed in.', schema: TotpConfirmedSchema } },
});

export const logoutRoute = defineRoute({
  operationId: 'logout',
  method: 'post',
  path: '/auth/logout',
  tags: ['auth'],
  summary: 'Sign out',
  description: 'Ends the current session if there is one. Always answers 204.',
  auth: 'none',
  responses: {
    204: { description: 'The session is gone.', schema: z.undefined(), empty: true },
  },
});

export const meRoute = defineRoute({
  operationId: 'getMe',
  method: 'get',
  path: '/auth/me',
  tags: ['auth'],
  summary: 'The signed-in user',
  auth: 'session',
  responses: { 200: { description: 'The current session.', schema: SessionInfoSchema } },
});

export const rolesRoute = defineRoute({
  operationId: 'getRoles',
  method: 'get',
  path: '/roles',
  tags: ['roles'],
  summary: 'The roles and the permission catalogue',
  description:
    'The built-in roles with the permissions each holds, and every permission with its meaning.',
  auth: 'session',
  permission: 'roles:read',
  responses: { 200: { description: 'The catalogue.', schema: RoleCatalogSchema } },
});

export const listAuditRoute = defineRoute({
  operationId: 'listAudit',
  method: 'get',
  path: '/audit',
  tags: ['audit'],
  summary: 'Read the audit log',
  description: 'Newest first. Page back with `cursor`. Filters combine.',
  auth: 'session',
  permission: 'audit:read',
  request: { query: AuditQuerySchema },
  responses: { 200: { description: 'One page of events.', schema: AuditPageSchema } },
});

export const verifyAuditChainRoute = defineRoute({
  operationId: 'verifyAuditChain',
  method: 'post',
  path: '/audit/verify-chain',
  tags: ['audit'],
  summary: 'Verify the integrity of the audit chain',
  description:
    'Reads the whole log and checks the numbering, every link and every hash. The run is itself recorded. A broken chain is a normal answer (`ok: false`), not an error.',
  auth: 'session',
  permission: 'audit:verify',
  responses: { 200: { description: 'The result.', schema: ChainVerificationSchema } },
});

/** Routes any signed-in user may call without a permission. Everything else under `session` names one. */
export const ROUTES_OPEN_TO_ANY_SESSION: readonly string[] = ['getMe'];

/** Every route of the public API. The server binds its handlers to these definitions. */
export const routes = [
  healthRoute,
  readyRoute,
  versionRoute,
  openApiRoute,
  getSetupStatusRoute,
  createOwnerRoute,
  loginRoute,
  totpRoute,
  totpEnrollmentRoute,
  totpConfirmRoute,
  logoutRoute,
  meRoute,
  rolesRoute,
  listAuditRoute,
  verifyAuditChainRoute,
] as const;

/** Errors every route may return, documented once. */
export const commonErrors = { default: ERROR } as const;
