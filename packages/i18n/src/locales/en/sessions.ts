/**
 * The Sessions page (apps/web/src/security/sessions-page.tsx): the signed-in sessions of your own account, and,
 * for those who may see them, of everyone. The address and the browser are data from the server and stay as sent.
 */
export const sessions = {
  header: {
    title: 'Sessions',
    description:
      'Where your account is signed in, and, with the right permission, where everyone else is',
  },

  signInAgain: 'Sign in again to continue.',

  /** The columns of both tables. */
  columns: {
    user: 'User',
    started: 'Started',
    lastActive: 'Last active',
    address: 'Address',
    browser: 'Browser',
    state: 'State',
  },

  badges: {
    current: 'This session',
    elevated: 'Elevated',
    elevatedHint: 'Freshly confirmed with a code from the authenticator',
  },

  mine: {
    title: 'Your sessions',
    description: 'Every browser where your account is signed in right now',
    endOthers: 'End all other sessions',
    signOut: 'Sign out',
    signOutAria: 'Sign out of the session started {{when}}',
    currentNote: 'To end the session you are using, choose “Sign out” in the account menu.',
    empty: 'There are no sessions to show.',
    endForbidden: 'You cannot end this session.',
  },

  endOthers: {
    title: 'End all other sessions?',
    warning:
      'Every other session of your account is signed out at once. The browsers and devices that use them have to sign in again. This session stays open.',
    submit: 'End other sessions',
  },

  all: {
    title: 'All sessions',
    description: 'Every signed-in session of every user, most recently active first',
    userFilterLabel: 'Filter by user',
    userFilterPlaceholder: 'All users',
    empty: 'Nobody is signed in.',
    emptyFiltered: 'This user has no signed-in sessions.',
    loadFailed: 'Your role may not see the sessions of other users.',
    end: 'End session',
    endAria: 'End the session of {{username}} started {{when}}',
    endUser: 'End all sessions of this user',
    endForbidden: 'Your role may not end the sessions of other users.',
  },

  endUser: {
    title: 'End all sessions of {{username}}?',
    warning:
      '{{username}} is signed out everywhere at once, for example after a cookie was stolen. Nothing else about the account changes, and they can sign in again.',
    submit: 'End all sessions',
  },

  /** What the page says after sessions were ended. */
  notice: {
    others_one: '{{count}} other session was ended.',
    others_other: '{{count}} other sessions were ended.',
    noOthers: 'You had no other sessions.',
    user_one: '{{count}} session of {{username}} was ended.',
    user_other: '{{count}} sessions of {{username}} were ended.',
    noneForUser: '{{username}} had no sessions to end.',
  },
} as const;
