import { type DynamicModule, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';

import { type AppConfig } from './config.js';
import { CONFIG } from './tokens.js';
import {
  PostgresCheck,
  READINESS_CHECKS,
  type ReadinessCheck,
  ReadinessService,
  ValkeyCheck,
} from './readiness.js';
import { SystemController } from './system.controller.js';

export interface AppOptions {
  /** Replaces the checks built from the configuration (tests). */
  readonly readinessChecks?: readonly ReadinessCheck[];
}

function checksFrom(config: AppConfig): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  if (config.databaseUrl) {
    checks.push(new PostgresCheck(config.databaseUrl));
  }
  if (config.valkeyUrl) {
    checks.push(new ValkeyCheck(config.valkeyUrl));
  }
  return checks;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  static register(config: AppConfig, options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      controllers: [SystemController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: READINESS_CHECKS, useValue: options.readinessChecks ?? checksFrom(config) },
        ReadinessService,
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.readiness.close();
  }
}
