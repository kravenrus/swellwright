import 'reflect-metadata';

import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ApiErrorSchema,
  UpdatesResponseSchema,
  type UpdatesResponse,
  VersionResponseSchema,
} from '@swellwright/contracts';

import { createApp } from '../bootstrap.js';
import { loadConfig } from '../config.js';
import {
  auditEvents,
  createOwner,
  databaseUrl,
  signInAs,
  start,
  stop,
  type Instance,
} from '../test-support.js';
import {
  FIRST_ANSWER_WAIT_MS,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RETRY_MS,
  UpdatesService,
} from './updates.service.js';

const REPO = 'swellwright/swellwright';
const RELEASE_URL = 'https://github.com/swellwright/swellwright/releases/tag/v1.2.3';
const START = Date.UTC(2026, 10, 19, 12, 0, 0);

interface Hit {
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
}

interface Answer {
  status: number;
  body: string;
}

/** A stand-in for api.github.com on the same machine: records every request and answers what it is told to. */
class FakeGithub {
  readonly hits: Hit[] = [];
  repository: Answer = { status: 200, body: JSON.stringify({ stargazers_count: 42 }) };
  release: Answer = {
    status: 200,
    body: JSON.stringify({ tag_name: 'v1.2.3', html_url: RELEASE_URL }),
  };
  /** While set, the answer for the repository waits for it. */
  private gate: Promise<void> | undefined;
  private server: Server | undefined;

  hold(): () => void {
    let open = (): void => undefined;
    this.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return () => {
      this.gate = undefined;
      open();
    };
  }

