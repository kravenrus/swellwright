/** The Users page (apps/web/src/security/users-page.tsx). Role names are in the `roles` namespace. */
export const users = {
  header: {
    title: 'Users',
    description: 'Who can sign in to this instance, and what they may do',
    invite: 'Invite a user',
  },

  /** Labels shared by the table and the dialogs. */
  fields: {
    loginName: 'Login name',
    role: 'Role',
    status: 'Status',
    displayName: 'Display name',
    email: 'E-mail address',
  },

  states: {
    active: 'Active',
    invited: 'Invited',
    disabled: 'Disabled',
  },

  table: {
    state: 'State',
    lastSignIn: 'Last sign-in',
    you: 'you',
    invitationUntil: 'invitation until {{when}}',
    actionsFor: 'Actions for {{username}}',
    loadMore: 'Load more',
    loadFailed: 'Your role may not see the users.',
  },

  menu: {
    change: 'Change',
    resetCredentials: 'Reset credentials',
    deleteUser: 'Delete user',
  },

  invite: {
    title: 'Invite a user',
    loginNameDescription:
      'Lower-case letters, digits, dot, dash or underscore. 2 to 32 characters.',
    loginNameError: 'This login name is not allowed.',
    roleDescription: 'What they may do. See the Roles page.',
    emailError: 'This is not an e-mail address.',
    forbidden: 'Your role may not invite users.',
    submit: 'Create and invite',
  },

  edit: {
    title: 'Change {{username}}',
    roleSelf: 'You cannot change your own role.',
    statusSelf: 'You cannot disable yourself.',
    statusHint: 'A disabled user is signed out at once and cannot sign in.',
    forbidden: 'Your role may not change users.',
  },

  reset: {
    title: 'Reset the credentials of {{username}}',
    warning:
      'This deletes their password, authenticator and recovery codes and signs them out everywhere, now. They cannot sign in until they accept the new invitation you will get.',
    forbidden: 'Your role may not reset credentials.',
    submit: 'Reset credentials',
  },

  /** Deleting a disabled account for good. */
  delete: {
    title: 'Delete {{username}}',
    irreversible: 'This cannot be undone.',
    warning:
      'The account of {{username}} is removed for good, with its password, authenticator, sessions and tokens. What the account did stays in the audit log under its name.',
    forbidden: 'Your role may not delete users.',
    submit: 'Delete user',
    done: '{{username}} was deleted.',
  },

  /** The invitation, shown once after creating a user or resetting their credentials. */
  invitation: {
    title: 'Invitation',
    introNew:
      '{{user}} has an account but no password yet. Give them this link. It is shown once, works once, and expires {{expires}}.',
    introReset:
      'The password and authenticator of {{user}} are gone and every session of theirs has ended. Give them this link. It is shown once, works once, and expires {{expires}}.',
    link: 'Link',
    copyLink: 'Copy the link',
    done: 'Done',
  },

  signInAgain: 'Sign in again to continue.',
} as const;
