import { Controller, Inject, Req } from '@nestjs/common';
import {
  type AuditPage,
  type ChainVerification,
  listAuditRoute,
  verifyAuditChainRoute,
} from '@swellwright/contracts';
import type { Request } from 'express';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { AuditService } from './audit.service.js';

@Controller()
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @ContractRoute(listAuditRoute)
  list(@Req() req: Request): Promise<AuditPage> {
    // Express exposes the query read-only and the interceptor only checks it: read it through the contract.
    return this.audit.list(listAuditRoute.request.query.parse(req.query));
  }

  @ContractRoute(verifyAuditChainRoute)
  async verify(@Req() req: AuthedRequest): Promise<ChainVerification> {
    const { user } = requireAuth(req);
    const result = await this.audit.verify();
    // The check is part of the history it checks. It lands after the head the check reported.
    await this.audit.record({
      action: 'audit.chain.verified',
      outcome: result.ok ? 'success' : 'failure',
      actor: { id: user.id, name: user.username },
      details: { ok: result.ok, checked: result.checked },
      meta: requestMeta(req),
    });
    return result;
  }
}
