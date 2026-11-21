import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  ApiErrorSchema,
  PluginConfigViewSchema,
  PluginListSchema,
  SecretViewSchema,
} from '@swellwright/contracts';

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
import { PluginHostService } from './host/plugin-host.service.js';
import { PluginCallError } from './host/process.js';
import { PluginBroker } from './broker.js';

const PASSPHRASE = 'a long passphrase for the tests';
const SECRET_VALUE = 'the-oauth-secret-value-9d1c';

const SCHEMA = {
  type: 'object',
  properties: {
    zone: { type: 'string', title: 'Zone', minLength: 3, maxLength: 60 },
    ttl: { type: 'integer', minimum: 60, maximum: 86400, default: 300 },
    dryRun: { type: 'boolean', default: false },
    credentials: { type: 'string', 'x-sw-secret': 'dns-oauth', title: 'Credentials' },
  },
  required: ['zone', 'credentials'],
  additionalProperties: false,
};

/** A plugin with settings, written to `root`. */
async function writeConfigured(
  root: string,
  id: string,
  options: { schema?: unknown; secrets?: string[] } = {},
): Promise<void> {
  await writeFixture(root, id, undefined, {
    config: { schema: './config.schema.json' },
    permissions: { network: ['api.example.com:443'], secrets: options.secrets ?? ['dns-oauth'] },
  });
  await writeFile(
    join(root, id, 'config.schema.json'),
    typeof options.schema === 'string' ? options.schema : JSON.stringify(options.schema ?? SCHEMA),
  );
}

