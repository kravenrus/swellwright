import { Controller } from '@nestjs/common';
import { type RoleCatalog, roleCatalog, rolesRoute } from '@swellwright/contracts';

import { ContractRoute } from './contract-route.js';

@Controller()
export class RolesController {
  @ContractRoute(rolesRoute)
  roles(): RoleCatalog {
    return roleCatalog();
  }
}
