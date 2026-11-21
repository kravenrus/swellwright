import { Body, Controller, Inject, Req, Res, type StreamableFile } from '@nestjs/common';
import {
  type ArtifactList,
  ArtifactNameParamsSchema,
  type ArtifactPushResult,
  type ArtifactVerification,
  ArtifactVersionParamsSchema,
  type ArtifactVersionView,
  type ArtifactView,
  downloadArtifactRoute,
  downloadArtifactVersionRoute,
  getArtifactRoute,
  getArtifactVersionRoute,
  listArtifactsRoute,
  listServerArtifactsRoute,
  type PushArtifactRequest,
  pushArtifactRoute,
  removeServerArtifactRoute,
  ServerArtifactParamsSchema,
  type ServerArtifactList,
  ServerArtifactVersionParamsSchema,
  ServerIdParamsSchema,
  VerifyArtifactQuerySchema,
  verifyServerArtifactRoute,
} from '@swellwright/contracts';
import type { Request, Response } from 'express';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { CatalogueService } from './catalogue.service.js';
import { DistributionService } from './distribution.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

/** The catalogue of artifacts, and what has been pushed to each server (ADR 0039). */
@Controller()
export class ArtifactsController {
  constructor(
    @Inject(CatalogueService) private readonly catalogue: CatalogueService,
    @Inject(DistributionService) private readonly distribution: DistributionService,
  ) {}

  @ContractRoute(listArtifactsRoute)
  list(): ArtifactList {
    return this.catalogue.list();
  }

  @ContractRoute(getArtifactRoute)
  get(@Req() req: Request): ArtifactView {
    return this.catalogue.get(ArtifactNameParamsSchema.parse(req.params).name);
  }

  @ContractRoute(getArtifactVersionRoute)
  getVersion(@Req() req: Request): ArtifactVersionView {
    const { name, version } = ArtifactVersionParamsSchema.parse(req.params);
    return this.catalogue.getVersion(name, version);
  }

  @ContractRoute(downloadArtifactRoute)
  async download(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name } = ArtifactNameParamsSchema.parse(req.params);
    const { manifest, file } = await this.catalogue.open(name, undefined, actorOf(req));
    res.setHeader('x-content-sha256', manifest.sha256);
    return file;
  }

  @ContractRoute(downloadArtifactVersionRoute)
  async downloadVersion(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { name, version } = ArtifactVersionParamsSchema.parse(req.params);
    const { manifest, file } = await this.catalogue.open(name, version, actorOf(req));
    res.setHeader('x-content-sha256', manifest.sha256);
    return file;
  }

  @ContractRoute(listServerArtifactsRoute)
  listForServer(@Req() req: Request): Promise<ServerArtifactList> {
    return this.distribution.list(ServerIdParamsSchema.parse(req.params).id);
  }

  @ContractRoute(pushArtifactRoute)
  async push(
    @Body() body: PushArtifactRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ArtifactPushResult> {
    const { id } = ServerIdParamsSchema.parse(req.params);
    const { result, created } = await this.distribution.push(
      actorOf(req),
      id,
      body,
      requestMeta(req),
    );
    // The contract lists 200 first, so that is the default: a copy that was uploaded answers 201.
    res.status(created ? 201 : 200);
    return result;
  }

  @ContractRoute(verifyServerArtifactRoute)
  verify(@Req() req: AuthedRequest): Promise<ArtifactVerification> {
    const { id, name } = ServerArtifactParamsSchema.parse(req.params);
    const { version } = VerifyArtifactQuerySchema.parse(req.query);
    return this.distribution.verify(actorOf(req), id, name, version, requestMeta(req));
  }

  @ContractRoute(removeServerArtifactRoute)
  async remove(@Req() req: AuthedRequest): Promise<void> {
    const { id, name, version } = ServerArtifactVersionParamsSchema.parse(req.params);
    await this.distribution.remove(actorOf(req), id, name, version, requestMeta(req));
  }
}
