/**
 * The API tokens page (apps/web/src/security/tokens-page.tsx): your own tokens, creating one, and, for those who
 * may see them, the tokens of everyone. Names, usernames, addresses and permission ids are data and stay as they are.
 */
export const tokens = {
  header: {
    title: 'API tokens',
    description:
      'Credentials for scripts and the command line, issued in your name and limited to what you choose',
  },

  signInAgain: 'Sign in again to continue.',

  /** The columns of both tables. */
  columns: {
    user: 'User',
    name: 'Name',
    permissions: 'Permissions',
    addresses: 'Allowed addresses',
    created: 'Created',
    expires: 'Expires',
    lastUsed: 'Last used',
    state: 'State',
    id: 'ID',
  },

  /** The title of a toast after something worked; the text says what. */
  toast: {
    success: 'Success',
  },

  states: {
    active: 'Active',
    expired: 'Expired',
    revoked: 'Revoked',
  },

  table: {
    permissionCount_one: '{{count}} permission',
    permissionCount_other: '{{count}} permissions',
    anywhere: 'anywhere',
    neverUsed: 'never used',
    revokedOn: 'Revoked {{when}}',
    view: 'View',
    revoke: 'Revoke',
    actionsFor: 'Actions for the token “{{name}}”',
  },

  /** The details of one token (the View entry of the menu of a row). */
  view: {
    copyPermissions: 'Copy permissions',
  },

  mine: {
    title: 'Your tokens',
    description: 'Tokens issued in your name. You can hold up to {{max}} active tokens at once.',
    create: 'Create token',
    empty: 'You have no API tokens.',
    emptyHint: 'Create one to use the API from a script or the command line.',
    valueNote: 'The value of a token is shown only once, when it is created.',
    revokeForbidden: 'You cannot revoke this token.',
  },

  all: {
    title: 'All tokens',
    description: 'The API tokens of every user. Their values are never shown.',
    userFilterLabel: 'Filter by user',
    userFilterPlaceholder: 'All users',
    empty: 'Nobody has created an API token.',
    emptyFiltered: 'This user has no API tokens.',
    loadFailed: 'Your role may not see the tokens of other users.',
    revokeForbidden: 'Your role may not revoke the tokens of other users.',
  },

  revoke: {
    title: 'Revoke “{{name}}”?',
    warning:
      'Whatever uses this token stops working at once. Revoking cannot be undone: create a new token to replace it.',
    warningOther:
      'Whatever uses this token of {{username}} stops working at once. Revoking cannot be undone; {{username}} can create a new token.',
    submit: 'Revoke token',
    done: 'The token “{{name}}” was revoked.',
  },

  /** The two groups of permissions of a resource: looking at things, and doing things. */
  permissionKinds: {
    read: 'Read',
    actions: 'Actions',
    aria: '{{kind}} permissions: {{resource}}',
  },

  /** The kinds of permission a token can carry, named after the part before the colon. */
  resources: {
    servers: 'Servers',
    panel: 'Panel',
    runs: 'Runs',
    vault: 'Vault',
    terminal: 'Terminal',
    users: 'Users',
    roles: 'Roles',
    audit: 'Audit',
    sessions: 'Sessions',
    tokens: 'Tokens',
    plugins: 'Plugins',
  },

  create: {
    title: 'Create an API token',
    onceTitle: 'Shown only once',
    once: 'The value of the token appears once, right after you create it. Only a hash of it is kept, so a lost token cannot be recovered.',
    presetRead: 'Read only',
    presetAll: 'Everything I may',
    clear: 'Clear the permissions',
    nameLabel: 'Name',
    nameDescription: 'What the token is for, for example “deploy script”',
    nameError: 'Enter a name of up to {{max}} characters.',
    expiresLabel: 'Expires after (days)',
    expiresDescription: 'From 1 to {{max}}. A token never lasts longer.',
    expiresError: 'Enter a whole number of days from 1 to {{max}}.',
    addressesLabel: 'Allowed addresses',
    addressesDescription:
      'Optional. One address or range per line, for example 203.0.113.7 or 203.0.113.0/24. Left empty, the token works from anywhere.',
    addressesInvalid: 'Not an address or range: {{list}}',
    addressesTooMany: 'Too many entries. List fewer addresses or use wider ranges.',
    permissionsLabel: 'Permissions',
    permissionsDescription:
      'A token can carry only permissions your role has. Permissions that need a fresh confirmation with a code cannot be given to a token.',
    permissionsEmpty: 'Your role has no permissions that a token can carry.',
    permissionsError: 'Tick at least one permission.',
    forbidden: 'Your role may not create API tokens.',
    submit: 'Create token',
  },

  /** What the person sees right after creating a token: the one time its value is shown. */
  created: {
    title: 'Your new token',
    intro: 'The token “{{name}}” expires {{when}}.',
    warningTitle: 'Copy it now',
    warning:
      'This is the only time the token is shown. Only a hash of it is kept, so a lost token cannot be recovered: revoke it and create another.',
    valueLabel: 'Token',
    copy: 'Copy token',
    exampleLabel: 'Example request',
    exampleHint: 'Asks the API who the token belongs to.',
    copyExample: 'Copy command',
    saved: 'I saved the token',
  },
} as const;
