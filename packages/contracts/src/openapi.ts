import { z } from 'zod';

import {
  AuditActionSchema,
  AuditCheckpointSchema,
  AuditCheckpointVerificationSchema,
  AuditDetailsSchema,
  AuditEventSchema,
  AuditExportSchema,
  AuditOutcomeSchema,
  AuditPageSchema,
  ChainProblemSchema,
  ChainVerificationSchema,
  VerifyAuditCheckpointRequestSchema,
} from './audit.js';
import {
  UpdatePreferencesRequestSchema,
  AcceptInvitationRequestSchema,
  AuthNextStepSchema,
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
  UserSummarySchema,
} from './auth.js';
import { ApiErrorSchema, ErrorCodeSchema } from './errors.js';
import {
  EnablePluginRequestSchema,
  PluginApprovalSchema,
  PluginConfigFieldSchema,
  PluginConfigViewSchema,
  UpdatePluginConfigRequestSchema,
  PluginDiscoveryStateSchema,
  PluginGatewayReplySchema,
  PluginGatewayRequestSchema,
  PluginListSchema,
  PluginPermissionChangeSchema,
  PluginPermissionsViewSchema,
  PluginProvidedSchema,
  PluginRuntimeSchema,
  PluginSidecarFragmentSchema,
  PluginStatusSchema,
  PluginTrustSchema,
  PluginViewSchema,
} from './plugins.js';
import {
  PermissionSchema,
  PermissionSummarySchema,
  RoleCatalogSchema,
  RoleSummarySchema,
  UserRoleSchema,
} from './roles.js';
import { type RouteDef, routes } from './routes.js';
import {
  CreateUserRequestSchema,
  InvitationSchema,
  UpdateUserRequestSchema,
  UserInvitationSchema,
  UserListSchema,
  UserStateSchema,
  UserStatusSchema,
  UserViewSchema,
} from './users.js';
import {
  CreateSecretRequestSchema,
  ChangeVaultPassphraseRequestSchema,
  ConfirmPassphraseRequestSchema,
  InitializeVaultRequestSchema,
  RevealedSecretSchema,
  SecretListSchema,
  SecretTypeSchema,
  SecretViewSchema,
  UnsealVaultRequestSchema,
  UpdateSecretRequestSchema,
  VaultInitializedSchema,
  VaultRotatedSchema,
  VaultStatusSchema,
} from './vault.js';
import { SessionListSchema, SessionSummarySchema, SessionsRevokedSchema } from './sessions.js';
import {
  CreatedTokenSchema,
  CreateTokenRequestSchema,
  TokenListSchema,
  TokenStateSchema,
  TokenViewSchema,
} from './tokens.js';
import {
  CheckResultSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
  VersionResponseSchema,
} from './system.js';

/** Version of the API description. Bump it with every contract change (oasdiff checks the rules). */
export const OPENAPI_INFO_VERSION = '0.16.0';

/** Named schemas that appear under `components.schemas`. Every response schema must be listed here. */
const COMPONENT_SCHEMAS: readonly z.ZodType[] = [
  ErrorCodeSchema,
  ApiErrorSchema,
  HealthResponseSchema,
  CheckResultSchema,
  ReadyResponseSchema,
  VersionResponseSchema,
  UserRoleSchema,
  UserSummarySchema,
  SetupStatusSchema,
  SetupOwnerRequestSchema,
  LoginRequestSchema,
  AuthNextStepSchema,
  PendingSessionSchema,
  TotpCodeRequestSchema,
  TotpEnrollmentSchema,
  SessionInfoSchema,
  UpdatePreferencesRequestSchema,
  TotpConfirmedSchema,
  PermissionSchema,
  PermissionSummarySchema,
  RoleSummarySchema,
  RoleCatalogSchema,
  AuditActionSchema,
  AuditOutcomeSchema,
  AuditDetailsSchema,
  AuditEventSchema,
  AuditPageSchema,
  ChainProblemSchema,
  ChainVerificationSchema,
  AuditExportSchema,
  AuditCheckpointSchema,
  VerifyAuditCheckpointRequestSchema,
  AuditCheckpointVerificationSchema,
  AcceptInvitationRequestSchema,
  ChangePasswordRequestSchema,
  ElevationSchema,
  UserStatusSchema,
  UserStateSchema,
  UserViewSchema,
  InvitationSchema,
  UserInvitationSchema,
  UserListSchema,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  SecretTypeSchema,
  VaultStatusSchema,
  InitializeVaultRequestSchema,
  VaultInitializedSchema,
  UnsealVaultRequestSchema,
  ChangeVaultPassphraseRequestSchema,
  ConfirmPassphraseRequestSchema,
  VaultRotatedSchema,
  SecretViewSchema,
  SessionSummarySchema,
  SessionListSchema,
  SessionsRevokedSchema,
  TokenStateSchema,
  TokenViewSchema,
  TokenListSchema,
  CreateTokenRequestSchema,
  CreatedTokenSchema,
  PluginTrustSchema,
  PluginDiscoveryStateSchema,
  PluginStatusSchema,
  PluginPermissionsViewSchema,
  PluginPermissionChangeSchema,
  PluginProvidedSchema,
  PluginRuntimeSchema,
  PluginApprovalSchema,
  PluginViewSchema,
  PluginListSchema,
  EnablePluginRequestSchema,
  PluginConfigFieldSchema,
  PluginConfigViewSchema,
  UpdatePluginConfigRequestSchema,
  PluginSidecarFragmentSchema,
  PluginGatewayRequestSchema,
  PluginGatewayReplySchema,
  SecretListSchema,
  CreateSecretRequestSchema,
  UpdateSecretRequestSchema,
  RevealedSecretSchema,
];

