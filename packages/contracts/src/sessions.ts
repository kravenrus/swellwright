import { z } from 'zod';

/** One signed-in browser session, as its owner or an administrator sees it. The token itself is never sent. */
export const SessionSummarySchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    username: z.string(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().describe('When the session ends if it stays idle.'),
    absoluteExpiresAt: z.iso.datetime().describe('When the session ends whatever its activity.'),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    current: z.boolean().describe('True for the session that made this request.'),
    elevated: z
      .boolean()
      .describe('Whether it is freshly verified with the second factor right now (step-up).'),
  })
  .meta({ id: 'SessionSummary' });
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListSchema = z
  .object({ sessions: z.array(SessionSummarySchema) })
  .meta({ id: 'SessionList' });
export type SessionList = z.infer<typeof SessionListSchema>;

export const SessionIdParamsSchema = z.object({ id: z.uuid() });

export const SessionListQuerySchema = z.object({
  userId: z.uuid().optional().describe('Only the sessions of this user.'),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

export const SessionsRevokedSchema = z
  .object({ revoked: z.number().int().min(0) })
  .meta({ id: 'SessionsRevoked' });
export type SessionsRevoked = z.infer<typeof SessionsRevokedSchema>;
