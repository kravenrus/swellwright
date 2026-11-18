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
  })
  .meta({ id: 'VersionResponse', description: 'Build and API version.' });
export type VersionResponse = z.infer<typeof VersionResponseSchema>;
