// The connection, exec, sudo, SFTP and pool against a real sshd. Skipped unless the environment names a server:
// see integration-env.ts. No test here ever sends a wrong password or key.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { SshConnection } from './connection.js';
import { HostKeyMismatchError, SshTimeoutError } from './errors.js';
import { fetchHostKey } from './host-key.js';
import {
  INTEGRATION_SKIP,
  integrationConfig,
  integrationTarget,
  type IntegrationConfig,
} from './integration-env.js';
import { SshPool } from './pool.js';
import type { SftpClient } from './sftp.js';
import { shellQuote } from './shell.js';
import { sleep } from './test-util.js';
import type { SshTarget } from './types.js';

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

describe('against a real sshd', { skip: INTEGRATION_SKIP }, () => {
  let config: IntegrationConfig;
  let target: SshTarget;
  let connection: SshConnection;
  const work = `${integrationConfig()?.baseDir ?? '/tmp/swellwright-test-steps'}-work`;
  const local = mkdtempSync(join(tmpdir(), 'sw-ssh-integration-'));

  const assertDisposable = (path: string): void => {
    assert.match(path, /^\/[^/]+\/[^/]+\/.+/u);
    assert.ok(path.includes('test'), `refusing to touch ${path}`);
  };

  before(async () => {
    const found = integrationConfig();
    assert.ok(found);
    config = found;
    target = await integrationTarget(config);
    connection = await SshConnection.connect(target);
    assertDisposable(work);
    await connection.exec(`mkdir -p ${shellQuote(work)}`);
  });
  after(async () => {
    assertDisposable(work);
    await connection.exec(`rm -rf ${shellQuote(work)}`);
    connection.close();
    rmSync(local, { recursive: true, force: true });
  });

  it('reads the host key without credentials, and pinning that key connects', async () => {
    const key = await fetchHostKey(config.host, config.port);
    assert.match(key.fingerprintSha256, /^SHA256:[A-Za-z0-9+/]{43}$/u);
    assert.ok(key.algorithm.length > 0);
    assert.equal(connection.hostKey.fingerprintSha256, key.fingerprintSha256);
  });

  it('refuses a different pinned key before authenticating (nothing but the handshake is sent)', async () => {
    await assert.rejects(
      SshConnection.connect({
        ...target,
        hostKey: { mode: 'pinned', fingerprints: [`SHA256:${'A'.repeat(43)}`] },
      }),
      HostKeyMismatchError,
    );
  });

  it('runs commands: output, error output, exit status, standard input, UTF-8', async () => {
    const result = await connection.exec('echo out; echo err >&2; exit 4');
    assert.deepEqual(
      { code: result.code, stdout: result.stdout, stderr: result.stderr },
      { code: 4, stdout: 'out\n', stderr: 'err\n' },
    );
    assert.equal(
      (await connection.exec('cat', { stdin: 'héllo 日本語\nline 2' })).stdout,
      'héllo 日本語\nline 2',
    );
    assert.equal((await connection.exec('printf "ünï"')).stdout, 'ünï');
  });

  it('caps big output and flags it, and honours a deadline without losing the connection', async () => {
    const big = await connection.exec('head -c 3000000 /dev/zero | tr "\\000" a', {
      maxOutputBytes: 1000,
    });
    assert.equal(big.stdout.length, 1000);
    assert.equal(big.stdoutTruncated, true);
    await assert.rejects(connection.exec('sleep 30', { timeoutMs: 600 }), SshTimeoutError);
    assert.equal((await connection.exec('echo alive')).stdout, 'alive\n');
  });

  it('delivers an environment variable when the server accepts it (AcceptEnv)', async () => {
    const accepts = await connection.exec(
      `grep -qE '^AcceptEnv.*LC_' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null`,
    );
    if (accepts.code !== 0) return;
    const result = await connection.exec('echo "$LC_SWTEST"', { env: { LC_SWTEST: 'delivered' } });
    assert.equal(result.stdout, 'delivered\n');
  });

  it('runs a command as root through sudo, the password only on standard input', async () => {
    if (config.sudoPassword === undefined) return;
    const password = config.sudoPassword;
    const root = await connection.exec('id -u', { sudo: { password } });
    assert.equal(root.stdout, '0\n', root.stderr);
    // The command's own input arrives untouched: the password line is not part of it.
    const echoed = await connection.exec('cat', { sudo: { password }, stdin: 'payload only\n' });
    assert.equal(echoed.stdout, 'payload only\n');

    // While a sudo command runs, no process on the server carries the password in its arguments.
    const running = connection.exec('sleep 4; echo finished', {
      sudo: { password },
      timeoutMs: 30_000,
    });
    await sleep(1500);
    const processes = await connection.exec('ps -eo args=');
    assert.ok(
      processes.stdout.includes('sleep 4'),
      'the long command should be visible in the process list',
    );
    assert.ok(
      !processes.stdout.includes(password),
      'the sudo password is visible in the process list',
    );
    assert.equal((await running).stdout, 'finished\n');
  });

  describe('SFTP', () => {
    let sftp: SftpClient;
    before(async () => {
      sftp = await connection.sftp();
    });

    it('round-trips a file with its hash, atomically, and the server agrees on the hash', async () => {
      const content = randomBytes(2 * 1024 * 1024 + 7);
      const source = join(local, 'up.bin');
      writeFileSync(source, content);
      const expected = sha256(content);
      await sftp.mkdir(`${work}/nested/dir`);
      const remote = `${work}/nested/dir/up.bin`;
      const up = await sftp.put(source, remote, {
        expectedSha256: expected,
        verify: 'exec',
        mode: 0o600,
      });
      assert.equal(up.bytes, content.length);
      assert.equal(up.sha256, expected);
      const onServer = await connection.exec(
        `sha256sum ${shellQuote(remote)} && stat -c %a ${shellQuote(remote)} && ls ${shellQuote(`${work}/nested/dir`)}`,
      );
      assert.match(onServer.stdout, new RegExp(`^${expected}\\s`, 'u'));
      assert.ok(onServer.stdout.includes('600\n'));
      assert.ok(!onServer.stdout.includes('.part'));

      const target2 = join(local, 'down.bin');
      const down = await sftp.get(remote, target2, { expectedSha256: expected });
      assert.equal(down.bytes, content.length);
      assert.equal(sha256(readFileSync(target2)), expected);
    });

    it('replaces a file atomically, renames, stats and removes', async () => {
      await sftp.writeFile(`${work}/a.txt`, 'first');
      await sftp.writeFile(`${work}/a.txt`, 'second, longer');
      assert.equal((await sftp.readFile(`${work}/a.txt`)).toString('utf8'), 'second, longer');
      await sftp.writeFile(`${work}/b.txt`, 'to be replaced');
      await sftp.rename(`${work}/a.txt`, `${work}/b.txt`);
      assert.equal((await sftp.readFile(`${work}/b.txt`)).toString('utf8'), 'second, longer');
      assert.equal(await sftp.stat(`${work}/a.txt`), null);
      assert.equal((await sftp.stat(`${work}/b.txt`))?.size, 'second, longer'.length);
      await sftp.remove(`${work}/b.txt`);
      assert.equal(await sftp.stat(`${work}/b.txt`), null);
    });
  });

  it('pools connections to the real server', async () => {
    const pool = new SshPool({ idleMs: 5000 });
    try {
      const first = await pool.withConnection(target, (pooled) => pooled.exec('echo pooled'));
      const second = await pool.withConnection(target, (pooled) => pooled.exec('echo pooled'));
      assert.equal(first.stdout, 'pooled\n');
      assert.equal(second.stdout, 'pooled\n');
      assert.equal(pool.stats().idle, 1);
    } finally {
      pool.closeAll();
    }
  });

  it('keeps an idle connection alive with keepalive packets', async () => {
    const kept = await SshConnection.connect({
      ...target,
      keepaliveIntervalMs: 500,
      keepaliveCountMax: 2,
    });
    try {
      await sleep(2500);
      assert.equal((await kept.exec('echo still-here')).stdout, 'still-here\n');
    } finally {
      kept.close();
    }
  });
});
