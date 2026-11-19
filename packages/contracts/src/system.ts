import { z } from 'zod';

export const API_VERSION = 'v1' as const;

/** Liveness: the process is up and serving requests. It never touches dependencies. */
export const HealthResponseSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'HealthResponse', description: 'Liveness probe result.' });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const CheckResultSchema = z
  .object({
    status: z.enum(['up', 'down']),
    latencyMs: z.number().nonnegative().describe('How long the check took, in milliseconds.'),
    error: z
      .string()
      .optional()
      .describe('Short reason when the check is down; never contains secrets.'),
  })
  .meta({ id: 'CheckResult' });
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Readiness: every configured dependency answers. HTTP 200 when ready, 503 when not. */
export const ReadyResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z
      .record(z.string(), CheckResultSchema)
      .describe('One entry per configured dependency.'),
  })
  .meta({ id: 'ReadyResponse', description: 'Readiness probe result.' });
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;

export const VersionResponseSchema = z
  .object({
    name: z.literal('swellwright'),
    version: z.string().describe('Semantic version of the running build.'),
    apiVersion: z.literal(API_VERSION),
    commit: z.string().optional().describe('Source revision, when the build embeds it.'),
    build: z
      .object({
        time: z
          .string()
          .nullable()
          .describe('When the image was built, as the build recorded it (usually ISO 8601).'),
        number: z.string().nullable().describe('The number of the build in the CI that made it.'),
      })
      .describe(
        'What the build recorded about itself. A field is null when the build did not say.',
      ),
    git: z
      .object({
        branch: z.string().nullable().describe('The branch the build was made from.'),
        commit: z
          .string()
          .nullable()
          .describe('The source revision (the full or abbreviated hash).'),
        commitUrl: z
          .string()
          .nullable()
          .describe('The page of that revision on GitHub; null unless the revision is a hash.'),
      })
      .describe('The source of the build. A field is null when the build did not say.'),
  })
  .meta({ id: 'VersionResponse', description: 'Build and API version.' });
export type VersionResponse = z.infer<typeof VersionResponseSchema>;

export const UpdatesResponseSchema = z
  .object({
    enabled: z
      .boolean()
      .describe('False when the administrator switched the check off (`SW_UPDATE_CHECK=off`).'),
    latestVersion: z
      .string()
      .nullable()
      .describe(
        'The newest published release, without a leading "v". Null while it is not known yet, when the repository has no release, or when the check is off.',
      ),
    releaseUrl: z.string().nullable().describe('The page of that release.'),
    stars: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe('How many people starred the repository; null while not known.'),
    repositoryUrl: z
      .string()
      .nullable()
      .describe('The page of the repository (taken from the settings, no request needed).'),
    checkedAt: z.iso
      .datetime()
      .nullable()
      .describe('When the server last learned something from GitHub; null while it has not.'),
  })
  .meta({
    id: 'UpdatesResponse',
    description: 'What the server knows about newer releases and the project page.',
  });
export type UpdatesResponse = z.infer<typeof UpdatesResponseSchema>;
