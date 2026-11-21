import { z } from 'zod';

/**
 * Lower-case letters, digits and hyphens, starting with a letter and not ending with a hyphen, 1 to 64 characters.
 * An artifact name is a directory name in the catalogue and in the path on a server, so it is deliberately plain.
 */
export const ARTIFACT_NAME_PATTERN = /^[a-z](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
export const ArtifactNameSchema = z.string().regex(ARTIFACT_NAME_PATTERN, {
  message:
    'Use 1 to 64 lower-case letters, digits or hyphens, starting with a letter and not ending with a hyphen.',
});

/** Semantic versioning without build metadata: `1.2.3` or `1.2.3-rc.1`. */
export const ARTIFACT_VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
export const ArtifactVersionSchema = z.string().max(32).regex(ARTIFACT_VERSION_PATTERN, {
  message: 'Use a semantic version such as 1.2.3.',
});

/**
 * The name of the file of an artifact: one path segment, no directory part. It becomes the last part of a path on a
 * server, so a separator, a leading dot or a `..` is refused here and again wherever a path is built.
 */
export const ARTIFACT_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
export const ArtifactFileSchema = z
  .string()
  .regex(ARTIFACT_FILE_PATTERN, {
    message: 'Use a plain file name of 1 to 128 letters, digits, dots, dashes or underscores.',
  })
  .refine((name) => !name.includes('..'), { message: 'A file name must not contain "..".' });

export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
export const Sha256Schema = z.string().regex(SHA256_PATTERN, {
  message: 'Use 64 lower-case hexadecimal characters.',
});

/** What runs the file. `none` is a file that is shipped but not run (a template, a data file). */
export const ARTIFACT_INTERPRETERS = ['sh', 'bash', 'python3', 'none'] as const;
export const ArtifactInterpreterSchema = z
  .enum(ARTIFACT_INTERPRETERS)
  .meta({ id: 'ArtifactInterpreter' });
export type ArtifactInterpreter = z.infer<typeof ArtifactInterpreterSchema>;

/** The mode a file gets on a server: a script is executable, a data file is not, and neither is writable by others. */
export const artifactFileMode = (interpreter: ArtifactInterpreter): number =>
  interpreter === 'none' ? 0o644 : 0o755;

export const ARTIFACT_MANIFEST_VERSION = 1;

const ParamName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u);

/** One step of an artifact: what it does and which parameters it reads (names that are keys of `params`). */
export const ArtifactStepSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9]{0,31}$/u),
    title: z.string().min(1).max(200),
    readOnly: z.boolean().describe('The step changes nothing on the server.'),
    needsRoot: z.boolean(),
    inFull: z.boolean().describe('The `full` action runs this step.'),
    params: z.array(ParamName).max(64),
    requires: z
      .array(ParamName)
      .max(64)
      .describe('Parameters without which the step stops when it cannot ask.'),
  })
  .meta({ id: 'ArtifactStep' });
export type ArtifactStep = z.infer<typeof ArtifactStepSchema>;

/** A pattern is shown, not run, by Swellwright; it must still be a regular expression, or the manifest is malformed. */
function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, 'u');
    return true;
  } catch {
    return false;
  }
}

export const ArtifactParamSchema = z
  .strictObject({
    group: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/u),
    description: z.string().min(1).max(500),
    required: z.boolean().describe('Some step requires it.'),
    secret: z.boolean().describe('Never printed or logged by the artifact.'),
    pattern: z
      .string()
      .min(1)
      .max(1000)
      .refine(compiles, { message: 'The pattern is not a regular expression.' })
      .optional(),
    enum: z.array(z.string().max(200)).min(1).max(100).optional(),
    default: z.string().max(500).nullable(),
    example: z.string().max(500).optional(),
  })
  .refine((param) => param.pattern === undefined || param.enum === undefined, {
    message: 'A parameter has a pattern or a list of values, not both.',
  })
  .meta({ id: 'ArtifactParam' });
export type ArtifactParam = z.infer<typeof ArtifactParamSchema>;

/**
 * What `manifest.json` of an artifact says (ADR 0036, written by `scripts/artifact-manifest.mjs`). Strict: a key this
 * version does not know makes the manifest malformed, so the artifact is not offered rather than half understood.
 */
