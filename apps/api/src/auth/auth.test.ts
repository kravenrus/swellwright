import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ApiErrorSchema,
  PendingSessionSchema,
  SessionInfoSchema,
  SetupStatusSchema,
  TotpConfirmedSchema,
  TotpEnrollmentSchema,
} from '@swellwright/contracts';
import { SessionStage } from '@swellwright/db';
import { createIsolatedDatabase, type IsolatedDatabase } from '@swellwright/db/testing';

import { createApp } from '../bootstrap.js';
import { loadConfig } from '../config.js';
import { base32Decode, base32Encode, timeStep, totpCode } from './totp.js';

const databaseUrl = process.env['SW_TEST_DATABASE_URL'];
const SETUP_TOKEN = 'test-setup-token-0123456789';
const PASSWORD = 'correct horse battery staple';
const CHEAP = { memory: 256, passes: 1, parallelism: 1 } as const;
const AUTH_KEY = Buffer.alloc(32, 1).toString('base64');

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
  readonly setCookie: string[];
}

/** A browser stand-in: keeps the session cookie between calls. */
class Client {
  cookie: string | undefined;

  constructor(private readonly base: string) {}

  async call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = res.headers.getSetCookie();
    for (const line of setCookie) {
      const [pair] = line.split(';');
      const [name, value] = (pair ?? '').split('=');
      if (name === 'sw_session') {
        this.cookie = value ? `sw_session=${value}` : undefined;
      }
    }
    const text = await res.text();
    return {
      status: res.status,
      body: text ? (JSON.parse(text) as unknown) : undefined,
      headers: res.headers,
      setCookie,
    };
  }

  get(path: string): Promise<Reply> {
    return this.call('GET', path);
  }

  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Reply> {
    return this.call('POST', path, body, headers);
  }
}

const errorCode = (reply: Reply): string => ApiErrorSchema.parse(reply.body).error.code;
/** A code for the current step, or a step further on when the current one was used already. */
const codeFor = (secret: string, stepsAhead = 0): string =>
  totpCode(base32Decode(secret), timeStep(Date.now()) + stepsAhead);

interface Instance {
  app: NestExpressApplication;
  base: string;
  isolated: IsolatedDatabase;
  client: () => Client;
}

