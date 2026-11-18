/**
 * The plugins page (apps/web/src/settings/plugins-page.tsx): the plugins found in the directories of this instance,
 * what each one asks for, enabling or disabling them, and checking that an enabled one loads. Names, ids, versions,
 * hosts, scopes, method names and the problems or errors a plugin reports are data and stay as they are.
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
    none: 'Plugins are read from directories on the server. Set <code>SW_PLUGINS_OFFICIAL_DIR</code> for the plugins that ship with Swellwright, <code>SW_PLUGINS_LOCAL_DIR</code> for your own and <code>SW_PLUGINS_COMMUNITY_DIR</code> for plugins by others, then restart the API.',
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
    community: 'Community',
  },
  trustHint: {
    official: 'Comes with Swellwright.',
    local: 'Comes from a directory of this server.',
    community:
      'A plugin by others: it can only run as a container or as data, never as code inside Swellwright.',
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

  /** The settings a plugin declares (a form made from its `config.schema`); field names and server messages are data. */
  settings: {
    title: 'Settings',
    loadFailed: 'Your role may not see the settings of this plugin.',
    forbidden: 'Your role may not change the settings of plugins.',
    readOnly: 'Your role may see these settings but not change them.',
    problemsTitle: 'These settings need attention',
    save: 'Save settings',
    saved: 'Settings saved.',
    lastChanged: 'Last changed by {{who}} on {{when}}.',
    neverSaved: 'Nothing has been saved yet.',
    notSet: 'Not set',
    lengthMin_one: 'At least {{count}} character',
    lengthMin_other: 'At least {{count}} characters',
    lengthMax_one: 'At most {{count}} character',
    lengthMax_other: 'At most {{count}} characters',
    lengthExact_one: 'Exactly {{count}} character',
    lengthExact_other: 'Exactly {{count}} characters',
    lengthBoth_one: 'From {{min}} to {{count}} character',
    lengthBoth_other: 'From {{min}} to {{count}} characters',
    rangeMin: 'At least {{min}}',
    rangeMax: 'At most {{max}}',
    rangeBoth: 'From {{min}} to {{max}}',
    secretHint: 'Secrets are kept in the vault. Choose one; its value is never shown here.',
    secretCreate: 'Create it on the Vault page',
    secretsUnavailable:
      'The secrets could not be listed, so only the start of the chosen secret’s id is shown.',
    secretMissing: 'Not in the list ({{id}})',
    noSecrets: 'There is no secret of the type “{{type}}” in the vault yet.',
  },

  signed: 'The manifest carries a signature. It is not verified yet, so it proves nothing.',

  local: {
    title: 'Code from this server',
    body: 'This plugin comes from a directory of this server, not from the Swellwright project. Its code runs in a process of its own that can read only its own files and reach only the hosts you approve, or in a container you start yourself when it has one. That limits mistakes and most misuse; it is not a sandbox against code written to attack the server. Enable only what you trust.',
  },

  /** A plugin whose code runs in a container the administrator starts: what the container is and how it is run. */
  container: {
    title: 'Container',
    image: 'Image',
    port: 'Port',
    memory: 'Memory limit',
    memoryValue: '{{memory}} MiB',
    cpus: 'CPU limit',
    note: 'The code of this plugin runs in a container of its own that you start yourself; Swellwright never starts containers. The container has no network of its own: it reaches the world only through Swellwright, and only the hosts you approve.',
    fragmentButton: 'Compose fragment',
    forbidden: 'Your role may not get the compose fragment of plugins.',
  },

  /** The Docker Compose file that adds the container to the stack. It holds the token the container proves itself with. */
  fragment: {
    title: 'Compose fragment',
    warning:
      'This file holds the token the container proves itself with. Keep it like a secret. It changes when the plugin’s files change.',
    service: 'Service',
    file: 'Compose file {{name}}',
    applyTitle: 'How to apply',
    applySave: 'Save the file next to your compose file.',
    applyRun: 'Run <code>{{command}}</code>.',
    applyCheck: 'Then press Check in the Runtime section of this plugin.',
  },

  runtime: {
    title: 'Runtime',
    states: {
      stopped: 'Stopped',
      running: 'Running',
      failed: 'Failed',
    },
    started: 'Started',
    calls: 'Calls',
    idle: 'No process is running now.',
    sidecarIdle: 'Not checked yet. Press Check to ask the container.',
    noCode: 'It has no code to run: nothing starts.',
    failedTitle: 'It failed to run',
    failedUnknown: 'No reason was recorded.',
    modulesTitle: 'Loaded modules',
    methodsTitle: 'Methods it offers',
    operationsTitle: 'Operations it offers',
    noMethods: 'none',
    restricted:
      'A plugin runs in a restricted process of its own. It can read only its own files, has no network of its own (it reaches only the hosts you approved, through Swellwright), cannot start programs or workers, sees nothing of the environment of Swellwright, has a memory limit, and is ended when a call takes too long.',
    restrictedContainer:
      'The plugin runs in its own container, outside Swellwright. Check asks the container what it offers.',
    check: {
      button: 'Check',
      note: 'Loads the plugin in its restricted process and lists what it offers. Nothing else happens.',
      noteSidecar: 'Asks the container what it offers. Nothing else happens.',
      noteData:
        'Reads the driver and lists the operations it offers. Nothing is sent to the service.',
      forbidden: 'Your role may not check plugins.',
    },
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
