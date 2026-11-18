import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';

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

/**
 * What the browser may load for the console: everything from this origin, styles may be inline (React sets
 * `style` attributes), no plugins, no framing, forms only to this origin.
 */
export const CONSOLE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Headers for the files of the console: the page is never cached, the hashed assets always are. */
export function consoleHeaders(
  res: { setHeader(name: string, value: string): unknown },
  filePath: string,
): void {
  if (filePath.endsWith(`${sep}index.html`)) {
    res.setHeader('cache-control', 'no-cache');
  } else if (filePath.includes(`${sep}assets${sep}`)) {
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('cache-control', 'public, max-age=3600');
  }
  res.setHeader('content-security-policy', CONSOLE_CSP);
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
}

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
  // Behind a reverse proxy the address of the connection is the proxy's. Only the proxies named in the
  // configuration may say who the client is, or anyone could write any address into the audit chain.
  app.set('trust proxy', config.trustProxy);
  app.use(requestContext);
  if (config.webDir) {
    if (!existsSync(join(config.webDir, 'index.html'))) {
      throw new Error(`SW_WEB_DIR has no index.html: ${config.webDir}`);
    }
    // Before the API routes: a file that exists is served, everything else falls through to them.
    app.useStaticAssets(config.webDir, { index: 'index.html', setHeaders: consoleHeaders });
  }
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