async function start(env: Record<string, string> = {}): Promise<Instance> {
  const isolated = await createIsolatedDatabase(databaseUrl ?? '');
  const config = loadConfig(
    {
      SW_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      SW_AUTH_KEY: AUTH_KEY,
      SW_SETUP_TOKEN: SETUP_TOKEN,
      SW_LOCKOUT_ATTEMPTS: '3',
      ...env,
    },
    '0.0.0-test',
  );
  const app = await createApp(config, {
    readinessChecks: [],
    passwordParams: CHEAP,
    database: isolated.database,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  const base = `http://127.0.0.1:${String(port)}/api/v1`;
  return { app, base, isolated, client: () => new Client(base) };
}

async function stop(instance: Instance): Promise<void> {
  await instance.app.close();
  await instance.isolated.drop();
}

/** Creates the owner and finishes the enrollment. Returns what a later sign-in needs. */
async function createOwner(
  instance: Instance,
  username = 'owner',
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const client = instance.client();
  const created = await client.post('/setup/owner', {
    setupToken: SETUP_TOKEN,
    username,
    password: PASSWORD,
  });
  assert.equal(created.status, 200);
  const enrollment = TotpEnrollmentSchema.parse((await client.post('/auth/totp/enrollment')).body);
  const confirmed = await client.post('/auth/totp/confirm', { code: codeFor(enrollment.secret) });
  assert.equal(confirmed.status, 200);
  return {
    secret: enrollment.secret,
    recoveryCodes: TotpConfirmedSchema.parse(confirmed.body).recoveryCodes,
  };
}

/** Lets the same authenticator code be used again: a test has no 30-second wait. */
async function forgetLastStep(instance: Instance): Promise<void> {
  await instance.isolated.database.client.credential.updateMany({ data: { totpLastStep: null } });
}

describe('first-run setup', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  it('reports an instance without an owner, then one with', async () => {
    const client = instance.client();
    assert.deepEqual(SetupStatusSchema.parse((await client.get('/setup/status')).body), {
      initialized: false,
    });
    await createOwner(instance, 'first');
    assert.deepEqual(SetupStatusSchema.parse((await client.get('/setup/status')).body), {
      initialized: true,
    });
  });

  it('refuses a second owner, whatever the token', async () => {
    const reply = await instance
      .client()
      .post('/setup/owner', { setupToken: SETUP_TOKEN, username: 'second', password: PASSWORD });
    assert.equal(reply.status, 409);
    assert.equal(errorCode(reply), 'conflict');
  });

  it('stores an Argon2id hash and the owner role, never the password', async () => {
    const { client } = instance.isolated.database;
    const user = await client.user.findUniqueOrThrow({
      where: { username: 'first' },
      include: { credential: true },
    });
    assert.equal(user.role, 'owner');
    assert.match(user.credential?.passwordHash ?? '', /^\$argon2id\$/u);
    assert.ok(!JSON.stringify(user).includes(PASSWORD));
  });
});

describe('first-run setup, refusals', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  it('refuses a wrong setup token and creates nothing', async () => {
    const reply = await instance
      .client()
      .post('/setup/owner', { setupToken: 'not-the-token', username: 'owner', password: PASSWORD });
    assert.equal(reply.status, 403);
    assert.equal(errorCode(reply), 'forbidden');
    assert.equal(await instance.isolated.database.client.user.count(), 0);
  });

  it('refuses a weak password or a bad login name without echoing the password', async () => {
    const weak = await instance.client().post('/setup/owner', {
      setupToken: SETUP_TOKEN,
      username: 'owner',
      password: 'hunter2',
    });
    assert.equal(weak.status, 400);
    assert.equal(errorCode(weak), 'validation_failed');
    assert.ok(!JSON.stringify(weak.body).includes('hunter2'));
    const bad = await instance.client().post('/setup/owner', {
      setupToken: SETUP_TOKEN,
      username: 'Not Allowed',
      password: PASSWORD,
    });
    assert.equal(errorCode(bad), 'validation_failed');
    assert.equal(await instance.isolated.database.client.user.count(), 0);
  });

  it('sets a session cookie that scripts cannot read and other sites cannot send', async () => {
    const reply = await instance
      .client()
      .post('/setup/owner', { setupToken: SETUP_TOKEN, username: 'owner', password: PASSWORD });
    assert.equal(reply.status, 200);
    assert.deepEqual(PendingSessionSchema.parse(reply.body), { next: 'totp_enrollment' });
    const cookie = reply.setCookie.find((c) => c.startsWith('sw_session='));
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/iu);
    assert.match(cookie, /SameSite=Strict/iu);
    assert.match(cookie, /Path=\/api\/v1/iu);
    assert.ok(!/Secure/iu.test(cookie), 'Secure is off in this configuration');
  });
});

describe('first-run setup, two requests at once', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  it('creates exactly one owner', async () => {
    const attempts = ['a1', 'b2', 'c3'].map((username) =>
      instance
        .client()
        .post('/setup/owner', { setupToken: SETUP_TOKEN, username, password: PASSWORD }),
    );
    const statuses = (await Promise.all(attempts)).map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409]);
    assert.equal(await instance.isolated.database.client.user.count(), 1);
  });
});

describe('cookie attributes in production mode', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start({ SW_COOKIE_SECURE: 'true' });
  });
  after(async () => {
    await stop(instance);
  });

  it('adds Secure when configured', async () => {
    const reply = await instance
      .client()
      .post('/setup/owner', { setupToken: SETUP_TOKEN, username: 'owner', password: PASSWORD });
    assert.match(reply.setCookie.join('\n'), /Secure/iu);
  });
});

