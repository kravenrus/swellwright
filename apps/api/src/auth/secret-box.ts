import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
export const AUTH_KEY_BYTES = 32;

/**
 * Seals small secrets (the TOTP secret) with AES-256-GCM under the instance authentication key.
 * The blob is `version | nonce | ciphertext | tag`; the context is authenticated but not stored, so a blob
 * copied to another user or purpose fails to open.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== AUTH_KEY_BYTES) {
      throw new Error(`The authentication key must be ${String(AUTH_KEY_BYTES)} bytes.`);
    }
  }

  seal(plaintext: Buffer, context: string): Buffer {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), nonce, ciphertext, cipher.getAuthTag()]);
  }

  /** Throws when the blob is malformed, was sealed under another key or context, or was altered. */
  open(blob: Uint8Array, context: string): Buffer {
    const data = Buffer.from(blob);
    if (data.length < 1 + NONCE_BYTES + TAG_BYTES || data[0] !== VERSION) {
      throw new Error('Unreadable sealed value.');
    }
    const nonce = data.subarray(1, 1 + NONCE_BYTES);
    const tag = data.subarray(data.length - TAG_BYTES);
    const ciphertext = data.subarray(1 + NONCE_BYTES, data.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
