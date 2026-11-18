import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule, type AppOptions } from './app.module.js';
import { type AppConfig } from './config.js';
import { API_PREFIX } from './contract-route.js';
import {
  ApiExceptionFilter,
  ContractRequestInterceptor,
  ContractResponseInterceptor,
  requestContext,
} from './http.js';

/** Builds the application with every cross-cutting piece wired. Used by `main` and by the tests. */
export async function createApp(
  config: AppConfig,
  options: AppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, options),
    {
      logger: config.silent ? false : ['log', 'warn', 'error'],
    },
  );
  app.disable('x-powered-by');
  app.use(requestContext);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ApiExceptionFilter());
  // Requests are always checked against the contract; responses only where drift is cheap to catch.
  app.useGlobalInterceptors(
    new ContractRequestInterceptor(),
    ...(config.validateResponses ? [new ContractResponseInterceptor()] : []),
  );
  if (config.authKeyEphemeral && config.databaseUrl && !config.silent) {
    new Logger('Config').warn(
      'SW_AUTH_KEY is not set: a temporary key is used, so authenticator secrets stop working when the process restarts.',
    );
  }
  app.enableShutdownHooks();
  return app;
}
