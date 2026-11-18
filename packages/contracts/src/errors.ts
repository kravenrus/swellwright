import { z } from 'zod';

/** Stable, machine-readable error codes. Clients branch on `code`, never on `message`. */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'not_ready',
  'internal_error',
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES).meta({ id: 'ErrorCode' });
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** The envelope of every non-2xx response. */
export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z
        .string()
        .describe('Human-readable text for logs and developers, not for branching.'),
      requestId: z.string().describe('Also sent in the x-request-id response header.'),
      details: z
        .unknown()
        .optional()
        .describe('Optional structured details, for example validation issues.'),
    }),
  })
  .meta({ id: 'ApiError', description: 'Error envelope.' });
export type ApiError = z.infer<typeof ApiErrorSchema>;
