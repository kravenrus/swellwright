import { Controller, Inject, Res } from '@nestjs/common';
import {
  buildOpenApi,
  healthRoute,
  type HealthResponse,
  openApiRoute,
  readyRoute,
  type ReadyResponse,
  versionRoute,
  type VersionResponse,
} from '@swellwright/contracts';
import type { Response } from 'express';

import { type AppConfig } from './config.js';
import { CONFIG } from './tokens.js';
import { ContractRoute } from './contract-route.js';
import { ReadinessService } from './readiness.js';

@Controller()
export class SystemController {
  constructor(
    @Inject(ReadinessService) private readonly readiness: ReadinessService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @ContractRoute(healthRoute)
  health(): HealthResponse {
    return { status: 'ok' };
  }

  @ContractRoute(readyRoute)
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadyResponse> {
    const result = await this.readiness.run();
    res.status(result.status === 'ready' ? 200 : 503);
    return result;
  }

  @ContractRoute(versionRoute)
  version(): VersionResponse {
    return {
      name: 'swellwright',
      version: this.config.version,
      apiVersion: 'v1',
      ...(this.config.commit ? { commit: this.config.commit } : {}),
    };
  }

  @ContractRoute(openApiRoute)
  openApi(): Record<string, unknown> {
    return buildOpenApi();
  }
}
