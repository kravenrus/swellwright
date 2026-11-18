import {
  type AcceptInvitationRequest,
  type AuditPage,
  AuditPageSchema,
  type AuditQuery,
  ApiErrorSchema,
  type ChainVerification,
  ChainVerificationSchema,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type Elevation,
  ElevationSchema,
  type ErrorCode,
  type HealthResponse,
  HealthResponseSchema,
  type LoginRequest,
  type PendingSession,
  PendingSessionSchema,
  type ReadyResponse,
  ReadyResponseSchema,
  type RoleCatalog,
  RoleCatalogSchema,
  type SessionInfo,
  SessionInfoSchema,
  type SetupOwnerRequest,
  type SetupStatus,
  SetupStatusSchema,
  type TotpConfirmed,
  TotpConfirmedSchema,
  type TotpEnrollment,
  TotpEnrollmentSchema,
  type UpdateUserRequest,
  type UserInvitation,
  UserInvitationSchema,
  type UserList,
  type UserListQuery,
  UserListSchema,
  type UserView,
  UserViewSchema,
  type VersionResponse,
  VersionResponseSchema,
} from '@swellwright/contracts';
const BASE = '/api/v1';

export class ApiUnreachableError extends Error {
  constructor() {
    super('The API did not answer.');
  }
}

/** The person was asked to confirm with a code (step-up) and closed the dialog instead. */
export class StepUpCancelledError extends Error {
  constructor() {
    super('The confirmation was cancelled.');
  }
}

/** The API answered with the documented error envelope. Branch on `code`, never on the message. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'unknown',
    message: string,
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(message);
  }
}

/** Reads a JSON body and checks it against the contract, so a drifting server fails loudly. */
async function getJson<T>(path: string, schema: { parse: (data: unknown) => T }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  } catch {
    throw new ApiUnreachableError();
  }
  // A body that is not JSON (a proxy error page, an empty 502) means the API is not behind this address.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiUnreachableError();
  }
  // /ready answers 503 with the same body shape; any other mismatch fails the schema below.
  return schema.parse(body);
}

/**
 * A call that can fail with the error envelope. The session cookie travels by itself (same origin).
 * `schema` is undefined for a response without a body.
 */
async function send<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body: unknown,
  schema: { parse: (data: unknown) => T } | undefined,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiUnreachableError();
  }
  if (response.status === 204) {
    return undefined as T;
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiUnreachableError();
  }
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiUnreachableError();
    }
    const retry = Number(response.headers.get('retry-after'));
    throw new ApiRequestError(
      response.status,
      parsed.data.error.code,
      parsed.data.error.message,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  if (!schema) {
    return undefined as T;
  }
  return schema.parse(json);
}

export interface SystemStatus {
  health: HealthResponse;
  ready: ReadyResponse;
  version: VersionResponse;
}

export async function loadSystemStatus(): Promise<SystemStatus> {
  const [health, ready, version] = await Promise.all([
    getJson('/health', HealthResponseSchema),
    getJson('/ready', ReadyResponseSchema),
    getJson('/version', VersionResponseSchema),
  ]);
  return { health, ready, version };
}

export const getSetupStatus = (): Promise<SetupStatus> =>
  send('GET', '/setup/status', undefined, SetupStatusSchema);

export const createOwner = (request: SetupOwnerRequest): Promise<PendingSession> =>
  send('POST', '/setup/owner', request, PendingSessionSchema);

export const login = (request: LoginRequest): Promise<PendingSession> =>
  send('POST', '/auth/login', request, PendingSessionSchema);

export const verifyTotp = (code: string): Promise<SessionInfo> =>
  send('POST', '/auth/totp', { code }, SessionInfoSchema);

export const startTotpEnrollment = (): Promise<TotpEnrollment> =>
  send('POST', '/auth/totp/enrollment', undefined, TotpEnrollmentSchema);

export const confirmTotpEnrollment = (code: string): Promise<TotpConfirmed> =>
  send('POST', '/auth/totp/confirm', { code }, TotpConfirmedSchema);

export const logout = (): Promise<void> => send('POST', '/auth/logout', undefined, undefined);

export const stepUp = (code: string): Promise<Elevation> =>
  send('POST', '/auth/step-up', { code }, ElevationSchema);

export const acceptInvitation = (request: AcceptInvitationRequest): Promise<PendingSession> =>
  send('POST', '/auth/invitations/accept', request, PendingSessionSchema);

export const changePassword = (request: ChangePasswordRequest): Promise<void> =>
  send('POST', '/auth/password', request, undefined);

export const listUsers = (query: UserListQuery): Promise<UserList> =>
  send('GET', `/users${queryString(query)}`, undefined, UserListSchema);

export const createUser = (request: CreateUserRequest): Promise<UserInvitation> =>
  send('POST', '/users', request, UserInvitationSchema);

export const updateUser = (id: string, request: UpdateUserRequest): Promise<UserView> =>
  send('PATCH', `/users/${id}`, request, UserViewSchema);

export const resetCredentials = (id: string): Promise<UserInvitation> =>
  send('POST', `/users/${id}/reset-credentials`, undefined, UserInvitationSchema);

export const getRoles = (): Promise<RoleCatalog> =>
  send('GET', '/roles', undefined, RoleCatalogSchema);

/** `?a=1&b=2` from the values that are set, or nothing. */
function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const listAudit = (query: AuditQuery): Promise<AuditPage> =>
  send('GET', `/audit${queryString(query)}`, undefined, AuditPageSchema);

export const verifyAuditChain = (): Promise<ChainVerification> =>
  send('POST', '/audit/verify-chain', undefined, ChainVerificationSchema);

/** The current session, or null when nobody is signed in. */
export async function getMe(): Promise<SessionInfo | null> {
  try {
    return await send('GET', '/auth/me', undefined, SessionInfoSchema);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
