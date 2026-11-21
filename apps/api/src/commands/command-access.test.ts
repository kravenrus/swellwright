import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { CommandRunListSchema, CommandRunViewSchema } from '@swellwright/contracts';

import { databaseUrl, errorCode } from '../test-support.js';
import { Harness, standardPrograms } from './commands-test-support.js';

describe('who may read, run and stop', { skip: !databaseUrl }, () => {
  const h = new Harness();
  let serverId = '';
  let runId = '';
  let targetId = '';

  before(async () => {
    await h.open();
    const host = await h.host(standardPrograms());
    serverId = await h.server(host);
    const run = await h.finished(
      (await h.createRun(h.operator, h.inline([serverId], '# fake:hello\n'))).id,
    );
    runId = run.id;
    targetId = run.targets[0]?.id ?? '';
  });
  after(async () => {
    await h.close();
  });

  const body = () => h.inline([serverId], '# fake:hello\n');

  it('lets everybody who may read servers read the history and the output, the auditor and the observer included', async () => {
    for (const client of [h.observer, h.auditor, h.operator, h.owner]) {
      const list = await client.get('/command-runs');
      assert.equal(list.status, 200);
      assert.ok(CommandRunListSchema.parse(list.body).total >= 1);
      assert.equal((await client.get(`/command-runs/${runId}`)).status, 200);
      assert.equal(
        (await client.get(`/command-runs/${runId}/targets/${targetId}/output?stream=stdout`))
          .status,
        200,
      );
      assert.equal((await client.get('/scripts')).status, 200);
    }
  });

  it('lets nobody who is not signed in see or do anything', async () => {
    const anonymous = h.instance.client();
    assert.equal((await anonymous.get('/command-runs')).status, 401);
    assert.equal((await anonymous.get(`/command-runs/${runId}`)).status, 401);
    assert.equal(
      (await anonymous.get(`/command-runs/${runId}/targets/${targetId}/output?stream=stdout`))
        .status,
      401,
    );
    assert.equal((await anonymous.post('/command-runs', body())).status, 401);
    assert.equal((await anonymous.post(`/command-runs/${runId}/cancel`)).status, 401);
  });

  it('does not let a role without servers:exec start or stop a run', async () => {
    for (const client of [h.observer, h.auditor]) {
      const started = await client.post('/command-runs', body());
      assert.equal(started.status, 403);
      assert.equal(errorCode(started), 'forbidden');
      assert.equal((await client.post(`/command-runs/${runId}/cancel`)).status, 403);
    }
    const events = await h.instance.isolated.database.client.commandRun.count();
    assert.equal(events, 1, 'nothing was queued');
  });

  it('asks the operator for a fresh code, and runs once it was given', async () => {
    await h.lapse();
    const late = await h.operator.post('/command-runs', body());
    assert.equal(late.status, 403);
    assert.equal(errorCode(late), 'step_up_required');
    assert.equal(
      errorCode(await h.operator.post(`/command-runs/${runId}/cancel`)),
      'step_up_required',
    );
    assert.equal((await h.owner.post('/command-runs', body())).status, 403, 'the owner too');
    assert.equal((await h.owner.get('/command-runs')).status, 200, 'reading needs no code');
    await h.stepUp(h.operator, 'ops');
    await h.stepUp(h.owner, 'owner');
    const reply = await h.operator.post('/command-runs', body());
    assert.equal(reply.status, 201, JSON.stringify(reply.body));
    await h.finished(CommandRunViewSchema.parse(reply.body).id);
  });

  it('keeps the permission out of reach of an API token, and the routes closed to one that has servers:read', async () => {
    const minted = await h.owner.post('/tokens', { name: 'ci', permissions: ['servers:exec'] });
    assert.equal(minted.status, 400, 'a token cannot hold a permission that needs a code');
    const ok = await h.owner.post('/tokens', { name: 'reader', permissions: ['servers:read'] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const token = (ok.body as { token: string }).token;
    const bearer = { authorization: `Bearer ${token}` };
    const client = h.instance.client();
    assert.equal((await client.call('GET', '/command-runs', undefined, bearer)).status, 200);
    assert.equal(
      (await client.call('GET', `/command-runs/${runId}`, undefined, bearer)).status,
      200,
    );
    assert.equal((await client.call('GET', '/scripts', undefined, bearer)).status, 200);
    assert.equal((await client.call('POST', '/command-runs', body(), bearer)).status, 401);
    assert.equal(
      (await client.call('POST', `/command-runs/${runId}/cancel`, undefined, bearer)).status,
      401,
    );
    assert.equal(
      (
        await client.call(
          'POST',
          '/scripts',
          {
            name: 'x',
            description: 'x',
            dangerLevel: 'read',
            sudo: false,
            parameters: [],
            body: 'x',
          },
          bearer,
        )
      ).status,
      401,
    );
  });
});

describe('the rate limit on runs', { skip: !databaseUrl }, () => {
  const h = new Harness();
  before(async () => {
    await h.open({ SW_COMMAND_RATE_LIMIT_PER_MINUTE: '3' });
  });
  after(async () => {
    await h.close();
  });

  it('refuses the fourth run of a minute with 429 and a Retry-After, and counts per user', async () => {
    // A server that cannot be used makes a run that ends at once: nothing is sent anywhere.
    const host = await h.host(standardPrograms());
    const id = await h.server(host, { access: false });
    const body = h.inline([id], 'uptime');
    for (let index = 0; index < 3; index += 1) {
      assert.equal((await h.operator.post('/command-runs', body)).status, 201);
    }
    const refused = await h.operator.post('/command-runs', body);
    assert.equal(refused.status, 429);
    assert.equal(errorCode(refused), 'rate_limited');
    assert.ok(Number(refused.headers.get('retry-after')) > 0);
    assert.equal(
      (await h.owner.post('/command-runs', body)).status,
      201,
      'another user has a limit of their own',
    );
    assert.equal(host.launches.created, 0);
  });
});

describe('what the run does not do', { skip: !databaseUrl }, () => {
  const h = new Harness();
  before(async () => {
    await h.open();
  });
  after(async () => {
    await h.close();
  });

  it('never puts a password, a key or the text of a command into an answer, a list or the audit log', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    const run = await h.finished(
      (await h.createRun(h.operator, h.inline([id], '# fake:hello\n', { sudo: true }))).id,
    );
    const everything = JSON.stringify([
      run,
      (await h.owner.get('/command-runs')).body,
      (await h.owner.get('/audit?limit=200')).body,
    ]);
    for (const secret of [
      'the-login-password-for-command-tests',
      'the-sudo-password-for-command-tests',
      'not-the-password-of-anybody',
    ]) {
      assert.ok(!everything.includes(secret), 'a secret leaked');
    }
    // The text of the command is in the run (that is its record) but not in the audit log.
    const audit = JSON.stringify((await h.owner.get('/audit?limit=200')).body);
    assert.ok(!audit.includes('fake:hello'));
    assert.ok(audit.includes(run.bodySha256));
  });
});
