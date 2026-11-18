import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 time-based one-time passwords with the parameters every authenticator app supports. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
const SECRET_BYTES = 20;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32.charAt((value << (5 - bits)) & 31);
  }
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      throw new Error('Not a base32 string.');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(SECRET_BYTES);
}

/** The time step (counter) a moment falls into. */
export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one time step (RFC 4226 HOTP with the step as the counter). */
export function totpCode(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    (((mac[offset + 1] ?? 0) & 0xff) << 16) |
    (((mac[offset + 2] ?? 0) & 0xff) << 8) |
    ((mac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export interface VerifyTotpOptions {
  readonly secret: Uint8Array;
  readonly code: string;
  readonly nowMs: number;
  /** The step of the last accepted code. Codes for this step or an earlier one are refused (no replay). */
  readonly lastStep: number | null;
  /** Steps accepted on each side of the current one, for clock drift. */
  readonly drift?: number;
}

/** Returns the time step the code matched, or null. The comparison does not stop at the first digit. */
export function verifyTotp(options: VerifyTotpOptions): number | null {
  const given = Buffer.from(options.code.replace(/\s/gu, ''), 'utf8');
  const current = timeStep(options.nowMs);
  const drift = options.drift ?? 1;
  let matched: number | null = null;
  for (let step = current - drift; step <= current + drift; step += 1) {
    const expected = Buffer.from(totpCode(options.secret, step), 'utf8');
    const equal = given.length === expected.length && timingSafeEqual(given, expected);
    if (equal && (options.lastStep === null || step > options.lastStep)) {
      matched = step;
    }
  }
  return matched;
}

/** The `otpauth://` URI authenticator apps read from a QR code. */
export function otpauthUri(issuer: string, account: string, secret: Uint8Array): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
