import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import {
  PluginListSchema,
  PluginSidecarFragmentSchema,
  PluginViewSchema,
  SecretViewSchema,
} from '@swellwright/contracts';
import { parse } from 'yaml';

import {
  AUTH_KEY,
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
import { PluginNetwork } from './host/network.js';
import { PluginHostService } from './host/plugin-host.service.js';
import { PluginCallError } from './host/process.js';
import {
  callSidecar,
  composeFragment,
  describeSidecar,
  SidecarError,
  sidecarToken,
  sidecarUrl,
  tokenMatches,
} from './host/sidecar.js';
import { discoverPlugins } from './discovery.js';

const DIGEST = 'b'.repeat(64);
const IMAGE = `ghcr.io/example/sidecar:1.0@sha256:${DIGEST}`;
const PUBLIC = [{ address: [93, 184, 216, 34].join('.'), family: 4 as const }];
const KEY = Buffer.from(AUTH_KEY, 'base64');

/** A little web server that stands in for a container: it answers like a sidecar does. */
async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}
const portOf = (server: Server): number => (server.address() as { port: number }).port;
const bodyOf = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });

describe('the token of a sidecar', () => {
  it('belongs to one plugin as it was approved: another id, another digest, another key, another token', () => {
    const a = sidecarToken(KEY, 'dns-example', DIGEST);
    assert.match(a, /^[0-9a-f]{64}$/u);
    assert.equal(sidecarToken(KEY, 'dns-example', DIGEST), a, 'stable');
    assert.notEqual(sidecarToken(KEY, 'dns-other', DIGEST), a);
    assert.notEqual(sidecarToken(KEY, 'dns-example', 'c'.repeat(64)), a);
    assert.notEqual(sidecarToken(Buffer.alloc(32, 9), 'dns-example', DIGEST), a);
  });

  it('is recognised only as a Bearer token that is exactly the expected one', () => {
    const token = sidecarToken(KEY, 'dns-example', DIGEST);
    assert.equal(tokenMatches(token, `Bearer ${token}`), true);
    for (const header of [
      undefined,
      '',
      token,
      `bearer ${token}`,
      `Bearer ${token.toUpperCase()}`,
      `Bearer ${token.slice(1)}`,
      `Bearer ${token}0`,
      `Bearer ${'0'.repeat(64)}`,
      `Basic ${token}`,
    ]) {
      assert.equal(tokenMatches(token, header), false, String(header));
    }
  });

  it('is reached at the address the template gives', () => {
    assert.equal(
      sidecarUrl('http://plugin-{id}:{port}', 'dns-example', 8080),
      'http://plugin-dns-example:8080',
    );
    assert.equal(sidecarUrl('http://127.0.0.1:{port}/', 'x', 9), 'http://127.0.0.1:9');
  });
});

