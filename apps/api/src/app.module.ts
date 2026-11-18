import { type DynamicModule, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Database } from '@swellwright/db';

import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard, OriginGuard, PermissionGuard, StepUpGuard } from './auth/guards.js';
import { DEFAULT_PASSWORD_PARAMS, PasswordHasher, type PasswordParams } from './auth/password.js';
import { SecretBox } from './auth/secret-box.js';
import { SessionManagementService } from './auth/session-management.service.js';
import { SessionService } from './auth/session.service.js';
import { TokenService } from './auth/token.service.js';
import { TokensController } from './auth/tokens.controller.js';
import { SessionsController } from './auth/sessions.controller.js';
import { SetupController } from './auth/setup.controller.js';
import { SetupService } from './auth/setup.service.js';
import { type AppConfig } from './config.js';
import { CONFIG, DATABASE, PASSWORD_HASHER, SECRET_BOX, VAULT_KDF } from './tokens.js';
import {
  DatabaseCheck,
  READINESS_CHECKS,
  type ReadinessCheck,
  ReadinessService,
  ValkeyCheck,
} from './readiness.js';
import { RolesController } from './roles.controller.js';
import { SystemController } from './system.controller.js';
import { InvitationService } from './users/invitation.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';
import type { KdfParams } from './vault/kdf.js';
import { VaultController } from './vault/vault.controller.js';
import { VaultService } from './vault/vault.service.js';

export interface AppOptions {
  /** Replaces the checks built from the configuration (tests). */
  readonly readinessChecks?: readonly ReadinessCheck[];
  /** Cheaper Argon2id parameters for tests; production always uses the defaults. */
  readonly passwordParams?: PasswordParams;
  /** A database to use instead of the one built from the configuration (tests with a schema of their own). */
  readonly database?: Database;
  /** Cheaper Argon2id parameters for the vault passphrase in tests; production uses the configuration. */
  readonly vaultKdf?: KdfParams;
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
    const database =
      options.database ??
      (config.databaseUrl ? new Database({ url: config.databaseUrl }) : undefined);
    return {
      module: AppModule,
      controllers: [
        SystemController,
        SetupController,
        AuthController,
        TokensController,
        SessionsController,
        RolesController,
        AuditController,
        UsersController,
        VaultController,
      ],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DATABASE, useValue: database },
        {
          provide: READINESS_CHECKS,
          useValue: options.readinessChecks ?? checksFrom(config, database),
        },
        ReadinessService,
        {
          provide: PASSWORD_HASHER,
          useValue: new PasswordHasher(options.passwordParams ?? DEFAULT_PASSWORD_PARAMS),
        },
        { provide: SECRET_BOX, useValue: new SecretBox(config.authKey) },
        SessionService,
        TokenService,
        SessionManagementService,
        AuditService,
        AuthService,
        SetupService,
        InvitationService,
        UsersService,
        { provide: VAULT_KDF, useValue: options.vaultKdf ?? config.vaultKdf },
        VaultService,
        // Guards run in this order: the origin check, the session, the role's permission, the step-up.
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_GUARD, useClass: StepUpGuard },
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.readiness.close();
    await this.database?.close();
  }
}