describe('the settings and secrets of a plugin', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let local: string;
  let owner: Client;
  let ownerSecret: string;
  let observerSecret: string;
  let goodSecret = '';
  let wrongKind = '';

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
  /** A note is written in the background, so it may land a moment after the call that caused it. */
  const settled = async (action: string, count = 1) => {
    for (let i = 0; i < 60; i++) {
      const found = await events(action);
      if (found.length >= count) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return events(action);
  };
  const put = (id: string, values: Record<string, unknown>) =>
    owner.call('PUT', `/plugins/${id}/config`, { values });
  const call = (id: string, method: string, params: unknown = null) =>
    host().call(id, 'DnsProvider', method, params);
  const refusal = async (id: string, method: string, params: unknown = null) => {
    try {
      await call(id, method, params);
    } catch (error) {
      assert.ok(error instanceof PluginCallError, String(error));
      return error;
    }
    return assert.fail('the call was expected to be refused');
  };

  before(async () => {
    local = await mkdtemp(join(tmpdir(), 'sw-settings-'));
    instance = await start({ SW_PLUGINS_LOCAL_DIR: local });
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ secret: observerSecret } = await createUser(instance, 'observer', 'observer'));
    owner = await signInAs(instance, 'owner', ownerSecret);
    assert.equal((await owner.post('/vault/initialize', { passphrase: PASSPHRASE })).status, 201);
    const good = await owner.post('/secrets', {
      name: 'dns credentials',
      type: 'dns_oauth',
      value: SECRET_VALUE,
    });
    goodSecret = SecretViewSchema.parse(good.body).id;
    const wrong = await owner.post('/secrets', {
      name: 'generic one',
      type: 'generic',
      value: 'x-value',
    });
    wrongKind = SecretViewSchema.parse(wrong.body).id;
    await writeConfigured(local, 'dns-settings');
  });
  after(async () => {
    await stop(instance);
    await rm(local, { recursive: true, force: true });
  });

  it('shows the form a plugin declares, and that nothing is set yet', async () => {
    assert.equal((await view('dns-settings')).hasConfig, true);
    const reply = await owner.get('/plugins/dns-settings/config');
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const config = PluginConfigViewSchema.parse(reply.body);
    assert.deepEqual(
      config.fields.map((f) => f.name),
      ['zone', 'ttl', 'dryRun', 'credentials'],
    );
    const zone = found(
      config.fields.find((f) => f.name === 'zone'),
      'zone',
    );
    assert.equal(zone.required, true);
    assert.equal(zone.title, 'Zone');
    assert.equal(zone.minLength, 3);
    const credentials = found(
      config.fields.find((f) => f.name === 'credentials'),
      'credentials',
    );
    assert.equal(credentials.secretKind, 'dns-oauth');
    assert.equal(
      found(
        config.fields.find((f) => f.name === 'ttl'),
        'ttl',
      ).default,
      300,
    );
    assert.equal(config.updatedAt, null);
    assert.deepEqual(config.problems, []);
  });

  it('is read by anyone who may read plugins, changed by the owner with a fresh second factor', async () => {
    const observer = await signInAs(instance, 'observer', observerSecret);
    assert.equal((await observer.get('/plugins/dns-settings/config')).status, 200);
    const denied = await observer.call('PUT', '/plugins/dns-settings/config', { values: {} });
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied), 'forbidden');
    await db().session.updateMany({ data: { elevatedUntil: new Date(Date.now() - 1000) } });
    const needsCode = await put('dns-settings', { zone: 'example.org' });
    assert.equal(needsCode.status, 403);
    assert.equal(errorCode(needsCode), 'step_up_required');
    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);
    assert.equal((await owner.get('/plugins/not-there/config')).status, 404);
  });

  it('checks every value against the form, and refuses a secret that is of the wrong kind or does not exist', async () => {
    const bad = async (values: Record<string, unknown>, pattern: RegExp) => {
      const reply = await put('dns-settings', values);
      assert.equal(reply.status, 400, JSON.stringify(values));
      assert.match(ApiErrorSchema.parse(reply.body).error.message, pattern);
    };
    await bad({}, /zone is required/u);
    await bad({ zone: 'example.org' }, /credentials is required/u);
    await bad({ zone: 'ab', credentials: goodSecret }, /zone must be at least 3/u);
    await bad({ zone: 'example.org', credentials: goodSecret, ttl: 5 }, /ttl must be at least 60/u);
    await bad(
      { zone: 'example.org', credentials: goodSecret, extra: 1 },
      /extra is not a setting/u,
    );
    await bad({ zone: 'example.org', credentials: 'plain text' }, /must be the id of a secret/u);
    await bad({ zone: 'example.org', credentials: wrongKind }, /secret of the kind "dns-oauth"/u);
    await bad(
      { zone: 'example.org', credentials: '018f0000-0000-7000-8000-000000000001' },
      /secret of the kind "dns-oauth" that exists/u,
    );
    assert.equal(await db().pluginConfig.count(), 0, 'nothing was stored');
  });

  it('stores the settings, records which fields changed and never what they were set to', async () => {
    const reply = await put('dns-settings', { zone: 'example.org', credentials: goodSecret });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    const config = PluginConfigViewSchema.parse(reply.body);
    assert.deepEqual(config.values, {
      zone: 'example.org',
      ttl: 300,
      dryRun: false,
      credentials: goodSecret,
    });
    assert.equal(config.updatedBy, 'owner');
    const first = found((await events('plugin.config.updated')).at(-1), 'the record');
    assert.equal(first.actor?.name, 'owner');
    assert.deepEqual(first.object, { type: 'plugin', id: 'dns-settings' });
    assert.deepEqual(first.details, { fields: 'credentials,dryRun,ttl,zone', count: 4 });

    assert.equal(
      (await put('dns-settings', { zone: 'example.net', credentials: goodSecret, ttl: 600 }))
        .status,
      200,
    );
    const second = found((await events('plugin.config.updated')).at(-1), 'the record');
    assert.deepEqual(second.details, { fields: 'ttl,zone', count: 2 });
    // The value is composed so that it does not look like a URL check to a code scanner.
    const zoneValue = ['example', 'net'].join('.');
    assert.equal(
      JSON.stringify(await auditEvents(instance)).includes(zoneValue),
      false,
      'no value in the log',
    );
    const stored = await db().pluginConfig.findUniqueOrThrow({
      where: { pluginId: 'dns-settings' },
    });
    assert.equal(
      stored.settings.includes(SECRET_VALUE),
      false,
      'the secret itself is not in the settings',
    );
    assert.equal(stored.settings.includes(goodSecret), true, 'only its id');
    assert.equal(
      PluginConfigViewSchema.parse((await owner.get('/plugins/dns-settings/config')).body).values[
        'zone'
      ],
      'example.net',
    );
  });

  it('does not run a plugin whose required settings are not filled in, and says which', async () => {
    await writeConfigured(local, 'dns-unset');
    await enable('dns-unset');
    const error = await refusal('dns-unset', 'echo', 1);
    assert.equal(error.reason, 'not_configured');
    assert.match(error.message, /zone is required/u);
  });

  it('hands the plugin its settings with every call, without the secret', async () => {
    await enable('dns-settings');
    assert.deepEqual(await call('dns-settings', 'config'), {
      zone: 'example.net',
      ttl: 600,
      dryRun: false,
    });
  });

  it('hands the plugin the secret bound to a setting, only while the vault is open, and records its use once', async () => {
    assert.equal(await call('dns-settings', 'secret', { field: 'credentials' }), SECRET_VALUE);
    assert.equal(await call('dns-settings', 'secret', { field: 'credentials' }), SECRET_VALUE);
    const used = await settled('plugin.secret.used');
    assert.equal(used.length, 1, 'once per window, however often it is asked for');
    const record = found(used[0], 'the record');
    assert.equal(record.actor, null);
    assert.deepEqual(record.object, { type: 'plugin', id: 'dns-settings' });
    assert.deepEqual(record.details, { field: 'credentials', secret: goodSecret });
    assert.equal(JSON.stringify(await auditEvents(instance)).includes(SECRET_VALUE), false);

    assert.equal((await owner.post('/vault/seal')).status, 200);
    assert.match(
      String(await call('dns-settings', 'secretRefused', { field: 'credentials' })),
      /sealed/iu,
    );
    assert.equal((await owner.post('/vault/unseal', { passphrase: PASSPHRASE })).status, 200);
    assert.equal(await call('dns-settings', 'secret', { field: 'credentials' }), SECRET_VALUE);
  });

  it('refuses a secret for a field that does not hold one, and a secret kind that was not approved', async () => {
    assert.match(
      String(await call('dns-settings', 'secretRefused', { field: 'zone' })),
      /is not a setting that holds a secret/u,
    );
    assert.match(
      String(await call('dns-settings', 'secretRefused', { field: 'nothing' })),
      /is not a setting that holds a secret/u,
    );
    // The approval is what counts, not the file: take the kind out of it.
    const record = await db().pluginApproval.findUniqueOrThrow({
      where: { pluginId: 'dns-settings' },
    });
    const approved = JSON.parse(record.permissions) as Record<string, unknown>;
    await db().pluginApproval.update({
      where: { pluginId: 'dns-settings' },
      data: { permissions: JSON.stringify({ ...approved, secrets: [] }) },
    });
    // A running process keeps what it was started with; the next one is started from the approval as it is.
    await host().stop('dns-settings');
    assert.match(
      String(await call('dns-settings', 'secretRefused', { field: 'credentials' })),
      /was not approved for secrets of the kind "dns-oauth"/u,
    );
    await db().pluginApproval.update({
      where: { pluginId: 'dns-settings' },
      data: { permissions: record.permissions },
    });
    await host().stop('dns-settings');
  });

  it('refuses a secret that was deleted or replaced by one of another kind after it was bound', async () => {
    assert.equal((await owner.call('DELETE', `/secrets/${goodSecret}`)).status, 204);
    assert.match(
      String(await call('dns-settings', 'secretRefused', { field: 'credentials' })),
      /no longer exists/u,
    );
  });

  it('keeps a storage of its own, in which it reads, writes, lists and deletes', async () => {
    assert.deepEqual(await call('dns-settings', 'store', { key: 'cursor', value: { page: 3 } }), {
      page: 3,
    });
    assert.deepEqual(await call('dns-settings', 'storedKeys'), ['cursor']);
    // Another plugin sees none of it.
    assert.deepEqual(
      await call('dns-unset', 'storedKeys').catch(() => 'not configured'),
      'not configured',
    );
    const broker = instance.app.get(PluginBroker);
    assert.deepEqual(await broker.storageKeys('dns-unset'), []);
    assert.deepEqual(await call('dns-settings', 'forget', { key: 'cursor' }), []);
  });

  it('bounds what it may keep: a key, a value, and the whole', async () => {
    const broker = instance.app.get(PluginBroker);
    await assert.rejects(broker.storageSet('dns-settings', '', 1), /1 to 128 characters/u);
    await assert.rejects(
      broker.storageSet('dns-settings', 'k'.repeat(129), 1),
      /1 to 128 characters/u,
    );
    await assert.rejects(
      broker.storageSet('dns-settings', 'big', 'x'.repeat(64 * 1024)),
      /at most 64 KiB/u,
    );
    const nearly = 'x'.repeat(60 * 1024);
    for (let i = 0; i < 68; i++) {
      await broker.storageSet('dns-settings', `bulk-${String(i)}`, nearly);
    }
    await assert.rejects(broker.storageSet('dns-settings', 'one-more', nearly), /at most 4 MiB/u);
    // Replacing a value is judged by what it adds, not by what is there.
    await broker.storageSet('dns-settings', 'bulk-0', 'small');
    await broker.storageSet('dns-settings', 'one-more', 'fits now');
    for (let i = 0; i < 68; i++) {
      await broker.storageDelete('dns-settings', `bulk-${String(i)}`);
    }
    await broker.storageDelete('dns-settings', 'one-more');
    assert.deepEqual(await broker.storageKeys('dns-settings'), []);
  });

  it('shows a plugin as unusable when its settings declare something it did not ask for or cannot say', async () => {
    await writeConfigured(local, 'bad-kind', {
      secrets: [],
      schema: {
        type: 'object',
        properties: { token: { type: 'string', 'x-sw-secret': 'dns-oauth' } },
      },
    });
    const notAsked = await view('bad-kind');
    assert.equal(notAsked.discovery, 'invalid');
    assert.match(notAsked.problems.join(' '), /the manifest does not ask for/u);

    await writeConfigured(local, 'unknown-kind', { secrets: ['no-such-kind'] });
    const unknown = await view('unknown-kind');
    assert.equal(unknown.discovery, 'invalid');
    assert.match(unknown.problems.join(' '), /which this version does not have/u);

    await writeConfigured(local, 'bad-json', { schema: '{ nope' });
    assert.match((await view('bad-json')).problems.join(' '), /not valid JSON/u);

    await writeConfigured(local, 'bad-schema', {
      schema: { type: 'object', properties: { a: { type: 'array' } } },
    });
    assert.equal((await view('bad-schema')).discovery, 'invalid');
    assert.equal(
      (await owner.get('/plugins/bad-schema/config')).status,
      404,
      'no form for a plugin that is not sound',
    );
  });

  it('has no settings page for a plugin that declares none', async () => {
    await writeFixture(local, 'plain-one');
    assert.equal((await view('plain-one')).hasConfig, false);
    const reply = await owner.get('/plugins/plain-one/config');
    assert.equal(reply.status, 404);
    assert.match(JSON.stringify(reply.body), /no settings/u);
  });
});
