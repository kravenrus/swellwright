import { z } from 'zod';

/** What a plugin can provide. The contracts of each kind follow with the first plugin that provides it. */
export const EXTENSION_KINDS = [
  'DnsProvider',
  'NodeFlavor',
  'CertDistributor',
  'CertIssuer',
  'ClientProfile',
  'AuthProvider',
  'HostingProvider',
  'NotificationChannel',
  'SecretBackend',
  'AccessMethod',
  'BaselinePack',
  'ConventionPack',
  'WorkflowPack',
  'ProbeTest',
  'ReportTemplate',
  'PanelAdapter',
  'UiContribution',
] as const;
export const ExtensionKindSchema = z.enum(EXTENSION_KINDS);
export type ExtensionKind = z.infer<typeof ExtensionKindSchema>;

/**
 * Kinds that talk to a REST service and may be described declaratively (a YAML driver: authentication, requests,
 * response mapping) so that no third-party code runs at all.
 */
export const DECLARATIVE_KINDS = [
  'DnsProvider',
  'HostingProvider',
  'NotificationChannel',
] as const satisfies readonly ExtensionKind[];

/** `dns-rucenter`: lower-case words joined by single dashes, starting with a letter. */
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** The semantic version of semver.org, including a pre-release and build metadata. */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

/**
 * A path inside the plugin's directory. Relative, written with forward slashes, no `..`, no empty parts, and
 * only the characters a file name needs: a manifest cannot point outside its plugin.
 */
export function isSafeRelativePath(value: string): boolean {
  if (!/^[A-Za-z0-9._@/-]+$/u.test(value) || value.startsWith('/')) {
    return false;
  }
  const parts = value.replace(/^\.\//u, '').split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

const RelativePathSchema = z.string().max(256).refine(isSafeRelativePath, {
  message: 'must be a relative path inside the plugin with forward slashes and no ".." parts',
});

/** Names that only mean something inside a network. A plugin has no business calling them. */
const LOCAL_SUFFIXES = new Set([
  'local',
  'localhost',
  'internal',
  'lan',
  'home',
  'corp',
  'intranet',
]);

/** `api.nic.ru:443`. A public DNS name with at least one dot, and a port: no wildcard, no address, nothing local. */
export function isNetworkTarget(value: string): boolean {
  const colon = value.lastIndexOf(':');
  if (colon < 1) {
    return false;
  }
  const host = value.slice(0, colon);
  const port = value.slice(colon + 1);
  if (!/^[1-9]\d{0,4}$/u.test(port) || Number(port) > 65535 || host.length > 253) {
    return false;
  }
  const labels = host.split('.');
  if (
    labels.length < 2 ||
    !labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(l))
  ) {
    return false;
  }
  const suffix = labels.at(-1) ?? '';
  // An address such as 10.0.0.1 ends in a number; a name ends in a letter.
  return /^[a-z]/u.test(suffix) && !LOCAL_SUFFIXES.has(suffix);
}

const NetworkTargetSchema = z.string().refine(isNetworkTarget, {
  message: 'must be host:port with a public DNS name (no wildcard, address or local name)',
});

/** A kind of secret (`dns-oauth`) or a scope of the panel API (`hosts:read`). */
const NameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)*$/u, 'must be lower-case words joined by - or :')
  .max(64);

/**
 * What the plugin asks for. Everything is denied unless it is listed, and what is listed is shown to the
 * administrator who enables the plugin (ADR 0008).
 */
export const PluginPermissionsSchema = z.strictObject({
  /** Hosts the plugin may call, only through the core's proxy. */
  network: z.array(NetworkTargetSchema).max(32).default([]),
  /** Kinds of secret it may be handed, for the duration of a call. */
  secrets: z.array(NameSchema).max(32).default([]),
  /** Scopes of the panel API it may use. */
  panel: z.array(NameSchema).max(64).default([]),
  /** Whether it may run commands on servers over SSH. */
  ssh: z.boolean().default(false),
});
export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

/**
 * An image of a sidecar (ADR 0031): a name, optionally with a registry and a tag, and **always the digest** of the
 * content. A tag can be moved to other content; a digest cannot, so what the administrator approved is what runs.
 */