describe('authenticator enrollment', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  it('keeps a password-only session away from everything but the second step', async () => {
    const client = instance.client();
    await client.post('/setup/owner', {
      setupToken: SETUP_TOKEN,
      username: 'owner',
      password: PASSWORD,
    });
    assert.equal((await client.get('/auth/me')).status, 401);
    // The authenticator is not set up, so there is nothing to verify yet.
    assert.equal((await client.post('/auth/totp', { code: '123456' })).status, 409);
    const first = TotpEnrollmentSchema.parse((await client.post('/auth/totp/enrollment')).body);
    const again = TotpEnrollmentSchema.parse((await client.post('/auth/totp/enrollment')).body);
    assert.equal(first.secret, again.secret, 'the same secret until it is confirmed');
    assert.match(first.otpauthUri, /^otpauth:\/\/totp\/Swellwright:owner\?/u);
    assert.ok(first.otpauthUri.includes(`secret=${first.secret}`));

    // The database holds a sealed blob, not the secret.
    const stored = await instance.isolated.database.client.credential.findFirstOrThrow();
    assert.ok(stored.totpSecret);
    assert.ok(!Buffer.from(stored.totpSecret).includes(base32Decode(first.secret)));
  });

  it('refuses a wrong code and accepts the right one with ten recovery codes', async () => {
    const client = instance.client();
    const login = await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.deepEqual(PendingSessionSchema.parse(login.body), { next: 'totp_enrollment' });
    const { secret } = TotpEnrollmentSchema.parse(
      (await client.post('/auth/totp/enrollment')).body,
    );
    const wrong = codeFor(secret) === '000000' ? '000001' : '000000';
    assert.equal((await client.post('/auth/totp/confirm', { code: wrong })).status, 401);

    const pendingCookie = client.cookie;
    const confirmed = await client.post('/auth/totp/confirm', { code: codeFor(secret) });
    assert.equal(confirmed.status, 200);
    const body = TotpConfirmedSchema.parse(confirmed.body);
    assert.equal(body.recoveryCodes.length, 10);
    assert.equal(body.user.username, 'owner');
    assert.equal(body.user.role, 'owner');
    assert.notEqual(client.cookie, pendingCookie, 'the session cookie is replaced');

    // The password-only cookie is dead: nothing carries over to the real session.
    const stale = instance.client();
    stale.cookie = pendingCookie;
    assert.equal((await stale.get('/auth/me')).status, 401);

    const me = SessionInfoSchema.parse((await client.get('/auth/me')).body);
    assert.equal(me.user.username, 'owner');
  });

  it('stores recovery codes as hashes only', async () => {
    const rows = await instance.isolated.database.client.recoveryCode.findMany();
    assert.equal(rows.length, 10);
    for (const row of rows) {
      assert.match(row.codeHash, /^[0-9a-f]{64}$/u);
      assert.equal(row.usedAt, null);
    }
  });

  it('refuses to enroll again once confirmed', async () => {
    const client = instance.client();
    const login = await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.deepEqual(PendingSessionSchema.parse(login.body), { next: 'totp' });
    assert.equal((await client.post('/auth/totp/enrollment')).status, 409);
  });
});

