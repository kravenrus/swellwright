import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { PluginListSchema, PluginViewSchema } from '@swellwright/contracts';

import {
  auditEvents,
  type Client,
  codeFor,
  createOwner,
  createUser,
  databaseUrl,
  errorCode,
  forgetLastStep,
  found,
  type Instance,
  signInAs,
  start,
  stop,
} from '../test-support.js';
import { writeFixture } from './host/fixtures.js';
import { PluginNetwork } from './host/network.js';
import { PluginHostService } from './host/plugin-host.service.js';
import { PluginCallError } from './host/process.js';

const PUBLIC = [{ address: [93, 184, 216, 34].join('.'), family: 4 as const }];

async function eventually<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
  for (let i = 0; i < 40; i++) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`${what} did not happen`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('running approved plugins', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let local: string;
  let owner: Client;
  let ownerSecret: string;
  let observerSecret: string;

  const db = () => instance.isolated.database.client;
  const host = () => instance.app.get(PluginHostService);
  const view = async (id: string) =>
    found(
      PluginListSchema.parse((await owner.get('/plugins')).body).plugins.find((p) => p.id === id),
      id,
    );
  const enable = async (id: string) => {
    const reply = await owner.post(`/plugins/${id}/enable`, { digest: (await view(id)).digest });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
  };
  const check = (id: string) => owner.post(`/plugins/${id}/check`);
  const events = async (action: string) =>
    (await auditEvents(instance)).filter((e) => e.action === action);
  const call = (id: string, method: string, params: unknown = null) =>
    host().call(id, 'DnsProvider', method, params);

  before(async () => {
    local = await mkdtemp(join(tmpdir(), 'sw-run-'));
    instance = await start(
      {
        SW_PLUGINS_LOCAL_DIR: local,
        SW_PLUGIN_CALL_TIMEOUT_SECONDS: '1',
        SW_PLUGIN_MEMORY_MIB: '64',
      },
      {
        pluginNetwork: new PluginNetwork({
          resolve: () => Promise.resolve(PUBLIC),
          transport: (r) =>
            Promise.resolve({ status: 200, headers: {}, body: `answered ${r.host}${r.path}` }),
        }),
      },
    );
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ secret: observerSecret } = await createUser(instance, 'observer', 'observer'));
    owner = await signInAs(instance, 'owner', ownerSecret);
    await writeFixture(local, 'dns-example');
    await writeFixture(local, 'flaky-example');
    // A plugin that only describes a driver in data has no code, so no process.
    const declarative = join(local, 'webhook-example');
    await mkdir(declarative, { recursive: true });
    await writeFile(
      join(declarative, 'swellwright.plugin.json'),
      JSON.stringify({
        id: 'webhook-example',
        version: '1.0.0',
        name: 'Declarative webhook',
        engines: { swellwright: '>=0.0.0-0 <1' },
        provides: [{ kind: 'NotificationChannel', driver: 'driver.yaml' }],
        permissions: { network: ['hooks.example.com:443'] },
        license: 'AGPL-3.0-only',
      }),
    );
    await writeFile(
      join(declarative, 'driver.yaml'),
      [
        'version: 1',
        'kind: NotificationChannel',
        'operations:',
        '  ping:',
        '    steps:',
        '      - id: call',
        '        request:',
        '          url: https://hooks.example.com/ping',
        '',
      ].join('\n'),
    );
  });
  after(async () => {
    await stop(instance);
    await rm(local, { recursive: true, force: true });
  });

  it('does not run a plugin that was never enabled, and says so', async () => {
    await assert.rejects(call('dns-example', 'echo', 1), (error: unknown) => {
      assert.ok(error instanceof PluginCallError);
      assert.equal(error.reason, 'not_running');
      assert.match(error.message, /never enabled/u);
      return true;
    });
    assert.equal((await view('dns-example')).runtime.state, 'stopped');
  });

  it('is checked by the people who may manage plugins, with a fresh second factor', async () => {
    await enable('dns-example');
    const observer = await signInAs(instance, 'observer', observerSecret);
    const denied = await observer.post('/plugins/dns-example/check');
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied), 'forbidden');

    await db().session.updateMany({ data: { elevatedUntil: new Date(Date.now() - 1000) } });
    const needsCode = await check('dns-example');
    assert.equal(needsCode.status, 403);
    assert.equal(errorCode(needsCode), 'step_up_required');
    assert.equal((await view('dns-example')).runtime.state, 'stopped', 'nothing started');
    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);

    assert.equal((await owner.post('/plugins/not-there/check')).status, 404);
    assert.equal((await check('flaky-example')).status, 409, 'not enabled');
  });

  it('loads an enabled plugin in its own process and shows what it offers', async () => {
    const reply = await check('dns-example');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const plugin = PluginViewSchema.parse(reply.body);
    assert.equal(plugin.runtime.state, 'running');
    assert.equal(plugin.runtime.lastError, null);
    const [loaded] = plugin.runtime.modules;
    assert.equal(plugin.runtime.modules.length, 1);
    assert.ok(loaded);
    assert.equal(loaded.kind, 'DnsProvider');
    assert.ok(loaded.methods.includes('echo'));
    assert.ok(plugin.runtime.startedAt);
    assert.equal((await view('dns-example')).runtime.state, 'running');

    const record = found((await events('plugin.checked')).at(-1), 'the record of the check');
    assert.equal(record.outcome, 'success');
    assert.equal(record.actor?.name, 'owner');
    assert.deepEqual(record.object, { type: 'plugin', id: 'dns-example' });
    assert.equal(record.details['modules'], 1);
    assert.equal(record.details['methods'], loaded.methods.length);
  });

  it('calls a method, and lets it reach only the hosts that were approved', async () => {
    assert.deepEqual(await call('dns-example', 'echo', { a: 1 }), { a: 1 });
    assert.deepEqual(
      await call('dns-example', 'viaCore', { url: 'https://api.example.com/zones' }),
      { status: 200, ok: true, body: 'answered api.example.com/zones' },
    );
    const refused = await call('dns-example', 'refused', { url: 'https://evil.example.org/x' });
    assert.match(String(refused), /not among the hosts this plugin was approved to call/u);
    const note = await eventually(
      async () => (await events('plugin.network.denied')).at(-1),
      'the record of the refused request',
    );
    assert.equal(note.outcome, 'denied');
    assert.equal(note.actor, null);
    assert.deepEqual(note.object, { type: 'plugin', id: 'dns-example' });
    assert.deepEqual(note.details, { host: 'evil.example.org', reason: 'not_allowed' });
    assert.ok((await view('dns-example')).runtime.calls >= 3);
  });

  it('has no process for a plugin that is only data, and says that is fine', async () => {
    await enable('webhook-example');
    const reply = await check('webhook-example');
    assert.equal(reply.status, 200);
    const plugin = PluginViewSchema.parse(reply.body);
    assert.equal(plugin.runtime.state, 'stopped');
    assert.deepEqual(plugin.runtime.modules, [{ kind: 'NotificationChannel', methods: ['ping'] }]);
    const record = found((await events('plugin.checked')).at(-1), 'the record');
    assert.deepEqual([record.details['modules'], record.details['methods']], [1, 1]);
    // There is no code for the kind that has none, and an operation the driver does not have is refused.
    await assert.rejects(call('webhook-example', 'echo'), /no code to run/u);
    await assert.rejects(
      host().call('webhook-example', 'NotificationChannel', 'echo', null),
      /no operation "echo"/u,
    );
  });

  it('ends a plugin that takes too long, records it, and runs it again on the next call', async () => {
    const previous = found(host().pidOf('dns-example'), 'the running process');
    await assert.rejects(call('dns-example', 'loop'), (error: unknown) => {
      assert.ok(error instanceof PluginCallError);
      assert.equal(error.reason, 'timeout');
      return true;
    });
    const failed = await view('dns-example');
    assert.equal(failed.runtime.state, 'failed');
    assert.match(failed.runtime.lastError ?? '', /took longer than/u);
    const note = found((await events('plugin.failed')).at(-1), 'the record of the failure');
    assert.equal(note.outcome, 'failure');
    assert.deepEqual(note.details, { reason: 'timeout', method: 'loop' });
    await eventually(
      () => Promise.resolve(alive(previous) ? undefined : true),
      'the process to end',
    );

    assert.deepEqual(await call('dns-example', 'echo', 'again'), 'again');
    const current = found(host().pidOf('dns-example'), 'the new process');
    assert.notEqual(current, previous);
    assert.equal((await view('dns-example')).runtime.state, 'running');
  });

  it('switches off a plugin whose files changed, and ends its process', async () => {
    const pid = found(host().pidOf('dns-example'), 'the running process');
    await writeFile(
      join(local, 'dns-example', 'dist', 'entry.js'),
      "export default { methods: { echo: () => 'tampered' } };\n",
    );
    await assert.rejects(call('dns-example', 'echo', 1), (error: unknown) => {
      assert.ok(error instanceof PluginCallError);
      assert.match(error.message, /not what was approved/u);
      return true;
    });
    const off = found((await events('plugin.disabled')).at(-1), 'the record of the switch-off');
    assert.equal(off.actor, null);
    assert.equal(off.details['reason'], 'changed');
    await eventually(() => Promise.resolve(alive(pid) ? undefined : true), 'the process to end');
    assert.equal(host().pidOf('dns-example'), undefined);
    const plugin = await view('dns-example');
    assert.equal(plugin.status, 'changed');
    assert.equal(plugin.runtime.state, 'stopped');
  });

  it('is stopped at once when the administrator disables it, and not started again until it is enabled', async () => {
    await writeFixture(local, 'dns-example');
    await enable('dns-example');
    assert.equal((await check('dns-example')).status, 200);
    const pid = found(host().pidOf('dns-example'), 'the running process');
    const reply = await owner.post('/plugins/dns-example/disable');
    assert.equal(reply.status, 200);
    assert.equal(PluginViewSchema.parse(reply.body).runtime.state, 'stopped');
    await eventually(() => Promise.resolve(alive(pid) ? undefined : true), 'the process to end');
    assert.equal(host().pidOf('dns-example'), undefined);
    assert.equal((await check('dns-example')).status, 409);
    await assert.rejects(call('dns-example', 'echo', 1), /it is disabled/u);
  });

  it('reports a plugin that cannot load, and leaves the record of it', async () => {
    await writeFixture(local, 'flaky-example', 'throw new Error("cannot start");\n');
    await enable('flaky-example');
    const reply = await check('flaky-example');
    assert.equal(reply.status, 200);
    const plugin = PluginViewSchema.parse(reply.body);
    assert.equal(plugin.runtime.state, 'failed');
    assert.match(plugin.runtime.lastError ?? '', /cannot start/u);
    const record = found((await events('plugin.checked')).at(-1), 'the record');
    assert.equal(record.outcome, 'failure');
    assert.match(String(record.details['reason']), /cannot start/u);
  });

  it('leaves a plugin that keeps failing alone for a while', async () => {
    await writeFixture(local, 'flaky-example');
    await enable('flaky-example');
    assert.equal((await check('flaky-example')).status, 200);
    for (let i = 0; i < 3; i++) {
      await assert.rejects(call('flaky-example', 'loop'), (error: unknown) => {
        assert.ok(error instanceof PluginCallError);
        return true;
      });
    }
    await assert.rejects(call('flaky-example', 'echo', 1), /keeps failing/u);
    // The administrator can still look at it: a check is a deliberate act.
    assert.equal((await check('flaky-example')).status, 200);
    assert.equal((await view('flaky-example')).runtime.state, 'running');
  });
});
