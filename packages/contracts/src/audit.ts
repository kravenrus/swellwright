import { z } from 'zod';

/**
 * What the audit log records. An action is text in the database, so a feature adds its own here without a
 * migration. Names are `area.subject.what`.
 */
export const AUDIT_ACTIONS = [
  'setup.owner.created',
  'setup.owner.refused',
  'auth.login.failed',
  'auth.second_step.failed',
  'auth.login.succeeded',
  'auth.totp.enrolled',
  'auth.recovery_code.used',
  'auth.account.locked',
  'auth.logout',
  'auth.step_up.succeeded',
  'auth.step_up.failed',
  'auth.invitation.accepted',
  'auth.password.changed',
  'user.created',
  'user.updated',
  'user.credentials.reset',
  'vault.initialized',
  'vault.unsealed',
  'vault.unseal.failed',
  'vault.sealed',
  'vault.passphrase.changed',
  'vault.recovery_key.rotated',
  'vault.kek.rotated',
  'vault.data_keys.rotated',
  'secret.created',
  'secret.updated',
  'secret.deleted',
  'secret.revealed',
  'authz.denied',
  'audit.chain.verified',
  'session.revoked',
  'token.created',
  'token.revoked',
  'auth.token.denied',
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS).meta({ id: 'AuditAction' });
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export const AuditOutcomeSchema = z.enum(AUDIT_OUTCOMES).meta({
  id: 'AuditOutcome',
  description:
    '`success`: it happened. `failure`: it was tried and did not work (a wrong password). `denied`: the caller may not do it.',
});
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

/**
 * A few facts about an event: short strings, integers, booleans. Never a secret, a code or text an
 * unauthenticated caller typed. Flat on purpose: the hash covers the exact text, and a flat record has
 * one canonical form.
 */
export const AuditDetailsSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u),
    z.union([z.string().max(200), z.number().int(), z.boolean(), z.null()]),
  )
  .meta({ id: 'AuditDetails' });
export type AuditDetails = z.infer<typeof AuditDetailsSchema>;

export const AuditEventSchema = z
  .object({
    seq: z.number().int().positive().describe('Position in the chain, from 1, without gaps.'),
    occurredAt: z.iso.datetime(),
    actor: z
      .object({
        id: z.uuid(),
        name: z.string().describe('The login name at the time of the event.'),
      })
      .nullable()
      .describe('Null when nobody was identified (an unknown account, a refused setup).'),
    action: z.string().describe('One of the known actions; later versions add more.'),
    outcome: AuditOutcomeSchema,
    object: z.object({ type: z.string(), id: z.string() }).nullable(),
    ip: z.string().nullable(),
    requestId: z.string().nullable(),
    details: AuditDetailsSchema,
    prevHash: z.string().describe('The hash of the previous event; zeros for the first one.'),
    hash: z.string().describe('SHA-256 over this event and `prevHash` (docs/adr/0015).'),
  })
  .meta({ id: 'AuditEvent' });
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 200;

export const AuditQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AUDIT_PAGE_MAX)
    .optional()
    .describe(`Events per page, ${String(AUDIT_PAGE_DEFAULT)} by default.`),
  cursor: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe('Return events older than this sequence number (`nextCursor` of the previous page).'),
  action: z.string().min(1).max(64).optional(),
  // Not the named schema: a query parameter describes itself inline instead of pointing into the components.
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  actorId: z.uuid().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditPageSchema = z
  .object({
    events: z.array(AuditEventSchema).describe('Newest first.'),
    nextCursor: z.number().int().positive().nullable().describe('Null on the last page.'),
  })
  .meta({ id: 'AuditPage' });
export type AuditPage = z.infer<typeof AuditPageSchema>;

export const ChainProblemSchema = z
  .object({
    seq: z.number().int().positive().describe('The first sequence number that does not check out.'),
    reason: z
      .enum(['missing', 'link', 'content'])
      .describe(
        '`missing`: a number is absent or repeated. `link`: the previous hash does not match. `content`: the stored hash does not match the stored fields.',
      ),
  })
  .meta({ id: 'ChainProblem' });
export type ChainProblem = z.infer<typeof ChainProblemSchema>;

export const ChainVerificationSchema = z
  .object({
    ok: z.boolean(),
    checked: z
      .number()
      .int()
      .nonnegative()
      .describe('How many events were checked and found intact, up to the first problem.'),
    head: z
      .object({ seq: z.number().int().positive(), hash: z.string() })
      .nullable()
      .describe('The last event when the check started. Note it somewhere outside the database.'),
    problem: ChainProblemSchema.nullable(),
  })
  .meta({ id: 'ChainVerification' });
export type ChainVerification = z.infer<typeof ChainVerificationSchema>;
