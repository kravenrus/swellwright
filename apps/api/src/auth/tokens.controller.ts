import { Body, Controller, Inject, Req } from '@nestjs/common';
import {
  type CreatedToken,
  createTokenRoute,
  type CreateTokenRequest,
  listMyTokensRoute,
  listTokensRoute,
  revokeMyTokenRoute,
  revokeTokenRoute,
  TokenIdParamsSchema,
  type TokenList,
} from '@swellwright/contracts';

import { ContractRoute } from '../contract-route.js';
import { type AuthedRequest, requestMeta, requireAuth } from './context.js';
import { TokenService } from './token.service.js';

@Controller()
export class TokensController {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  @ContractRoute(listMyTokensRoute)
  listMine(@Req() req: AuthedRequest): Promise<TokenList> {
    return this.tokens.listOwn(requireAuth(req));
  }

  @ContractRoute(revokeMyTokenRoute)
  async revokeMine(@Req() req: AuthedRequest): Promise<void> {
    const { id } = TokenIdParamsSchema.parse(req.params);
    await this.tokens.revoke(requireAuth(req), id, 'own', requestMeta(req));
  }

  @ContractRoute(createTokenRoute)
  create(@Body() body: CreateTokenRequest, @Req() req: AuthedRequest): Promise<CreatedToken> {
    return this.tokens.create(requireAuth(req), body, requestMeta(req));
  }

  @ContractRoute(listTokensRoute)
  list(@Req() req: AuthedRequest): Promise<TokenList> {
    return this.tokens.listAll(listTokensRoute.request.query.parse(req.query));
  }

  @ContractRoute(revokeTokenRoute)
  async revoke(@Req() req: AuthedRequest): Promise<void> {
    const { id } = TokenIdParamsSchema.parse(req.params);
    await this.tokens.revoke(requireAuth(req), id, 'any', requestMeta(req));
  }
}
