import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { CommandRunViewSchema } from '@swellwright/contracts';

import { databaseUrl } from '../test-support.js';
import {
  Harness,
  PASSPHRASE,
  createGate,
  eventsOf,
  sleep,
  standardPrograms,
  until,
} from './commands-test-support.js';

describe('the runner follows a script through trouble', { skip: !databaseUrl }, () => {
  const h = new Harness();
  const gates = { split: createGate(), gate: createGate() };
  before(async () => {
    await h.open();
  });
  after(async () => {
    await h.close();
  });

  it('reconnects after a cut connection and continues by offset: nothing lost, nothing twice', async () => {
    const split = createGate();
    const host = await h.host(standardPrograms({ split }));
    const proxy = await h.proxyFor(host);
    const id = await h.server(proxy);
    const run = await h.createRun(h.operator, h.inline([id], '# fake:split\n'));
    await h.waitFor(
      run.id,
      'the first part of the output',
      (r) => r.targets[0].stdout.storedBytes > 0,
    );

    proxy.cut();
    await sleep(150);
    split.open();

    const done = await h.finished(run.id);
    assert.equal(done.state, 'succeeded');
    const target = done.targets[0];
    assert.equal(target?.stdout.tail, 'part one\npart two\n', 'complete, in order, once');
    assert.equal(target.stderr.tail, 'warning at the end\n');
    assert.equal(host.launches.created, 1, 'the script was started once');
    assert.equal(host.launches.attached, 0, 'and not started again after the reconnect');
    assert.ok(host.server.connections >= 2, 'a second connection was made');
  });

  it('waits for a server that is out of reach, and gives it up as lost after the limit', async () => {
    const lost = new Harness();
    await lost.open({ SW_COMMAND_LOST_AFTER_MINUTES: '0.03' });
    try {
      const host = await lost.host(standardPrograms());
      const proxy = await lost.proxyFor(host);
      const id = await lost.server(proxy);
      const run = await lost.createRun(lost.operator, lost.inline([id], '# fake:forever\n'));
      await lost.waitFor(run.id, 'output', (r) => r.targets[0].stdout.storedBytes > 0);
      await proxy.close();
      // For a while the script is simply out of reach: the target says so, and is still running.
      const waiting = await lost.waitFor(
        run.id,
        'the waiting note',
        (r) => r.targets[0].waiting === 'ssh_connect_failed',
      );
      assert.equal(waiting.targets[0].state, 'running', 'the script is not affected');
      const done = await lost.finished(run.id, 30_000);
      assert.equal(done.targets[0].state, 'lost');
      assert.equal(done.targets[0].errorCode, 'unreachable');
      assert.equal(done.state, 'failed');
    } finally {
      await lost.close();
    }
  });

  it('waits while the vault is sealed and finishes when it is opened again', async () => {
    const host = await h.host(standardPrograms({ gate: gates.gate }));
    const id = await h.server(host);
    const run = await h.createRun(h.operator, h.inline([id], '# fake:gate\n'));
    await h.waitFor(run.id, 'the first output', (r) => r.targets[0].stdout.storedBytes > 0);

    assert.equal((await h.owner.post('/vault/seal')).status, 200);
    const waiting = await h.waitFor(
      run.id,
      'the sealed vault',
      (r) => r.targets[0].waiting === 'vault_sealed',
    );
    assert.equal(waiting.targets[0].state, 'running');
    gates.gate.open();
    await sleep(200);
    assert.equal(
      (await h.getRun(run.id)).state,
      'running',
      'it cannot be read while the vault is sealed',
    );

    assert.equal((await h.owner.post('/vault/unseal', { passphrase: PASSPHRASE })).status, 200);
    const done = await h.finished(run.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(done.targets[0].stdout.tail, 'waiting\nreleased\n');
    assert.equal(done.targets[0].waiting, null);
  });

  it('marks a server lost when the record of the run has vanished from it', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    const run = await h.createRun(h.operator, h.inline([id], '# fake:forever\n'));
    const started = await h.waitFor(run.id, 'output', (r) => r.targets[0].stdout.storedBytes > 0);
    host.forget(`sw-${started.targets[0].id}`);
    const done = await h.finished(run.id);
    assert.equal(done.targets[0].state, 'lost');
    assert.equal(done.targets[0].errorCode, 'step_lost');
    assert.equal(done.targets[0].stdout.tail, 'started\n', 'what was read before is kept');
  });

  it('stops a script that runs too long, and says it was the time', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    const run = await h.createRun(
      h.operator,
      h.inline([id], '# fake:forever\n', { timeoutSeconds: 1 }),
    );
    const done = await h.finished(run.id);
    assert.equal(done.state, 'failed');
    const target = done.targets[0];
    assert.equal(target?.state, 'failed');
    assert.equal(target.errorCode, 'timeout');
    assert.match(target.errorMessage ?? '', /1 seconds/u);
    assert.equal(target.exitCode, 143);
    assert.equal(host.removed.length, 1, 'its record is removed after the output was kept');
  });

  it('fails a server that cannot start the script and shows why', async () => {
    const host = await h.host(standardPrograms(), { launchFailure: 'sudo failed' });
    const id = await h.server(host);
    const done = await h.finished(
      (await h.createRun(h.operator, h.inline([id], '# fake:hello\n', { sudo: true }))).id,
    );
    assert.equal(done.targets[0].state, 'failed');
    assert.equal(done.targets[0].errorCode, 'start_failed');
    assert.match(done.targets[0].errorMessage ?? '', /sudo failed/u);
  });

  it('fails a server that does not answer at all after two tries, and goes on with the others', async () => {
    const host = await h.host(standardPrograms());
    const gone = await h.host(standardPrograms());
    const goneId = await h.server(gone);
    await gone.close();
    const id = await h.server(host);
    const done = await h.finished(
      (await h.createRun(h.operator, h.inline([goneId, id], '# fake:hello\n'))).id,
    );
    assert.equal(done.state, 'partial');
    assert.equal(done.targets[0].state, 'failed');
    assert.equal(done.targets[0].errorCode, 'ssh_connect_failed');
    assert.equal(done.targets[1].state, 'succeeded');
  });

  it('ends a target whose server was deleted, with the others unaffected', async () => {
    const host = await h.host(standardPrograms({ gate: gates.gate }));
    const doomed = await h.server(host, { name: 'doomed' });
    const other = await h.server(host, { name: 'other' });
    const fresh = createGate();
    gates.gate = fresh;
    const run = await h.createRun(h.operator, h.inline([doomed, other], '# fake:forever\n'));
    await h.waitFor(run.id, 'both running', (r) =>
      r.targets.every((t) => t.stdout.storedBytes > 0),
    );
    assert.equal((await h.owner.call('DELETE', `/servers/${doomed}`)).status, 204);
    const afterDelete = await h.waitFor(
      run.id,
      'the deleted server to end',
      (r) => r.targets[0].state === 'failed',
    );
    assert.equal(afterDelete.targets[0].errorCode, 'server_deleted');
    assert.equal(afterDelete.targets[0].serverId, null);
    assert.equal(afterDelete.targets[0].serverName, 'doomed', 'the name it had is kept');
    assert.equal(afterDelete.targets[1].state, 'running');
    assert.equal((await h.operator.post(`/command-runs/${run.id}/cancel`)).status, 200);
    const done = await h.finished(run.id);
    assert.equal(done.targets[1].state, 'cancelled');
  });
});

