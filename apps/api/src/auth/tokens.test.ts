import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  CreatedTokenSchema,
  SessionInfoSchema,
  TOKEN_PATTERN,
  TokenListSchema,
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

/** Lets the elevation of every session lapse, as if the step-up window had run out. */
async function lapse(instance: Instance): Promise<void> {
  await instance.isolated.database.client.session.updateMany({
    data: { elevatedUntil: new Date(Date.now() - 1000) },
  });
}

/** Makes every session freshly verified, as if its owner had just entered a code. */
async function elevate(instance: Instance): Promise<void> {
  await instance.isolated.database.client.session.updateMany({
    data: { elevatedUntil: new Date(Date.now() + 10 * 60_000) },
  });
}

describe('API tokens', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let owner: Client;
  let ownerSecret: string;
  let operatorSecret: string;
  let operatorId: string;
  let observerSecret: string;
  let auditorSecret: string;

  before(async () => {
    // The proxy at the loopback address may say who the client is, so a test can come "from" another address.
    instance = await start({ SW_TRUSTED_PROXIES: 'loopback' });
    ({ secret: ownerSecret } = await createOwner(instance));
    ({ id: operatorId, secret: operatorSecret } = await createUser(instance, 'operator', 'operator'));
    ({ secret: observerSecret } = await createUser(instance, 'observer', 'observer'));
    ({ secret: auditorSecret } = await createUser(instance, 'auditor', 'auditor'));
    owner = await signInAs(instance, 'owner', ownerSecret);
  });
  after(async () => {
    await stop(instance);
  });

  /** A client with no cookie: what the CLI is. */
  const bare = () => instance.client();
  const bearer = (token: string, from?: string) => ({
    authorization: `Bearer ${token}`,
    ...(from ? { 'x-forwarded-for': from } : {}),
  });

  async function mint(
    client: Client,
    permissions: string[],
    extra: Record<string, unknown> = {},
  ): Promise<{ token: string; id: string }> {
    await elevate(instance);
    const reply = await client.post('/tokens', { name: 'ci', permissions, ...extra });
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    const created = CreatedTokenSchema.parse(reply.body);
    return { token: created.token, id: created.view.id };
  }

  it('is made once, in the answer, and only the hash is kept', async () => {
    const reply = await owner.post('/tokens', {
      name: 'dashboard',
      permissions: ['users:read', 'audit:read'],
      expiresInDays: 30,
    });
    assert.equal(reply.status, 201);
    const created = CreatedTokenSchema.parse(reply.body);
    assert.match(created.token, TOKEN_PATTERN);
    assert.equal(created.view.prefix, created.token.slice(0, 8));
    assert.equal(created.view.state, 'active');
    assert.deepEqual(created.view.permissions, ['users:read', 'audit:read']);
    const days = (Date.parse(created.view.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30, `thirty days, got ${String(days)}`);

    const stored = await instance.isolated.database.client.apiToken.findUniqueOrThrow({
      where: { id: created.view.id },
    });
    assert.ok(!JSON.stringify(stored).includes(created.token), 'the value is never stored');
    assert.match(stored.tokenHash, /^[0-9a-f]{64}$/u);

    const listed = JSON.stringify((await owner.get('/auth/tokens')).body);
    assert.ok(!listed.includes(created.token), 'the list never carries the value');
    assert.ok(!listed.includes(stored.tokenHash), 'nor the hash');
    const event = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'token.created'),
      'the creation record',
    );
    assert.equal(event.details['name'], 'dashboard');
    assert.equal(event.details['days'], 30);
    assert.equal(event.details['permissions'], 2);
    assert.ok(!JSON.stringify(event).includes(created.token));
  });

  it('needs the permission and a fresh second factor to be made', async () => {
    const observer = await signInAs(instance, 'observer', observerSecret);
    const denied = await observer.post('/tokens', { name: 'x', permissions: ['servers:read'] });
    assert.equal(denied.status, 403);
    assert.equal(errorCode(denied), 'forbidden');

    const fresh = await signInAs(instance, 'owner', ownerSecret);
    await lapse(instance);
    const needsCode = await fresh.post('/tokens', { name: 'x', permissions: ['users:read'] });
    assert.equal(needsCode.status, 403);
    assert.equal(errorCode(needsCode), 'step_up_required');
    await forgetLastStep(instance);
    assert.equal((await fresh.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);
    assert.equal(
      (await fresh.post('/tokens', { name: 'x', permissions: ['users:read'] })).status,
      201,
    );
  });

  it('carries no more than its creator can do, and nothing that needs a second factor', async () => {
    await elevate(instance);
    const operator = await signInAs(instance, 'operator', operatorSecret);
    const tooMuch = await operator.post('/tokens', { name: 'x', permissions: ['users:read'] });
    assert.equal(tooMuch.status, 400, 'the operator cannot read users');
    assert.match(JSON.stringify(tooMuch.body), /users:read/u);
    for (const needsCode of ['users:write', 'vault:reveal', 'tokens:create', 'audit:export']) {
      const reply = await owner.post('/tokens', { name: 'x', permissions: [needsCode] });
      assert.equal(reply.status, 400, needsCode);
    }
    for (const bad of [
      { name: '', permissions: ['users:read'] },
      { name: 'x', permissions: [] },
      { name: 'x', permissions: ['users:read', 'users:read'] },
      { name: 'x', permissions: ['servers:fly'] },
      { name: 'x', permissions: ['users:read'], expiresInDays: 0 },
      { name: 'x', permissions: ['users:read'], expiresInDays: 366 },
      { name: 'x', permissions: ['users:read'], ipAllowlist: ['not-an-address'] },
    ]) {
      assert.equal((await owner.post('/tokens', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal(
      (await operator.post('/tokens', { name: 'ok', permissions: ['servers:read'] })).status,
      201,
    );
  });

  it('works as a bearer credential on the routes that accept it, within what it carries', async () => {
    const { token } = await mint(owner, ['users:read']);
    const cli = bare();
    const me = await cli.call('GET', '/auth/me', undefined, bearer(token));
    assert.equal(me.status, 200);
    const info = SessionInfoSchema.parse(me.body);
    assert.equal(info.user.username, 'owner');
    assert.deepEqual(info.permissions, ['users:read']);

    assert.equal((await cli.call('GET', '/users', undefined, bearer(token))).status, 200);
    const denied = await cli.call('GET', '/roles', undefined, bearer(token));
    assert.equal(denied.status, 403, 'roles:read was not granted to this token');
    assert.equal(errorCode(denied), 'forbidden');
  });

  it('is refused on routes that are for a browser session, and on every route that needs a step-up', async () => {
    const { token } = await mint(owner, ['users:read', 'sessions:read', 'tokens:read']);
    const cli = bare();
    const headers = bearer(token);
    assert.equal((await cli.call('GET', '/auth/sessions', undefined, headers)).status, 401);
    assert.equal((await cli.call('GET', '/auth/tokens', undefined, headers)).status, 401);
    assert.equal(
      (await cli.call('POST', '/tokens', { name: 'x', permissions: ['users:read'] }, headers)).status,
      401,
    );
    assert.equal((await cli.call('POST', '/auth/step-up', { code: '123456' }, headers)).status, 401);
    assert.equal((await cli.call('POST', '/users', { username: 'x', role: 'observer' }, headers)).status, 401);
    // A route for tokens that also lets a token read what it was given.
    assert.equal((await cli.call('GET', '/sessions', undefined, headers)).status, 200);
    assert.equal((await cli.call('GET', '/tokens', undefined, headers)).status, 200);
  });

  it('is never replaced by a cookie: a bad token on a route that takes either is refused', async () => {
    const signedIn = await signInAs(instance, 'owner', ownerSecret);
    const bad = `swt_${'A'.repeat(43)}`;
    const reply = await signedIn.call('GET', '/auth/me', undefined, bearer(bad));
    assert.equal(reply.status, 401);
    assert.equal((await signedIn.get('/auth/me')).status, 200, 'the cookie alone still works');
  });

  it('loses its power with the role of its owner, and with the owner', async () => {
    const operator = await signInAs(instance, 'operator', operatorSecret);
    const { token } = await mint(operator, ['servers:read', 'panel:write']);
    const cli = bare();
    const grants = async () =>
      SessionInfoSchema.parse((await cli.call('GET', '/auth/me', undefined, bearer(token))).body)
        .permissions;
    assert.deepEqual(await grants(), ['servers:read', 'panel:write']);
    const users = instance.isolated.database.client.user;
    await users.update({ where: { id: operatorId }, data: { role: 'observer' } });
    assert.deepEqual(await grants(), ['servers:read'], 'a demoted owner takes the extra away at once');
    await users.update({ where: { id: operatorId }, data: { status: 'disabled' } });
    assert.equal((await cli.call('GET', '/auth/me', undefined, bearer(token))).status, 401);
    await users.update({ where: { id: operatorId }, data: { status: 'active', role: 'operator' } });
    assert.deepEqual(await grants(), ['servers:read', 'panel:write'], 'and gives it back with the role');
  });

  it('stops at its expiry and when it is revoked, and says why in the audit chain', async () => {
    const expiring = await mint(owner, ['users:read']);
    const cli = bare();
    await instance.isolated.database.client.apiToken.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await cli.call('GET', '/users', undefined, bearer(expiring.token))).status, 401);
    const expired = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'auth.token.denied'),
      'the denial',
    );
    assert.equal(expired.details['reason'], 'expired');
    assert.equal(expired.object?.id, expiring.id);
    assert.ok(!JSON.stringify(expired).includes(expiring.token));

    const revoked = await mint(owner, ['users:read']);
    assert.equal((await cli.call('GET', '/users', undefined, bearer(revoked.token))).status, 200);
    assert.equal((await owner.call('DELETE', `/auth/tokens/${revoked.id}`)).status, 204);
    assert.equal((await cli.call('GET', '/users', undefined, bearer(revoked.token))).status, 401);
    const denied = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'auth.token.denied'),
      'the denial',
    );
    assert.equal(denied.details['reason'], 'revoked');
    // Revoking again succeeds and adds nothing.
    const before = (await auditEvents(instance)).filter((e) => e.action === 'token.revoked').length;
    assert.equal((await owner.call('DELETE', `/auth/tokens/${revoked.id}`)).status, 204);
    assert.equal(
      (await auditEvents(instance)).filter((e) => e.action === 'token.revoked').length,
      before,
    );
  });

  it('can be limited to addresses', async () => {
    const { token, id } = await mint(owner, ['users:read'], {
      ipAllowlist: ['203.0.113.0/24', '2001:db8::/32'],
    });
    const cli = bare();
    const from = (address: string) =>
      cli.call('GET', '/users', undefined, bearer(token, address));
    assert.equal((await from('203.0.113.77')).status, 200);
    assert.equal((await from('2001:db8::42')).status, 200);
    assert.equal((await from('198.51.100.1')).status, 401);
    assert.equal((await cli.call('GET', '/users', undefined, bearer(token))).status, 401, 'from the proxy itself');
    const denial = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'auth.token.denied'),
      'the denial',
    );
    assert.equal(denial.details['reason'], 'address');
    assert.equal(denial.object?.id, id);
    const row = await instance.isolated.database.client.apiToken.findUniqueOrThrow({ where: { id } });
    // The use is written at most once a minute, so the first good address of the minute is the one kept.
    assert.equal(row.lastUsedIp, '203.0.113.77');
  });

  it('keeps the audit chain from filling up when a dead token keeps being used', async () => {
    const { token, id } = await mint(owner, ['users:read']);
    await owner.call('DELETE', `/auth/tokens/${id}`);
    const cli = bare();
    for (let i = 0; i < 12; i += 1) {
      assert.equal((await cli.call('GET', '/users', undefined, bearer(token))).status, 401);
    }
    const notes = (await auditEvents(instance)).filter(
      (e) => e.action === 'auth.token.denied' && e.object?.id === id,
    );
    assert.equal(notes.length, 5);
  });

  it('answers 429 to an address that keeps sending tokens that do not exist', async () => {
    const cli = bare();
    let last = 0;
    for (let i = 0; i < 40; i += 1) {
      const reply = await cli.call(
        'GET',
        '/users',
        undefined,
        bearer(`swt_${String(i).padStart(43, 'x')}`, '198.51.100.99'),
      );
      last = reply.status;
      if (last === 429) {
        assert.ok(reply.headers.get('retry-after'));
        break;
      }
      assert.equal(last, 401);
    }
    assert.equal(last, 429);
    // Another address is not affected.
    const ok = await mint(owner, ['users:read']);
    assert.equal((await cli.call('GET', '/users', undefined, bearer(ok.token, '198.51.100.5'))).status, 200);
    assert.equal((await cli.call('GET', '/users', undefined, { authorization: 'Bearer ' })).status, 401);
    assert.equal((await cli.call('GET', '/users', undefined, { authorization: 'Basic abc' })).status, 401);
  });

  it('records when it was last used, not on every request', async () => {
    const { token, id } = await mint(owner, ['users:read']);
    const cli = bare();
    const row = () =>
      instance.isolated.database.client.apiToken.findUniqueOrThrow({ where: { id } });
    assert.equal((await row()).lastUsedAt, null);
    await cli.call('GET', '/users', undefined, bearer(token, '203.0.113.5'));
    const first = found((await row()).lastUsedAt ?? undefined, 'first use');
    await cli.call('GET', '/users', undefined, bearer(token, '203.0.113.6'));
    const second = found((await row()).lastUsedAt ?? undefined, 'second use');
    assert.equal(second.getTime(), first.getTime(), 'a minute has not passed');
    assert.equal((await row()).lastUsedIp, '203.0.113.5');
  });

  it('is listed to its owner, to those who may read all tokens, and revoked by those who may', async () => {
    const operator = await signInAs(instance, 'operator', operatorSecret);
    const mine = await mint(operator, ['servers:read']);
    const listOwn = TokenListSchema.parse((await operator.get('/auth/tokens')).body).tokens;
    assert.ok(listOwn.every((t) => t.username === 'operator'));
    assert.ok(listOwn.some((t) => t.id === mine.id));

    // The operator cannot see or revoke anyone's tokens through the administrator routes.
    assert.equal((await operator.get('/tokens')).status, 403);
    // The owner's route to someone else's token reports "not found", not "forbidden".
    assert.equal((await owner.call('DELETE', `/auth/tokens/${mine.id}`)).status, 404);

    const auditor = await signInAs(instance, 'auditor', auditorSecret);
    const all = TokenListSchema.parse((await auditor.get('/tokens')).body).tokens;
    assert.ok(all.some((t) => t.id === mine.id) && all.some((t) => t.username === 'owner'));
    const only = TokenListSchema.parse((await owner.get(`/tokens?userId=${operatorId}`)).body).tokens;
    assert.ok(only.length > 0 && only.every((t) => t.username === 'operator'));
    // The auditor may read, not revoke.
    const forbidden = await auditor.call('DELETE', `/tokens/${mine.id}`);
    assert.equal(forbidden.status, 403);
    assert.equal(errorCode(forbidden), 'forbidden');

    // The owner revokes it, with a code.
    await lapse(instance);
    const needsCode = await owner.call('DELETE', `/tokens/${mine.id}`);
    assert.equal(errorCode(needsCode), 'step_up_required');
    await forgetLastStep(instance);
    assert.equal((await owner.post('/auth/step-up', { code: codeFor(ownerSecret) })).status, 200);
    assert.equal((await owner.call('DELETE', `/tokens/${mine.id}`)).status, 204);
    const revoked = found(
      (await auditEvents(instance)).findLast((e) => e.action === 'token.revoked'),
      'the revocation',
    );
    assert.deepEqual(revoked.details, { scope: 'user', user: 'operator', name: 'ci' });
    assert.equal((await bare().call('GET', '/auth/me', undefined, bearer(mine.token))).status, 401);
  });

  it('is limited in number, and old ones are cleared away', async () => {
    await elevate(instance);
    const maker = await signInAs(instance, 'auditor', auditorSecret);
    // The auditor may not create tokens: use the owner for the limit.
    assert.equal((await maker.post('/tokens', { name: 'x', permissions: ['users:read'] })).status, 403);
    const users = instance.isolated.database.client;
    const ownerRow = await users.user.findFirstOrThrow({ where: { username: 'owner' } });
    const active = await users.apiToken.count({
      where: { userId: ownerRow.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    for (let i = active; i < 20; i += 1) {
      await users.apiToken.create({
        data: {
          userId: ownerRow.id,
          name: `filler ${String(i)}`,
          tokenHash: `${String(i).padStart(2, '0')}`.repeat(32),
          prefix: 'swt_fill',
          permissions: ['users:read'],
          ipAllowlist: [],
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    const full = await owner.post('/tokens', { name: 'one too many', permissions: ['users:read'] });
    assert.equal(full.status, 409);
    assert.equal(errorCode(full), 'conflict');

    // Ended tokens older than thirty days are removed when a new one is made.
    await users.apiToken.updateMany({
      where: { userId: ownerRow.id, name: { startsWith: 'filler' } },
      data: { revokedAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    const kept = await users.apiToken.count({ where: { userId: ownerRow.id, name: { startsWith: 'filler' } } });
    assert.ok(kept > 0);
    assert.equal((await owner.post('/tokens', { name: 'fits now', permissions: ['users:read'] })).status, 201);
    assert.equal(
      await users.apiToken.count({ where: { userId: ownerRow.id, name: { startsWith: 'filler' } } }),
      0,
    );
  });
});