export const ArtifactManifestSchema = z
  .strictObject({
    manifestVersion: z.literal(ARTIFACT_MANIFEST_VERSION),
    name: ArtifactNameSchema,
    version: ArtifactVersionSchema,
    description: z.string().min(1).max(500),
    file: ArtifactFileSchema,
    interpreter: ArtifactInterpreterSchema,
    sha256: Sha256Schema.describe('SHA-256 of the file, which every use of it is checked against.'),
    size: z.number().int().min(1).max(1_073_741_824).describe('Bytes.'),
    minOs: z.string().min(1).max(200).describe('The systems it is written for, as text.'),
    steps: z.array(ArtifactStepSchema).max(64),
    params: z.record(ParamName, ArtifactParamSchema),
  })
  .superRefine((manifest, ctx) => {
    const names = Object.keys(manifest.params);
    if (names.length > 200) {
      ctx.addIssue({ code: 'custom', message: 'An artifact has at most 200 parameters.' });
    }
    const seen = new Set<string>();
    for (const step of manifest.steps) {
      if (seen.has(step.id)) {
        ctx.addIssue({ code: 'custom', message: `The step "${step.id}" is declared twice.` });
      }
      seen.add(step.id);
      for (const param of [...step.params, ...step.requires]) {
        if (!names.includes(param)) {
          ctx.addIssue({
            code: 'custom',
            message: `The step "${step.id}" names the parameter ${param}, which the manifest does not declare.`,
          });
        }
      }
    }
  })
  .meta({ id: 'ArtifactManifest' });
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

/** `ok`: the file is there and is exactly what the manifest says. `broken`: it is not served and not distributed. */
export const ARTIFACT_STATES = ['ok', 'broken'] as const;
export const ArtifactStateSchema = z.enum(ARTIFACT_STATES).meta({ id: 'ArtifactState' });
export type ArtifactState = z.infer<typeof ArtifactStateSchema>;

export const ArtifactVersionViewSchema = z
  .object({
    version: z
      .string()
      .nullable()
      .describe('Null when the manifest is so malformed that it names no version.'),
    state: ArtifactStateSchema,
    problem: z.string().nullable().describe('Why it is broken; null when it is ok.'),
    sha256: z.string().nullable().describe('The hash the manifest declares.'),
    size: z.number().int().nullable().describe('The size the manifest declares.'),
    manifest: ArtifactManifestSchema.nullable().describe('Null when the manifest is malformed.'),
  })
  .meta({ id: 'ArtifactVersionView' });
export type ArtifactVersionView = z.infer<typeof ArtifactVersionViewSchema>;

export const ArtifactViewSchema = z
  .object({
    name: z.string().describe('The name in the manifest, or the directory name when it has none.'),
    description: z.string().nullable(),
    latestVersion: z
      .string()
      .nullable()
      .describe('The highest version that is ok; null when none is.'),
    versions: z.array(ArtifactVersionViewSchema).describe('Newest first.'),
  })
  .meta({ id: 'ArtifactView' });
export type ArtifactView = z.infer<typeof ArtifactViewSchema>;

export const ArtifactListSchema = z
  .object({ artifacts: z.array(ArtifactViewSchema).describe('Ordered by name.') })
  .meta({ id: 'ArtifactList' });
export type ArtifactList = z.infer<typeof ArtifactListSchema>;

export const ArtifactNameParamsSchema = z.object({ name: ArtifactNameSchema });
export const ArtifactVersionParamsSchema = z.object({
  name: ArtifactNameSchema,
  version: ArtifactVersionSchema,
});

// --- On a server ------------------------------------------------------------------------------------------------

/**
 * Where a copy goes. `user`: the home of the login, `~/.swellwright/artifacts`, private to that user. `system`:
 * `/var/lib/swellwright/artifacts`, owned by root and readable by all, written through `sudo`.
 */
export const ARTIFACT_DESTINATIONS = ['user', 'system'] as const;
export const ArtifactDestinationSchema = z
  .enum(ARTIFACT_DESTINATIONS)
  .meta({ id: 'ArtifactDestination' });
export type ArtifactDestination = z.infer<typeof ArtifactDestinationSchema>;

/** The directory below which copies are kept on a server, by destination (the home is the login's `$HOME`). */
export const ARTIFACT_SYSTEM_DIR = '/var/lib/swellwright/artifacts';
export const ARTIFACT_USER_DIR = '.swellwright/artifacts';

/** `ok`: the copy hashes to what the catalogue says. `differs`: it exists and hashes to something else. `missing`: it is gone. */
export const ARTIFACT_CHECK_STATES = ['ok', 'differs', 'missing'] as const;
export const ArtifactCheckStateSchema = z
  .enum(ARTIFACT_CHECK_STATES)
  .meta({ id: 'ArtifactCheckState' });
