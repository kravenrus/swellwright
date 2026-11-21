// The real-sshd tests (*.integration.test.ts) read their server from the environment:
//
//   SW_TEST_SSH_HOST, SW_TEST_SSH_PORT (default 22), SW_TEST_SSH_USER, SW_TEST_SSH_KEY (path to a private key),
//   optional SW_TEST_SSH_SUDO_PASSWORD (the user's sudo password),
//   optional SW_TEST_SSH_BASE_DIR (a directory the user may fill and delete; its path must contain "test").
//
// Without them the tests are skipped. They never send a wrong password or key: failure paths of authentication
// belong to the in-process server.

import { readFileSync } from 'node:fs';

import { fetchHostKey } from './host-key.js';
import type { SshTarget } from './types.js';

export interface IntegrationConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  sudoPassword: string | undefined;
  /** For steps. */
  baseDir: string;
}

export function integrationConfig(): IntegrationConfig | undefined {
  const host = process.env['SW_TEST_SSH_HOST'];
  const username = process.env['SW_TEST_SSH_USER'];
  const keyPath = process.env['SW_TEST_SSH_KEY'];
  if (host === undefined || username === undefined || keyPath === undefined) return undefined;
  return {
    host,
    port: Number(process.env['SW_TEST_SSH_PORT'] ?? '22'),
    username,
    privateKey: readFileSync(keyPath, 'utf8'),
    sudoPassword: process.env['SW_TEST_SSH_SUDO_PASSWORD'],
    baseDir: process.env['SW_TEST_SSH_BASE_DIR'] ?? '/tmp/swellwright-test-steps',
  };
}

export const INTEGRATION_SKIP: string | false =
  process.env['SW_TEST_SSH_HOST'] !== undefined &&
  process.env['SW_TEST_SSH_USER'] !== undefined &&
  process.env['SW_TEST_SSH_KEY'] !== undefined
    ? false
    : 'SW_TEST_SSH_HOST, SW_TEST_SSH_USER and SW_TEST_SSH_KEY are not set';

/** A target for the configured server, pinned to the key it presents (learned without sending credentials). */
export async function integrationTarget(
  config: IntegrationConfig,
  overrides: Partial<SshTarget> = {},
): Promise<SshTarget> {
  const key = await fetchHostKey(config.host, config.port);
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    auth: { kind: 'key', privateKey: config.privateKey },
    hostKey: { mode: 'pinned', fingerprints: [key.fingerprintSha256] },
    ...overrides,
  };
}
