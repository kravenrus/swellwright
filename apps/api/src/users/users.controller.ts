import { Body, Controller, Inject, Req } from '@nestjs/common';
import {
  createUserRoute,
  deleteUserRoute,
  updatePreferencesRoute,
  type UpdatePreferencesRequest,
  type UserSummary,
  type CreateUserRequest,
  listUsersRoute,
  resetCredentialsRoute,
  updateUserRoute,
  type UpdateUserRequest,
  UserIdParamsSchema,
  type UserInvitation,
  type UserList,
  type UserView,
} from '@swellwright/contracts';
import type { Request } from 'express';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { UsersService } from './users.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

@Controller()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @ContractRoute(listUsersRoute)
  list(@Req() req: Request): Promise<UserList> {
    // Express exposes the query read-only and the interceptor only checks it: read it through the contract.
    return this.users.list(listUsersRoute.request.query.parse(req.query));
  }

  @ContractRoute(createUserRoute)
  create(@Body() body: CreateUserRequest, @Req() req: AuthedRequest): Promise<UserInvitation> {
    return this.users.create(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(updateUserRoute)
  update(@Body() body: UpdateUserRequest, @Req() req: AuthedRequest): Promise<UserView> {
    const { id } = UserIdParamsSchema.parse(req.params);
    return this.users.update(actorOf(req), id, body, requestMeta(req));
  }

  @ContractRoute(resetCredentialsRoute)
  reset(@Req() req: AuthedRequest): Promise<UserInvitation> {
    const { id } = UserIdParamsSchema.parse(req.params);
    return this.users.resetCredentials(actorOf(req), id, requestMeta(req), 'console');
  }

  @ContractRoute(deleteUserRoute)
  async remove(@Req() req: AuthedRequest): Promise<void> {
    const { id } = UserIdParamsSchema.parse(req.params);
    await this.users.remove(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(updatePreferencesRoute)
  preferences(
    @Body() body: UpdatePreferencesRequest,
    @Req() req: AuthedRequest,
  ): Promise<UserSummary> {
    return this.users.setLanguage(requireAuth(req).user.id, body.language);
  }
}
