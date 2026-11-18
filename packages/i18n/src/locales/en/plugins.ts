/**
 * The plugins page (apps/web/src/settings/plugins-page.tsx): the plugins found in the directories of this instance,
 * what each one asks for, and enabling or disabling them. Names, ids, versions, hosts, scopes and the problems a
 * plugin reports are data and stay as they are.
 */
export const plugins = {
  header: {
    title: 'Plugins',
    description: 'Extensions of this instance, what each one asks for and whether it is enabled',
  },

  signInAgain: 'Sign in again to continue.',
  loadFailed: 'Your role may not see the plugins.',
  manageForbidden: 'Your role may not enable or disable plugins.',

  directories: {
    noneTitle: 'No plugin directory is configured',
    none: 'Plugins are read from directories on the server. Set <code>SW_PLUGINS_OFFICIAL_DIR</code> for the plugins that ship with Swellwright and <code>SW_PLUGINS_LOCAL_DIR</code> for your own, then restart the API.',
    emptyTitle: 'No plugins found',
    empty:
      'The configured directories contain no plugins. Add a plugin folder to one of them and refresh.',
  },

  columns: {
    plugin: 'Plugin',
    version: 'Version',
    trust: 'Trust',
    status: 'Status',
    provides: 'Provides',
  },

  trust: {
    official: 'Official',
    local: 'Local',
  },
  trustHint: {
    official: 'Comes with Swellwright.',
    local: 'Comes from a directory of this server.',
  },

  statuses: {
    not_enabled: 'Not enabled',
    enabled: 'Enabled',
    disabled: 'Disabled',
    changed: 'Changed',
    unavailable: 'Unavailable',
    missing: 'Missing',
  },

  provides: {
    declarative: '{{kind}} · declarative',
    codeHint: 'Runs its own code.',
    declarativeHint: 'Described in data; runs no code of its own.',
  },

  table: {
    summary_one: '{{count}} plugin',
    summary_other: '{{count}} plugins',
  },

  actions: {
    review: 'Review',
    enable: 'Enable',
    disable: 'Disable',
    reviewAria: 'Review the plugin “{{name}}”',
    enableAria: 'Enable the plugin “{{name}}”',
    disableAria: 'Disable the plugin “{{name}}”',
  },

  detail: {
    fields: {
      id: 'Id',
      version: 'Version',
      license: 'License',
      trust: 'Trust',
      digest: 'Digest',
    },
    digestHint: 'SHA-256 over every file of the plugin. Your approval is tied to it.',
    provides: 'Provides',
  },

  approval: {
    line: 'Approved {{when}} by {{who}} (version {{version}}).',
  },

  asks: {
    title: 'What it asks for',
    approvedTitle: 'What it was approved for',
    nothing: 'Nothing: it asks for no permissions.',
    network: 'Network hosts',
    secrets: 'Secrets',
    panel: 'Panel API',
    ssh: 'SSH',
    none: 'none',
    sshYes: 'Yes, it may run commands on servers',
    sshNo: 'No',
    note: 'Whatever is not listed is denied. Network calls go through the core, and a secret is handed to the plugin for a single call.',
  },

  signed: 'The manifest carries a signature. It is not verified yet, so it proves nothing.',

  local: {
    title: 'Code from this server',
    body: 'This plugin comes from a directory of this server, not from the Swellwright project. The administrator who enables it answers for what it does.',
  },

  changed: {
    title: 'The files changed since they were approved',
    body: 'It does not run until it is approved again.',
    permissionsTitle: 'Permissions compared with the approved ones',
    widens: 'It asks for more than before.',
    same: 'It asks for the same as before.',
    added: 'Added',
    removed: 'Removed',
    ssh: 'SSH on servers',
  },

  missing: {
    title: 'Its files are gone',
    body: 'The plugin was approved before and is no longer in the directory. Its approval stays on record.',
  },

  unavailable: {
    title: 'It cannot be enabled',
    invalid: 'Its files are not valid.',
    incompatible: 'It was made for other versions of Swellwright.',
  },

  enable: {
    confirm: 'Enable plugin',
    note: 'Enabling approves what it asks for, tied to this exact content (its digest). If the files change, it must be approved again.',
  },

  disable: {
    title: 'Disable “{{name}}”?',
    body: 'The plugin is switched off. Its approval stays on record, so you can enable it again later.',
    confirm: 'Disable plugin',
  },

  notice: {
    enabled: 'The plugin “{{name}}” is enabled.',
    disabled: 'The plugin “{{name}}” is disabled.',
  },
} as const;