describe('sign-in', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let secret: string;
  let recoveryCodes: string[];

  before(async () => {
    instance = await start();
    ({ secret, recoveryCodes } = await createOwner(instance));
  });
  after(async () => {
    await stop(instance);
  });

  const signIn = async (client: Client, code: string): Promise<Reply> => {
    const login = await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.equal(login.status, 200);
    return client.post('/auth/totp', { code });
  };

  it('signs in with the password and an authenticator code, then out', async () => {
    await forgetLastStep(instance);
    const client = instance.client();
    const login = await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.deepEqual(PendingSessionSchema.parse(login.body), { next: 'totp' });
    assert.equal((await client.get('/auth/me')).status, 401, 'a password alone opens nothing');

    const done = await client.post('/auth/totp', { code: codeFor(secret) });
    assert.equal(done.status, 200);
    assert.equal(SessionInfoSchema.parse(done.body).user.username, 'owner');
    assert.equal((await client.get('/auth/me')).status, 200);

    const out = await client.post('/auth/logout');
    assert.equal(out.status, 204);
    assert.equal(out.body, undefined);
    assert.equal(client.cookie, undefined, 'the cookie is cleared');
    assert.equal((await client.get('/auth/me')).status, 401);
  });

  it('answers a wrong password and an unknown user alike', async () => {
    const client = instance.client();
    const wrong = await client.post('/auth/login', {
      username: 'owner',
      password: 'wrong password!!',
    });
    const unknown = await client.post('/auth/login', {
      username: 'nobody',
      password: 'wrong password!!',
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(
      { ...ApiErrorSchema.parse(wrong.body).error, requestId: '' },
      { ...ApiErrorSchema.parse(unknown.body).error, requestId: '' },
    );
    assert.equal(client.cookie, undefined, 'no session without a correct password');
  });

  it('takes the login name in any case', async () => {
    const client = instance.client();
    const login = await client.post('/auth/login', { username: ' OWNER ', password: PASSWORD });
    assert.equal(login.status, 200);
  });

  it('refuses a replayed authenticator code', async () => {
    await forgetLastStep(instance);
    const code = codeFor(secret);
    assert.equal((await signIn(instance.client(), code)).status, 200);
    assert.equal((await signIn(instance.client(), code)).status, 401);
  });

  it('lets a recovery code in once', async () => {
    const code = recoveryCodes[0] ?? '';
    const first = await signIn(instance.client(), code.toLowerCase());
    assert.equal(first.status, 200);
    const second = await signIn(instance.client(), code);
    assert.equal(second.status, 401);
    const used = await instance.isolated.database.client.recoveryCode.count({
      where: { usedAt: { not: null } },
    });
    assert.equal(used, 1);
  });

  it('refuses a call to the second step without a session or with a made-up one', async () => {
    assert.equal((await instance.client().post('/auth/totp', { code: '123456' })).status, 401);
    const forged = instance.client();
    forged.cookie = 'sw_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    assert.equal((await forged.get('/auth/me')).status, 401);
    assert.equal((await forged.post('/auth/totp', { code: '123456' })).status, 401);
  });

  it('keeps a session cookie from working on the second step once signed in', async () => {
    await forgetLastStep(instance);
    const client = instance.client();
    assert.equal((await signIn(client, codeFor(secret))).status, 200);
    assert.equal((await client.post('/auth/totp', { code: codeFor(secret, 1) })).status, 401);
  });

  it('refuses a disabled user, and ends the sessions they had', async () => {
    await forgetLastStep(instance);
    const client = instance.client();
    assert.equal((await signIn(client, codeFor(secret))).status, 200);
    await instance.isolated.database.client.user.updateMany({ data: { status: 'disabled' } });
    assert.equal((await client.get('/auth/me')).status, 401);
    const login = await instance
      .client()
      .post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.equal(login.status, 401);
    await instance.isolated.database.client.user.updateMany({ data: { status: 'active' } });
  });
});

describe('session lifetime', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let secret: string;
  before(async () => {
    instance = await start();
    ({ secret } = await createOwner(instance));
  });
  after(async () => {
    await stop(instance);
  });

  const signedIn = async (): Promise<Client> => {
    await forgetLastStep(instance);
    const client = instance.client();
    await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.equal((await client.post('/auth/totp', { code: codeFor(secret) })).status, 200);
    return client;
  };

  it('ends an idle session', async () => {
    const client = await signedIn();
    await instance.isolated.database.client.session.updateMany({
      where: { stage: SessionStage.active },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await client.get('/auth/me')).status, 401);
  });

  it('ends a session at its absolute limit however active it is', async () => {
    const client = await signedIn();
    await instance.isolated.database.client.session.updateMany({
      where: { stage: SessionStage.active },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await client.get('/auth/me')).status, 401);
  });

  it('moves the idle expiry forward while the session is used, never past the absolute limit', async () => {
    const client = await signedIn();
    const sessions = instance.isolated.database.client.session;
    const soon = new Date(Date.now() + 5 * 60_000);
    const longAgo = new Date(Date.now() - 5 * 60_000);
    await sessions.updateMany({
      where: { stage: SessionStage.active },
      data: { expiresAt: soon, lastSeenAt: longAgo },
    });
    assert.equal((await client.get('/auth/me')).status, 200);
    const row = await sessions.findFirstOrThrow({ where: { stage: SessionStage.active } });
    assert.ok(
      row.expiresAt.getTime() > soon.getTime() + 60 * 60_000,
      'idle expiry moved well forward',
    );
    assert.ok(row.expiresAt.getTime() <= row.absoluteExpiresAt.getTime());
  });

  it('keeps the password step short', async () => {
    const client = instance.client();
    await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    const row = await instance.isolated.database.client.session.findFirstOrThrow({
      where: { stage: SessionStage.password_verified },
    });
    assert.ok(row.expiresAt.getTime() - Date.now() <= 10 * 60_000);
  });

  it('stores only a hash of the session token', async () => {
    const client = await signedIn();
    const token = client.cookie?.split('=')[1] ?? '';
    const rows = await instance.isolated.database.client.session.findMany();
    assert.ok(token.length > 20);
    for (const row of rows) {
      assert.notEqual(row.tokenHash, token);
      assert.match(row.tokenHash, /^[0-9a-f]{64}$/u);
    }
  });
});