export const SIDECAR_IMAGE_PATTERN = /^[a-z0-9][a-z0-9._/:-]{0,250}@sha256:[0-9a-f]{64}$/u;

/** How a sidecar is run: the image, the port it listens on inside its container, and what it may use. */
export const SidecarSchema = z.strictObject({
  image: z.string().regex(SIDECAR_IMAGE_PATTERN, 'must end with @sha256: and the 64-digit digest'),
  port: z.number().int().min(1024).max(65535),
  memoryMiB: z.number().int().min(32).max(2048).default(256),
  cpus: z.number().min(0.1).max(4).default(0.5),
});
export type Sidecar = z.infer<typeof SidecarSchema>;

export const ProvidedExtensionSchema = z
  .strictObject({
    kind: ExtensionKindSchema,
    /** The module that implements it, run in a process of its own (ADR 0028). */
    entry: RelativePathSchema.optional(),
    /** The declarative driver (YAML) that replaces code, for the kinds that allow it (ADR 0030). */
    driver: RelativePathSchema.optional(),
    /** It is implemented by the sidecar container the manifest describes (ADR 0031). */
    sidecar: z.literal(true).optional(),
  })
  .superRefine((value, ctx) => {
    const given = [value.entry, value.driver, value.sidecar].filter((v) => v !== undefined).length;
    if (given !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'give exactly one of "entry", "driver" and "sidecar"',
      });
    }
    if (
      value.driver !== undefined &&
      !(DECLARATIVE_KINDS as readonly string[]).includes(value.kind)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['driver'],
        message: `a ${value.kind} cannot be declarative (only ${DECLARATIVE_KINDS.join(', ')} can)`,
      });
    }
  });

/**
 * `swellwright.plugin.json`. Unknown keys are refused, so a misspelled permission is an error and not a
 * permission that silently does nothing.
 */
export const PluginManifestSchema = z
  .strictObject({
    id: z
      .string()
      .min(3)
      .max(48)
      .regex(PLUGIN_ID_PATTERN, 'must be lower-case words joined by dashes'),
    version: z.string().max(64).regex(SEMVER_PATTERN, 'must be a semantic version like 1.2.3'),
    name: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    /** The core versions it works with, as a semver range: `>=1.0 <2`. */
    engines: z.strictObject({
      swellwright: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[0-9A-Za-z.<>=^~|*\s-]+$/u, 'must be a semver range like ">=1.0 <2"'),
    }),
    provides: z.array(ProvidedExtensionSchema).min(1).max(16),
    permissions: PluginPermissionsSchema.default({
      network: [],
      secrets: [],
      panel: [],
      ssh: false,
    }),
    config: z.strictObject({ schema: RelativePathSchema }).optional(),
    ui: z.strictObject({ settings: RelativePathSchema }).optional(),
    /** The plugin's own corner of storage. It is the plugin's id; two plugins cannot share one. */
    storage: z.strictObject({ namespace: z.string().max(48) }).optional(),
    /** The container that runs the plugin's code, when any `provides` is a sidecar. */
    sidecar: SidecarSchema.optional(),
    license: z.string().min(1).max(64),
    signature: z.string().min(1).max(4096).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.storage !== undefined && value.storage.namespace !== value.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['storage', 'namespace'],
        message: 'must equal the plugin id (a namespace is never shared)',
      });
    }
    const wantsSidecar = value.provides.some((p) => p.sidecar === true);
    if (wantsSidecar && value.sidecar === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sidecar'],
        message: 'a plugin that provides a sidecar describes it (image, port)',
      });
    }
    if (!wantsSidecar && value.sidecar !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sidecar'],
        message: 'is only for a plugin that provides a sidecar',
      });
    }
  });
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** The name of the file in the root of a plugin directory. */
export const MANIFEST_FILE = 'swellwright.plugin.json';

/** Every file the manifest names, relative to the plugin directory. */
export function referencedFiles(manifest: PluginManifest): string[] {
  const files = manifest.provides.flatMap((p) => [p.entry, p.driver]);
  files.push(manifest.config?.schema, manifest.ui?.settings);
  return [
    ...new Set(
      files.filter((f): f is string => f !== undefined).map((f) => f.replace(/^\.\//u, '')),
    ),
  ];
}
