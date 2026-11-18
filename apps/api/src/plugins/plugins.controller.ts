import { Body, Controller, Inject, Req } from '@nestjs/common';
import {
  checkPluginRoute,
  disablePluginRoute,
  enablePluginRoute,
  type EnablePluginRequest,
  listPluginsRoute,
  PluginIdParamsSchema,
  type PluginList,
  type PluginView,
} from '@swellwright/contracts';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { PluginHostService } from './host/plugin-host.service.js';
import { PluginsService } from './plugins.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

@Controller()
export class PluginsController {
  constructor(
    @Inject(PluginsService) private readonly plugins: PluginsService,
    @Inject(PluginHostService) private readonly host: PluginHostService,
  ) {}

  @ContractRoute(listPluginsRoute)
  list(): Promise<PluginList> {
    return this.plugins.list();
  }

  @ContractRoute(enablePluginRoute)
  enable(@Body() body: EnablePluginRequest, @Req() req: AuthedRequest): Promise<PluginView> {
    const { id } = PluginIdParamsSchema.parse(req.params);
    return this.plugins.enable(actorOf(req), id, body.digest, requestMeta(req));
  }

  @ContractRoute(disablePluginRoute)
  disable(@Req() req: AuthedRequest): Promise<PluginView> {
    const { id } = PluginIdParamsSchema.parse(req.params);
    return this.plugins.disable(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(checkPluginRoute)
  check(@Req() req: AuthedRequest): Promise<PluginView> {
    const { id } = PluginIdParamsSchema.parse(req.params);
    return this.host.check(actorOf(req), id, requestMeta(req));
  }
}
