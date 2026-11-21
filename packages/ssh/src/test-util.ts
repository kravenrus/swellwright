// Helpers shared by the tests of this package (not part of its public API).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestSshServer } from './test-support/index.js';
import type { SshTarget } from './types.js';

/** Tests that need a real POSIX shell (`/bin/sh`, `setsid`, ...) run on Linux and macOS only. */
export const POSIX = process.platform !== 'win32';
export const NO_POSIX_SHELL = POSIX ? false : 'needs a POSIX shell';

/** Running as root changes how sudo behaves; the tests of the sudo wrapper need an ordinary user. */
export const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;

export function tempDir(prefix = 'sw-ssh-test-'): { path: string; cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return {
    path,
    cleanup: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export const TEST_PASSWORD = 'correct-horse-battery';

/** A target for a test server, pinned to its host key, with short timeouts. */
export function targetFor(server: TestSshServer, overrides: Partial<SshTarget> = {}): SshTarget {
  return {
    host: server.host,
    port: server.port,
    username: 'tester',
    auth: { kind: 'password', password: TEST_PASSWORD },
    hostKey: { mode: 'pinned', fingerprints: [server.hostKeyFingerprint] },
    connectTimeoutMs: 5000,
    keepaliveIntervalMs: 0,
    ...overrides,
  };
}

export const USERS = { tester: { password: TEST_PASSWORD } } as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits until `condition` holds, polling, or fails after `timeoutMs`. */
export async function until(
  condition: () => boolean,
  timeoutMs = 5000,
  what = 'the condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await sleep(20);
  }
}
