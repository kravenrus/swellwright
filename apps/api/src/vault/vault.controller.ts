import { Body, Controller, Inject, Req } from '@nestjs/common';
import {
  changeVaultPassphraseRoute,
  type ChangeVaultPassphraseRequest,
  type ConfirmPassphraseRequest,
  createSecretRoute,
  type CreateSecretRequest,
  deleteSecretRoute,
  initializeVaultRoute,
  type InitializeVaultRequest,
  listSecretsRoute,
  type RevealedSecret,
  revealSecretRoute,
  rotateDataKeysRoute,
  rotateKekRoute,
  rotateRecoveryKeyRoute,
  SecretIdParamsSchema,
  type SecretList,
  type SecretView,
  sealVaultRoute,
  unsealVaultRoute,
  type UnsealVaultRequest,
  updateSecretRoute,
  type UpdateSecretRequest,
  type VaultInitialized,
  type VaultRotated,
  vaultStatusRoute,
  type VaultStatus,
} from '@swellwright/contracts';

import { type AuthedRequest, requestMeta, requireAuth } from '../auth/context.js';
import { ContractRoute } from '../contract-route.js';
import { VaultService } from './vault.service.js';

const actorOf = (req: AuthedRequest): { id: string; name: string } => {
  const { user } = requireAuth(req);
  return { id: user.id, name: user.username };
};

@Controller()
export class VaultController {
  constructor(@Inject(VaultService) private readonly vault: VaultService) {}

  @ContractRoute(vaultStatusRoute)
  status(): Promise<VaultStatus> {
    return this.vault.status();
  }

  @ContractRoute(initializeVaultRoute)
  initialize(
    @Body() body: InitializeVaultRequest,
    @Req() req: AuthedRequest,
  ): Promise<VaultInitialized> {
    return this.vault.initialize(actorOf(req), body.passphrase, requestMeta(req));
  }

  @ContractRoute(unsealVaultRoute)
  unseal(@Body() body: UnsealVaultRequest, @Req() req: AuthedRequest): Promise<VaultStatus> {
    return this.vault.unseal(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(sealVaultRoute)
  seal(@Req() req: AuthedRequest): Promise<VaultStatus> {
    return this.vault.seal(actorOf(req), requestMeta(req));
  }

  @ContractRoute(changeVaultPassphraseRoute)
  changePassphrase(
    @Body() body: ChangeVaultPassphraseRequest,
    @Req() req: AuthedRequest,
  ): Promise<VaultStatus> {
    return this.vault.changePassphrase(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(rotateRecoveryKeyRoute)
  rotateRecoveryKey(
    @Body() body: ConfirmPassphraseRequest,
    @Req() req: AuthedRequest,
  ): Promise<VaultInitialized> {
    return this.vault.rotateRecoveryKey(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(rotateKekRoute)
  rotateKek(
    @Body() body: ConfirmPassphraseRequest,
    @Req() req: AuthedRequest,
  ): Promise<VaultInitialized> {
    return this.vault.rotateKek(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(rotateDataKeysRoute)
  rotateDataKeys(@Req() req: AuthedRequest): Promise<VaultRotated> {
    return this.vault.rotateDataKeys(actorOf(req), requestMeta(req));
  }

  @ContractRoute(listSecretsRoute)
  list(): Promise<SecretList> {
    return this.vault.list();
  }

  @ContractRoute(createSecretRoute)
  create(@Body() body: CreateSecretRequest, @Req() req: AuthedRequest): Promise<SecretView> {
    return this.vault.create(actorOf(req), body, requestMeta(req));
  }

  @ContractRoute(updateSecretRoute)
  update(@Body() body: UpdateSecretRequest, @Req() req: AuthedRequest): Promise<SecretView> {
    const { id } = SecretIdParamsSchema.parse(req.params);
    return this.vault.update(actorOf(req), id, body, requestMeta(req));
  }

  @ContractRoute(deleteSecretRoute)
  async remove(@Req() req: AuthedRequest): Promise<void> {
    const { id } = SecretIdParamsSchema.parse(req.params);
    await this.vault.remove(actorOf(req), id, requestMeta(req));
  }

  @ContractRoute(revealSecretRoute)
  reveal(@Req() req: AuthedRequest): Promise<RevealedSecret> {
    const { id } = SecretIdParamsSchema.parse(req.params);
    return this.vault.reveal(actorOf(req), id, requestMeta(req));
  }
}
