import { createHash, randomBytes, randomInt } from 'node:crypto';

/** A new opaque session token: 256 random bits. The cookie carries it, the database keeps only its hash. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 in hex. Fine for high-entropy tokens and codes; never use it for passwords. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 12;
export const RECOVERY_CODE_COUNT = 10;

/** `XXXX-XXXX-XXXX`: 12 characters from a 32-symbol alphabet without look-alikes, 60 bits. */
export function newRecoveryCode(): string {
  let raw = '';
  for (let i = 0; i < RECOVERY_LENGTH; i += 1) {
    raw += RECOVERY_ALPHABET.charAt(randomInt(RECOVERY_ALPHABET.length));
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, newRecoveryCode);
}

/** Upper-cases and drops separators; null when the input cannot be a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.replace(/[\s-]/gu, '').toUpperCase();
  if (clean.length !== RECOVERY_LENGTH) {
    return null;
  }
  for (let i = 0; i < clean.length; i += 1) {
    if (!RECOVERY_ALPHABET.includes(clean.charAt(i))) {
      return null;
    }
  }
  return clean;
}

export function recoveryCodeHash(normalized: string): string {
  return hashToken(`recovery:${normalized}`);
}

/** A six-digit authenticator code, as opposed to a recovery code. */
export function looksLikeTotpCode(input: string): boolean {
  return /^\d{6}$/u.test(input.replace(/\s/gu, ''));
}
