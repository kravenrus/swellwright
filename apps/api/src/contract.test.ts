import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Controller } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiErrorSchema, healthRoute, routes } from '@swellwright/contracts';

import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';
import { API_PREFIX, ContractRoute, toExpressPath } from './contract-route.js';
import { ApiExceptionFilter, ContractResponseInterceptor, requestContext } from './http.js';

const config = loadConfig({ SW_LOG_LEVEL: 'silent', NODE_ENV: 'test' }, '0.0.0-test');

describe('contract binding', () => {
  it('turns OpenAPI paths into Express paths', () => {
    assert.equal(toExpressPath('/runs/{id}/steps/{step}'), '/runs/:id/steps/:step');
  });

  it('serves every route of the registry (no route is only documented)', async () => {
    const app = await createApp(config, { readinessChecks: [] });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as { port: number };
    try {
      for (const route of routes) {
        const res = await fetch(`http://127.0.0.1:${String(port)}/${API_PREFIX}${route.path}`, {
          method: route.method.toUpperCase(),
        });
        assert.notEqual(
          res.status,
          404,
          `${route.method} ${route.path} is in the registry but not served`,
        );
        const listed: Readonly<Record<number, unknown>> = route.responses;
        assert.ok(
          listed[res.status],
          `${route.operationId} answered ${String(res.status)}, which its contract does not list`,
        );
      }
    } finally {
      await app.close();
    }
  });

  it('answers 500 internal_error, without leaking details, when a handler breaks its contract', async () => {
    @Controller()
    class BrokenController {
      @ContractRoute(healthRoute)
      health(): unknown {
        return { status: 'definitely-not-ok' };
      }
    }
    const app = await NestFactory.create<NestExpressApplication>(
      { module: class BrokenModule {}, controllers: [BrokenController] },
      { logger: false },
    );
    app.use(requestContext);
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ContractResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${String(port)}/${API_PREFIX}/health`);
      assert.equal(res.status, 500);
      const body = ApiErrorSchema.parse(await res.json());
      assert.equal(body.error.code, 'internal_error');
      assert.ok(!JSON.stringify(body).includes('definitely-not-ok'));
    } finally {
      await app.close();
    }
  });
});