describe('lockout', { skip: !databaseUrl }, () => {
  let instance: Instance;
  let secret: string;
  before(async () => {
    instance = await start();
    ({ secret } = await createOwner(instance));
  });
  after(async () => {
    await stop(instance);
  });

  it('locks the account after repeated wrong passwords, even for the right one', async () => {
    const client = instance.client();
    const attempt = (password: string): Promise<Reply> =>
      client.post('/auth/login', { username: 'owner', password });
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await attempt('wrong password!!')).status, 401);
    }
    const locked = await attempt(PASSWORD);
    assert.equal(locked.status, 429);
    assert.equal(errorCode(locked), 'rate_limited');
    assert.ok(Number(locked.headers.get('retry-after')) > 0);

    // When the lock runs out the account works again, with a fresh count.
    await instance.isolated.database.client.credential.updateMany({
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    assert.equal((await attempt(PASSWORD)).status, 200);
  });

  it('counts wrong authenticator codes too, and ends the pending session at the limit', async () => {
    await instance.isolated.database.client.credential.updateMany({
      data: { failedAttempts: 0, lockedUntil: null },
    });
    const client = instance.client();
    await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    const wrong = codeFor(secret) === '000000' ? '000001' : '000000';
    assert.equal((await client.post('/auth/totp', { code: wrong })).status, 401);
    assert.equal((await client.post('/auth/totp', { code: wrong })).status, 401);
    assert.equal((await client.post('/auth/totp', { code: wrong })).status, 401);
    // The third failure locked the account and ended the session that was trying.
    assert.equal((await client.post('/auth/totp', { code: codeFor(secret) })).status, 401);
    const login = await instance
      .client()
      .post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.equal(login.status, 429);
  });

  it('resets the count after a completed sign-in', async () => {
    await instance.isolated.database.client.credential.updateMany({
      data: { failedAttempts: 2, lockedUntil: null, totpLastStep: null },
    });
    const client = instance.client();
    await client.post('/auth/login', { username: 'owner', password: PASSWORD });
    assert.equal((await client.post('/auth/totp', { code: codeFor(secret) })).status, 200);
    const credential = await instance.isolated.database.client.credential.findFirstOrThrow();
    assert.equal(credential.failedAttempts, 0);
  });
});