describe('the compose fragment of a sidecar', () => {
  const text = composeFragment({
    id: 'dns-example',
    version: '1.2.3',
    digest: DIGEST,
    sidecar: { image: IMAGE, port: 8080, memoryMiB: 128, cpus: 0.25 },
    token: sidecarToken(KEY, 'dns-example', DIGEST),
    coreUrl: 'http://swellwright:3000',
    network: 'plugins',
    coreService: 'swellwright',
  });
  const doc = parse(text) as {
    services: Record<string, Record<string, unknown>>;
    networks: Record<string, Record<string, unknown>>;
  };

  it('is valid YAML with the sidecar and the core joined to one network with no way out', () => {
    assert.deepEqual(Object.keys(doc.services).sort(), ['plugin-dns-example', 'swellwright']);
    assert.deepEqual(doc.networks, { plugins: { internal: true } });
    assert.deepEqual(doc.services['swellwright'], { networks: ['plugins'] });
  });

  it('locks the container down: pinned image, read-only, no capabilities, no privileges, a user that is not root, limits', () => {
    const sidecar = found(doc.services['plugin-dns-example'], 'the sidecar');
    assert.equal(sidecar['image'], IMAGE);
    assert.equal(sidecar['read_only'], true);
    assert.deepEqual(sidecar['cap_drop'], ['ALL']);
    assert.deepEqual(sidecar['security_opt'], ['no-new-privileges:true']);
    assert.equal(sidecar['user'], '65532:65532');
    assert.deepEqual(sidecar['networks'], ['plugins']);
    assert.equal(sidecar['mem_limit'], '128m');
    assert.equal(sidecar['memswap_limit'], '128m');
    assert.equal(sidecar['cpus'], 0.25);
    assert.equal(sidecar['pids_limit'], 128);
    assert.equal('ports' in sidecar, false, 'nothing is published to the host');
    assert.equal('privileged' in sidecar, false);
    assert.equal('volumes' in sidecar, false, 'no volumes: it cannot see the host');
    assert.equal('network_mode' in sidecar, false);
  });

  it('gives it its id, port, the way to the core and its token, and says what the file is', () => {
    const environment = (found(doc.services['plugin-dns-example'], 'the sidecar')['environment'] ??
      {}) as Record<string, string>;
    assert.deepEqual(environment, {
      SW_PLUGIN_ID: 'dns-example',
      SW_PLUGIN_PORT: '8080',
      SW_CORE_URL: 'http://swellwright:3000',
      SW_PLUGIN_TOKEN: sidecarToken(KEY, 'dns-example', DIGEST),
    });
    assert.match(text, /^# Swellwright plugin dns-example 1\.2\.3/u);
    assert.match(text, /keep it like a secret/u);
  });
});

describe('talking to a sidecar', () => {
  const token = sidecarToken(KEY, 'dns-example', DIGEST);
  let server: Server;
  let mode = 'ok';
  before(async () => {
    server = await listen((req, res) => {
      void bodyOf(req).then((body) => {
        if (req.headers.authorization !== `Bearer ${token}`) {
          res.statusCode = 401;
          res.end('{}');
          return;
        }
        if (mode === 'html') {
          res.end('<html>nope</html>');
        } else if (mode === 'slow') {
          setTimeout(() => res.end('{}'), 2000);
        } else if (mode === 'huge') {
          res.end(JSON.stringify({ ok: true, value: 'x'.repeat(6 * 1024 * 1024) }));
        } else if (mode === 'error500') {
          res.statusCode = 500;
          res.end('{}');
        } else if (req.url === '/describe') {
          res.end(
            JSON.stringify({ modules: [{ kind: 'DnsProvider', methods: ['zones', 'records'] }] }),
          );
        } else if (mode === 'refuse') {
          res.end(JSON.stringify({ ok: false, message: 'nope, not today' }));
        } else {
          res.end(JSON.stringify({ ok: true, value: { echoed: JSON.parse(body) as unknown } }));
        }
      });
    });
  });
  after(() => {
    server.close();
  });
  const base = () => `http://127.0.0.1:${String(portOf(server))}`;

  it('asks what it offers and calls a method with the settings that go with every call', async () => {
    mode = 'ok';
    assert.deepEqual(await describeSidecar(base(), token, 2000), {
      modules: [{ kind: 'DnsProvider', methods: ['zones', 'records'] }],
    });
    const answer = await callSidecar(
      base(),
      token,
      { kind: 'DnsProvider', method: 'zones', params: { a: 1 }, config: { zone: 'example.org' } },
      2000,
    );
    assert.deepEqual(answer, {
      ok: true,
      value: {
        echoed: {
          kind: 'DnsProvider',
          method: 'zones',
          params: { a: 1 },
          config: { zone: 'example.org' },
        },
      },
    });
  });

  it('reports a refusal as an answer and the rest as errors that say what is wrong', async () => {
    mode = 'refuse';
    assert.deepEqual(
      await callSidecar(base(), token, { kind: 'K', method: 'm', params: null, config: {} }, 2000),
      { ok: false, message: 'nope, not today' },
    );
    const failing = (run: () => Promise<unknown>, reason: string, pattern: RegExp) =>
      assert.rejects(run, (error: unknown) => {
        assert.ok(error instanceof SidecarError);
        assert.equal(error.reason, reason);
        assert.match(error.message, pattern);
        return true;
      });
    await failing(
      () => describeSidecar(base(), 'f'.repeat(64), 2000),
      'invalid',
      /refused the token/u,
    );
    mode = 'html';
    await failing(
      () => describeSidecar(base(), token, 2000),
      'invalid',
      /did not answer with JSON/u,
    );
    mode = 'error500';
    await failing(() => describeSidecar(base(), token, 2000), 'invalid', /answered 500/u);
    mode = 'slow';
    await failing(() => describeSidecar(base(), token, 300), 'timeout', /did not answer in time/u);
    mode = 'huge';
    await assert.rejects(
      callSidecar(base(), token, { kind: 'K', method: 'm', params: null, config: {} }, 5000),
    );
    await failing(
      () => describeSidecar('http://127.0.0.1:1', token, 1000),
      'unreachable',
      /Is its container running/u,
    );
  });
});

describe('a plugin that is a sidecar', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let community: string;
  let owner: Client;
  let ownerSecret: string;
  let observerSecret: string;
  let sidecarServer: Server;
  let sidecarPort = 0;
  let tokenSeen: string | undefined;
  let secretId = '';
  /** What the fake container does when it is called: it may use the gateway of the core with its token. */
  let onCall: (body: {
    kind: string;
    method: string;
    params: unknown;
    config: unknown;
  }) => Promise<unknown> = () => Promise.resolve(null);
  let gatewayToken = '';
  const sent: { host: string; path: string; body: string | undefined }[] = [];

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
  const events = async (action: string) =>
    (await auditEvents(instance)).filter((e) => e.action === action);
  const settled = async (action: string, count = 1) => {
    for (let i = 0; i < 60; i++) {
      const list = await events(action);
      if (list.length >= count) {
        return list;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return events(action);
  };
  const gateway = async (id: string, token: string | undefined, body: unknown) =>
    fetch(`${instance.base}/plugins/${id}/gateway`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });

  async function writeSidecar(id: string, extra: Record<string, unknown> = {}): Promise<void> {
    const directory = join(community, id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, 'swellwright.plugin.json'),
      JSON.stringify({
        id,
        version: '1.0.0',
        name: `The ${id} plugin`,
        engines: { swellwright: '>=0.0.0-0 <1' },
        provides: [{ kind: 'DnsProvider', sidecar: true }],
        permissions: { network: ['api.example.com:443'], secrets: ['dns-oauth'] },
        sidecar: { image: IMAGE, port: sidecarPort },
        config: { schema: 'config.schema.json' },
        license: 'AGPL-3.0-only',
        ...extra,
      }),
    );
    await writeFile(
      join(directory, 'config.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: {
          zone: { type: 'string', minLength: 3 },
          credentials: { type: 'string', 'x-sw-secret': 'dns-oauth' },
        },
        required: ['zone'],
      }),
    );
  }

  before(async () => {
    community = await mkdtemp(join(tmpdir(), 'sw-community-'));
    sidecarServer = await listen((req, res) => {
      void bodyOf(req).then(async (text) => {
        tokenSeen = req.headers.authorization;
        if (tokenSeen !== `Bearer ${gatewayToken}`) {
          res.statusCode = 401;
          res.end('{}');
          return;
        }
        if (req.url === '/describe') {
          res.end(
            JSON.stringify({ modules: [{ kind: 'DnsProvider', methods: ['zones', 'work'] }] }),
          );
          return;
        }
        try {
          const value = await onCall(JSON.parse(text) as never);
          res.end(JSON.stringify({ ok: true, value }));
        } catch (error) {
          res.end(
            JSON.stringify({
              ok: false,
              message: error instanceof Error ? error.message : 'failed',
            }),
          );
        }
      });
    });
    sidecarPort = portOf(sidecarServer);
    instance = await start(
      {
        SW_PLUGINS_COMMUNITY_DIR: community,
        SW_PLUGIN_SIDECAR_URL: 'http://127.0.0.1:{port}',
        SW_PLUGIN_CALL_TIMEOUT_SECONDS: '2',
      },
      {
        pluginNetwork: new PluginNetwork({
          resolve: () => Promise.resolve(PUBLIC),
          transport: (r) => {
            sent.push({ host: r.host, path: r.path, body: r.body });
            return Promise.resolve({
              status: 200,
              headers: {},
              body: `answered ${r.host}${r.path}`,
            });
          },
        }),
      },
    );
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ secret: observerSecret } = await createUser(instance, 'observer', 'observer'));
    owner = await signInAs(instance, 'owner', ownerSecret);
    assert.equal(
      (await owner.post('/vault/initialize', { passphrase: 'a long passphrase for the tests' }))
        .status,
      201,
    );
    secretId = SecretViewSchema.parse(
      (
        await owner.post('/secrets', {
          name: 'dns',
          type: 'dns_oauth',
          value: 'the-secret-value-77',
        })
      ).body,
    ).id;
    await writeSidecar('dns-sidecar');
    // A community plugin may not bring code to run inside the core's process.
    await mkdir(join(community, 'bring-code', 'dist'), { recursive: true });
    await writeFile(
      join(community, 'bring-code', 'swellwright.plugin.json'),
      JSON.stringify({
        id: 'bring-code',
        version: '1.0.0',
        name: 'Brings code',
        engines: { swellwright: '>=0.0.0-0 <1' },
        provides: [{ kind: 'DnsProvider', entry: './dist/entry.js' }],
        license: 'AGPL-3.0-only',
      }),
    );
    await writeFile(
      join(community, 'bring-code', 'dist', 'entry.js'),
      'export default { methods: {} };\n',
    );
  });
  after(async () => {
    sidecarServer.close();
    await stop(instance);
    await rm(community, { recursive: true, force: true });
  });

  it('is found as a community plugin with its container described; code from the community is refused', async () => {
    const plugin = await view('dns-sidecar');
    assert.equal(plugin.discovery, 'available', plugin.problems.join());
    assert.equal(plugin.trust, 'community');
    assert.deepEqual(plugin.provides, [{ kind: 'DnsProvider', mode: 'code' }]);
    assert.deepEqual(plugin.sidecar, {
      image: IMAGE,
      port: sidecarPort,
      memoryMiB: 256,
      cpus: 0.5,
    });
    const code = await view('bring-code');
    assert.equal(code.discovery, 'invalid');
    assert.match(code.problems.join(), /does not run code in the process of Swellwright/u);
    // The same manifest from a directory of this instance may run code: the rule is about who brought it.
    const mine = await discoverPlugins([{ directory: community, trust: 'local' }], '0.0.0-test');
    assert.equal(mine.find((p) => p.folder === 'bring-code')?.state, 'available');
  });

  it('gives the compose fragment to those who may manage plugins, with a fresh second factor, and records it', async () => {
    const observer = await signInAs(instance, 'observer', observerSecret);
    assert.equal((await observer.get('/plugins/dns-sidecar/sidecar')).status, 403);
    await db().session.updateMany({ data: { elevatedUntil: new Date(Date.now() - 1000) } });
    const needsCode = await owner.get('/plugins/dns-sidecar/sidecar');
    assert.equal(errorCode(needsCode), 'step_up_required');
    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);

    const reply = await owner.get('/plugins/dns-sidecar/sidecar');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const fragment = PluginSidecarFragmentSchema.parse(reply.body);
    assert.equal(fragment.service, 'plugin-dns-sidecar');
    gatewayToken = sidecarToken(
      KEY,
      'dns-sidecar',
      found((await view('dns-sidecar')).digest ?? undefined, 'digest'),
    );
    assert.ok(
      fragment.compose.includes(gatewayToken),
      'the fragment holds the token of the plugin as it is',
    );
    const record = found((await events('plugin.sidecar.exported')).at(-1), 'the record');
    assert.equal(record.actor?.name, 'owner');
    assert.equal(
      JSON.stringify(record).includes(gatewayToken),
      false,
      'the token is not in the log',
    );

    assert.equal((await owner.get('/plugins/not-there/sidecar')).status, 404);
    assert.equal((await owner.get('/plugins/bring-code/sidecar')).status, 404, 'no sidecar to run');
  });

  it('is checked by asking the container what it offers, and a container that is not there is an answer', async () => {
    await enable('dns-sidecar');
    const reply = await owner.post('/plugins/dns-sidecar/check');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const plugin = PluginViewSchema.parse(reply.body);
    assert.equal(plugin.runtime.state, 'running');
    assert.deepEqual(plugin.runtime.modules, [{ kind: 'DnsProvider', methods: ['work', 'zones'] }]);

    const saved = gatewayToken;
    gatewayToken = 'f'.repeat(64);
    try {
      const wrong = PluginViewSchema.parse((await owner.post('/plugins/dns-sidecar/check')).body);
      assert.equal(wrong.runtime.state, 'failed');
      assert.match(wrong.runtime.lastError ?? '', /refused the token of the plugin/u);
      assert.equal(found((await events('plugin.checked')).at(-1), 'record').outcome, 'failure');
    } finally {
      gatewayToken = saved;
    }
  });

  it('is called with its settings, and says what the container said, including its refusals', async () => {
    const put = await owner.call('PUT', '/plugins/dns-sidecar/config', {
      values: { zone: 'example.org', credentials: secretId },
    });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    onCall = (call) => Promise.resolve({ got: call });
    const result = (await host().call('dns-sidecar', 'DnsProvider', 'zones', { a: 1 })) as {
      got: { kind: string; method: string; params: unknown; config: unknown };
    };
    assert.deepEqual(result.got, {
      kind: 'DnsProvider',
      method: 'zones',
      params: { a: 1 },
      config: { zone: 'example.org' },
    });
    onCall = () => Promise.reject(new Error('the zone is locked'));
    await assert.rejects(
      host().call('dns-sidecar', 'DnsProvider', 'zones', null),
      (error: unknown) => {
        assert.ok(error instanceof PluginCallError);
        assert.equal(error.reason, 'failed');
        assert.equal(error.message, 'the zone is locked');
        return true;
      },
    );
  });

  it('is not called when it cannot be reached, and the failure is shown', async () => {
    sidecarServer.close();
    await assert.rejects(
      host().call('dns-sidecar', 'DnsProvider', 'zones', null),
      (error: unknown) => {
        assert.ok(error instanceof PluginCallError);
        assert.match(error.message, /cannot be reached/u);
        return true;
      },
    );
    const plugin = await view('dns-sidecar');
    assert.equal(plugin.runtime.state, 'failed');
    // The container stays down: the rest of the tests use the gateway only.
  });

  it('lets a container ask the core for the network, a secret and its storage with its token, and nothing more', async () => {
    const id = 'dns-sidecar';
    const call = async (body: unknown) =>
      (await (await gateway(id, gatewayToken, body)).json()) as {
        ok: boolean;
        value?: unknown;
        message?: string;
      };

    const allowed = await call({
      op: 'fetch',
      url: 'https://api.example.com/zones?x=1',
      init: { method: 'GET' },
    });
    assert.equal(allowed.ok, true);
    assert.deepEqual(allowed.value, {
      status: 200,
      headers: {},
      body: 'answered api.example.com/zones?x=1',
    });
    const refused = await call({ op: 'fetch', url: 'https://evil.example.org/x' });
    assert.equal(refused.ok, false);
    assert.match(refused.message ?? '', /not among the hosts this plugin was approved to call/u);

    assert.deepEqual(await call({ op: 'secret', field: 'credentials' }), {
      ok: true,
      value: 'the-secret-value-77',
    });
    assert.match(
      (await call({ op: 'secret', field: 'zone' })).message ?? '',
      /is not a setting that holds a secret/u,
    );

    assert.deepEqual(await call({ op: 'storage', action: 'set', key: 'cursor', value: { n: 7 } }), {
      ok: true,
      value: null,
    });
    assert.deepEqual(await call({ op: 'storage', action: 'get', key: 'cursor' }), {
      ok: true,
      value: { n: 7 },
    });
    assert.deepEqual(await call({ op: 'storage', action: 'keys' }), {
      ok: true,
      value: ['cursor'],
    });
    assert.deepEqual(await call({ op: 'storage', action: 'delete', key: 'cursor' }), {
      ok: true,
      value: null,
    });
    assert.equal((await call({ op: 'storage', action: 'get', key: '' })).ok, false);

    const note = found((await settled('plugin.secret.used')).at(-1), 'the record of the secret');
    assert.deepEqual(note.details, { field: 'credentials', secret: secretId });
  });

  it('takes a request body as large as a plugin may send, and no larger', async () => {
    const big = 'x'.repeat(900 * 1024);
    const reply = await gateway('dns-sidecar', gatewayToken, {
      op: 'fetch',
      url: 'https://api.example.com/upload',
      init: { method: 'POST', body: big },
    });
    assert.equal(reply.status, 200);
    assert.equal(found(sent.at(-1), 'the request').body?.length, big.length);
    const tooBig = await gateway('dns-sidecar', gatewayToken, {
      op: 'fetch',
      url: 'https://api.example.com/upload',
      init: { method: 'POST', body: 'y'.repeat(4 * 1024 * 1024) },
    });
    assert.equal(tooBig.status, 413);
  });

  it('answers 401, saying nothing about why, to a wrong token, no token, an unknown plugin and a plugin that is not enabled', async () => {
    const good = { op: 'secret', field: 'credentials' };
    for (const [id, token] of [
      ['dns-sidecar', 'f'.repeat(64)],
      ['dns-sidecar', undefined],
      ['dns-sidecar', 'short'],
      ['no-such-plugin', gatewayToken],
      ['bring-code', gatewayToken],
    ] as const) {
      const reply = await gateway(id, token, good);
      assert.equal(reply.status, 401, `${id} ${String(token)}`);
      assert.equal(
        errorCode({ status: 401, body: await reply.json(), headers: reply.headers, setCookie: [] }),
        'unauthorized',
      );
    }
    assert.equal((await owner.post('/plugins/dns-sidecar/disable')).status, 200);
    assert.equal(
      (await gateway('dns-sidecar', gatewayToken, good)).status,
      401,
      'switched off: the token stops working at once',
    );
    await enable('dns-sidecar');
    assert.equal((await gateway('dns-sidecar', gatewayToken, good)).status, 200);
    const denied = await settled('plugin.gateway.denied');
    assert.ok(denied.length >= 1 && denied.length <= 5, 'noted, and capped');
    assert.equal(JSON.stringify(denied).includes(gatewayToken), false);
  });

  it('stops trusting the token when the files of the plugin change, because the token belongs to the files', async () => {
    const before = gatewayToken;
    await writeSidecar('dns-sidecar', { version: '1.0.1' });
    const reply = await gateway('dns-sidecar', before, { op: 'secret', field: 'credentials' });
    assert.equal(reply.status, 401);
    const plugin = await view('dns-sidecar');
    assert.equal(plugin.status, 'changed');
    const fresh = sidecarToken(KEY, 'dns-sidecar', found(plugin.digest ?? undefined, 'digest'));
    assert.notEqual(fresh, before);
    await enable('dns-sidecar');
    assert.equal(
      (await gateway('dns-sidecar', fresh, { op: 'storage', action: 'keys' })).status,
      200,
    );
    assert.equal(
      (await gateway('dns-sidecar', before, { op: 'storage', action: 'keys' })).status,
      401,
    );
  });

  it('slows down guessing: many wrong tokens from one address are answered 429', async () => {
    let last = 0;
    for (let i = 0; i < 30; i++) {
      last = (await gateway('dns-sidecar', 'e'.repeat(64), { op: 'storage', action: 'keys' }))
        .status;
      if (last === 429) {
        break;
      }
    }
    assert.equal(last, 429);
    // The right token from that address is refused too while the window lasts: guessing gets nothing.
    assert.equal(
      (await gateway('dns-sidecar', gatewayToken, { op: 'storage', action: 'keys' })).status,
      429,
    );
  });
});

