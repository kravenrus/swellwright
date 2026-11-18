import { z } from 'zod';

import { UsernameSchema } from './auth.js';
import { UserRoleSchema } from './roles.js';

export const USER_STATUSES = ['active', 'disabled'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES).meta({ id: 'UserStatus' });
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** What a person sees about an account. `invited`: active, but the password or authenticator is not set up yet. */
export const USER_STATES = ['active', 'invited', 'disabled'] as const;
export const UserStateSchema = z.enum(USER_STATES).meta({ id: 'UserState' });
export type UserState = z.infer<typeof UserStateSchema>;

export const UserViewSchema = z
  .object({
    id: z.uuid(),
    username: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    role: UserRoleSchema,
    state: UserStateSchema,
    lastLoginAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    invitationExpiresAt: z.iso
      .datetime()
      .nullable()
      .describe('When the open invitation of this user stops working; null when there is none.'),
  })
  .meta({ id: 'UserView' });
export type UserView = z.infer<typeof UserViewSchema>;

export const INVITATION_PURPOSES = ['invite', 'reset'] as const;
export const InvitationSchema = z
  .object({
    token: z
      .string()
      .describe(
        'Shown once, never again; only its hash is kept. The console opens `#invite=<token>`.',
      ),
    expiresAt: z.iso.datetime(),
    purpose: z.enum(INVITATION_PURPOSES),
  })
  .meta({
    id: 'Invitation',
    description: 'A one-time token that lets its holder choose a password for the account.',
  });
export type Invitation = z.infer<typeof InvitationSchema>;

export const UserInvitationSchema = z
  .object({ user: UserViewSchema, invitation: InvitationSchema })
  .meta({ id: 'UserInvitation' });
export type UserInvitation = z.infer<typeof UserInvitationSchema>;

export const USER_PAGE_DEFAULT = 100;
export const USER_PAGE_MAX = 200;

export const UserListQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(USER_PAGE_MAX)
    .optional()
    .describe(`Users per page, ${String(USER_PAGE_DEFAULT)} by default.`),
  cursor: z.uuid().optional().describe('The `nextCursor` of the previous page.'),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const UserListSchema = z
  .object({
    users: z.array(UserViewSchema).describe('Ordered by creation.'),
    nextCursor: z.uuid().nullable().describe('Null on the last page.'),
  })
  .meta({ id: 'UserList' });
export type UserList = z.infer<typeof UserListSchema>;

export const UserIdParamsSchema = z.object({ id: z.uuid() });

const DisplayName = z.string().trim().min(1).max(100);
const Email = z.email().max(254);

export const CreateUserRequestSchema = z
  .object({
    username: UsernameSchema,
    role: UserRoleSchema,
    displayName: DisplayName.optional(),
    email: Email.optional(),
  })
  .meta({ id: 'CreateUserRequest' });
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({
    role: UserRoleSchema.optional(),
    status: UserStatusSchema.optional(),
    displayName: DisplayName.nullable().optional(),
    email: Email.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field.' })
  .meta({
    id: 'UpdateUserRequest',
    description:
      'Fields that are absent stay as they are; `null` clears the display name or the e-mail address.',
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
