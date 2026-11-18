import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule, type AppOptions } from './app.module.js';
import { type AppConfig } from './config.js';
import { API_PREFIX } from './contract-route.js';
import { ApiExceptionFilter, ContractResponseInterceptor, requestContext } from './http.js';

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
  if (config.validateResponses) {
    app.useGlobalInterceptors(new ContractResponseInterceptor());
  }
  app.enableShutdownHooks();
  return app;
}
