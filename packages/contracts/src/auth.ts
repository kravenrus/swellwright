import { z } from 'zod';

import { PermissionSchema, UserRoleSchema } from './roles.js';

/** Login names are stored lower-case, 2 to 32 characters. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/u;
export const UsernameSchema = z.string().regex(USERNAME_PATTERN, {
  message:
    'Use 2 to 32 lower-case letters, digits, dots, dashes or underscores, starting with a letter or digit.',
});

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
/** The policy applies when a password is chosen. A login only checks the length bounds. */
export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const UserSummarySchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string().nullable(),
    role: UserRoleSchema,
    language: z.string(),
    theme: z.string(),
  })
  .meta({ id: 'UserSummary', description: 'The signed-in user.' });
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const SetupStatusSchema = z
  .object({
    initialized: z.boolean().describe('True once the instance owner exists.'),
  })
  .meta({ id: 'SetupStatus' });
export type SetupStatus = z.infer<typeof SetupStatusSchema>;

export const SetupOwnerRequestSchema = z
  .object({
    setupToken: z
      .string()
      .min(1)
      .max(256)
      .describe('The one-time token the server printed to its log at start.'),
    username: UsernameSchema,
    password: PasswordSchema,
  })
  .meta({ id: 'SetupOwnerRequest' });
export type SetupOwnerRequest = z.infer<typeof SetupOwnerRequestSchema>;

export const LoginRequestSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .meta({ id: 'LoginRequest' });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AcceptInvitationRequestSchema = z
  .object({
    token: z.string().min(20).max(128).describe('The invitation token the owner handed over.'),
    password: PasswordSchema,
  })
  .meta({ id: 'AcceptInvitationRequest' });
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: PasswordSchema,
  })
  .meta({ id: 'ChangePasswordRequest' });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const AUTH_NEXT_STEPS = ['totp', 'totp_enrollment'] as const;
export const AuthNextStepSchema = z.enum(AUTH_NEXT_STEPS).meta({ id: 'AuthNextStep' });
export type AuthNextStep = z.infer<typeof AuthNextStepSchema>;

export const PendingSessionSchema = z
  .object({
    next: AuthNextStepSchema.describe(
      '`totp`: enter a code from the authenticator or a recovery code. `totp_enrollment`: set up the authenticator first.',
    ),
  })
  .meta({
    id: 'PendingSession',
    description: 'The password was accepted; a second step is needed to finish signing in.',
  });
export type PendingSession = z.infer<typeof PendingSessionSchema>;

export const TOTP_CODE_LENGTH = 6;
export const TotpCodeRequestSchema = z
  .object({
    code: z
      .string()
      .min(TOTP_CODE_LENGTH)
      .max(32)
      .describe('A 6-digit authenticator code, or one recovery code (only on sign-in).'),
  })
  .meta({ id: 'TotpCodeRequest' });
export type TotpCodeRequest = z.infer<typeof TotpCodeRequestSchema>;

export const TotpEnrollmentSchema = z
  .object({
    secret: z.string().describe('Base32 secret for manual entry.'),
    otpauthUri: z.string().describe('An otpauth:// URI for QR codes.'),
  })
  .meta({ id: 'TotpEnrollment' });
export type TotpEnrollment = z.infer<typeof TotpEnrollmentSchema>;

const PermissionsField = z
  .array(PermissionSchema)
  .describe(
    "What the user's role allows. The console uses it to show or hide pages; every route checks again.",
  );

export const SessionInfoSchema = z
  .object({
    user: UserSummarySchema,
    permissions: PermissionsField,
    expiresAt: z.iso.datetime().describe('When the session ends if it stays idle.'),
  })
  .meta({ id: 'SessionInfo' });
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const TotpConfirmedSchema = z
  .object({
    user: UserSummarySchema,
    permissions: PermissionsField,
    expiresAt: z.iso.datetime(),
    recoveryCodes: z
      .array(z.string())
      .describe('Single-use codes for a lost authenticator. Shown once, never again.'),
  })
  .meta({ id: 'TotpConfirmed' });
export type TotpConfirmed = z.infer<typeof TotpConfirmedSchema>;
