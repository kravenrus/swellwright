/**
 * The Servers page and its drawer (apps/web/src/fleet): the table, the form of a server, its pinned host keys, its
 * access entries and its facts. The names of the states are keyed by the id of the state (`SERVER_STATES` in the
 * contracts); the id itself stays the data the API works with.
 */
export const servers = {
  title: 'Servers',
  signInAgain: 'Sign in again to continue.',
  readForbidden: 'Your role may not see the servers.',
  loadFailed: 'The servers could not be loaded',

  header: {
    add: 'Add a server',
  },

  toast: {
    success: 'Done',
    saved: 'Server {{name}} was saved.',
    created: 'Server {{name}} was added. You can pin its host key and add access now.',
    deleted: 'Server {{name}} was deleted.',
  },

  /** What a server is in its life. A server may be moved between any two of them. */
  states: {
    draft: 'Draft',
    provisioning: 'Provisioning',
    active: 'Active',
    draining: 'Draining',
    retired: 'Retired',
  },

  columns: {
    name: 'Name',
    status: 'Status',
    state: 'State',
    address: 'Address',
    port: 'SSH port',
    provider: 'Provider',
    os: 'OS',
    kernel: 'Kernel',
    hostKey: 'Host key',
    access: 'Access',
    tags: 'Tags',
    notes: 'Notes',
    created: 'Created',
    updated: 'Updated',
  },

  hostKey: {
    pinned: 'Pinned',
    notPinned: 'Not pinned',
  },

  table: {
    empty: 'No servers found.',
    add: 'Add a server',
    edit: 'Edit',
    editNamed: 'Open server {{name}}',
  },

  form: {
    createTitle: 'New server',
    editTitle: 'Server {{name}}',
    create: 'Add the server',
    forbidden: 'Your role may not change servers.',
    state: 'State',
    name: 'Name',
    nameHint:
      'Letters, digits, spaces, dots, dashes and underscores. Each server has its own name.',
    nameError: 'Use 1 to 64 letters, digits, spaces, dots, dashes or underscores.',
    address: 'Address',
    addressHint: 'A host name or an IP address, the one SSH connects to.',
    addressError: 'Use a host name, an IPv4 or an IPv6 address.',
    port: 'SSH port',
    portHint: '1 to 65535.',
    portError: 'Use a port from 1 to 65535.',
    details: 'Details',
    country: 'Country',
    countryPlaceholder: 'Not set',
    countryNothing: 'No such country',
    provider: 'Provider',
    providerError: 'Use at most 64 characters.',
    optional: 'Optional',
    tags: 'Tags',
    tagsHint: 'Separate with a comma, a space or a semicolon. Up to 20 tags.',
    tagsPlaceholder: 'Add a tag',
    tagsError:
      'A tag has 1 to 32 letters, digits, dots, dashes, underscores or colons and starts with a letter or a digit.',
    notes: 'Notes',
    notesError: 'Use at most 2000 characters.',
  },

  hostKeys: {
    title: 'Host keys',
    subtitle: 'What the server must show before Swellwright trusts it',
    count_one: '{{count}} key pinned',
    count_other: '{{count}} keys pinned',
    none: 'Not pinned',
    empty:
      'No host key is pinned. Pin the fingerprint you checked yourself, for example in the console of your provider, so that nobody can answer in the name of this server.',
    howTo: 'You get the fingerprint on the server with',
    algorithm: 'Key type',
    fingerprint: 'SHA-256 fingerprint',
    fingerprintError: 'Use SHA256: and 43 characters, as ssh-keygen prints it.',
    pin: 'Pin the key',
    pinned: 'The host key of {{name}} was pinned.',
    pinFailed: 'Pin the host key',
    pinnedBy: 'Pinned by',
    unknownUser: 'a user that no longer exists',
    revoke: 'Revoke',
    revokeNamed: 'Revoke the key {{fingerprint}}',
    revokeTitle: 'Revoke the host key',
    revokeIrreversible: 'The key stops being trusted at once.',
    revokeWarning:
      'Use this when {{name}} was reinstalled. Nothing connects to it until a new key is pinned.',
    revoked: 'The host key was revoked.',
    revokeFailed: 'Revoke the host key',
    forbidden: 'Your role may not change host keys.',
  },

  access: {
    title: 'Access',
    subtitle: 'How Swellwright logs in. Entries name secrets of the vault; at most {{max}}.',
    add: 'Add access',
    full: 'A server has at most {{max}} access entries.',
    empty: 'No way to log in is set up. Add an entry that names a secret of the vault.',
    addTitle: 'Add access',
    editTitle: 'Change access',
    added: 'Access to {{name}} was added.',
    updated: 'Access to {{name}} was changed.',
    forbidden: 'Your role may not change access.',
    method: 'Method',
    methods: {
      password: 'Password',
      key: 'SSH key',
    },
    username: 'Login',
    usernameError:
      'Use 1 to 64 lower-case letters, digits, dashes or underscores, starting with a letter or an underscore.',
    secretPassword: 'Password secret',
    secretKey: 'Key secret',
    secretPasswordHint: 'The password of this login, as a secret of the vault.',
    secretKeyHint: 'The private key of this login, as a secret of the vault.',
    secretError: 'Choose a secret of the kind "{{kind}}".',
    secretsFailed: 'The secrets of the vault could not be read.',
    noSecrets: 'There is no secret of the kind "{{kind}}".',
    chooseSecret: 'Choose a secret',
    openVault: 'Open the vault',
    sudoSecret: 'Sudo password',
    sudoHint: 'Optional. A password secret, when sudo asks for one.',
    noSudo: 'No sudo password',
    priority: 'Priority',
    priorityHint: 'Lower first. The entries are tried in this order.',
    priorityDefault: 'After the last one',
    priorityError: 'Use a whole number from 0 to 1000.',
    edit: 'Change',
    editNamed: 'Change the access of {{username}}',
    remove: 'Remove',
    removeNamed: 'Remove the access of {{username}}',
    removeTitle: 'Remove the access',
    removeWarning:
      'The login {{username}} will no longer be used for {{name}}. The secrets stay in the vault.',
    removed: 'The access was removed.',
    removeFailed: 'Remove the access',
  },

  facts: {
    title: 'Facts',
    empty:
      'Nothing was collected yet. Facts (the system, the kernel, the services) are collected over SSH in the next step.',
    collected: 'Collected {{time}} by {{source}}',
  },

  delete: {
    title: 'Delete {{name}}',
    submit: 'Delete the server',
    irreversible: 'This cannot be undone.',
    warning:
      'The server {{name}} is removed from the inventory with its pinned host keys and access entries. The secrets stay in the vault.',
    rule: 'Only a draft or a retired server can be deleted.',
    forbidden: 'Your role may not delete servers.',
  },

  drawer: {
    title: 'Server',
    goneTitle: 'The server is gone',
    goneText: 'It was deleted meanwhile. Close this drawer and refresh the list.',
    failedTitle: 'The server could not be loaded',
    failedText: 'The details of the server could not be read. Try again.',
  },
} as const;
