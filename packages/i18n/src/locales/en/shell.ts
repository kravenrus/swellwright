/** The frame of the console: the header controls, the build information and the pages that are not pages. */
export const shell = {
  versionLabel: 'Version and build information',
  githubLabel: 'Swellwright on GitHub',
  docsLabel: 'Swellwright documentation',
  openMenu: 'Open the menu',
  closeMenu: 'Close the menu',
  buildInfo: {
    title: 'Build information',
    updateTitle: 'Update available',
    updateText: 'A new version is available',
    releaseNotes: 'Release notes',
    version: 'Version',
    branch: 'Branch',
    buildTime: 'Build time',
    build: 'Build',
    commit: 'Commit',
    copy: 'Copy build information',
    copied: 'Copied',
    viewCommit: 'View the commit on GitHub',
    unknown: 'unknown',
    repository: 'Repository on GitHub',
    unavailable: 'The server did not answer.',
  },
  notFound: {
    title: 'Nothing to see here',
    text: 'The page you are trying to open does not exist. You may have mistyped the address, or the page is not built yet.',
    action: 'Take me back to the home page',
  },
  connection: {
    lost: 'Connection lost',
    reconnecting: 'Reconnecting...',
  },
  serverError: {
    title: 'Something bad just happened...',
    refresh: 'Refresh the page',
    details: 'Technical details of the error',
  },
  forbidden: {
    title: 'Not available for your role',
    text: 'You are signed in, but your role does not open this page.',
  },
} as const;
