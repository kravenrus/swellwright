import { z } from 'zod';

import {
  AuditCheckpointSchema,
  AuditCheckpointVerificationSchema,
  AuditExportQuerySchema,
  AuditExportSchema,
  AuditPageSchema,
  AuditQuerySchema,
  ChainVerificationSchema,
  VerifyAuditCheckpointRequestSchema,
} from './audit.js';
import {
  AcceptInvitationRequestSchema,
  ChangePasswordRequestSchema,
  ElevationSchema,
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
import {
  SessionIdParamsSchema,
  SessionListQuerySchema,
  SessionListSchema,
  SessionsRevokedSchema,
} from './sessions.js';
import { HealthResponseSchema, ReadyResponseSchema, VersionResponseSchema } from './system.js';
import {
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  UserIdParamsSchema,
  UserInvitationSchema,
  UserListQuerySchema,
  UserListSchema,
  UserViewSchema,
} from './users.js';
import {
  ChangeVaultPassphraseRequestSchema,
  ConfirmPassphraseRequestSchema,
  CreateSecretRequestSchema,
  InitializeVaultRequestSchema,
  RevealedSecretSchema,
  SecretIdParamsSchema,
  SecretListSchema,
  SecretViewSchema,
  UnsealVaultRequestSchema,
  UpdateSecretRequestSchema,
  VaultInitializedSchema,
  VaultRotatedSchema,
  VaultStatusSchema,
} from './vault.js';

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
  /**
   * The session must have been freshly verified with the second factor (ADR 0017); otherwise 403 with the
   * code `step_up_required`. Required for routes that hold a permission in `STEP_UP_PERMISSIONS`.
   */
  readonly stepUp?: true;
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

export const stepUpRoute = defineRoute({
  operationId: 'stepUp',
  method: 'post',
  path: '/auth/step-up',
  tags: ['auth'],
  summary: 'Prove the second factor again to elevate the session',
  description:
    'Takes a code from the authenticator or a recovery code. For a short time afterwards the session may call the routes marked `x-sw-step-up`; they answer 403 `step_up_required` before that. A wrong code counts towards the lockout like a wrong code at sign-in. Signing in elevates the session already.',
  auth: 'session',
  request: { body: TotpCodeRequestSchema },
  responses: { 200: { description: 'The session is elevated.', schema: ElevationSchema } },
});

export const acceptInvitationRoute = defineRoute({
  operationId: 'acceptInvitation',
  method: 'post',
  path: '/auth/invitations/accept',
  tags: ['auth'],
  summary: 'Choose a password with an invitation token',
  description:
    'For a new user or one whose credentials were reset. The token is used up. Starts a session that still needs the authenticator to be set up (`/auth/totp/enrollment`). An unknown, used or expired token answers 401.',
  auth: 'none',
  request: { body: AcceptInvitationRequestSchema },
  responses: { 200: { description: 'The password was set.', schema: PendingSessionSchema } },
});

export const changePasswordRoute = defineRoute({
  operationId: 'changePassword',
  method: 'post',
  path: '/auth/password',
  tags: ['auth'],
  summary: 'Change your own password',
  description:
    'Needs the current password and an elevated session. Ends your other sessions and keeps this one. A wrong current password counts towards the lockout.',
  auth: 'session',
  stepUp: true,
  request: { body: ChangePasswordRequestSchema },
  responses: {
    204: { description: 'The password was changed.', schema: z.undefined(), empty: true },
  },
});

export const listUsersRoute = defineRoute({
  operationId: 'listUsers',
  method: 'get',
  path: '/users',
  tags: ['users'],
  summary: 'List the users',
  auth: 'session',
  permission: 'users:read',
  request: { query: UserListQuerySchema },
  responses: { 200: { description: 'One page of users.', schema: UserListSchema } },
});

export const createUserRoute = defineRoute({
  operationId: 'createUser',
  method: 'post',
  path: '/users',
  tags: ['users'],
  summary: 'Invite a user',
  description:
    'Creates the account without a password and returns an invitation. The token is shown once. A taken login name or e-mail address answers 409.',
  auth: 'session',
  permission: 'users:write',
  stepUp: true,
  request: { body: CreateUserRequestSchema },
  responses: { 201: { description: 'The user and the invitation.', schema: UserInvitationSchema } },
});

export const updateUserRoute = defineRoute({
  operationId: 'updateUser',
  method: 'patch',
  path: '/users/{id}',
  tags: ['users'],
  summary: 'Change a user',
  description:
    'Role, status, display name and e-mail address. Refused with 409 when it would leave the instance without an active owner, or when you change your own role or status. Disabling a user ends their sessions.',
  auth: 'session',
  permission: 'users:write',
  stepUp: true,
  request: { params: UserIdParamsSchema, body: UpdateUserRequestSchema },
  responses: { 200: { description: 'The user after the change.', schema: UserViewSchema } },
});

export const resetCredentialsRoute = defineRoute({
  operationId: 'resetCredentials',
  method: 'post',
  path: '/users/{id}/reset-credentials',
  tags: ['users'],
  summary: 'Reset the password and the authenticator of a user',
  description:
    'Deletes the password, the authenticator and the recovery codes, ends every session of the user at once, and returns a new invitation. The user cannot sign in until it is accepted. Refused with 409 when you reset your own account (change your password instead).',
  auth: 'session',
  permission: 'users:write',
  stepUp: true,
  request: { params: UserIdParamsSchema },
  responses: {
    200: { description: 'The user and a new invitation.', schema: UserInvitationSchema },
  },
});

export const vaultStatusRoute = defineRoute({
  operationId: 'getVaultStatus',
  method: 'get',
  path: '/vault/status',
  tags: ['vault'],
  summary: 'Whether the vault exists and is open',
  description: 'Also the number of secrets. Works while the vault is sealed.',
  auth: 'session',
  permission: 'vault:read',
  responses: { 200: { description: 'The status.', schema: VaultStatusSchema } },
});

export const initializeVaultRoute = defineRoute({
  operationId: 'initializeVault',
  method: 'post',
  path: '/vault/initialize',
  tags: ['vault'],
  summary: 'Set the vault up',
  description:
    'Once. Makes the key, wraps it under the passphrase and under a recovery key, and leaves the vault open. The recovery key is in the answer and nowhere else: it is the only way back in when the passphrase is lost. Answers 409 when a vault exists.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: InitializeVaultRequestSchema },
  responses: {
    201: { description: 'The vault and its recovery key.', schema: VaultInitializedSchema },
  },
});

export const unsealVaultRoute = defineRoute({
  operationId: 'unsealVault',
  method: 'post',
  path: '/vault/unseal',
  tags: ['vault'],
  summary: 'Open the vault with the passphrase or the recovery key',
  description:
    'A wrong passphrase or key answers 401 and is recorded; ten failures in fifteen minutes answer 429 for everyone.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: UnsealVaultRequestSchema },
  responses: { 200: { description: 'The vault is open.', schema: VaultStatusSchema } },
});

export const sealVaultRoute = defineRoute({
  operationId: 'sealVault',
  method: 'post',
  path: '/vault/seal',
  tags: ['vault'],
  summary: 'Close the vault',
  description:
    'Wipes the key from memory. Nothing that needs a secret works until it is opened again.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  responses: { 200: { description: 'The vault is sealed.', schema: VaultStatusSchema } },
});

export const listSecretsRoute = defineRoute({
  operationId: 'listSecrets',
  method: 'get',
  path: '/secrets',
  tags: ['vault'],
  summary: 'List the secrets, without their values',
  description: 'Works while the vault is sealed: names, types and dates are not secret.',
  auth: 'session',
  permission: 'vault:read',
  responses: { 200: { description: 'The secrets.', schema: SecretListSchema } },
});

export const createSecretRoute = defineRoute({
  operationId: 'createSecret',
  method: 'post',
  path: '/secrets',
  tags: ['vault'],
  summary: 'Store a secret',
  description:
    'The vault must be open (423 `vault_sealed` otherwise). The value is encrypted with a key of its own and is write-only from now on. A taken name answers 409.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: CreateSecretRequestSchema },
  responses: { 201: { description: 'The secret, without its value.', schema: SecretViewSchema } },
});

export const updateSecretRoute = defineRoute({
  operationId: 'updateSecret',
  method: 'patch',
  path: '/secrets/{id}',
  tags: ['vault'],
  summary: 'Rename a secret, change its details or replace its value',
  description:
    'A new `value` needs the vault open and moves the version forward; the old value is not kept. Renaming and the details work while sealed.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { params: SecretIdParamsSchema, body: UpdateSecretRequestSchema },
  responses: { 200: { description: 'The secret after the change.', schema: SecretViewSchema } },
});

export const deleteSecretRoute = defineRoute({
  operationId: 'deleteSecret',
  method: 'delete',
  path: '/secrets/{id}',
  tags: ['vault'],
  summary: 'Delete a secret',
  description: 'Works while the vault is sealed. Cannot be undone.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { params: SecretIdParamsSchema },
  responses: { 204: { description: 'The secret is gone.', schema: z.undefined(), empty: true } },
});

export const revealSecretRoute = defineRoute({
  operationId: 'revealSecret',
  method: 'post',
  path: '/secrets/{id}/reveal',
  tags: ['vault'],
  summary: 'Show the value of a secret',
  description:
    'The only way a value leaves the vault. Needs the vault open, the reveal permission and a fresh second factor, and is recorded before the value is sent.',
  auth: 'session',
  permission: 'vault:reveal',
  stepUp: true,
  request: { params: SecretIdParamsSchema },
  responses: { 200: { description: 'The value.', schema: RevealedSecretSchema } },
});

export const changeVaultPassphraseRoute = defineRoute({
  operationId: 'changeVaultPassphrase',
  method: 'post',
  path: '/vault/passphrase',
  tags: ['vault'],
  summary: 'Change the passphrase of the vault',
  description:
    'Needs the current passphrase. The key that encrypts the secrets does not change, only the way the passphrase wraps it: nothing is re-encrypted, the recovery key stays valid, and the new passphrase is hardened with the current cost settings. Works while the vault is sealed. A wrong current passphrase answers 401 and counts towards the unseal limit.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: ChangeVaultPassphraseRequestSchema },
  responses: { 200: { description: 'The vault.', schema: VaultStatusSchema } },
});

export const rotateRecoveryKeyRoute = defineRoute({
  operationId: 'rotateRecoveryKey',
  method: 'post',
  path: '/vault/recovery-key/rotate',
  tags: ['vault'],
  summary: 'Issue a new recovery key',
  description:
    'Needs the passphrase. The old recovery key stops working at once; the new one is in the answer and nowhere else, so keep it away from this server. Nothing is re-encrypted.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: ConfirmPassphraseRequestSchema },
  responses: { 200: { description: 'The new recovery key.', schema: VaultInitializedSchema } },
});

export const rotateKekRoute = defineRoute({
  operationId: 'rotateKek',
  method: 'post',
  path: '/vault/rotate-kek',
  tags: ['vault'],
  summary: 'Replace the key that wraps every data key',
  description:
    'Needs the vault open and the passphrase. A new key-encryption key wraps every data key (the values are not re-encrypted), the key version moves forward, and a new recovery key is issued because the old one opened the old key. All or nothing: a failure leaves the vault as it was.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  request: { body: ConfirmPassphraseRequestSchema },
  responses: {
    200: { description: 'The new recovery key and the vault.', schema: VaultInitializedSchema },
  },
});

export const rotateDataKeysRoute = defineRoute({
  operationId: 'rotateDataKeys',
  method: 'post',
  path: '/vault/rotate-data-keys',
  tags: ['vault'],
  summary: 'Encrypt every secret under a fresh data key',
  description:
    'Needs the vault open. Every current value is decrypted in memory and encrypted again under a new data key wrapped by the current key. Versions and values do not change. All or nothing.',
  auth: 'session',
  permission: 'vault:manage',
  stepUp: true,
  responses: {
    200: { description: 'How many secrets were re-encrypted.', schema: VaultRotatedSchema },
  },
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

export const listMySessionsRoute = defineRoute({
  operationId: 'listMySessions',
  method: 'get',
  path: '/auth/sessions',
  tags: ['sessions'],
  summary: 'The signed-in sessions of your account',
  description: 'Every active session of the caller, the current one marked.',
  auth: 'session',
  responses: { 200: { description: 'Your sessions.', schema: SessionListSchema } },
});

export const revokeMySessionRoute = defineRoute({
  operationId: 'revokeMySession',
  method: 'delete',
  path: '/auth/sessions/{id}',
  tags: ['sessions'],
  summary: 'End one of your sessions',
  description:
    'Ends another session of your own account at once. The session you are using cannot be ended here (409): sign out instead. A session that is not yours is reported as not found.',
  auth: 'session',
  request: { params: SessionIdParamsSchema },
  responses: { 204: { description: 'The session is gone.', schema: z.undefined(), empty: true } },
});

export const revokeOtherSessionsRoute = defineRoute({
  operationId: 'revokeOtherSessions',
  method: 'post',
  path: '/auth/sessions/revoke-others',
  tags: ['sessions'],
  summary: 'End all your other sessions',
  description: 'Keeps the session you are using and ends every other session of your account.',
  auth: 'session',
  responses: { 200: { description: 'How many were ended.', schema: SessionsRevokedSchema } },
});

export const listSessionsRoute = defineRoute({
  operationId: 'listSessions',
  method: 'get',
  path: '/sessions',
  tags: ['sessions'],
  summary: 'The signed-in sessions of every user',
  description: 'Active sessions, most recently used first. Filter by user with `userId`.',
  auth: 'session',
  permission: 'sessions:read',
  request: { query: SessionListQuerySchema },
  responses: { 200: { description: 'The sessions.', schema: SessionListSchema } },
});

export const revokeSessionRoute = defineRoute({
  operationId: 'revokeSession',
  method: 'delete',
  path: '/sessions/{id}',
  tags: ['sessions'],
  summary: 'End a session of any user',
  description:
    'Ends the session at once and records it. The session you are using cannot be ended here (409).',
  auth: 'session',
  permission: 'sessions:revoke',
  stepUp: true,
  request: { params: SessionIdParamsSchema },
  responses: { 204: { description: 'The session is gone.', schema: z.undefined(), empty: true } },
});

export const revokeUserSessionsRoute = defineRoute({
  operationId: 'revokeUserSessions',
  method: 'post',
  path: '/users/{id}/sessions/revoke',
  tags: ['sessions'],
  summary: 'End every session of a user',
  description:
    'Ends all sessions of the user at once, for example after a suspected theft of a cookie. Refused with 409 for your own account (use "end all other sessions").',
  auth: 'session',
  permission: 'sessions:revoke',
  stepUp: true,
  request: { params: UserIdParamsSchema },
  responses: { 200: { description: 'How many were ended.', schema: SessionsRevokedSchema } },
});

export const exportAuditRoute = defineRoute({
  operationId: 'exportAudit',
  method: 'get',
  path: '/audit/export',
  tags: ['audit'],
  summary: 'Export the audit log for checking outside the database',
  description:
    'Pages of events, oldest first, with every field their hashes cover, so that a copy can be verified without this server (`node dist/admin.js audit-verify <file>`). Each page is recorded. Needs a fresh second factor: a copy of the whole log is a lot to hand over.',
  auth: 'session',
  permission: 'audit:export',
  stepUp: true,
  request: { query: AuditExportQuerySchema },
  responses: { 200: { description: 'One page of the export.', schema: AuditExportSchema } },
});

export const createAuditCheckpointRoute = defineRoute({
  operationId: 'createAuditCheckpoint',
  method: 'post',
  path: '/audit/checkpoints',
  tags: ['audit'],
  summary: 'Note the head of the audit chain in a form that cannot be made up in the database',
  description:
    'Returns the last event with a signature made with a key that is not in the database. Keep the text somewhere else (a ticket, a vault of your own, a cron job). Later, a check against it proves that nothing up to that event was changed, and that no tail was cut off.',
  auth: 'any',
  permission: 'audit:verify',
  responses: { 200: { description: 'The checkpoint.', schema: AuditCheckpointSchema } },
});

export const verifyAuditCheckpointRoute = defineRoute({
  operationId: 'verifyAuditCheckpoint',
  method: 'post',
  path: '/audit/checkpoints/verify',
  tags: ['audit'],
  summary: 'Check the log against a checkpoint',
  description:
    'Checks the signature, finds the event, compares its hash and checks the chain up to it. A failed check is a normal answer (`ok: false` with the reason). The check is recorded.',
  auth: 'any',
  permission: 'audit:verify',
  request: { body: VerifyAuditCheckpointRequestSchema },
  responses: {
    200: { description: 'The result.', schema: AuditCheckpointVerificationSchema },
  },
});

/** Routes any signed-in user may call without a permission. Everything else under `session` names one. */
export const ROUTES_OPEN_TO_ANY_SESSION: readonly string[] = [
  'getMe',
  'changePassword',
  'stepUp',
  'listMySessions',
  'revokeMySession',
  'revokeOtherSessions',
];

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
  stepUpRoute,
  acceptInvitationRoute,
  changePasswordRoute,
  listUsersRoute,
  createUserRoute,
  updateUserRoute,
  resetCredentialsRoute,
  vaultStatusRoute,
  initializeVaultRoute,
  unsealVaultRoute,
  sealVaultRoute,
  listSecretsRoute,
  createSecretRoute,
  updateSecretRoute,
  deleteSecretRoute,
  revealSecretRoute,
  changeVaultPassphraseRoute,
  rotateRecoveryKeyRoute,
  rotateKekRoute,
  rotateDataKeysRoute,
  rolesRoute,
  listAuditRoute,
  verifyAuditChainRoute,
  exportAuditRoute,
  createAuditCheckpointRoute,
  verifyAuditCheckpointRoute,
  listMySessionsRoute,
  revokeMySessionRoute,
  revokeOtherSessionsRoute,
  listSessionsRoute,
  revokeSessionRoute,
  revokeUserSessionsRoute,
] as const;

/** Errors every route may return, documented once. */
export const commonErrors = { default: ERROR } as const;
