import { Body, Controller, Inject, Req, Res } from '@nestjs/common';
import {
  type AcceptHostKeyRequest,
  acceptHostKeyRoute,
  AccessParamsSchema,
  type AccessVerification,
  addAccessRoute,
  type AddAccessRequest,
  type CreateServerRequest,
  createServerRoute,
  deleteServerRoute,
  getFactsRoute,
  getServerRoute,
  type HostKeyAccepted,
  HostKeyParamsSchema,
  type HostKeyScan,
  listServersRoute,
  pinHostKeyRoute,
  type PinHostKeyRequest,
  refreshFactsRoute,
  removeAccessRoute,
  revokeHostKeyRoute,
  scanHostKeyRoute,
  type ServerAccess,
  type ServerFactsRecord,
  type ServerHostKey,
  ServerIdParamsSchema,
  type ServerList,
  type ServerView,
  updateAccessRoute,
  type UpdateAccessRequest,
  updateServerRoute,
  type UpdateServerRequest,
  verifyAccessRoute,
} from '@swellwright/contracts';
import type { Request, Response } from 'express';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { ServerSshService } from './server-ssh.service.js';
import { ServersService } from './servers.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

@Controller()
export class ServersController {
  constructor(
    @Inject(ServersService) private readonly servers: ServersService,
    @Inject(ServerSshService) private readonly ssh: ServerSshService,
  ) {}

  @ContractRoute(listServersRoute)
  list(@Req() req: Request): Promise<ServerList> {
    // Express exposes the query read-only and the interceptor only checks it: read it through the contract.
    return this.servers.list(listServersRoute.request.query.parse(req.query));
  }

  @ContractRoute(createServerRoute)
  create(@Body() body: CreateServerRequest, @Req() req: AuthedRequest): Promise<ServerView> {
    return this.servers.create(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(getServerRoute)
  get(@Req() req: Request): Promise<ServerView> {
    return this.servers.get(ServerIdParamsSchema.parse(req.params).id);
  }

  @ContractRoute(updateServerRoute)
  update(@Body() body: UpdateServerRequest, @Req() req: AuthedRequest): Promise<ServerView> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    return this.servers.update(actorOf(req), id, body, requestMeta(req));
  }

  @ContractRoute(deleteServerRoute)
  async remove(@Req() req: AuthedRequest): Promise<void> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    await this.servers.remove(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(pinHostKeyRoute)
  async pinHostKey(
    @Body() body: PinHostKeyRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServerHostKey> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    const { key, created } = await this.servers.pinHostKey(
      actorOf(req),
      id,
      body,
      requestMeta(req),
    );
    // The contract lists 200 first, so that is the default: a key that is new answers 201.
    res.status(created ? 201 : 200);
    return key;
  }

  @ContractRoute(revokeHostKeyRoute)
  async revokeHostKey(@Req() req: AuthedRequest): Promise<void> {
    const { id, keyId } = HostKeyParamsSchema.parse(req.params);
    await this.servers.revokeHostKey(actorOf(req), id, keyId, requestMeta(req));
  }

  @ContractRoute(addAccessRoute)
  addAccess(@Body() body: AddAccessRequest, @Req() req: AuthedRequest): Promise<ServerAccess> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    return this.servers.addAccess(actorOf(req), id, body, requestMeta(req));
  }

  @ContractRoute(updateAccessRoute)
  updateAccess(
    @Body() body: UpdateAccessRequest,
    @Req() req: AuthedRequest,
  ): Promise<ServerAccess> {
    const { id, accessId } = AccessParamsSchema.parse(req.params);
    return this.servers.updateAccess(actorOf(req), id, accessId, body, requestMeta(req));
  }

  @ContractRoute(removeAccessRoute)
  async removeAccess(@Req() req: AuthedRequest): Promise<void> {
    const { id, accessId } = AccessParamsSchema.parse(req.params);
    await this.servers.removeAccess(actorOf(req), id, accessId, requestMeta(req));
  }

  @ContractRoute(scanHostKeyRoute)
  scanHostKey(@Req() req: AuthedRequest): Promise<HostKeyScan> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    return this.ssh.scan(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(acceptHostKeyRoute)
  async acceptHostKey(
    @Body() body: AcceptHostKeyRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HostKeyAccepted> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    const { key, replaced, created } = await this.ssh.accept(
      actorOf(req),
      id,
      body,
      requestMeta(req),
    );
    res.status(created ? 201 : 200);
    return { key, replaced };
  }

  @ContractRoute(verifyAccessRoute)
  verifyAccess(@Req() req: AuthedRequest): Promise<AccessVerification> {
    const { id, accessId } = AccessParamsSchema.parse(req.params);
    return this.ssh.verify(actorOf(req), id, accessId, requestMeta(req));
  }

  @ContractRoute(refreshFactsRoute)
  refreshFacts(@Req() req: AuthedRequest): Promise<ServerFactsRecord> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    return this.ssh.refreshFacts(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(getFactsRoute)
  getFacts(@Req() req: Request): Promise<ServerFactsRecord> {
    return this.ssh.getFacts(ServerIdParamsSchema.parse(req.params).id);
  }
}