describe('stopping a run', { skip: !databaseUrl }, () => {
  const h = new Harness();
  before(async () => {
    await h.open({ SW_COMMAND_CONCURRENCY: '2' });
  });
  after(async () => {
    await h.close();
  });

  it('stops the servers that run and cancels the ones that never started', async () => {
    const host = await h.host(standardPrograms());
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      ids.push(await h.server(host));
    }
    const run = await h.createRun(h.operator, h.inline(ids, '# fake:forever\n'));
    await h.waitFor(
      run.id,
      'two servers running',
      (r) =>
        r.counts.running === 2 && r.targets.filter((t) => t.stdout.storedBytes > 0).length === 2,
    );
    assert.equal((await h.getRun(run.id)).counts.pending, 2, 'two wait for a free slot');

    const reply = await h.operator.post(`/command-runs/${run.id}/cancel`);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    assert.ok(CommandRunViewSchema.parse(reply.body).cancelRequestedAt);

    const done = await h.finished(run.id);
    assert.equal(done.state, 'cancelled');
    assert.deepEqual(
      done.targets.map((t) => t.state),
      ['cancelled', 'cancelled', 'cancelled', 'cancelled'],
    );
    const started = done.targets.filter((t) => t.exitCode !== null);
    assert.equal(started.length, 2);
    assert.ok(
      started.every((t) => t.exitCode === 143),
      'the script got TERM',
    );
    assert.equal(
      done.targets.filter((t) => t.startedAt === null).length,
      2,
      'the others never started',
    );
    assert.equal(host.launches.created, 2, 'no more than the two that had a slot');
    assert.equal(host.maxRunning, 2, 'never more than the limit at once');
    const cancelled = (await eventsOf(h.instance, 'command.run.cancelled')).filter(
      (e) => e.object?.id === run.id,
    );
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0]?.actor?.name, 'ops');
    assert.equal(cancelled[0].details['running'], 2);
    assert.equal(cancelled[0].details['cancelled_before_start'], 2);
    const finished = (await eventsOf(h.instance, 'command.run.finished')).filter(
      (e) => e.object?.id === run.id,
    );
    assert.equal(finished.length, 1);
    assert.equal(finished[0]?.details['state'], 'cancelled');
    assert.equal(finished[0].outcome, 'failure');
  });

  it('is harmless to ask twice, even at once, and refuses a run that has ended', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    const run = await h.createRun(h.operator, h.inline([id], '# fake:forever\n'));
    await h.waitFor(run.id, 'running', (r) => r.targets[0].stdout.storedBytes > 0);
    const [first, second] = await Promise.all([
      h.operator.post(`/command-runs/${run.id}/cancel`),
      h.owner.post(`/command-runs/${run.id}/cancel`),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const done = await h.finished(run.id);
    assert.equal(done.state, 'cancelled');
    const recorded = (await eventsOf(h.instance, 'command.run.cancelled')).filter(
      (e) => e.object?.id === run.id,
    );
    assert.equal(recorded.length, 1, 'one record, whoever came first');
    const late = await h.operator.post(`/command-runs/${run.id}/cancel`);
    assert.equal(late.status, 409);
    assert.equal(
      (await h.operator.post('/command-runs/0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b/cancel')).status,
      404,
    );
  });

  it('stops a script whose launch is still on its way when the request comes', async () => {
    const launch = createGate();
    const host = await h.host(standardPrograms(), { launchGate: launch.promise });
    const id = await h.server(host);
    const run = await h.createRun(h.operator, h.inline([id], '# fake:forever\n'));
    await until('the launch to arrive', () => host.launchesWaiting > 0);
    assert.equal((await h.operator.post(`/command-runs/${run.id}/cancel`)).status, 200);
    launch.open();
    const done = await h.finished(run.id);
    assert.equal(done.state, 'cancelled');
    assert.equal(done.targets[0].state, 'cancelled');
    assert.equal(host.runningSteps().length, 0, 'nothing is left running on the server');
  });

  it('cancels a run that has not reached its servers at all', async () => {
    const host = await h.host(standardPrograms());
    const ids = [await h.server(host), await h.server(host), await h.server(host)];
    const run = await h.createRun(h.operator, h.inline(ids, '# fake:forever\n'));
    const reply = await h.operator.post(`/command-runs/${run.id}/cancel`);
    assert.equal(reply.status, 200);
    const done = await h.finished(run.id);
    assert.equal(done.state, 'cancelled');
    assert.ok(done.targets.every((t) => t.state === 'cancelled'));
    await sleep(100);
    assert.equal(host.runningSteps().length, 0);
  });

  it('works at most as many servers at the same time as the setting says, and finishes all of them', async () => {
    const release = createGate();
    const host = await h.host(standardPrograms({ gate: release }));
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      ids.push(await h.server(host));
    }
    const run = await h.createRun(h.operator, h.inline(ids, '# fake:gate\n'));
    await h.waitFor(run.id, 'the first two to wait at the gate', (r) => r.counts.running === 2);
    await sleep(200);
    assert.equal(host.maxRunning, 2, 'two at a time');
    release.open();
    const done = await h.finished(run.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(host.launches.created, 5);
    assert.equal(host.maxRunning, 2);
  });
});