  async listen(): Promise<string> {
    const server = createServer((req, res) => {
      const path = req.url ?? '';
      this.hits.push({ path, headers: req.headers });
      const answer = (a: Answer): void => {
        res.writeHead(a.status, { 'content-type': 'application/json' });
        res.end(a.body);
      };
      if (path === `/repos/${REPO}`) {
        const gate = this.gate;
        if (gate) {
          void gate.then(() => {
            answer(this.repository);
          });
        } else {
          answer(this.repository);
        }
      } else if (path === `/repos/${REPO}/releases/latest`) {
        answer(this.release);
      } else {
        answer({ status: 404, body: '{"message":"Not Found"}' });
      }
    });
    this.server = server;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
}

interface Rig {
  readonly service: UpdatesService;
  readonly github: FakeGithub;
  readonly clock: { now: number };
  readonly app: NestExpressApplication;
  readonly base: string;
}

/** An application whose update check asks the stand-in, with a clock the test moves. */
async function withRig(
  env: Record<string, string>,
  run: (rig: Rig) => Promise<void>,
): Promise<void> {
  const github = new FakeGithub();
  const apiBase = await github.listen();
  const clock = { now: START };
  const config = loadConfig(
    { SW_LOG_LEVEL: 'silent', NODE_ENV: 'test', SW_UPDATE_API_BASE: apiBase, ...env },
    '0.0.0-test',
  );
  const app = await createApp(config, { readinessChecks: [], clock: () => clock.now });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  try {
    await run({
      service: app.get(UpdatesService),
      github,
      clock,
      app,
      base: `http://127.0.0.1:${String(port)}/api/v1`,
    });
  } finally {
    await app.close();
    await github.close();
  }
}

const nothing: Omit<UpdatesResponse, 'enabled' | 'repositoryUrl'> = {
  latestVersion: null,
  releaseUrl: null,
  stars: null,
  checkedAt: null,
};

describe('the update check', () => {
  it('asks for the repository and its latest release, and answers with both', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      const answer = await service.current();
      assert.deepEqual(answer, {
        enabled: true,
        latestVersion: '1.2.3',
        releaseUrl: RELEASE_URL,
        stars: 42,
        repositoryUrl: `https://github.com/${REPO}`,
        checkedAt: new Date(clock.now).toISOString(),
      });
      assert.ok(UpdatesResponseSchema.safeParse(answer).success);
      assert.deepEqual(
        github.hits.map((h) => h.path),
        [`/repos/${REPO}`, `/repos/${REPO}/releases/latest`],
      );
    });
  });

  it('sends a plain GET: the project and its version, nothing that identifies anyone', async () => {
    await withRig({ SW_VERSION: '1.4.0+build 7' }, async ({ service, github }) => {
      await service.current();
      assert.equal(github.hits.length, 2);
      for (const { headers } of github.hits) {
        assert.equal(headers.accept, 'application/vnd.github+json');
        assert.equal(headers['user-agent'], 'swellwright/1.4.0+build-7');
        assert.equal(headers['x-github-api-version'], '2022-11-28');
        for (const name of [
          'cookie',
          'authorization',
          'referer',
          'origin',
          'x-request-id',
          'x-forwarded-for',
          'x-sw-instance',
        ]) {
          assert.equal(headers[name], undefined, name);
        }
      }
    });
  });

  it('keeps the answer for a day and then asks again', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      await service.current();
      assert.equal(github.hits.length, 2);
      await service.current();
      clock.now += UPDATE_CHECK_INTERVAL_MS - 1;
      const cached = await service.current();
      assert.equal(github.hits.length, 2, 'a second call, and one a moment before the day is over');
      assert.equal(cached.latestVersion, '1.2.3');

      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 43 }) };
      github.release = {
        status: 200,
        body: JSON.stringify({
          tag_name: 'v1.3.0',
          html_url: 'https://github.com/x/y/releases/tag/v1.3.0',
        }),
      };
      clock.now += 1;
      const fresh = await service.current();
      assert.equal(github.hits.length, 4);
      assert.equal(fresh.latestVersion, '1.3.0');
      assert.equal(fresh.stars, 43);
      assert.equal(fresh.checkedAt, new Date(clock.now).toISOString());
    });
  });

  it('runs one check at a time: calls that arrive together share it', async () => {
    await withRig({}, async ({ service, github }) => {
      const answers = await Promise.all(Array.from({ length: 6 }, () => service.current()));
      assert.equal(github.hits.length, 2);
      for (const answer of answers) {
        assert.equal(answer.stars, 42);
      }
    });
  });

  it('does nothing at start: no request before somebody asks', async () => {
    await withRig({}, async ({ github }) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(github.hits.length, 0);
    });
  });

  it('keeps the old answer after a failure and tries again in an hour, not before', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      const first = await service.current();
      assert.equal(github.hits.length, 2);

      github.repository = { status: 500, body: '{"message":"Server Error"}' };
      clock.now += UPDATE_CHECK_INTERVAL_MS;
      const failed = await service.current();
      assert.deepEqual(failed, first, 'the old values stay, and checkedAt is the old one');
      assert.equal(github.hits.length, 3, 'one attempt');

      await service.current();
      clock.now += UPDATE_RETRY_MS - 1;
      await service.current();
      assert.equal(github.hits.length, 3, 'nothing for an hour after the failure');

      clock.now += 1;
      await service.current();
      assert.equal(github.hits.length, 4, 'the hour is over: one more attempt, failing again');
      clock.now += UPDATE_RETRY_MS - 1;
      await service.current();
      assert.equal(github.hits.length, 4, 'and an hour again');

      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 50 }) };
      clock.now += 1;
      const healed = await service.current();
      assert.equal(github.hits.length, 6);
      assert.equal(healed.stars, 50);
      assert.equal(healed.checkedAt, new Date(clock.now).toISOString());
      clock.now += UPDATE_CHECK_INTERVAL_MS - 1;
      await service.current();
      assert.equal(github.hits.length, 6, 'a success is good for a day again');
    });
  });

  it('keeps the star count when only the release request fails', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      await service.current();
      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 77 }) };
      github.release = { status: 503, body: '' };
      clock.now += UPDATE_CHECK_INTERVAL_MS;
      const answer = await service.current();
      assert.equal(answer.stars, 77);
      assert.equal(answer.latestVersion, '1.2.3');
      clock.now += UPDATE_RETRY_MS;
      github.release = {
        status: 200,
        body: JSON.stringify({ tag_name: '2.0.0-rc.1', html_url: RELEASE_URL }),
      };
      assert.equal((await service.current()).latestVersion, '2.0.0-rc.1');
    });
  });

  it('answers null for the version when the repository has no release (404), and keeps the stars', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      github.release = { status: 404, body: '{"message":"Not Found"}' };
      const none = await service.current();
      assert.deepEqual(none, {
        enabled: true,
        latestVersion: null,
        releaseUrl: null,
        stars: 42,
        repositoryUrl: `https://github.com/${REPO}`,
        checkedAt: new Date(START).toISOString(),
      });
      // The first release appears; and when it is deleted again the answer goes back to nothing.
      github.release = {
        status: 200,
        body: JSON.stringify({ tag_name: 'v0.1.0', html_url: RELEASE_URL }),
      };
      clock.now += UPDATE_CHECK_INTERVAL_MS;
      assert.equal((await service.current()).latestVersion, '0.1.0');
      github.release = { status: 404, body: '{"message":"Not Found"}' };
      clock.now += UPDATE_CHECK_INTERVAL_MS;
      const again = await service.current();
      assert.equal(again.latestVersion, null);
      assert.equal(again.releaseUrl, null);
    });
  });

  it('is a failure, not an answer, when the repository itself is not found', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      github.repository = { status: 404, body: '{"message":"Not Found"}' };
      const answer = await service.current();
      assert.deepEqual(answer, {
        enabled: true,
        ...nothing,
        repositoryUrl: `https://github.com/${REPO}`,
      });
      assert.equal(
        github.hits.length,
        1,
        'no question about releases of a repository that is not there',
      );
      clock.now += UPDATE_RETRY_MS;
      await service.current();
      assert.equal(github.hits.length, 2);
    });
  });

  it('sends nothing, ever, when the check is switched off', async () => {
    await withRig({ SW_UPDATE_CHECK: 'off' }, async ({ service, github, clock, base }) => {
      const answer = await service.current();
      assert.deepEqual(answer, {
        enabled: false,
        ...nothing,
        repositoryUrl: `https://github.com/${REPO}`,
      });
      clock.now += 10 * UPDATE_CHECK_INTERVAL_MS;
      await service.current();
      await service.current();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(github.hits.length, 0);
      // And the HTTP route says the same without a request (it is refused without a session).
      assert.equal((await fetch(`${base}/updates`)).status, 401);
      assert.equal(github.hits.length, 0);
    });
  });

  it('ignores an answer that is not JSON, and does not throw', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      github.repository = { status: 200, body: '{not json' };
      const bad = await service.current();
      assert.equal(bad.stars, null);
      assert.equal(bad.latestVersion, null);
      assert.equal(bad.checkedAt, null);
      assert.equal(github.hits.length, 1);

      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 5 }) };
      github.release = { status: 200, body: '<html>rate limited</html>' };
      clock.now += UPDATE_RETRY_MS;
      const partial = await service.current();
      assert.equal(partial.stars, 5, 'what was understood is kept');
      assert.equal(partial.latestVersion, null);
      assert.equal(github.hits.length, 3);
    });
  });

  it('ignores answers of the wrong shape and links that are not https', async () => {
    await withRig({}, async ({ service, github, clock }) => {
      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 'many' }) };
      assert.equal((await service.current()).stars, null);
      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: -3 }) };
      clock.now += UPDATE_RETRY_MS;
      assert.equal((await service.current()).stars, null);
      github.repository = { status: 200, body: '[]' };
      clock.now += UPDATE_RETRY_MS;
      assert.equal((await service.current()).stars, null);

      github.repository = { status: 200, body: JSON.stringify({ stargazers_count: 9 }) };
      for (const body of [
        JSON.stringify({ tag_name: 5 }),
        JSON.stringify({ html_url: RELEASE_URL }),
        JSON.stringify({ tag_name: 'v1.0 <script>' }),
        JSON.stringify({ tag_name: '' }),
        '"v1.0.0"',
      ]) {
        github.release = { status: 200, body };
        clock.now += UPDATE_RETRY_MS;
        const answer = await service.current();
        assert.equal(answer.latestVersion, null, body);
        assert.equal(answer.stars, 9);
      }

      // A tag that is fine with a link that is not: the page comes from the settings, not from the answer.
      for (const html_url of ['javascript:alert(1)', 'http://example.com/x', 'nonsense', 5]) {
        github.release = {
          status: 200,
          body: JSON.stringify({ tag_name: 'v1.2.3', html_url }),
        };
        clock.now += UPDATE_RETRY_MS;
        const answer = await service.current();
        assert.equal(answer.latestVersion, '1.2.3');
        assert.equal(
          answer.releaseUrl,
          `https://github.com/${REPO}/releases/tag/v1.2.3`,
          String(html_url),
        );
      }
    });
  });

  it('is told "nothing yet" after a moment when GitHub is slow, and finishes in the background', async () => {
    await withRig({}, async ({ service, github }) => {
      const release = github.hold();
      const asked = Date.now();
      const slow = await service.current();
      const waited = Date.now() - asked;
      assert.ok(waited >= FIRST_ANSWER_WAIT_MS - 100, `waited ${String(waited)} ms`);
      assert.ok(waited < FIRST_ANSWER_WAIT_MS + 1500, `waited ${String(waited)} ms`);
      assert.deepEqual(slow, {
        enabled: true,
        ...nothing,
        repositoryUrl: `https://github.com/${REPO}`,
      });
      // Calls meanwhile join the same check; nothing new is asked.
      release();
      const done = await service.current();
      assert.equal(done.stars, 42);
      assert.equal(done.latestVersion, '1.2.3');
      assert.equal(github.hits.length, 2);
    });
  });

  it('lets go of a request that is still open when the application stops', async () => {
    const github = new FakeGithub();
    const apiBase = await github.listen();
    github.hold();
    const config = loadConfig(
      { SW_LOG_LEVEL: 'silent', NODE_ENV: 'test', SW_UPDATE_API_BASE: apiBase },
      '0.0.0-test',
    );
    const app = await createApp(config, { readinessChecks: [] });
    await app.listen(0, '127.0.0.1');
    const service = app.get(UpdatesService);
    void service.current();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await app.close();
    assert.ok(Date.now() - started < 2000, 'the stop did not wait for GitHub');
    await github.close();
  });
});

