export const CONFIG = Symbol('CONFIG');
/** The shared `Database` of the process, or `undefined` when no database URL is configured. */
export const DATABASE = Symbol('DATABASE');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const SECRET_BOX = Symbol('SECRET_BOX');
/** The Argon2id cost for a new vault passphrase. */
export const VAULT_KDF = Symbol('VAULT_KDF');
/** The core's door for plugin requests (ADR 0028); tests replace it. */
export const PLUGIN_NETWORK = Symbol('PLUGIN_NETWORK');