export type ArtifactCheckState = z.infer<typeof ArtifactCheckStateSchema>;

/** Whether the catalogue still holds this version intact: it may have been left out of a newer image. */
export const ARTIFACT_CATALOGUE_STATES = ['ok', 'broken', 'missing'] as const;
export const ArtifactCatalogueStateSchema = z
  .enum(ARTIFACT_CATALOGUE_STATES)
  .meta({ id: 'ArtifactCatalogueState' });

export const ServerArtifactSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    sha256: z.string().describe('What was pushed: the hash the catalogue declared.'),
    size: z.number().int(),
    destination: ArtifactDestinationSchema,
    remotePath: z.string().describe('The absolute path of the file on the server.'),
    pushedAt: z.iso.datetime(),
    pushedBy: z
      .string()
      .nullable()
      .describe('The login name of the user who pushed it; null when that user no longer exists.'),
    verify: z
      .object({
        state: ArtifactCheckStateSchema,
        verifiedAt: z.iso.datetime(),
        remoteSha256: z.string().nullable().describe('What the copy hashed to; null when missing.'),
      })
      .nullable()
      .describe('The last check of the copy; null if it was never checked after the push.'),
    catalogue: ArtifactCatalogueStateSchema,
  })
  .meta({ id: 'ServerArtifact' });
export type ServerArtifact = z.infer<typeof ServerArtifactSchema>;

export const ServerArtifactListSchema = z
  .object({ artifacts: z.array(ServerArtifactSchema).describe('By name, then version.') })
  .meta({ id: 'ServerArtifactList' });
export type ServerArtifactList = z.infer<typeof ServerArtifactListSchema>;

export const PushArtifactRequestSchema = z
  .object({
    name: ArtifactNameSchema,
    version: ArtifactVersionSchema.optional().describe(
      'The version to push; the latest one that is ok by default.',
    ),
    destination: ArtifactDestinationSchema.optional().describe('`user` by default.'),
  })
  .meta({ id: 'PushArtifactRequest' });
export type PushArtifactRequest = z.infer<typeof PushArtifactRequestSchema>;

export const ARTIFACT_PUSH_RESULTS = ['pushed', 'unchanged'] as const;
export const ArtifactPushResultSchema = z
  .object({
    result: z
      .enum(ARTIFACT_PUSH_RESULTS)
      .describe('`unchanged`: the same file was already there; nothing was uploaded.'),
    artifact: ServerArtifactSchema,
    durationMs: z.number().int().nonnegative(),
  })
  .meta({ id: 'ArtifactPushResult' });
export type ArtifactPushResult = z.infer<typeof ArtifactPushResultSchema>;

export const VerifyArtifactQuerySchema = z.object({
  version: ArtifactVersionSchema.optional().describe(
    'Only this version; every version of the artifact on the server by default.',
  ),
});

export const ServerArtifactParamsSchema = z.object({ id: z.uuid(), name: ArtifactNameSchema });
export const ServerArtifactVersionParamsSchema = z.object({
  id: z.uuid(),
  name: ArtifactNameSchema,
  version: ArtifactVersionSchema,
});

export const ArtifactCheckSchema = z
  .object({
    version: z.string(),
    state: ArtifactCheckStateSchema,
    expectedSha256: z
      .string()
      .describe(
        'What the copy must hash to: the catalogue, or what was pushed when the catalogue no longer has it.',
      ),
    actualSha256: z.string().nullable().describe('What it hashed to now; null when it is missing.'),
    catalogue: ArtifactCatalogueStateSchema,
  })
  .meta({ id: 'ArtifactCheck' });
export type ArtifactCheck = z.infer<typeof ArtifactCheckSchema>;

export const ArtifactVerificationSchema = z
  .object({
    verifiedAt: z.iso.datetime(),
    ok: z.boolean().describe('Every copy that was checked is intact.'),
    results: z.array(ArtifactCheckSchema),
  })
  .meta({ id: 'ArtifactVerification' });
export type ArtifactVerification = z.infer<typeof ArtifactVerificationSchema>;

/** The details of an `artifact_hash_mismatch` error. */
export const ArtifactHashMismatchDetailsSchema = z.object({
  expected: z.string(),
  actual: z.string(),
  stage: z
    .enum(['upload', 'final'])
    .describe('`upload`: the temporary file on the server; `final`: the file in its place.'),
});
export type ArtifactHashMismatchDetails = z.infer<typeof ArtifactHashMismatchDetailsSchema>;