describe('the reference sidecar of the examples', { skip: !databaseUrl }, () => {
  const EXAMPLE = fileURLToPath(new URL('../../../../examples/sidecar-node', import.meta.url));
  let instance: Instance;
  let community: string;
  let owner: Client;
  let child: ChildProcess | undefined;
  let port = 0;

  before(async () => {
    community = await mkdtemp(join(tmpdir(), 'sw-example-'));
    const probe = await listen(() => undefined);
    port = portOf(probe);
    probe.close();
    instance = await start({
      SW_PLUGINS_COMMUNITY_DIR: community,
      SW_PLUGIN_SIDECAR_URL: 'http://127.0.0.1:{port}',
    });
    const { secret } = await createOwner(instance);
    owner = await signInAs(instance, 'owner', secret);
    const manifest = JSON.parse(
      await readFile(join(EXAMPLE, 'swellwright.plugin.json'), 'utf8'),
    ) as {
      sidecar: { port: number };
    };
    manifest.sidecar.port = port;
    await mkdir(join(community, 'example-sidecar'), { recursive: true });
    await writeFile(
      join(community, 'example-sidecar', 'swellwright.plugin.json'),
      JSON.stringify(manifest),
    );
  });
  after(async () => {
    child?.kill('SIGKILL');
    await stop(instance);
    await rm(community, { recursive: true, force: true });
  });

  it('speaks the protocol both ways: the core calls it, and it asks the core for its storage', async () => {
    const listed = PluginListSchema.parse((await owner.get('/plugins')).body).plugins;
    const plugin = found(
      listed.find((p) => p.id === 'example-sidecar'),
      'the example',
    );
    assert.equal(plugin.discovery, 'available', plugin.problems.join());
    const digest = found(plugin.digest ?? undefined, 'digest');
    const address = instance.base.replace(/\/api\/v1$/u, '');
    child = spawn(process.execPath, [join(EXAMPLE, 'server.mjs')], {
      env: {
        SW_PLUGIN_ID: 'example-sidecar',
        SW_PLUGIN_TOKEN: sidecarToken(KEY, 'example-sidecar', digest),
        SW_CORE_URL: address,
        SW_PLUGIN_PORT: String(port),
      },
      stdio: 'ignore',
    });
    assert.equal((await owner.post('/plugins/example-sidecar/enable', { digest })).status, 200);

    let checked = PluginViewSchema.parse((await owner.post('/plugins/example-sidecar/check')).body);
    for (let i = 0; i < 40 && checked.runtime.state !== 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      checked = PluginViewSchema.parse((await owner.post('/plugins/example-sidecar/check')).body);
    }
    assert.equal(checked.runtime.state, 'running', checked.runtime.lastError ?? '');
    assert.deepEqual(checked.runtime.modules, [
      { kind: 'DnsProvider', methods: ['counter', 'echo'] },
    ]);

    const host = instance.app.get(PluginHostService);
    assert.deepEqual(await host.call('example-sidecar', 'DnsProvider', 'echo', { a: 1 }), {
      params: { a: 1 },
      config: {},
    });
    assert.deepEqual(await host.call('example-sidecar', 'DnsProvider', 'counter', null), {
      calls: 1,
    });
    assert.deepEqual(await host.call('example-sidecar', 'DnsProvider', 'counter', null), {
      calls: 2,
    });
    await assert.rejects(
      host.call('example-sidecar', 'DnsProvider', 'nothing', null),
      /There is no method nothing/u,
    );
  });
});
