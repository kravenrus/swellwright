import { z } from 'zod';

import { SecretTypeSchema } from './vault.js';

/** Where a server is in its life. Any state may follow any other; workflows of later phases will constrain it. */
export const SERVER_STATES = ['draft', 'provisioning', 'active', 'draining', 'retired'] as const;
export const ServerStateSchema = z.enum(SERVER_STATES).meta({ id: 'ServerState' });
export type ServerState = z.infer<typeof ServerStateSchema>;

/** The states in which a server may be deleted: it was never in service, or it is out of it. */
export const DELETABLE_SERVER_STATES: readonly ServerState[] = ['draft', 'retired'];

/** How Swellwright logs in. Certificates come later. */
export const ACCESS_METHODS = ['password', 'key'] as const;
export const AccessMethodSchema = z.enum(ACCESS_METHODS).meta({ id: 'AccessMethod' });
export type AccessMethod = z.infer<typeof AccessMethodSchema>;

/** The kind of secret each access method needs for the login, and the kind for `sudo`. */
export const SECRET_TYPE_FOR_METHOD = { password: 'ssh_password', key: 'ssh_key' } as const;
export const SUDO_SECRET_TYPE = 'ssh_password';

export const MAX_ACCESS_PER_SERVER = 5;
export const MAX_TAGS_PER_SERVER = 20;

/** Letters, digits, space, dot, dash and underscore; 1 to 64 characters. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9 _.-]{1,64}$/u;
export const ServerNameSchema = z.string().trim().regex(SERVER_NAME_PATTERN, {
  message: 'Use 1 to 64 letters, digits, spaces, dots, dashes or underscores.',
});

const HOSTNAME_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

/** A host name (RFC 1123, not all numeric at the end, so `999.1.1.1` is not one), an IPv4 or an IPv6 address. */
export function isValidServerAddress(value: string): boolean {
  if (value.length < 1 || value.length > 255) {
    return false;
  }
  if (z.ipv4().safeParse(value).success || z.ipv6().safeParse(value).success) {
    return true;
  }
  if (value.length > 253) {
    return false;
  }
  const labels = value.split('.');
  const last = labels[labels.length - 1] ?? '';
  return labels.every((label) => HOSTNAME_LABEL.test(label)) && !/^[0-9]+$/u.test(last);
}

export const ServerAddressSchema = z
  .string()
  .trim()
  .refine(isValidServerAddress, { message: 'Use a host name, an IPv4 or an IPv6 address.' });

export const SshPortSchema = z.number().int().min(1).max(65535);

/** ISO 3166-1 alpha-2, upper case. Lower case is accepted and stored in upper case. */
export const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u, { message: 'Use a two-letter ISO 3166-1 country code.' });

const Provider = z.string().trim().min(1).max(64);
const Notes = z.string().trim().min(1).max(2000);

/** A tag: no spaces (a list of tags is typed with spaces and commas between them), 1 to 32 characters. */
export const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$/u;
export const ServerTagSchema = z.string().trim().regex(TAG_PATTERN, {
  message:
    'Use 1 to 32 letters, digits, dots, dashes, underscores or colons, starting with a letter or digit.',
});
/** Duplicates are dropped by the server, the first one stays. */
export const ServerTagsSchema = z.array(ServerTagSchema).max(MAX_TAGS_PER_SERVER);

/** The host key algorithm as OpenSSH names it: `ssh-ed25519`, `ecdsa-sha2-nistp256`, `rsa-sha2-512`, ... */
export const HOST_KEY_ALGORITHM_PATTERN = /^[a-z0-9][a-z0-9@.-]{1,31}$/u;
export const HostKeyAlgorithmSchema = z.string().trim().regex(HOST_KEY_ALGORITHM_PATTERN, {
  message: 'Use the key type as OpenSSH names it, for example ssh-ed25519.',
});

/**
 * `SHA256:` and 43 base64 characters without padding, as `ssh-keygen -l` prints it. 32 bytes make 256 bits, and 43
 * characters carry 258, so the last character may only use its first four bits: a fingerprint that does not end in
 * one of those sixteen characters cannot be a SHA-256 digest.
 */
export const FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]$/u;
export const FingerprintSchema = z.string().trim().regex(FINGERPRINT_PATTERN, {
  message: 'Use a SHA-256 fingerprint as ssh-keygen prints it: SHA256: and 43 base64 characters.',
});

/** What the SSH layer will put into the facts. The summary reads only these two, as text. */
export const ServerFactsSummarySchema = z
  .object({
    os: z
      .string()
      .nullable()
      .describe('For example "Ubuntu 24.04"; null when the facts do not say.'),
    kernel: z.string().nullable(),
    collectedAt: z.iso.datetime(),
  })
  .meta({ id: 'ServerFactsSummary' });
export type ServerFactsSummary = z.infer<typeof ServerFactsSummarySchema>;

export const ServerFactsSchema = z
  .object({
    facts: z
      .record(z.string(), z.unknown())
      .describe('What was found on the server. Its shape belongs to the SSH layer.'),
    collectedAt: z.iso.datetime(),
    source: z.string().describe('What collected it, for example `ssh`.'),
  })
  .meta({ id: 'ServerFacts' });
export type ServerFacts = z.infer<typeof ServerFactsSchema>;

