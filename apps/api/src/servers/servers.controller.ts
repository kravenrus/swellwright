import { Body, Controller, Inject, Req, Res } from '@nestjs/common';
import {
  AccessParamsSchema,
  addAccessRoute,
  type AddAccessRequest,
  type CreateServerRequest,
  createServerRoute,
  deleteServerRoute,
  getServerRoute,
  HostKeyParamsSchema,
  listServersRoute,
  pinHostKeyRoute,
  type PinHostKeyRequest,
  removeAccessRoute,
  revokeHostKeyRoute,
  type ServerAccess,
  type ServerHostKey,
  ServerIdParamsSchema,
  type ServerList,
  type ServerView,
  updateAccessRoute,
  type UpdateAccessRequest,
  updateServerRoute,
  type UpdateServerRequest,
} from '@swellwright/contracts';
import type { Request, Response } from 'express';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { ServersService } from './servers.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

@Controller()
export class ServersController {
  constructor(@Inject(ServersService) private readonly servers: ServersService) {}

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
}
