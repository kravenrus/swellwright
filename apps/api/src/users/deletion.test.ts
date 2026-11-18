import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SessionInfoSchema, UserListSchema, UserSummarySchema } from '@swellwright/contracts';

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

describe('deleting a user', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let owner: Client;
  let ownerSecret: string;
  let ownerId: string;
  let observerSecret: string;

  const db = () => instance.isolated.database.client;
  const disable = (id: string) => owner.call('PATCH', `/users/${id}`, { status: 'disabled' });
  const names = async () =>
    UserListSchema.parse((await owner.get('/users')).body).users.map((u) => u.username);

  before(async () => {
    instance = await start();
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ secret: observerSecret } = await createUser(instance, 'observer', 'observer'));
    owner = await signInAs(instance, 'owner', ownerSecret);
    ownerId = (await db().user.findFirstOrThrow({ where: { username: 'owner' } })).id;
  });
  after(async () => {
    await stop(instance);
  });

  it('needs the permission and a fresh second factor', async () => {
    const { id } = await createUser(instance, 'victim', 'operator');
    await disable(id);
    const observer = await signInAs(instance, 'observer', observerSecret);
    const denied = await observer.call('DELETE', `/users/${id}`);
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied), 'forbidden');

    await db().session.updateMany({ data: { elevatedUntil: new Date(Date.now() - 1000) } });
    const needsCode = await owner.call('DELETE', `/users/${id}`);
    assert.equal(needsCode.status, 403);
    assert.equal(errorCode(needsCode), 'step_up_required');
    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);
    assert.equal((await owner.call('DELETE', `/users/${id}`)).status, 204);
  });

  it('refuses your own account, an account that is still active and one that does not exist', async () => {
    const self = await owner.call('DELETE', `/users/${ownerId}`);
    assert.equal(self.status, 409);
    assert.equal(errorCode(self), 'conflict');

    const { id } = await createUser(instance, 'still-active', 'operator');
    const active = await owner.call('DELETE', `/users/${id}`);
    assert.equal(active.status, 409);
    assert.match(JSON.stringify(active.body), /Disable the account/u);
    assert.ok((await names()).includes('still-active'), 'nothing was deleted');

    assert.equal(
      (await owner.call('DELETE', '/users/018f0000-0000-7000-8000-000000000000')).status,
      404,
    );
    assert.equal((await owner.call('DELETE', '/users/not-a-uuid')).status, 400);
  });

  it('removes the account with everything that hangs on it, and keeps what it did in the log', async () => {
    const { id, secret } = await createUser(instance, 'alice', 'operator');
    const alice = await signInAs(instance, 'alice', secret);
    assert.equal((await alice.get('/auth/me')).status, 200);
    await db().apiToken.create({
      data: {
        userId: id,
        name: 'alice token',
        tokenHash: 'ab'.repeat(32),
        prefix: 'swt_abcd',
        permissions: ['servers:read'],
        ipAllowlist: [],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    assert.ok((await db().session.count({ where: { userId: id } })) > 0);

    assert.equal((await disable(id)).status, 200);
    assert.equal((await owner.call('DELETE', `/users/${id}`)).status, 204);

    assert.ok(!(await names()).includes('alice'));
    assert.equal(await db().user.count({ where: { id } }), 0);
    assert.equal(await db().credential.count({ where: { userId: id } }), 0);
    assert.equal(await db().session.count({ where: { userId: id } }), 0);
    assert.equal(await db().apiToken.count({ where: { userId: id } }), 0);
    assert.equal((await alice.get('/auth/me')).status, 401);

    const events = await auditEvents(instance);
    const record = found(
      events.findLast((e) => e.action === 'user.deleted'),
      'the record',
    );
    assert.deepEqual(record.details, { username: 'alice', role: 'operator' });
    assert.equal(record.actor?.name, 'owner');
    assert.deepEqual(record.object, { type: 'user', id });
    // What alice did is still there, under her name.
    assert.ok(events.some((e) => e.actor?.name === 'alice' && e.action === 'auth.login.succeeded'));

    // The name is free again.
    const again = await owner.post('/users', { username: 'alice', role: 'observer' });
    assert.equal(again.status, 201);
  });

  it('removes the open invitation of an account that never signed in', async () => {
    const reply = await owner.post('/users', { username: 'never-came', role: 'observer' });
    assert.equal(reply.status, 201);
    const id = found(
      (await db().user.findFirst({ where: { username: 'never-came' } }))?.id,
      'the invited user',
    );
    assert.equal(await db().invitation.count({ where: { userId: id } }), 1);
    await disable(id);
    assert.equal((await owner.call('DELETE', `/users/${id}`)).status, 204);
    assert.equal(await db().invitation.count({ where: { userId: id } }), 0);
  });
});

describe('the language of a person', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let owner: Client;
  let ownerSecret: string;

  before(async () => {
    instance = await start();
    ({ secret: ownerSecret } = await createOwner(instance));
    owner = await signInAs(instance, 'owner', ownerSecret);
  });
  after(async () => {
    await stop(instance);
  });

  const me = async () => SessionInfoSchema.parse((await owner.get('/auth/me')).body).user;

  it('is nobody’s until they choose', async () => {
    assert.equal((await me()).language, null);
  });

  it('is kept on the account and comes back on every sign-in', async () => {
    const reply = await owner.call('PATCH', '/auth/preferences', { language: 'ru' });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.equal(UserSummarySchema.parse(reply.body).language, 'ru');
    assert.equal((await me()).language, 'ru');
    const fresh = await signInAs(instance, 'owner', ownerSecret);
    assert.equal(SessionInfoSchema.parse((await fresh.get('/auth/me')).body).user.language, 'ru');
  });

  it('can go back to following the browser, and takes only a language code', async () => {
    assert.equal((await owner.call('PATCH', '/auth/preferences', { language: null })).status, 200);
    assert.equal((await me()).language, null);
    for (const bad of ['RU', 'russian', 'ru-RU', '', 'r', 12, {}]) {
      const reply = await owner.call('PATCH', '/auth/preferences', { language: bad });
      assert.equal(reply.status, 400, JSON.stringify(bad));
    }
    assert.equal((await owner.call('PATCH', '/auth/preferences', {})).status, 400);
    assert.equal(
      (await instance.client().call('PATCH', '/auth/preferences', { language: 'en' })).status,
      401,
    );
  });
});