const ServerFieldsShape = {
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  sshPort: z.number().int(),
  country: z.string().nullable(),
  provider: z.string().nullable(),
  state: ServerStateSchema,
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const ServerSummarySchema = z
  .object({
    ...ServerFieldsShape,
    hostKeyCount: z.number().int().nonnegative(),
    pinned: z.boolean().describe('At least one host key is pinned: a connection can be trusted.'),
    accessCount: z.number().int().nonnegative(),
    facts: ServerFactsSummarySchema.nullable().describe('Null until facts are collected.'),
  })
  .meta({ id: 'ServerSummary' });
export type ServerSummary = z.infer<typeof ServerSummarySchema>;

export const ServerListSchema = z
  .object({ servers: z.array(ServerSummarySchema).describe('Ordered by name.') })
  .meta({ id: 'ServerList' });
export type ServerList = z.infer<typeof ServerListSchema>;

export const ServerListQuerySchema = z.object({
  // Not the named schema: a query parameter describes itself inline instead of pointing into the components.
  state: z.enum(SERVER_STATES).optional(),
  tag: z.string().min(1).max(32).optional().describe('Only servers that carry this tag.'),
  q: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe('Servers whose name or address contains this text, ignoring case.'),
});
export type ServerListQuery = z.infer<typeof ServerListQuerySchema>;

export const ServerHostKeySchema = z
  .object({
    id: z.uuid(),
    algorithm: z.string(),
    fingerprintSha256: z.string(),
    source: z.string().describe('`manual` (typed in) or, later, `scan`.'),
    acceptedBy: z
      .string()
      .nullable()
      .describe('The login name of the user who pinned it; null when that user no longer exists.'),
    acceptedAt: z.iso.datetime(),
  })
  .meta({ id: 'ServerHostKey' });
export type ServerHostKey = z.infer<typeof ServerHostKeySchema>;

export const SecretRefSchema = z
  .object({ id: z.uuid(), name: z.string(), type: SecretTypeSchema })
  .meta({
    id: 'SecretRef',
    description: 'A vault secret by name. The value is never part of a server.',
  });
export type SecretRef = z.infer<typeof SecretRefSchema>;

export const ServerAccessSchema = z
  .object({
    id: z.uuid(),
    method: AccessMethodSchema,
    username: z.string(),
    secret: SecretRefSchema.describe('The password or the private key.'),
    sudoSecret: SecretRefSchema.nullable().describe(
      'The password used for `sudo`, when there is one.',
    ),
    priority: z.number().int().describe('Lower first: the order in which the entries are tried.'),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'ServerAccess' });
export type ServerAccess = z.infer<typeof ServerAccessSchema>;

export const ServerViewSchema = z
  .object({
    ...ServerFieldsShape,
    hostKeys: z.array(ServerHostKeySchema).describe('Oldest first.'),
    access: z.array(ServerAccessSchema).describe('By priority, then by age.'),
    facts: ServerFactsSchema.nullable().describe('Null until facts are collected.'),
  })
  .meta({ id: 'ServerView' });
export type ServerView = z.infer<typeof ServerViewSchema>;

export const ServerIdParamsSchema = z.object({ id: z.uuid() });
export const HostKeyParamsSchema = z.object({ id: z.uuid(), keyId: z.uuid() });
export const AccessParamsSchema = z.object({ id: z.uuid(), accessId: z.uuid() });

export const CreateServerRequestSchema = z
  .object({
    name: ServerNameSchema,
    address: ServerAddressSchema,
    sshPort: SshPortSchema.optional().describe('22 by default.'),
    country: CountryCodeSchema.optional(),
    provider: Provider.optional(),
    state: ServerStateSchema.optional().describe('`draft` by default.'),
    tags: ServerTagsSchema.optional(),
    notes: Notes.optional(),
  })
  .meta({ id: 'CreateServerRequest' });
export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const UpdateServerRequestSchema = z
  .object({
    name: ServerNameSchema.optional(),
    address: ServerAddressSchema.optional(),
    sshPort: SshPortSchema.optional(),
    country: CountryCodeSchema.nullable().optional(),
    provider: Provider.nullable().optional(),
    state: ServerStateSchema.optional(),
    tags: ServerTagsSchema.optional(),
    notes: Notes.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field.' })
  .meta({
    id: 'UpdateServerRequest',
    description:
      'Fields that are absent stay as they are; `null` clears the country, the provider or the notes; `tags` replaces the list.',
  });
export type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>;

export const PinHostKeyRequestSchema = z
  .object({ algorithm: HostKeyAlgorithmSchema, fingerprintSha256: FingerprintSchema })
  .meta({ id: 'PinHostKeyRequest' });
export type PinHostKeyRequest = z.infer<typeof PinHostKeyRequestSchema>;

export const AccessUsernameSchema = z.string().regex(/^[a-z_][a-z0-9_-]{0,63}$/u, {
  message:
    'Use 1 to 64 lower-case letters, digits, dashes or underscores, starting with a letter or underscore.',
});
export const AccessPrioritySchema = z.number().int().min(0).max(1000);

export const AddAccessRequestSchema = z
  .object({
    method: AccessMethodSchema,
    username: AccessUsernameSchema,
    secretId: z.uuid().describe('A vault secret of the kind the method needs.'),
    sudoSecretId: z
      .uuid()
      .optional()
      .describe('A vault secret of kind `ssh_password`, used for `sudo`.'),
    priority: AccessPrioritySchema.optional().describe(
      'Lower first; after the last entry by default.',
    ),
  })
  .meta({ id: 'AddAccessRequest' });
export type AddAccessRequest = z.infer<typeof AddAccessRequestSchema>;

export const UpdateAccessRequestSchema = z
  .object({
    method: AccessMethodSchema.optional(),
    username: AccessUsernameSchema.optional(),
    secretId: z.uuid().optional(),
    sudoSecretId: z.uuid().nullable().optional(),
    priority: AccessPrioritySchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field.' })
  .meta({
    id: 'UpdateAccessRequest',
    description:
      'Fields that are absent stay as they are; `null` removes the sudo secret. The result must still be consistent: the secret kind has to fit the method.',
  });
export type UpdateAccessRequest = z.infer<typeof UpdateAccessRequestSchema>;