describe('GET /updates', () => {
  it('needs a session', async () => {
    await withRig({}, async ({ base, github }) => {
      const res = await fetch(`${base}/updates`);
      assert.equal(res.status, 401);
      assert.equal(ApiErrorSchema.parse(await res.json()).error.code, 'unauthorized');
      assert.equal(github.hits.length, 0, 'an unauthenticated call does not start a check');
    });
  });
});

describe('GET /updates and GET /version with a signed-in user', { skip: !databaseUrl }, () => {
  let github: FakeGithub;
  let instance: Instance;
  let secret: string;
  const clock = { now: START };

  before(async () => {
    github = new FakeGithub();
    const apiBase = await github.listen();
    instance = await start(
      {
        SW_UPDATE_API_BASE: apiBase,
        SW_BUILD_TIME: '2026-11-19T09:30:00Z',
        SW_BUILD_NUMBER: '314',
        SW_GIT_BRANCH: 'main',
        SW_GIT_COMMIT: '0123456789abcdef0123456789abcdef01234567',
      },
      { clock: () => clock.now },
    );
    ({ secret } = await createOwner(instance));
  });
  after(async () => {
    await stop(instance);
    await github.close();
  });

  it('answers in the contract shape and records nothing in the audit log', async () => {
    const client = await signInAs(instance, 'owner', secret);
    const before = (await auditEvents(instance)).length;
    const res = await client.get('/updates');
    assert.equal(res.status, 200);
    assert.deepEqual(UpdatesResponseSchema.parse(res.body), {
      enabled: true,
      latestVersion: '1.2.3',
      releaseUrl: RELEASE_URL,
      stars: 42,
      repositoryUrl: `https://github.com/${REPO}`,
      checkedAt: new Date(START).toISOString(),
    });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await client.get('/updates')).status, 200);
    assert.equal(github.hits.length, 2, 'two calls, one check');
    assert.equal((await auditEvents(instance)).length, before, 'reading it leaves no record');
  });

  it('reports what the build recorded in the version document, and a link to the commit', async () => {
    const res = await fetch(`${instance.base}/version`);
    const body = VersionResponseSchema.parse(await res.json());
    assert.equal(body.version, '0.0.0-test');
    assert.deepEqual(body.build, { time: '2026-11-19T09:30:00Z', number: '314' });
    assert.deepEqual(body.git, {
      branch: 'main',
      commit: '0123456789abcdef0123456789abcdef01234567',
      commitUrl: `https://github.com/${REPO}/commit/0123456789abcdef0123456789abcdef01234567`,
    });
  });
});
