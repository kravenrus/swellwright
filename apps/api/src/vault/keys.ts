import { randomBytes } from 'node:crypto';

import { SecretBox } from '../auth/secret-box.js';
import { base32Decode, base32Encode } from '../auth/totp.js';

/** The key-encryption key, and the recovery key that can open it, are 256 random bits (ADR 0018). */
export const KEK_BYTES = 32;
export const RECOVERY_KEY_BYTES = 32;

/** What each blob is bound to. A blob moved to another purpose, secret, version or type fails to open. */
const KEK_UNDER_PASSPHRASE = 'swellwright:kek:passphrase:v1';
const KEK_UNDER_RECOVERY = 'swellwright:kek:recovery:v1';
const valueContext = (id: string, version: number, type: string): string =>
  `swellwright:secret:v1:${id}:${String(version)}:${type}`;
const dekContext = (id: string, version: number): string =>
  `swellwright:dek:v1:${id}:${String(version)}`;

export const newKek = (): Buffer => randomBytes(KEK_BYTES);
export const newRecoveryKey = (): Buffer => randomBytes(RECOVERY_KEY_BYTES);

/** `XXXX-XXXX-...`: base32 in groups of four, easy to read out and to type. */
export function formatRecoveryKey(key: Buffer): string {
  return (base32Encode(key).match(/.{1,4}/gu) ?? []).join('-');
}

/** The key behind what a person typed, or null when it cannot be one. */
export function parseRecoveryKey(text: string): Buffer | null {
  const clean = text.replace(/[\s-]/gu, '').toUpperCase();
  if (!/^[A-Z2-7]+$/u.test(clean)) {
    return null;
  }
  try {
    const key = base32Decode(clean);
    return key.length === RECOVERY_KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

export const wrapKekUnderPassphraseKey = (kek: Buffer, key: Buffer): Buffer =>
  new SecretBox(key).seal(kek, KEK_UNDER_PASSPHRASE);
export const wrapKekUnderRecoveryKey = (kek: Buffer, key: Buffer): Buffer =>
  new SecretBox(key).seal(kek, KEK_UNDER_RECOVERY);

/** The KEK, or null when the key is wrong (AES-GCM refuses it) or the blob is not ours. */
function unwrap(blob: Uint8Array, key: Buffer, context: string): Buffer | null {
  try {
    return new SecretBox(key).open(blob, context);
  } catch {
    return null;
  }
}
export const unwrapKekWithPassphraseKey = (blob: Uint8Array, key: Buffer): Buffer | null =>
  unwrap(blob, key, KEK_UNDER_PASSPHRASE);
export const unwrapKekWithRecoveryKey = (blob: Uint8Array, key: Buffer): Buffer | null =>
  unwrap(blob, key, KEK_UNDER_RECOVERY);

/** Which secret and which version a pair of blobs belongs to. */
export interface SecretIdentity {
  readonly id: string;
  readonly version: number;
  readonly type: string;
}

/** Encrypts a value under a data key of its own, and wraps that data key under the KEK. */
export function encryptSecret(
  kek: Buffer,
  identity: SecretIdentity,
  value: string,
): { ciphertext: Buffer; wrappedDek: Buffer } {
  const dek = randomBytes(KEK_BYTES);
  try {
    return {
      ciphertext: new SecretBox(dek).seal(
        Buffer.from(value, 'utf8'),
        valueContext(identity.id, identity.version, identity.type),
      ),
      wrappedDek: new SecretBox(kek).seal(dek, dekContext(identity.id, identity.version)),
    };
  } finally {
    dek.fill(0);
  }
}

/** Wraps the data key of one secret version under a new KEK. The value is not touched. Throws if the old KEK is wrong. */
export function rewrapDek(
  oldKek: Buffer,
  newKek: Buffer,
  identity: { readonly id: string; readonly version: number },
  wrappedDek: Uint8Array,
): Buffer {
  const dek = new SecretBox(oldKek).open(wrappedDek, dekContext(identity.id, identity.version));
  try {
    return new SecretBox(newKek).seal(dek, dekContext(identity.id, identity.version));
  } finally {
    dek.fill(0);
  }
}

/** Throws when either blob was altered, moved to another secret, version or type, or the KEK is wrong. */
export function decryptSecret(
  kek: Buffer,
  identity: SecretIdentity,
  blobs: { ciphertext: Uint8Array; wrappedDek: Uint8Array },
): string {
  const dek = new SecretBox(kek).open(blobs.wrappedDek, dekContext(identity.id, identity.version));
  try {
    return new SecretBox(dek)
      .open(blobs.ciphertext, valueContext(identity.id, identity.version, identity.type))
      .toString('utf8');
  } finally {
    dek.fill(0);
  }
}
