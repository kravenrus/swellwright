import { z } from 'zod';

/** Where a plugin directory comes from (ADR 0021): the monorepo's plugins, or a directory of this instance. */
export const PLUGIN_TRUSTS = ['official', 'local'] as const;
export const PluginTrustSchema = z.enum(PLUGIN_TRUSTS).meta({ id: 'PluginTrust' });
export type PluginTrust = z.infer<typeof PluginTrustSchema>;

/** What discovery says about the files of a plugin, whatever the administrator did with it. */
export const PLUGIN_DISCOVERY_STATES = ['available', 'incompatible', 'invalid'] as const;
export const PluginDiscoveryStateSchema = z
  .enum(PLUGIN_DISCOVERY_STATES)
  .meta({ id: 'PluginDiscoveryState' });
export type PluginDiscoveryState = z.infer<typeof PluginDiscoveryStateSchema>;

/**
 * Where a plugin stands.
 * - `not_enabled`: usable, never approved.
 * - `enabled`: approved, and the files and the manifest are what was approved.
 * - `disabled`: approved before and turned off since; the files are still what was approved.
 * - `changed`: approved before, but the files differ now; it does not run until approved again.
 * - `unavailable`: its files are invalid or for other versions of Swellwright; it cannot be enabled.
 * - `missing`: approved before, and gone from the disk.
 */
export const PLUGIN_STATUSES = [
  'not_enabled',
  'enabled',
  'disabled',
  'changed',
  'unavailable',
  'missing',
] as const;
export const PluginStatusSchema = z.enum(PLUGIN_STATUSES).meta({ id: 'PluginStatus' });
export type PluginStatus = z.infer<typeof PluginStatusSchema>;

/** What a plugin asks for, as it is shown to the administrator who enables it. Everything else is denied. */
export const PluginPermissionsViewSchema = z
  .object({
    network: z
      .array(z.string())
      .describe('Hosts it may call, as host:port, only through the core.'),
    secrets: z.array(z.string()).describe('Kinds of secret it may be handed, for one call.'),
    panel: z.array(z.string()).describe('Scopes of the panel API it may use.'),
    ssh: z.boolean().describe('Whether it may run commands on servers.'),
  })
  .meta({ id: 'PluginPermissions' });
export type PluginPermissionsView = z.infer<typeof PluginPermissionsViewSchema>;

const ListChangeSchema = z.object({ added: z.array(z.string()), removed: z.array(z.string()) });

/** What changed between what was approved and what the files ask for now. */
export const PluginPermissionChangeSchema = z
  .object({
    network: ListChangeSchema,
    secrets: ListChangeSchema,
    panel: ListChangeSchema,
    ssh: z.enum(['granted', 'revoked', 'unchanged']),
    widens: z.boolean().describe('It may do more than what was approved.'),
  })
  .meta({ id: 'PluginPermissionChange' });
export type PluginPermissionChange = z.infer<typeof PluginPermissionChangeSchema>;

export const PluginProvidedSchema = z
  .object({
    kind: z.string().describe('The extension kind, for example `DnsProvider`.'),
    mode: z.enum(['code', 'declarative']).describe('Runs its own code, or is described in data.'),
  })
  .meta({ id: 'PluginProvided' });

export const PluginApprovalSchema = z
  .object({
    version: z.string(),
    trust: PluginTrustSchema,
    digest: z.string(),
    permissions: PluginPermissionsViewSchema,
    approvedAt: z.iso.datetime(),
    approvedBy: z.string().describe('The user name at the time.'),
  })
  .meta({ id: 'PluginApproval', description: 'What an administrator approved, and when.' });
export type PluginApproval = z.infer<typeof PluginApprovalSchema>;

export const PluginViewSchema = z
  .object({
    id: z.string().describe('The plugin id; for a directory that is not a plugin, its name.'),
    folder: z.string().nullable().describe('The directory name; null when it is gone.'),
    trust: PluginTrustSchema.nullable(),
    discovery: PluginDiscoveryStateSchema.nullable().describe('Null when the plugin is gone.'),
    status: PluginStatusSchema,
    problems: z.array(z.string()).describe('Why it is invalid or incompatible.'),
    name: z.string().nullable(),
    version: z.string().nullable(),
    description: z.string().nullable(),
    license: z.string().nullable(),
    provides: z.array(PluginProvidedSchema),
    permissions: PluginPermissionsViewSchema.nullable().describe('What its files ask for now.'),
    digest: z
      .string()
      .nullable()
      .describe('SHA-256 over every file of the plugin; approval is tied to it.'),
    signed: z
      .boolean()
      .describe('The manifest carries a signature. It is not verified yet, so it proves nothing.'),
    hasSettings: z.boolean().describe('It brings a settings page of its own.'),
    approval: PluginApprovalSchema.nullable(),
    change: PluginPermissionChangeSchema.nullable().describe(
      'For a changed plugin: what its permissions differ by from the approved ones.',
    ),
  })
  .meta({ id: 'PluginView' });
export type PluginView = z.infer<typeof PluginViewSchema>;

export const PluginListSchema = z
  .object({
    plugins: z.array(PluginViewSchema),
    directories: z
      .object({ official: z.boolean(), local: z.boolean() })
      .describe('Which plugin directories are configured.'),
  })
  .meta({ id: 'PluginList' });
export type PluginList = z.infer<typeof PluginListSchema>;

export const PluginIdParamsSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
});

/** The digest is what the administrator was shown; if the files changed since, the approval is refused. */
export const EnablePluginRequestSchema = z
  .object({
    digest: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .describe(
        'The digest of the plugin as shown; the plugin is enabled only if it is still this.',
      ),
  })
  .meta({ id: 'EnablePluginRequest' });
export type EnablePluginRequest = z.infer<typeof EnablePluginRequestSchema>;
