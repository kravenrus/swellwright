export const CONFIG = Symbol('CONFIG');
/** The shared `Database` of the process, or `undefined` when no database URL is configured. */
export const DATABASE = Symbol('DATABASE');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const SECRET_BOX = Symbol('SECRET_BOX');
/** The Argon2id cost for a new vault passphrase. */
export const VAULT_KDF = Symbol('VAULT_KDF');
