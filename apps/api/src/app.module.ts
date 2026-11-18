import { type DynamicModule, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { Database } from '@swellwright/db';

import { type AppConfig } from './config.js';
import { CONFIG, DATABASE } from './tokens.js';
import {
  DatabaseCheck,
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

function checksFrom(config: AppConfig, database: Database | undefined): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  if (database) {
    checks.push(new DatabaseCheck(database));
  }
  if (config.valkeyUrl) {
    checks.push(new ValkeyCheck(config.valkeyUrl));
  }
  return checks;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(ReadinessService) private readonly readiness: ReadinessService,
    @Inject(DATABASE) private readonly database: Database | undefined,
  ) {}

  static register(config: AppConfig, options: AppOptions = {}): DynamicModule {
    // The pool is created lazily by the client, so building it here does not connect.
    const database = config.databaseUrl ? new Database({ url: config.databaseUrl }) : undefined;
    return {
      module: AppModule,
      controllers: [SystemController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DATABASE, useValue: database },
        {
          provide: READINESS_CHECKS,
          useValue: options.readinessChecks ?? checksFrom(config, database),
        },
        ReadinessService,
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.readiness.close();
    await this.database?.close();
  }
}
