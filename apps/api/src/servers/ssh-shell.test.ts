import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  AccessVerificationSchema,
  SecretViewSchema,
  ServerAccessSchema,
  ServerFactsRecordSchema,
  ServerViewSchema,
} from '@swellwright/contracts';
import { installFakeSudo, type FakeSudo, TestSshServer } from '@swellwright/ssh/test-support';

import {
  type Client,
  createOwner,
  databaseUrl,
  type Instance,
  signInAs,
  start,
  stop,
} from '../test-support.js';
import { findShell, shellHandler } from './ssh-test-support.js';

const PASSPHRASE = 'a long passphrase for the vault, used in tests';
const LOGIN = 'the-login-password-for-shell-tests';
const shell = findShell();
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

/**
 * The facts script and the probes run by a real shell, against the machine the tests run on (the in-process SSH server
 * hands each command to `sh`). Where `sudo` would be needed, a stand-in without a password takes its place.
 */
describe('with a real shell', { skip: !databaseUrl || shell === undefined }, () => {
  let instance: Instance;
  let owner: Client;
  let ssh: TestSshServer;
  let sudo: FakeSudo;
  let home = '';
  let serverId = '';
  let accessId = '';

  before(async () => {
    if (shell === undefined) {
      return;
    }
    instance = await start({ SW_SSH_ALLOW_LOOPBACK: 'true', SW_SSH_COMMAND_TIMEOUT_SECONDS: '60' });
    const { secret } = await createOwner(instance);
    owner = await signInAs(instance, 'owner', secret);
    assert.equal((await owner.post('/vault/initialize', { passphrase: PASSPHRASE })).status, 201);
    const stored = await owner.post('/secrets', {
      name: 'login',
      type: 'ssh_password',
      value: LOGIN,
    });
    const secretId = SecretViewSchema.parse(stored.body).id;

    home = mkdtempSync(join(tmpdir(), 'sw-shell-test-'));
    sudo = installFakeSudo({ password: 'unused-password', passwordless: true });
    ssh = await TestSshServer.start({
      users: { runner: { password: LOGIN } },
      exec: shellHandler({ shell: shell.shell, home, path: [sudo.dir, ...shell.extraPath] }),
    });
    const created = await owner.post('/servers', {
      name: 'real-shell',
      address: '127.0.0.1',
      sshPort: ssh.port,
    });
    serverId = ServerViewSchema.parse(created.body).id;
    const pinned = await owner.post(`/servers/${serverId}/host-keys`, {
      algorithm: 'ssh-ed25519',
      fingerprintSha256: ssh.hostKeyFingerprint,
    });
    assert.equal(pinned.status, 201);
    const entry = await owner.post(`/servers/${serverId}/access`, {
      method: 'password',
      username: 'runner',
      secretId,
    });
    accessId = ServerAccessSchema.parse(entry.body).id;
  });

  after(async () => {
    if (shell === undefined) {
      return;
    }
    await ssh.close();
    sudo.cleanup();
    rmSync(home, { recursive: true, force: true });
    await stop(instance);
  });

  it('asks who is logged in and whether sudo works', async () => {
    const reply = await owner.post(`/servers/${serverId}/access/${accessId}/verify`);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const check = AccessVerificationSchema.parse(reply.body);
    assert.equal(check.ok, true);
    assert.ok(check.remoteUser !== null && check.remoteUser.length > 0);
    if (process.platform !== 'win32') {
      assert.equal(check.isRoot, isRoot);
    }
    assert.equal(check.sudo, check.isRoot === true ? 'not_needed' : 'ok');
  });

  it('collects the facts of the machine it runs on, and changes nothing there', async () => {
    const before = readdirSync(home);
    const reply = await owner.post(`/servers/${serverId}/facts/refresh`);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const { facts } = ServerFactsRecordSchema.parse(reply.body);
    // The stand-in sudo changes nobody: what the script reports about itself (its uid) is what counts.
    assert.equal(facts.collectedAs, isRoot ? 'root' : 'user');
    assert.ok(facts.os !== null || process.platform === 'win32');
    assert.ok(facts.time?.utc);
    assert.ok(
      facts.time.skewSeconds !== null && Math.abs(facts.time.skewSeconds) <= 10,
      `the clock of the machine is the clock of the test: ${String(facts.time.skewSeconds)}`,
    );
    assert.deepEqual(readdirSync(home), before, 'the script writes no file');
    if (process.platform === 'linux') {
      assert.equal(facts.kernel?.name, 'Linux');
      assert.ok((facts.cpuCount ?? 0) >= 1);
      assert.ok((facts.memory?.totalBytes ?? 0) > 0);
      assert.ok((facts.uptimeSeconds ?? 0) > 0);
      assert.equal(facts.hostname, hostname());
      assert.ok(facts.disks?.some((disk) => disk.mount === '/'));
      assert.deepEqual(facts.warnings, [], 'a real Linux machine reads without a warning');
    } else {
      assert.ok(facts.warnings.some((warning) => warning.includes('not Linux')));
    }
  });
});