describe('the output limit', { skip: !databaseUrl }, () => {
  const h = new Harness();
  before(async () => {
    await h.open({ SW_COMMAND_OUTPUT_LIMIT_KIB: '16' });
  });
  after(async () => {
    await h.close();
  });

  it('keeps the beginning, says that the rest was cut and how much there was, and leaves the full copy on the server', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    const run = await h.finished(
      (await h.createRun(h.operator, h.inline([id], '# fake:big\n'))).id,
    );
    const target = run.targets[0];
    assert.ok(target);
    assert.equal(run.state, 'succeeded', 'the script itself succeeded');
    assert.equal(target.stdout.storedBytes, 16 * 1024);
    assert.equal(target.stdout.totalBytes, 40 * 1024);
    assert.equal(target.stdout.truncated, true);
    assert.equal(target.stderr.truncated, false);
    assert.equal(target.stdout.tail.length, 16 * 1024);
    assert.ok(/^x+$/u.test(target.stdout.tail));
    assert.equal(host.removed.length, 0, 'the only complete copy stays on the server');
    assert.equal(host.steps.size, 1);
    const page = await h.observer.get(
      `/command-runs/${run.id}/targets/${target.id}/output?stream=stdout&offset=16000&limit=1000`,
    );
    assert.equal(page.status, 200);
    const body = page.body as {
      text: string;
      nextOffset: number;
      eof: boolean;
      truncated: boolean;
    };
    assert.equal(body.text.length, 384);
    assert.equal(body.nextOffset, 16384);
    assert.equal(body.eof, true);
    assert.equal(body.truncated, true);
  });
});

