export { Database, type DatabaseOptions } from './database.js';
export { DatabaseNotReadyError, type SchemaProblem } from './errors.js';
export { appliedMigrations, schemaProblem, shippedMigrations } from './migrations.js';
export { Prisma, PrismaClient } from './generated/client.js';
export type {
  AuditEvent,
  Credential,
  Invitation,
  PluginApproval,
  RecoveryCode,
  Secret,
  Session,
  User,
  VaultMeta,
} from './generated/client.js';
export {
  AuditOutcome,
  InvitationPurpose,
  SecretType,
  SessionStage,
  UserRole,
  UserStatus,
} from './generated/enums.js';
