import {
  type AcceptInvitationRequest,
  type AuditCheckpoint,
  AuditCheckpointSchema,
  type AuditCheckpointVerification,
  AuditCheckpointVerificationSchema,
  type AuditExport,
  type AuditExportQuery,
  AuditExportSchema,
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
  type PluginConfigView,
  PluginConfigViewSchema,
  type PluginList,
  PluginListSchema,
  type PluginView,
  PluginViewSchema,
  type ReadyResponse,
  ReadyResponseSchema,
  type RoleCatalog,
  RoleCatalogSchema,
  type SessionInfo,
  SessionInfoSchema,
  type SessionList,
  type SessionListQuery,
  SessionListSchema,
  type SessionsRevoked,
  SessionsRevokedSchema,
  type SetupOwnerRequest,
  type SetupStatus,
  SetupStatusSchema,
  type TotpConfirmed,
  TotpConfirmedSchema,
  type TotpEnrollment,
  TotpEnrollmentSchema,
  type CreatedToken,
  CreatedTokenSchema,
  type CreateTokenInput,
  type ChangeVaultPassphraseRequest,
  type ConfirmPassphraseRequest,
  type CreateSecretRequest,
  type InitializeVaultRequest,
  type RevealedSecret,
  RevealedSecretSchema,
  type SecretList,
  SecretListSchema,
  type SecretView,
  SecretViewSchema,
  type TokenList,
  type TokenListQuery,
  TokenListSchema,
  type UnsealVaultRequest,
  type UpdateSecretRequest,
  type UpdatePluginConfigRequest,
  type UpdatePreferencesRequest,
  type UpdateUserRequest,
  type UserInvitation,
  UserInvitationSchema,
  type UserList,
  type UserListQuery,
  UserListSchema,
  type UserSummary,
  UserSummarySchema,
  type UserView,
  UserViewSchema,
  type VaultInitialized,
  VaultInitializedSchema,
  type VaultStatus,
  VaultStatusSchema,
  type VaultRotated,
  VaultRotatedSchema,
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

export const getVaultStatus = (): Promise<VaultStatus> =>
  send('GET', '/vault/status', undefined, VaultStatusSchema);

export const initializeVault = (request: InitializeVaultRequest): Promise<VaultInitialized> =>
  send('POST', '/vault/initialize', request, VaultInitializedSchema);

export const unsealVault = (request: UnsealVaultRequest): Promise<VaultStatus> =>
  send('POST', '/vault/unseal', request, VaultStatusSchema);

export const sealVault = (): Promise<VaultStatus> =>
  send('POST', '/vault/seal', undefined, VaultStatusSchema);

/** Works while the vault is sealed; a wrong current passphrase answers 401 (`unauthorized`). */
export const changeVaultPassphrase = (
  request: ChangeVaultPassphraseRequest,
): Promise<VaultStatus> => send('POST', '/vault/passphrase', request, VaultStatusSchema);

/** A new recovery key, shown once; the old one stops working at once. */
export const rotateRecoveryKey = (request: ConfirmPassphraseRequest): Promise<VaultInitialized> =>
  send('POST', '/vault/recovery-key/rotate', request, VaultInitializedSchema);

/** Needs the vault open (423 `vault_sealed` otherwise). Issues a new recovery key as well. */
export const rotateKek = (request: ConfirmPassphraseRequest): Promise<VaultInitialized> =>
  send('POST', '/vault/rotate-kek', request, VaultInitializedSchema);

/** Needs the vault open. Every secret is encrypted again under a fresh data key. */
export const rotateDataKeys = (): Promise<VaultRotated> =>
  send('POST', '/vault/rotate-data-keys', undefined, VaultRotatedSchema);

export const listSecrets = (): Promise<SecretList> =>
  send('GET', '/secrets', undefined, SecretListSchema);

export const createSecret = (request: CreateSecretRequest): Promise<SecretView> =>
  send('POST', '/secrets', request, SecretViewSchema);

export const updateSecret = (id: string, request: UpdateSecretRequest): Promise<SecretView> =>
  send('PATCH', `/secrets/${id}`, request, SecretViewSchema);

export const deleteSecret = (id: string): Promise<void> =>
  send('DELETE', `/secrets/${id}`, undefined, undefined);

export const revealSecret = (id: string): Promise<RevealedSecret> =>
  send('POST', `/secrets/${id}/reveal`, undefined, RevealedSecretSchema);

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

/** Removes a disabled account for good (`users:write`, needs a fresh confirmation with a code). Its history stays in the audit log. */
export const deleteUser = (id: string): Promise<void> =>
  send('DELETE', `/users/${id}`, undefined, undefined);

/** Saves your language on the account so it follows you to other browsers; `null` follows the browser again. */
export const updatePreferences = (
  language: UpdatePreferencesRequest['language'],
): Promise<UserSummary> => send('PATCH', '/auth/preferences', { language }, UserSummarySchema);

export const getRoles = (): Promise<RoleCatalog> =>
  send('GET', '/roles', undefined, RoleCatalogSchema);

/** The signed-in sessions of your own account; `current` marks the one making the call. */
export const listMySessions = (): Promise<SessionList> =>
  send('GET', '/auth/sessions', undefined, SessionListSchema);

/** Ends another session of your own account. Ending the one in use is refused (409). */
export const revokeMySession = (id: string): Promise<void> =>
  send('DELETE', `/auth/sessions/${id}`, undefined, undefined);

/** Ends every session of your account except the one in use. */
export const revokeOtherSessions = (): Promise<SessionsRevoked> =>
  send('POST', '/auth/sessions/revoke-others', undefined, SessionsRevokedSchema);

/** The signed-in sessions of every user, or of one (`sessions:read`). */
export const listSessions = (query: SessionListQuery): Promise<SessionList> =>
  send('GET', `/sessions${queryString(query)}`, undefined, SessionListSchema);

/** Ends a session of any user (`sessions:revoke`, needs a fresh confirmation with a code). */
export const revokeSession = (id: string): Promise<void> =>
  send('DELETE', `/sessions/${id}`, undefined, undefined);

/** Ends every session of a user (`sessions:revoke`, needs a fresh confirmation with a code). */
export const revokeUserSessions = (id: string): Promise<SessionsRevoked> =>
  send('POST', `/users/${id}/sessions/revoke`, undefined, SessionsRevokedSchema);

/** Your own API tokens: active, expired and revoked ones, never their values. */
export const listMyTokens = (): Promise<TokenList> =>
  send('GET', '/auth/tokens', undefined, TokenListSchema);

/** Revokes one of your own tokens. Revoking one that is already revoked is not an error. */
export const revokeMyToken = (id: string): Promise<void> =>
  send('DELETE', `/auth/tokens/${id}`, undefined, undefined);

/** Creates a token in your name (`tokens:create`, needs a fresh confirmation with a code). The value comes back once. */
export const createToken = (request: CreateTokenInput): Promise<CreatedToken> =>
  send('POST', '/tokens', request, CreatedTokenSchema);

/** The API tokens of every user, or of one (`tokens:read`). */
export const listTokens = (query: TokenListQuery): Promise<TokenList> =>
  send('GET', `/tokens${queryString(query)}`, undefined, TokenListSchema);

/** Revokes a token of any user (`tokens:revoke`, needs a fresh confirmation with a code). */
export const revokeToken = (id: string): Promise<void> =>
  send('DELETE', `/tokens/${id}`, undefined, undefined);

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

/** One page of the log for the export file, oldest first (`audit:export`, needs a fresh confirmation with a code). */
export const exportAudit = (query: AuditExportQuery): Promise<AuditExport> =>
  send('GET', `/audit/export${queryString(query)}`, undefined, AuditExportSchema);

/** The head of the chain as signed text, to be kept outside the database (`audit:verify`). */
export const createAuditCheckpoint = (): Promise<AuditCheckpoint> =>
  send('POST', '/audit/checkpoints', undefined, AuditCheckpointSchema);

/** Checks the log against a checkpoint noted earlier. A failed check is an answer (`ok: false`), not an error. */
export const verifyAuditCheckpoint = (checkpoint: string): Promise<AuditCheckpointVerification> =>
  send('POST', '/audit/checkpoints/verify', { checkpoint }, AuditCheckpointVerificationSchema);

/** The plugins found in the configured directories, and where each stands (`plugins:read`). */
export const listPlugins = (): Promise<PluginList> =>
  send('GET', '/plugins', undefined, PluginListSchema);

/**
 * Enables a plugin (`plugins:manage`, needs a fresh confirmation with a code). `digest` is the one the person was
 * shown: if the files differ now, the server refuses with 409 rather than approve something nobody looked at.
 */
export const enablePlugin = (id: string, digest: string): Promise<PluginView> =>
  send('POST', `/plugins/${id}/enable`, { digest }, PluginViewSchema);

/** Disables a plugin (`plugins:manage`, needs a fresh confirmation with a code). Its approval stays on record. */
export const disablePlugin = (id: string): Promise<PluginView> =>
  send('POST', `/plugins/${id}/disable`, undefined, PluginViewSchema);

/**
 * Starts an enabled plugin in its restricted process and loads its modules (`plugins:manage`, needs a fresh
 * confirmation with a code). A plugin that fails to load is an answer (`runtime.state` is `failed`), not an error.
 */
export const checkPlugin = (id: string): Promise<PluginView> =>
  send('POST', `/plugins/${id}/check`, undefined, PluginViewSchema);

/**
 * The settings a plugin declares and what is set now (`plugins:read`). A secret field holds the id of a vault
 * secret, never its value. 404 for a plugin that has no settings.
 */
export const getPluginConfig = (id: string): Promise<PluginConfigView> =>
  send('GET', `/plugins/${id}/config`, undefined, PluginConfigViewSchema);

/**
 * Replaces the settings of a plugin (`plugins:manage`, needs a fresh confirmation with a code). A value the server
 * does not accept is a 400 whose message names each field; nothing is stored then.
 */
export const updatePluginConfig = (
  id: string,
  values: UpdatePluginConfigRequest['values'],
): Promise<PluginConfigView> =>
  send('PUT', `/plugins/${id}/config`, { values }, PluginConfigViewSchema);

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
