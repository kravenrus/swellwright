import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SessionListSchema, SessionsRevokedSchema } from '@swellwright/contracts';

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

/** Lets the elevation of every session lapse, as if the step-up window had run out. */
async function lapse(instance: Instance): Promise<void> {
  await instance.isolated.database.client.session.updateMany({
    data: { elevatedUntil: new Date(Date.now() - 1000) },
  });
}

const sessionsOf = async (client: Client, path = '/auth/sessions') => {
  const reply = await client.get(path);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return SessionListSchema.parse(reply.body).sessions;
};

describe('sessions', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let ownerSecret: string;
  let aliceId: string;
  let aliceSecret: string;
  let auditorSecret: string;

  before(async () => {
    instance = await start();
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ id: aliceId, secret: aliceSecret } = await createUser(instance, 'alice', 'observer'));
    ({ secret: auditorSecret } = await createUser(instance, 'auditor', 'auditor'));
  });
  after(async () => {
    await stop(instance);
  });

  it('lists your own sessions and marks the one in use', async () => {
    const first = await signInAs(instance, 'owner', ownerSecret);
    const second = await signInAs(instance, 'owner', ownerSecret);
    const mine = await sessionsOf(first);
    assert.ok(mine.length >= 2);
    assert.ok(mine.every((s) => s.username === 'owner'));
    assert.equal(mine.filter((s) => s.current).length, 1);
    // The other client sees the same sessions with another one marked.
    const theirs = await sessionsOf(second);
    assert.equal(theirs.length, mine.length);
    const markedByFirst = found(
      mine.find((s) => s.current),
      'current session',
    );
    const markedBySecond = found(
      theirs.find((s) => s.current),
      'current session',
    );
    assert.notEqual(markedByFirst.id, markedBySecond.id);
    assert.equal(markedBySecond.elevated, true, 'a fresh sign-in is elevated');
  });

  it('never lists a session that is only half signed in, or one of someone else', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    const half = instance.client();
    assert.equal((await half.post('/auth/login', { username: 'owner', password: 'x' })).status, 401);
    await signInAs(instance, 'alice', aliceSecret);
    const mine = await sessionsOf(owner);
    assert.ok(mine.every((s) => s.userId !== aliceId));
  });

  it('ends another session of your own account, and the other browser is signed out at once', async () => {
    const keep = await signInAs(instance, 'owner', ownerSecret);
    const doomed = await signInAs(instance, 'owner', ownerSecret);
    const doomedId = found(
      (await sessionsOf(doomed)).find((s) => s.current),
      'doomed session',
    ).id;
    const reply = await keep.call('DELETE', `/auth/sessions/${doomedId}`);
    assert.equal(reply.status, 204);
    assert.equal((await doomed.get('/auth/me')).status, 401);
    assert.equal((await keep.get('/auth/me')).status, 200);
    const event = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'session.revoked'),
      'the revocation record',
    );
    assert.equal(event.object?.id, doomedId);
    assert.deepEqual(event.details, { scope: 'own', user: 'owner' });
    assert.equal(event.actor?.name, 'owner');
  });

  it('does not end the session in use, and does not reveal sessions of others', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    const alice = await signInAs(instance, 'alice', aliceSecret);
    const ownId = found(
      (await sessionsOf(owner)).find((s) => s.current),
      'own session',
    ).id;
    const aliceSession = found(
      (await sessionsOf(alice)).find((s) => s.current),
      'alice session',
    ).id;
    const self = await owner.call('DELETE', `/auth/sessions/${ownId}`);
    assert.equal(self.status, 409);
    assert.equal(errorCode(self), 'conflict');
    // Through the personal route a session of someone else does not exist.
    const foreign = await owner.call('DELETE', `/auth/sessions/${aliceSession}`);
    assert.equal(foreign.status, 404);
    assert.equal((await alice.get('/auth/me')).status, 200, 'alice is still signed in');
    assert.equal((await owner.call('DELETE', '/auth/sessions/not-a-uuid')).status, 400);
  });

  it('ends all your other sessions and keeps the current one', async () => {
    const keep = await signInAs(instance, 'owner', ownerSecret);
    // One after the other: a code works once, so two sign-ins at the same moment would fight over it.
    const others = [
      await signInAs(instance, 'owner', ownerSecret),
      await signInAs(instance, 'owner', ownerSecret),
    ];
    const before = (await sessionsOf(keep)).length;
    const reply = await keep.post('/auth/sessions/revoke-others');
    assert.equal(reply.status, 200);
    const { revoked } = SessionsRevokedSchema.parse(reply.body);
    assert.equal(revoked, before - 1);
    const after = await sessionsOf(keep);
    assert.equal(after.length, 1);
    assert.equal(found(after[0], 'remaining session').current, true);
    for (const client of others) {
      assert.equal((await client.get('/auth/me')).status, 401);
    }
    const event = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'session.revoked'),
      'the record',
    );
    assert.equal(event.details['scope'], 'others');
    assert.equal(event.details['count'], revoked);
    // Nothing left to end: no second record.
    const count = (await auditEvents(instance)).filter((e) => e.action === 'session.revoked').length;
    assert.equal((await keep.post('/auth/sessions/revoke-others')).status, 200);
    assert.equal(
      (await auditEvents(instance)).filter((e) => e.action === 'session.revoked').length,
      count,
    );
  });

  it('lets only those with the permission see everyone’s sessions', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    const alice = await signInAs(instance, 'alice', aliceSecret);
    const auditor = await signInAs(instance, 'auditor', auditorSecret);
    assert.equal((await alice.get('/sessions')).status, 403);
    const all = await sessionsOf(owner, '/sessions');
    assert.ok(all.some((s) => s.username === 'alice'));
    assert.ok(all.some((s) => s.username === 'owner'));
    const onlyAlice = await sessionsOf(owner, `/sessions?userId=${aliceId}`);
    assert.ok(onlyAlice.length > 0 && onlyAlice.every((s) => s.username === 'alice'));
    assert.ok((await sessionsOf(auditor, '/sessions')).length > 0, 'the auditor may read');
    assert.equal((await owner.get('/sessions?userId=nope')).status, 400);
  });

  it('needs the second factor, and a permission, to end the session of someone else', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    const alice = await signInAs(instance, 'alice', aliceSecret);
    const auditor = await signInAs(instance, 'auditor', auditorSecret);
    const aliceSession = found(
      (await sessionsOf(alice)).find((s) => s.current),
      'alice session',
    ).id;

    assert.equal((await alice.call('DELETE', `/sessions/${aliceSession}`)).status, 403);
    // The auditor may read sessions but not end them: forbidden, not a request for a code.
    const denied = await auditor.call('DELETE', `/sessions/${aliceSession}`);
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied), 'forbidden');

    await lapse(instance);
    const needsCode = await owner.call('DELETE', `/sessions/${aliceSession}`);
    assert.equal(needsCode.status, 403);
    assert.equal(errorCode(needsCode), 'step_up_required');
    assert.equal((await alice.get('/auth/me')).status, 200);

    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);
    assert.equal((await owner.call('DELETE', `/sessions/${aliceSession}`)).status, 204);
    assert.equal((await alice.get('/auth/me')).status, 401);
    const event = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'session.revoked'),
      'the record',
    );
    assert.deepEqual(event.details, { scope: 'user', user: 'alice' });
    assert.equal(event.actor?.name, 'owner');
  });

  it('ends every session of a user, but not through your own account', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    const aliceA = await signInAs(instance, 'alice', aliceSecret);
    const aliceB = await signInAs(instance, 'alice', aliceSecret);
    const ownerUser = await instance.isolated.database.client.user.findFirstOrThrow({
      where: { username: 'owner' },
    });
    const mine = await owner.post(`/users/${ownerUser.id}/sessions/revoke`);
    assert.equal(mine.status, 409);
    assert.equal(
      (await owner.post('/users/018f0000-0000-7000-8000-000000000000/sessions/revoke')).status,
      404,
    );
    const reply = await owner.post(`/users/${aliceId}/sessions/revoke`);
    assert.equal(reply.status, 200);
    assert.ok(SessionsRevokedSchema.parse(reply.body).revoked >= 2);
    assert.equal((await aliceA.get('/auth/me')).status, 401);
    assert.equal((await aliceB.get('/auth/me')).status, 401);
    const event = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'session.revoked'),
      'the record',
    );
    assert.equal(event.details['scope'], 'user');
    assert.equal(event.object?.type, 'user');
  });

  it('keeps sessions that ended on their own out of the list', async () => {
    const owner = await signInAs(instance, 'owner', ownerSecret);
    await instance.isolated.database.client.session.updateMany({
      where: { user: { username: 'alice' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const all = await sessionsOf(owner, '/sessions');
    assert.ok(all.every((s) => s.username !== 'alice'));
  });
});
