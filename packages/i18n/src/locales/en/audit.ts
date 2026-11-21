/** The Audit page (apps/web/src/security/audit-page.tsx). The action ids in the log are data and are shown as they are. */
export const audit = {
  title: 'Audit log',
  description: 'Append-only record of sign-ins, refusals and changes, chained by hashes',
  verifyChain: 'Verify chain',

  signInAgain: 'Sign in again to continue.',
  verifyForbidden: 'Your role may not verify the chain.',
  readForbidden: 'Your role may not read the audit log.',
  exportForbidden: 'Your role may not export the audit log.',
  checkpointForbidden: 'Your role may not make or check checkpoints.',

  outcome: {
    success: 'Success',
    failure: 'Failure',
    denied: 'Denied',
  },

  columns: {
    time: 'Time',
    who: 'Who',
    what: 'What',
    outcome: 'Outcome',
    address: 'Address',
  },
  nobody: 'nobody identified',

  list: {
    title: 'Events',
    description: 'Newest first',
    descriptionFiltered: 'Newest first, filtered',
  },

  event: {
    title: 'Event {{seq}}',
    view: 'Event details',
    viewAria: 'Show the details of event {{seq}}',
    sectionEvent: 'Event',
    sectionDetails: 'Details',
    sectionChain: 'Chain',
    object: 'Object',
    requestId: 'Request ID',
    prevHash: 'Previous hash',
    hash: 'Hash',
  },

  empty: 'Nothing recorded yet.',
  emptyFiltered: 'Nothing recorded yet for these filters.',

  verification: {
    intactTitle: 'The chain is intact',
    emptyLog: 'The log is empty.',
    allChecked_one: 'The only event checks out: numbering, link and hash.',
    allChecked_other: 'All {{count}} events check out: numbering, links and hashes.',
    headLabel: 'Head of the chain',
    head: 'Head: event {{seq}}. Note its hash somewhere outside the database: if events are cut off the end later, the head of a later check will be older than this one.',
    brokenTitle: 'The chain does not check out',
    problem: {
      missing: 'Event {{seq}} is missing or repeated.',
      link: 'Event {{seq}} does not point at the event before it.',
      content: 'Event {{seq}} was changed after it was written.',
    },
    intactBefore_one: '{{count}} event before it is intact.',
    intactBefore_other: '{{count}} events before it are intact.',
    failed: 'The check failed.',
  },

  export: {
    button: 'Export',
    title: 'Export the audit log',
    intro:
      'Downloads the whole log as one file: one event per line, oldest first, with every field the hashes cover. It is a copy you can check without this server.',
    verifyHint: 'On any machine that has the application, check the file with:',
    stepUp:
      'You will be asked to confirm with a code from your authenticator, and every page of the export is recorded in the log.',
    submit: 'Export and download',
    progress_one: '{{count}} event fetched…',
    progress_other: '{{count}} events fetched…',
    doneTitle: 'The file is ready',
    done_one: 'Saved {{count}} event to {{file}}.',
    done_other: 'Saved {{count}} events to {{file}}.',
    headLabel: 'Last event in the file',
    head: 'The last event in the file is number {{seq}}. Compare its hash with a checkpoint you noted earlier.',
  },

  checkpoint: {
    button: 'Note the head',
    title: 'Checkpoint of the audit chain',
    made: 'The head of the chain is event {{seq}}, noted {{when}}.',
    warningTitle: 'Store it outside this server',
    warning:
      'Keep this text on another machine, in a ticket or in a password manager of your own. A checkpoint kept only in this database is worthless: whoever can change the database can also delete it, and then rewritten history or a cut-off tail goes unnoticed.',
    valueLabel: 'Checkpoint',
    valueDescription:
      'It is signed with a key that is not in the database, so it cannot be made up. Later, “Check a checkpoint” proves that nothing up to this event was changed and that no end was cut off.',
  },

  check: {
    button: 'Check a checkpoint',
    title: 'Check the log against a checkpoint',
    intro:
      'Paste a checkpoint you noted earlier. The check confirms that its signature is genuine, that the event it names is still the same and that the chain up to that event is intact.',
    inputLabel: 'Checkpoint',
    inputPlaceholder: 'Paste the checkpoint here',
    submit: 'Check',
    okTitle: 'The log matches the checkpoint',
    ok: 'Event {{seq}}, noted {{when}}, is unchanged and the chain up to it checks out.',
    added_one: '{{count}} event was added since.',
    added_other: '{{count}} events were added since.',
    failedTitle: 'The log does not match the checkpoint',
    result: {
      malformed: 'This is not a checkpoint. Paste the whole text, exactly as it was given.',
      not_ours:
        'The signature is wrong: the checkpoint was made by another instance, or it was altered or made up. It says nothing about this log.',
      event_missing:
        'The checkpoint names event {{seq}}, but the log has no such event: it is shorter than when the checkpoint was made. The tail of the log was cut off.',
      hash_differs:
        'Event {{seq}} is not the event the checkpoint saw. History was rewritten after the checkpoint was made.',
      chain_broken:
        'The chain up to event {{seq}} does not check out: an event was changed, removed or inserted. Use “Verify chain” to find the first problem.',
    },
  },
} as const;
