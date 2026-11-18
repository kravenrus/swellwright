import 'reflect-metadata';

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiErrorSchema } from '@swellwright/contracts';

import { CONSOLE_CSP, consoleHeaders, createApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { auditEvents, databaseUrl, found, type Instance, start, stop } from './test-support.js';

describe('serving the console from the API', () => {
  let dir: string;
  let app: NestExpressApplication;
  let base: string;
  let port: number;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sw-web-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    await writeFile(join(dir, 'assets', 'app.1a2b3c.js'), 'console.log(1);');
    await writeFile(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(join(dir, '.secret'), 'not for the web');
    const config = loadConfig(
      { SW_LOG_LEVEL: 'silent', NODE_ENV: 'test', SW_WEB_DIR: dir },
      '0.0.0-test',
    );
    app = await createApp(config, { readinessChecks: [] });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
    base = `http://127.0.0.1:${String(port)}`;
  });
  after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('serves the page at the root, never cached, with the headers that keep it safe', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/u);
    assert.equal(await res.text(), '<!doctype html><div id="root"></div>');
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
    // Present and forbidding framing. The exact policy is checked below, not on the wire: a content filter on
    // the machine running the tests may add its own hosts to it.
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/u);
  });

  it('sets the page headers exactly: the policy, no caching of the page, long caching of hashed assets', () => {
    const headersFor = (filePath: string): Map<string, string> => {
      const set = new Map<string, string>();
      consoleHeaders(
        {
          setHeader(name: string, value: string) {
            set.set(name, value);
          },
        },
        filePath,
      );
      return set;
    };
    const page = headersFor(join('web', 'index.html'));
    assert.equal(page.get('content-security-policy'), CONSOLE_CSP);
    assert.equal(page.get('cache-control'), 'no-cache');
    assert.equal(page.get('x-frame-options'), 'DENY');
    assert.equal(page.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(
      headersFor(join('web', 'assets', 'a.js')).get('cache-control'),
      'public, max-age=31536000, immutable',
    );
    assert.equal(headersFor(join('web', 'logo.svg')).get('cache-control'), 'public, max-age=3600');
  });

  it('forbids what the console never needs', () => {
    for (const rule of [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ]) {
      assert.ok(CONSOLE_CSP.includes(rule), rule);
    }
    assert.ok(!/script-src[^;]*unsafe/u.test(CONSOLE_CSP), 'no inline or eval scripts');
  });

  it('lets the browser keep hashed assets for good and other files for an hour', async () => {
    const asset = await fetch(`${base}/assets/app.1a2b3c.js`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const icon = await fetch(`${base}/favicon.svg`);
    assert.equal(icon.headers.get('cache-control'), 'public, max-age=3600');
  });

  it('leaves the API alone: its answers are JSON, uncached, without the page headers', async () => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('content-security-policy'), null);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  it('answers an unknown path with 404, not with the page; unknown API paths with the error envelope', async () => {
    // The console has no paths of its own (no client-side routing), so nothing falls back to index.html.
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    const res = await fetch(`${base}/api/v1/nope`);
    assert.equal(res.status, 404);
    assert.equal(ApiErrorSchema.parse(await res.json()).error.code, 'not_found');
  });

  it('does not serve dotfiles, and does not leave the directory', async () => {
    assert.equal((await fetch(`${base}/.secret`)).status, 404);
    // fetch tidies `..` away, so the raw request is made by hand.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port, path: '/%2e%2e/%2e%2e/etc/passwd', method: 'GET' },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.ok(status === 403 || status === 404, `got ${String(status)}`);
  });
});

describe('serving the console: misconfiguration', () => {
  it('refuses to start when the directory has no page', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sw-empty-'));
    try {
      const config = loadConfig(
        { SW_LOG_LEVEL: 'silent', NODE_ENV: 'test', SW_WEB_DIR: dir },
        '0.0.0-test',
      );
      await assert.rejects(
        createApp(config, { readinessChecks: [] }),
        /SW_WEB_DIR has no index\.html/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serves no page when no directory is set', async () => {
    const config = loadConfig({ SW_LOG_LEVEL: 'silent', NODE_ENV: 'test' }, '0.0.0-test');
    assert.equal(config.webDir, undefined);
    const app = await createApp(config, { readinessChecks: [] });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as { port: number };
    try {
      assert.equal((await fetch(`http://127.0.0.1:${String(port)}/`)).status, 404);
    } finally {
      await app.close();
    }
  });
});

describe('trusted proxies in the configuration', () => {
  const trust = (value: string): unknown =>
    loadConfig({ SW_TRUSTED_PROXIES: value }, 'v').trustProxy;

  it('trusts nobody by default', () => {
    assert.equal(loadConfig({}, 'v').trustProxy, false);
    assert.equal(loadConfig({ SW_TRUSTED_PROXIES: '' }, 'v').trustProxy, false);
  });

  it('takes a number of hops, or names, addresses and ranges', () => {
    assert.equal(trust('1'), 1);
    assert.equal(trust(' 2 '), 2);
    assert.deepEqual(trust('loopback, uniquelocal'), ['loopback', 'uniquelocal']);
    assert.deepEqual(trust('10.0.0.0/8,172.16.0.1,fd00::/8'), [
      '10.0.0.0/8',
      '172.16.0.1',
      'fd00::/8',
    ]);
    assert.deepEqual(trust('loopback,'), ['loopback']);
  });

  it('refuses what looks like a typo, instead of trusting more than was meant', () => {
    for (const bad of ['0', '11', 'everyone', 'loopback,everyone', 'true', '300.1.1.1', ',']) {
      assert.throws(() => trust(bad), /SW_TRUSTED_PROXIES/u, bad);
    }
  });
});

describe('the address of the client behind a proxy', { skip: !databaseUrl }, () => {
  let trusting: Instance;
  let plain: Instance;

  before(async () => {
    trusting = await start({ SW_TRUSTED_PROXIES: 'loopback' });
    plain = await start();
  });
  after(async () => {
    await stop(trusting);
    await stop(plain);
  });

  const failedLoginAddress = async (instance: Instance): Promise<string | null> => {
    const reply = await instance
      .client()
      .post(
        '/auth/login',
        { username: 'nobody', password: 'x' },
        { 'x-forwarded-for': '203.0.113.9' },
      );
    assert.equal(reply.status, 401);
    const event = found(
      (await auditEvents(instance)).find((e) => e.action === 'auth.login.failed'),
      'the failed sign-in event',
    );
    return event.ip;
  };

  it('is read from X-Forwarded-For when the proxy is trusted', async () => {
    assert.equal(await failedLoginAddress(trusting), '203.0.113.9');
  });

  it('is the address of the connection when nobody is trusted, whatever the header says', async () => {
    const address = await failedLoginAddress(plain);
    assert.notEqual(address, '203.0.113.9');
    assert.match(address ?? '', /127\.0\.0\.1$/u);
  });
});
