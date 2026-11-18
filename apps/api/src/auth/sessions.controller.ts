import { Controller, Inject, Req } from '@nestjs/common';
import {
  listMySessionsRoute,
  listSessionsRoute,
  revokeMySessionRoute,
  revokeOtherSessionsRoute,
  revokeSessionRoute,
  revokeUserSessionsRoute,
  SessionIdParamsSchema,
  type SessionList,
  type SessionsRevoked,
  UserIdParamsSchema,
} from '@swellwright/contracts';

import { ContractRoute } from '../contract-route.js';
import { type AuthedRequest, requestMeta, requireAuth } from './context.js';
import { SessionManagementService } from './session-management.service.js';

@Controller()
export class SessionsController {
  constructor(
    @Inject(SessionManagementService) private readonly sessions: SessionManagementService,
  ) {}

  @ContractRoute(listMySessionsRoute)
  listMine(@Req() req: AuthedRequest): Promise<SessionList> {
    return this.sessions.listOwn(requireAuth(req));
  }

  @ContractRoute(revokeMySessionRoute)
  async revokeMine(@Req() req: AuthedRequest): Promise<void> {
    const { id } = SessionIdParamsSchema.parse(req.params);
    await this.sessions.revoke(requireAuth(req), id, 'own', requestMeta(req));
  }

  @ContractRoute(revokeOtherSessionsRoute)
  revokeOthers(@Req() req: AuthedRequest): Promise<SessionsRevoked> {
    return this.sessions.revokeOthers(requireAuth(req), requestMeta(req));
  }

  @ContractRoute(listSessionsRoute)
  list(@Req() req: AuthedRequest): Promise<SessionList> {
    // Express exposes the query read-only and the interceptor only checks it: read it through the contract.
    return this.sessions.listAll(
      requireAuth(req),
      listSessionsRoute.request.query.parse(req.query),
    );
  }

  @ContractRoute(revokeSessionRoute)
  async revoke(@Req() req: AuthedRequest): Promise<void> {
    const { id } = SessionIdParamsSchema.parse(req.params);
    await this.sessions.revoke(requireAuth(req), id, 'any', requestMeta(req));
  }

  @ContractRoute(revokeUserSessionsRoute)
  revokeUser(@Req() req: AuthedRequest): Promise<SessionsRevoked> {
    const { id } = UserIdParamsSchema.parse(req.params);
    return this.sessions.revokeUser(requireAuth(req), id, requestMeta(req));
  }
}