describe('requests from other origins', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  const login = (headers: Record<string, string>): Promise<Reply> =>
    instance.client().post('/auth/login', { username: 'nobody', password: 'whatever' }, headers);

  it('refuses a state-changing request that names a foreign origin', async () => {
    const reply = await login({ origin: 'https://evil.example' });
    assert.equal(reply.status, 403);
    assert.equal(errorCode(reply), 'forbidden');
  });

  it('refuses a cross-site request that sends no origin', async () => {
    assert.equal((await login({ 'sec-fetch-site': 'cross-site' })).status, 403);
  });

  it('accepts the host the request was sent to, and requests that are not from a browser', async () => {
    const origin = new URL(instance.base).origin;
    assert.equal((await login({ origin })).status, 401, 'reaches the handler: wrong credentials');
    assert.equal((await login({ 'sec-fetch-site': 'same-origin' })).status, 401);
    assert.equal((await login({})).status, 401);
  });

  it('never blocks reading', async () => {
    const reply = await instance.client().call('GET', '/setup/status', undefined, {
      origin: 'https://evil.example',
    });
    assert.equal(reply.status, 200);
  });
});

describe('allowed origins from the configuration', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start({ SW_ALLOWED_ORIGINS: 'https://console.example.com' });
  });
  after(async () => {
    await stop(instance);
  });

  it('accepts only the listed origins', async () => {
    const post = (origin: string): Promise<Reply> =>
      instance.client().post('/auth/login', { username: 'x', password: 'y' }, { origin });
    assert.equal((await post('https://console.example.com')).status, 401);
    assert.equal((await post(new URL(instance.base).origin)).status, 403);
  });
});

describe('sign-in without a database', () => {
  it('answers 503 with the error envelope', async () => {
    const config = loadConfig({ SW_LOG_LEVEL: 'silent', NODE_ENV: 'test' }, '0.0.0-test');
    const app = await createApp(config, { readinessChecks: [] });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as { port: number };
    try {
      const client = new Client(`http://127.0.0.1:${String(port)}/api/v1`);
      const status = await client.get('/setup/status');
      assert.equal(status.status, 503);
      assert.equal(errorCode(status), 'not_ready');
      const login = await client.post('/auth/login', { username: 'owner', password: PASSWORD });
      assert.equal(login.status, 503);
      assert.equal((await client.get('/auth/me')).status, 401);
    } finally {
      await app.close();
    }
  });
});

describe('the sealed secret', { skip: !databaseUrl }, () => {
  let instance: Instance;
  before(async () => {
    instance = await start();
  });
  after(async () => {
    await stop(instance);
  });

  it('cannot be read with another authentication key', async () => {
    const { secret } = await createOwner(instance);
    const { SecretBox } = await import('./secret-box.js');
    const row = await instance.isolated.database.client.credential.findFirstOrThrow();
    assert.ok(row.totpSecret);
    assert.deepEqual(
      base32Encode(
        new SecretBox(Buffer.from(AUTH_KEY, 'base64')).open(
          row.totpSecret,
          `swellwright:totp:v1:${row.userId}`,
        ),
      ),
      secret,
    );
    assert.throws(() =>
      new SecretBox(Buffer.alloc(32, 2)).open(
        row.totpSecret ?? new Uint8Array(),
        `swellwright:totp:v1:${row.userId}`,
      ),
    );
    assert.throws(() =>
      new SecretBox(Buffer.from(AUTH_KEY, 'base64')).open(
        row.totpSecret ?? new Uint8Array(),
        'swellwright:totp:v1:someone-else',
      ),
    );
  });
});
