import { z } from 'zod';

/** The built-in roles (docs/en/design/05-security.md). Custom roles come with user management (ADR 0015). */
export const USER_ROLES = ['owner', 'operator', 'observer', 'terminal', 'auditor'] as const;
export const UserRoleSchema = z.enum(USER_ROLES).meta({ id: 'UserRole' });
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * Every permission there is. A permission is `resource:action`. Permissions of features that are not built
 * yet are listed so the roles are stable; nothing enforces them until their routes exist (ADR 0015).
 */
export const PERMISSION_INFO = {
  'servers:read': 'See servers, their facts and state.',
  'servers:write': 'Add, change and retire servers; run maintenance on them.',
  'panel:read': 'See the connected Remnawave panel: nodes, hosts, profiles, squads.',
  'panel:write': 'Change panel objects through Swellwright.',
  'runs:read': 'See runs, their steps and logs.',
  'runs:execute': 'Start, approve, cancel and roll back runs.',
  'vault:read': 'See the vault status and the list of secrets, never their values.',
  'vault:manage': 'Create, rotate and delete secrets; seal and unseal the vault.',
  'vault:reveal': 'Show the value of a secret.',
  'terminal:use': 'Open the web terminal to a server.',
  'users:read': 'See the users of this instance.',
  'users:write': 'Create users, change their role and disable them.',
  'roles:read': 'See the roles and the permission catalogue.',
  'audit:read': 'Read the audit log.',
  'audit:verify': 'Verify the integrity of the audit chain.',
} as const satisfies Record<string, string>;

export type Permission = keyof typeof PERMISSION_INFO;
export const PERMISSIONS = Object.keys(PERMISSION_INFO) as readonly Permission[];
export const PermissionSchema = z
  .enum(PERMISSIONS as [Permission, ...Permission[]])
  .meta({ id: 'Permission' });

/** A permission that cannot be used without another one (writing a thing without seeing it makes no sense). */
export const IMPLIED_PERMISSIONS: Readonly<Partial<Record<Permission, Permission>>> = {
  'servers:write': 'servers:read',
  'panel:write': 'panel:read',
  'runs:execute': 'runs:read',
  'vault:manage': 'vault:read',
  'vault:reveal': 'vault:read',
  'users:write': 'users:read',
  'audit:verify': 'audit:read',
};

/**
 * Permissions whose routes always need a freshly verified second factor (ADR 0017). A test fails the build
 * for a route that holds one of them without declaring `stepUp`, so a new route cannot forget it.
 */
export const STEP_UP_PERMISSIONS: readonly Permission[] = [
  'users:write',
  'vault:manage',
  'vault:reveal',
  'terminal:use',
];

const READ_ONLY_OPERATIONS: readonly Permission[] = [
  'servers:read',
  'panel:read',
  'runs:read',
  'vault:read',
];

export const ROLE_INFO: Readonly<
  Record<UserRole, { readonly description: string; readonly permissions: readonly Permission[] }>
> = {
  owner: {
    description: 'Everything, including users, the vault and the audit log. Every new permission.',
    permissions: PERMISSIONS,
  },
  operator: {
    description:
      'Runs and changes servers and the panel. Cannot reveal a secret, open the terminal or manage users.',
    permissions: [
      'servers:read',
      'servers:write',
      'panel:read',
      'panel:write',
      'runs:read',
      'runs:execute',
      'vault:read',
    ],
  },
  observer: {
    description: 'Read-only view of servers, the panel, runs and the vault status.',
    permissions: READ_ONLY_OPERATIONS,
  },
  terminal: {
    description: 'Read-only view plus the web terminal.',
    permissions: [...READ_ONLY_OPERATIONS, 'terminal:use'],
  },
  auditor: {
    description:
      'Reads everything, including users, roles and the audit log, and verifies the chain.',
    permissions: [
      ...READ_ONLY_OPERATIONS,
      'users:read',
      'roles:read',
      'audit:read',
      'audit:verify',
    ],
  },
};

export function permissionsOf(role: UserRole): readonly Permission[] {
  return ROLE_INFO[role].permissions;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_INFO[role].permissions.includes(permission);
}

export const RoleSummarySchema = z
  .object({
    id: UserRoleSchema,
    description: z.string(),
    permissions: z.array(PermissionSchema),
  })
  .meta({ id: 'RoleSummary' });
export type RoleSummary = z.infer<typeof RoleSummarySchema>;

export const PermissionSummarySchema = z
  .object({ id: PermissionSchema, description: z.string() })
  .meta({ id: 'PermissionSummary' });
export type PermissionSummary = z.infer<typeof PermissionSummarySchema>;

export const RoleCatalogSchema = z
  .object({
    roles: z.array(RoleSummarySchema),
    permissions: z.array(PermissionSummarySchema),
  })
  .meta({
    id: 'RoleCatalog',
    description: 'The built-in roles with their permission sets, and the permission catalogue.',
  });
export type RoleCatalog = z.infer<typeof RoleCatalogSchema>;

/** The catalogue as the API sends it. */
export function roleCatalog(): RoleCatalog {
  return {
    roles: USER_ROLES.map((id) => ({
      id,
      description: ROLE_INFO[id].description,
      permissions: [...ROLE_INFO[id].permissions],
    })),
    permissions: PERMISSIONS.map((id) => ({ id, description: PERMISSION_INFO[id] })),
  };
}
