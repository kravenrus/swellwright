// Detached steps against a real sshd. Skipped unless the environment names a server: see integration-env.ts.

import { SshConnection } from './connection.js';
import { INTEGRATION_SKIP, integrationConfig, integrationTarget } from './integration-env.js';
import { defineStepScenarios } from './step-scenarios.js';
import { startCuttableProxy } from './test-support/index.js';

defineStepScenarios(
  'detached steps on a real sshd',
  async () => {
    const config = integrationConfig();
    if (config === undefined) throw new Error('not configured');
    const target = await integrationTarget(config);
    const proxy = await startCuttableProxy(config.host, config.port);
    return {
      connect: () => SshConnection.connect(target),
      connectCuttable: async () => ({
        connection: await SshConnection.connect({ ...target, host: proxy.host, port: proxy.port }),
        cut: proxy.cut,
      }),
      baseDir: config.baseDir,
      ...(config.sudoPassword === undefined
        ? {}
        : {
            sudo: {
              options: { password: config.sudoPassword },
              elevatesTo: 'root',
              elevates: true,
            },
          }),
      close: () => proxy.close(),
    };
  },
  { skip: INTEGRATION_SKIP },
);