describe('a restart of the server during a run', { skip: !databaseUrl }, () => {
  const h = new Harness();
  before(async () => {
    await h.open();
  });
  after(async () => {
    await h.close();
  });

  it('takes the run up again, once the vault is open, and ends with the whole output', async () => {
    const split = createGate();
    const host = await h.host(standardPrograms({ split }));
    const ids = [await h.server(host), await h.server(host)];
    const run = await h.createRun(h.operator, h.inline(ids, '# fake:split\n'));
    await h.waitFor(run.id, 'part one of both', (r) =>
      r.targets.every((t) => t.stdout.storedBytes > 0),
    );
    const before = await h.getRun(run.id);
    assert.equal(before.state, 'running');

    await h.restart();

    // The vault is sealed after a restart: the run waits, and says so, and nothing is lost on the server.
    const waiting = await h.waitFor(run.id, 'the waiting note', (r) =>
      r.targets.every((t) => t.waiting === 'vault_sealed'),
    );
    assert.equal(waiting.state, 'running');
    split.open();
    await sleep(150);
    assert.equal((await h.getRun(run.id)).state, 'running');

    await h.stepUp(h.owner, 'owner');
    assert.equal((await h.owner.post('/vault/unseal', { passphrase: PASSPHRASE })).status, 200);
    const done = await h.finished(run.id);
    assert.equal(done.state, 'succeeded');
    for (const target of done.targets) {
      assert.equal(target.stdout.tail, 'part one\npart two\n', 'whole, once');
      assert.equal(target.stdout.storedBytes, 'part one\npart two\n'.length);
      assert.equal(target.stderr.tail, 'warning at the end\n');
      assert.equal(target.exitCode, 0);
    }
    assert.equal(host.launches.created, 2, 'started once each');
    assert.equal(host.launches.attached, 0, 'and not started again after the restart');
    const finished = (await eventsOf(h.instance, 'command.run.finished')).filter(
      (e) => e.object?.id === run.id,
    );
    assert.equal(finished.length, 1, 'closed once');
    assert.equal(host.removed.length, 2);
  });

  it('starts the servers that had not started yet, after the restart', async () => {
    const host = await h.host(standardPrograms());
    const id = await h.server(host);
    // A run whose targets nobody has touched: as if the process stopped right after the request was answered.
    const db = h.instance.isolated.database.client;
    const made = await h.createRun(h.operator, h.inline([id], '# fake:hello\n'));
    await h.finished(made.id);
    const before = host.launches.created;
    const runner = h.instance.app.get((await import('./command-runner.service.js')).CommandRunner);
    await runner.idle();
    const row = await db.commandRun.findUniqueOrThrow({ where: { id: made.id } });
    assert.equal(row.state, 'succeeded');
    // Put a second run back into the state "queued, nothing started", then restart.
    const second = await h.createRun(h.operator, h.inline([id], '# fake:hello\n'));
    await h.finished(second.id);
    await db.commandRunTarget.updateMany({
      where: { runId: second.id },
      data: {
        state: 'pending',
        startedAt: null,
        finishedAt: null,
        launched: false,
        exitCode: null,
        stepId: `sw-again-${second.id}`,
      },
    });
    await db.commandRun.update({
      where: { id: second.id },
      data: { state: 'pending', startedAt: null, finishedAt: null },
    });
    await h.restart();
    await h.stepUp(h.owner, 'owner');
    assert.equal((await h.owner.post('/vault/unseal', { passphrase: PASSPHRASE })).status, 200);
    const done = await h.finished(second.id);
    assert.equal(done.state, 'succeeded');
    assert.equal(host.launches.created, before + 2, 'the first run and the revived one');
    assert.equal(CommandRunViewSchema.parse(done).targets[0].stdout.tail, 'hello\n');
  });
});
