/** The Overview page (apps/web/src/overview.tsx). */
export const overview = {
  title: 'Overview',
  description: 'Fleet health, runs and approvals at a glance',

  stats: {
    api: 'API',
    alive: 'Alive',
    dependencies: 'Dependencies',
    ready: 'Ready',
    notReady: 'Not ready',
    version: 'Version',
    dependenciesSummary: '{{up}} of {{total}} up',
  },

  checks: {
    title: 'Dependency checks',
    apiDescription: 'API description',
    noneTitle: 'Nothing to check yet',
    none: 'No dependencies are configured yet. Set SW_DATABASE_URL and SW_VALKEY_URL to have them checked here.',
    up: 'Up',
    down: 'Down',
    latencyValue: '{{ms}} ms',
  },

  error: {
    unreachableTitle: 'The API does not answer',
    unreachableText:
      'Start the API (pnpm --filter @swellwright/api start) or check the reverse proxy, then try again.',
    unexpectedTitle: 'The API answered with something unexpected',
    unexpectedText:
      'The response does not match the API contract. The API and the console are probably from different versions.',
  },
} as const;
