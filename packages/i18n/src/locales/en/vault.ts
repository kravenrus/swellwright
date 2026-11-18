/**
 * The Vault page (apps/web/src/security/vault-page.tsx): setting it up, sealing and unsealing, the list of
 * secrets and the dialogs that change them. The `types` names are keyed by the id of the secret type
 * (`SECRET_TYPES` in the contracts); the id itself stays the data the API works with.
 */
export const vault = {
  header: {
    title: 'Vault',
    description: 'Secrets are encrypted before they reach the database, and values are write-only',
    sealNow: 'Seal now',
    addSecret: 'Add a secret',
  },

  states: {
    unsealed: 'Unsealed',
    sealed: 'Sealed',
    uninitialized: 'Not set up',
  },

  signInAgain: 'Sign in again to continue.',

  /** The kinds of secret, by id. */
  types: {
    panel_token: 'Panel token',
    ssh_key: 'SSH key',
    ssh_password: 'SSH password',
    ssh_ca: 'SSH CA',
    dns_oauth: 'DNS OAuth',
    provider_token: 'Provider token',
    telegram: 'Telegram',
    generic: 'Generic',
  },

  /** The bar under the passphrase: how far it is from comfortable. */
  strength: {
    tooShort_one: 'At least {{count}} character. Words in a row are fine.',
    tooShort_other: 'At least {{count}} characters. Words in a row are fine.',
    acceptable: 'Acceptable. A longer phrase is better.',
    long: 'Long enough.',
  },

  setup: {
    title: 'Set up the vault',
    intro:
      'Choose a passphrase. It protects every secret Swellwright keeps. The vault starts sealed after every restart, and you open it with this passphrase. There is no way to recover it except the recovery key you get next.',
    passphraseLabel: 'Passphrase',
    repeatLabel: 'Repeat the passphrase',
    mismatch: 'The passphrases differ.',
    forbidden: 'Your role may not set the vault up.',
    submit: 'Create the vault',
    ownerNeeded: 'The vault is not set up yet. An owner has to set it up.',
  },

  /** Shown once, right after the vault is created. */
  recoveryKey: {
    title: 'Save the recovery key now',
    warning:
      'It opens the vault if you lose the passphrase, and nothing else can. It is shown once and kept nowhere on this server. Write it down or put it in a password manager, away from this machine.',
    copy: 'Copy the key',
    storedLabel: 'I have stored the recovery key outside this server',
    open: 'Open the vault',
  },

  sealed: {
    title: 'The vault is sealed',
    ownerNeeded: 'An owner has to unseal it before anything that uses a secret can run.',
  },

  unseal: {
    notice:
      'Runs that use a secret, and anything scheduled, wait until the vault is unsealed. The list below shows names and dates only.',
    passphraseLabel: 'Vault passphrase',
    recoveryKeyLabel: 'Recovery key',
    recoveryKeyDescription: 'Thirteen groups of four, like ABCD-EFGH-…',
    wrongPassphrase:
      'That passphrase is not right. Ten wrong attempts in a quarter of an hour lock unsealing for everyone.',
    wrongRecoveryKey: 'That recovery key is not right.',
    forbidden: 'Your role may not unseal the vault.',
    useRecoveryKey: 'Lost the passphrase? Use the recovery key',
    usePassphrase: 'Use the passphrase instead',
    submit: 'Unseal',
  },

  seal: {
    forbidden: 'Your role may not seal the vault.',
  },

  summary: {
    secrets: 'Secrets',
    keyVersion: 'Key version',
    setUp: 'Set up',
  },

  list: {
    name: 'Name',
    kind: 'Kind',
    version: 'Version',
    expires: 'Expires',
    valueChanged: 'Value changed',
    empty: 'No secrets yet.',
    emptyCanAdd: 'No secrets yet. Add the first one.',
    expired: '{{date}} (expired)',
    soon: '{{date}} (soon)',
    actionsFor: 'Actions for {{name}}',
    loadFailed: 'Your role may not see the secrets.',
    statusFailed: 'Your role may not see the vault.',
  },

  menu: {
    reveal: 'Reveal',
    change: 'Change',
  },

  form: {
    addTitle: 'Add a secret',
    editTitle: 'Change {{name}}',
    name: 'Name',
    kind: 'Kind',
    kindLocked: 'The kind cannot change.',
    value: 'Value',
    newValue: 'New value',
    valueHintCreate: 'Write-only: it can be revealed later, never listed.',
    valueHintEdit: 'Leave empty to keep the current value. A new one makes a new version.',
    description: 'Description',
    expiresOn: 'Expires on',
    expiresHint: 'Optional. The console warns before it.',
    forbidden: 'Your role may not change secrets.',
    submitCreate: 'Store the secret',
  },

  reveal: {
    hiddenIn_one: 'Hidden in {{count}} second. This was recorded in the audit log.',
    hiddenIn_other: 'Hidden in {{count}} seconds. This was recorded in the audit log.',
    forbidden: 'Your role may not reveal secrets.',
  },

  delete: {
    title: 'Delete {{name}}',
    warning:
      'The secret and its value are gone for good. Anything that still uses it will stop working.',
    forbidden: 'Your role may not delete secrets.',
  },
} as const;
