/** The Audit page (apps/web/src/security/audit-page.tsx). The action ids in the log are data and are shown as they are. */
export const audit = {
  title: 'Audit log',
  description: 'Append-only record of sign-ins, refusals and changes, chained by hashes',
  verifyChain: 'Verify chain',

  signInAgain: 'Sign in again to continue.',
  verifyForbidden: 'Your role may not verify the chain.',
  readForbidden: 'Your role may not read the audit log.',

  filters: {
    actionLabel: 'Action',
    actionPlaceholder: 'Any action',
    outcomeLabel: 'Outcome',
    outcomePlaceholder: 'Any outcome',
  },

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

  empty: 'Nothing recorded yet.',
  emptyFiltered: 'Nothing recorded yet for these filters.',
  loadOlder: 'Load older events',

  verification: {
    intactTitle: 'The chain is intact',
    emptyLog: 'The log is empty.',
    allChecked_one: 'The only event checks out: numbering, link and hash.',
    allChecked_other: 'All {{count}} events check out: numbering, links and hashes.',
    head: 'Head: event {{seq}}, <code>{{hash}}</code>. Note it somewhere outside the database: if events are cut off the end later, the head of a later check will be older than this one.',
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
} as const;
