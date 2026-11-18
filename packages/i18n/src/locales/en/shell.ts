/** The frame of the console: the header controls, the build information and the pages that are not pages. */
export const shell = {
  versionLabel: 'Version and build information',
  githubLabel: 'Swellwright on GitHub',
  openMenu: 'Open the menu',
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
    title: 'Page not found',
    text: 'There is no page at this address. It may have moved, or it is not built yet.',
    action: 'Go to the overview',
  },
  forbidden: {
    title: 'Not available for your role',
    text: 'You are signed in, but your role does not open this page.',
  },
} as const;
