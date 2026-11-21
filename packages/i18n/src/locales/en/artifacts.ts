/**
 * The Artifacts page (apps/web/src/operations/artifacts-page.tsx) and the artifacts card of the server drawer
 * (apps/web/src/fleet/artifacts-card.tsx). The names of the states are keyed by the states of the API.
 */
export const artifacts = {
  signInAgain: 'Sign in again to continue.',
  loadFailedTitle: 'The artifacts could not be loaded',
  readForbidden: 'Your role may not see the artifacts.',

  header: {
    title: 'Artifacts',
    description:
      'The files Swellwright puts on servers. Each one is checked against its SHA-256 before it is downloaded or sent.',
  },

  empty: {
    title: 'No artifacts found',
    text: 'The artifacts ship with the image, in the directory that SW_ARTIFACTS_DIR names. A directory with no manifest.json is not an artifact.',
  },

  /** The state of the file in the catalogue: is it what its manifest says. */
  states: {
    ok: 'Intact',
    broken: 'Broken',
  },

  card: {
    openAria: 'Open artifact {{name}}',
    menuAria: 'Actions for {{name}}',
    open: 'Details',
    download: 'Download',
    copyHash: 'Copy the SHA-256',
    copyName: 'Copy the name',
    hashCopyAria: 'Copy the SHA-256 of {{name}}',
    versions_one: '{{count}} version',
    versions_other: '{{count}} versions',
    malformed: 'Malformed manifest',
  },

  detail: {
    title: 'Details',
    version: 'Version',
    versionPick: 'Version shown',
    description: 'What it is',
    interpreter: 'Runs with',
    minOs: 'Written for',
    file: 'File',
    size: 'Size',
    sha256: 'SHA-256',
    sha256Hint:
      'What the file must hash to. Swellwright checks it before it serves or sends the file, and the server checks it again after the upload.',
    noVersion: 'This artifact has no usable manifest, so there is nothing to show but the reason.',
  },

  interpreters: {
    sh: 'POSIX sh',
    bash: 'bash',
    python3: 'Python 3',
    none: 'Nothing (a file that is only copied)',
  },

  broken: {
    title: 'This artifact is broken',
    body: 'The file on disk is not what its manifest says. It is not downloaded and not pushed to servers. Restore it from the image or the directory it came from.',
    reason: 'Why',
  },

  steps: {
    title: 'Steps',
    subtitle: 'What it can do, one at a time',
    none: 'This artifact has no steps.',
    readOnly: 'Read-only',
    changes: 'Changes the server',
    root: 'Needs root',
    inFull: 'In the full run',
    reads: 'Reads',
    requires: 'Needs',
  },

  params: {
    title: 'Parameters',
    subtitle: 'What a step is given: the environment or an env file',
    none: 'This artifact takes no parameters.',
    required: 'Required',
    secret: 'Secret',
    default: 'Default',
    example: 'Example',
    format: 'Format',
    values: 'Values',
    groups: {
      node: 'Node',
      installer: 'Installer',
    },
  },

  download: {
    button: 'Download',
    hint: 'The file is sent as it is, with its SHA-256 in the X-Content-SHA256 header.',
  },

  /** The card of a server's drawer: what was pushed to it. */
  server: {
    title: 'Artifacts',
    subtitle: 'Files Swellwright put on this server',
    count_one: '{{count}} copy',
    count_other: '{{count}} copies',
    none: 'None',
    empty:
      'Nothing was pushed to this server yet. Push an artifact to put a file on it, checked against its SHA-256 before and after the upload.',
    push: 'Push',
    pushForbidden: 'Your role may not push artifacts.',
    readFailed: 'The artifacts of this server could not be loaded',
    states: {
      ok: 'Matches the catalogue',
      differs: 'Differs',
      missing: 'Missing',
      never: 'Not checked yet',
    },
    destinations: {
      user: 'Home of the login',
      system: 'System directory',
    },
    catalogue: {
      broken: 'Broken in the catalogue',
      missing: 'Not in the catalogue',
    },
    fields: {
      path: 'Path',
      sha256: 'SHA-256',
      pushed: 'Pushed',
      checked: 'Last checked',
      onServer: 'On the server',
      expected: 'Expected',
    },
    verify: 'Verify',
    verifyNamed: 'Verify {{name}} {{version}}',
    verifyFailed: 'Verify the artifact',
    verifiedOk: '{{name}} {{version}} on {{server}} is what the catalogue says.',
    verifiedBad: '{{name}} {{version}} on {{server}} is {{state}}.',
    badStates: {
      differs: 'changed',
      missing: 'gone',
    },
    remove: 'Remove',
    removeNamed: 'Remove {{name}} {{version}}',
    removeTitle: 'Remove the artifact from the server',
    removeWarning:
      'The file {{name}} {{version}} is deleted from {{server}}, with the directories that were made for it and are empty now. The catalogue is not changed.',
    removed: '{{name}} {{version}} was removed from {{server}}.',
    removeFailed: 'Remove the artifact',
    pushedNow: '{{name}} {{version}} was pushed to {{server}} and checked.',
    unchangedNow: '{{name}} {{version}} is on {{server}} already, unchanged. Nothing was uploaded.',
    pushFailed: 'Push the artifact',
  },

  dialog: {
    title: 'Push an artifact to {{name}}',
    subtitle: 'Hashed here, uploaded over SFTP, hashed again on the server',
    artifact: 'Artifact',
    artifactPlaceholder: 'Choose an artifact',
    version: 'Version',
    destination: 'Where to put it',
    destinations: {
      user: 'Home of the login',
      system: 'System directory',
    },
    userHint:
      'The home directory of the user Swellwright logs in as, in .swellwright/artifacts. Private to that user.',
    systemHint:
      '/var/lib/swellwright/artifacts, owned by root and readable by everybody. Needs root or a working sudo.',
    pathExample: 'The file goes to',
    nothingToPush:
      'No artifact is intact, so nothing can be pushed. Look at the Artifacts page to see why.',
    push: 'Push',
    notice:
      'A file that already is on the server with the same SHA-256 is not uploaded again. If it differs, it is replaced.',
    chooseError: 'Choose an artifact.',
  },

  errors: {
    broken: 'This artifact is broken and is not sent. See the Artifacts page for the reason.',
    busy: 'Another artifact operation is running on this server. Try again when it has finished.',
    destinationConflict:
      'This version is on the server at the other place. Remove that copy first, then push it again.',
    hashMismatch:
      'What arrived on the server is not the file that was sent, so it was thrown away. Nothing was put in place. Try again.',
    hashMismatchFinal:
      'The file in its place on the server did not hash to the expected value, so it was removed.',
    sudoUnavailable:
      'This needs root. The login is not root and sudo does not work for it, so nothing was written.',
    expected: 'Expected',
    actual: 'Got',
  },
} as const;
