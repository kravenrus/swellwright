import { Body, Controller, Inject, Req, Res } from '@nestjs/common';
import {
  createOwnerRoute,
  getSetupStatusRoute,
  type PendingSession,
  type SetupOwnerRequest,
  type SetupStatus,
} from '@swellwright/contracts';
import type { Request, Response } from 'express';

import { type AppConfig } from '../config.js';
import { ContractRoute } from '../contract-route.js';
import { CONFIG } from '../tokens.js';
import { requestMeta } from './context.js';
import { setSessionCookie } from './cookies.js';
import { SetupService } from './setup.service.js';

@Controller()
export class SetupController {
  constructor(
    @Inject(SetupService) private readonly setup: SetupService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @ContractRoute(getSetupStatusRoute)
  status(): Promise<SetupStatus> {
    return this.setup.status();
  }

  @ContractRoute(createOwnerRoute)
  async createOwner(
    @Body() body: SetupOwnerRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PendingSession> {
    const { session } = await this.setup.createOwner(body, requestMeta(req));
    setSessionCookie(res, session.token, this.config);
    // The owner has no authenticator yet: the next step is to set one up.
    return { next: 'totp_enrollment' };
  }
}