type Json = Record<string, unknown>;

function idOf(schema: z.ZodType): string | undefined {
  return z.globalRegistry.get(schema)?.id;
}

function componentRegistry(): z.core.$ZodRegistry<{ id: string }> {
  const registry = z.registry<{ id: string }>();
  for (const schema of COMPONENT_SCHEMAS) {
    const id = idOf(schema);
    if (!id) {
      throw new Error('Every component schema needs meta({ id }).');
    }
    registry.add(schema, { id });
  }
  return registry;
}

function schemaRef(schema: z.ZodType): Json {
  const id = idOf(schema);
  if (id && COMPONENT_SCHEMAS.includes(schema)) {
    return { $ref: `#/components/schemas/${id}` };
  }
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'any',
  });
}

function parameters(route: RouteDef): Json[] {
  const out: Json[] = [];
  for (const [where, shape] of [
    ['path', route.request?.params],
    ['query', route.request?.query],
  ] as const) {
    if (!shape) {
      continue;
    }
    for (const [name, field] of Object.entries(shape.shape)) {
      out.push({
        name,
        in: where,
        required: where === 'path' ? true : !field.safeParse(undefined).success,
        schema: schemaRef(field),
      });
    }
  }
  return out;
}

function operation(route: RouteDef): Json {
  const responses: Json = {};
  for (const [status, def] of Object.entries(route.responses)) {
    responses[status] = def.empty
      ? { description: def.description }
      : {
          description: def.description,
          content: { 'application/json': { schema: schemaRef(def.schema) } },
        };
  }
  responses['default'] = {
    description: 'Error envelope.',
    content: { 'application/json': { schema: schemaRef(ApiErrorSchema) } },
  };
  const op: Json = {
    operationId: route.operationId,
    tags: [...route.tags],
    summary: route.summary,
    responses,
  };
  if (route.description) {
    op['description'] = route.description;
  }
  const params = parameters(route);
  if (params.length > 0) {
    op['parameters'] = params;
  }
  if (route.request?.body) {
    op['requestBody'] = {
      required: true,
      content: { 'application/json': { schema: schemaRef(route.request.body) } },
    };
  }
  op['security'] =
    route.auth === 'none'
      ? []
      : route.auth === 'token'
        ? [{ bearer: [] }]
        : route.auth === 'any'
          ? [{ session: [] }, { bearer: [] }]
          : [{ session: [] }];
  if (route.permission) {
    // Not part of OpenAPI: tells a reader and a generated client which role may call the operation.
    op['x-sw-permission'] = route.permission;
  }
  if (route.stepUp) {
    // Not part of OpenAPI: the session must have been elevated with POST /auth/step-up, or the answer is 403
    // with the error code `step_up_required`.
    op['x-sw-step-up'] = true;
  }
  return op;
}

/** Builds the OpenAPI 3.1 document from the route registry and the Zod schemas. No decorators involved. */
export function buildOpenApi(): Json {
  const paths: Record<string, Json> = {};
  for (const route of routes) {
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method]: operation(route) };
  }
  const { schemas } = z.toJSONSchema(componentRegistry(), {
    target: 'draft-2020-12',
    io: 'output',
    unrepresentable: 'any',
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, Json> };
  for (const schema of Object.values(schemas)) {
    // Zod adds a per-schema $schema and an $id with a fragment; the document already declares the dialect.
    delete schema['$schema'];
    delete schema['$id'];
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Swellwright API',
      version: OPENAPI_INFO_VERSION,
      description: 'Deploy and operate Remnawave fleets. Unofficial community project.',
      license: { name: 'AGPL-3.0-only', identifier: 'AGPL-3.0-only' },
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'system', description: 'Probes, version and the API description.' },
      { name: 'setup', description: 'First-run setup of a new instance.' },
      { name: 'auth', description: 'Sign-in with a password and an authenticator, sessions.' },
      { name: 'users', description: 'Users, their roles, invitations and credential resets.' },
      {
        name: 'vault',
        description:
          'The secrets vault: sealed on start, opened with a passphrase, values write-only.',
      },
      { name: 'roles', description: 'Built-in roles and the permission catalogue.' },
      { name: 'audit', description: 'The append-only audit log and its integrity check.' },
      { name: 'sessions', description: 'Signed-in browser sessions and how to end them.' },
      { name: 'tokens', description: 'API tokens for the CLI and integrations.' },
    ],
    paths,
    components: {
      schemas,
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sw_session',
          description:
            'Set by the sign-in routes. Routes marked as needing a session accept a signed-in one; the second sign-in step accepts one whose password was accepted.',
        },
        bearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'An API token (`swt_...`) created in the console. It carries a subset of the permissions of its owner, expires, and is refused on every route that needs a fresh second factor.',
        },
      },
    },
  };
}
