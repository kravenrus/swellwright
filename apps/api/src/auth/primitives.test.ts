import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readCookie } from './cookies.js';
import { PasswordHasher } from './password.js';
import { WindowLimiter } from './rate-limit.js';
import { SecretBox } from './secret-box.js';
import {
  hashToken,
  looksLikeTotpCode,
  newRecoveryCode,
  newRecoveryCodes,
  newSessionToken,
  normalizeRecoveryCode,
  recoveryCodeHash,
} from './tokens.js';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  timeStep,
  totpCode,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890". The RFC lists 8 digits; we use the last 6.
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');
const RFC_VECTORS: readonly (readonly [number, string])[] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      assert.equal(
        totpCode(RFC_SECRET, timeStep(seconds * 1000)),
        expected,
        `T=${String(seconds)}`,
      );
    }
  });

  it('encodes base32 like RFC 4648 and round-trips', () => {
    assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
    assert.equal(base32Decode('MZXW6YTBOI').toString(), 'foobar');
    const secret = generateTotpSecret();
    assert.equal(secret.length, 20);
    assert.deepEqual(base32Decode(base32Encode(secret)), secret);
    assert.deepEqual(base32Decode('mzxw 6ytb-oi=='), Buffer.from('foobar'));
    assert.throws(() => base32Decode('not base32!'));
  });

  it('accepts the current step and one step of drift, nothing further', () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);
    const at = (s: number): string => totpCode(RFC_SECRET, s);
    const check = (s: number): number | null =>
      verifyTotp({ secret: RFC_SECRET, code: at(s), nowMs: now, lastStep: null });
    assert.equal(check(step), step);
    assert.equal(check(step - 1), step - 1);
    assert.equal(check(step + 1), step + 1);
    assert.equal(check(step - 2), null);
    assert.equal(check(step + 2), null);
  });

  it('refuses a step that was already used, and any earlier one', () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);
    const code = totpCode(RFC_SECRET, step);
    assert.equal(verifyTotp({ secret: RFC_SECRET, code, nowMs: now, lastStep: step }), null);
    assert.equal(verifyTotp({ secret: RFC_SECRET, code, nowMs: now, lastStep: step + 1 }), null);
    assert.equal(verifyTotp({ secret: RFC_SECRET, code, nowMs: now, lastStep: step - 1 }), step);
  });

  it('rejects wrong, short and padded codes and ignores spaces', () => {
    const now = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, timeStep(now));
    const wrong = code === '000000' ? '000001' : '000000';
    for (const bad of [wrong, code.slice(1), `${code}0`, '', 'abcdef']) {
      assert.equal(
        verifyTotp({ secret: RFC_SECRET, code: bad, nowMs: now, lastStep: null }),
        null,
        bad,
      );
    }
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    assert.equal(
      verifyTotp({ secret: RFC_SECRET, code: spaced, nowMs: now, lastStep: null }),
      timeStep(now),
    );
  });

  it('builds the otpauth URI authenticator apps read', () => {
    const uri = new URL(otpauthUri('Swellwright', 'ow ner', RFC_SECRET));
    assert.equal(uri.protocol, 'otpauth:');
    assert.equal(uri.host, 'totp');
    assert.equal(decodeURIComponent(uri.pathname), '/Swellwright:ow ner');
    assert.equal(uri.searchParams.get('secret'), base32Encode(RFC_SECRET));
    assert.equal(uri.searchParams.get('issuer'), 'Swellwright');
    assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
    assert.equal(uri.searchParams.get('digits'), '6');
    assert.equal(uri.searchParams.get('period'), '30');
  });
});

describe('sealed secrets', () => {
  const key = Buffer.alloc(32, 7);

  it('opens what it sealed and keeps the plaintext out of the blob', () => {
    const box = new SecretBox(key);
    const blob = box.seal(Buffer.from('top secret value'), 'user-1');
    assert.ok(!blob.includes('top secret value'));
    assert.equal(box.open(blob, 'user-1').toString(), 'top secret value');
  });

  it('seals the same value differently every time', () => {
    const box = new SecretBox(key);
    assert.notDeepEqual(box.seal(Buffer.from('x'), 'c'), box.seal(Buffer.from('x'), 'c'));
  });

  it('fails to open under another context, another key or after tampering', () => {
    const box = new SecretBox(key);
    const blob = box.seal(Buffer.from('value'), 'user-1');
    assert.throws(() => box.open(blob, 'user-2'));
    assert.throws(() => new SecretBox(Buffer.alloc(32, 8)).open(blob, 'user-1'));
    const flipped = Buffer.from(blob);
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1;
    assert.throws(() => box.open(flipped, 'user-1'));
    assert.throws(() => box.open(blob.subarray(0, 10), 'user-1'));
  });

  it('refuses a key of the wrong size', () => {
    assert.throws(() => new SecretBox(Buffer.alloc(16)));
  });
});

describe('password hashing', () => {
  // Small parameters keep the tests fast; the production defaults are checked for their format only.
  const hasher = new PasswordHasher({ memory: 256, passes: 1, parallelism: 1 });

  it('produces a PHC string that verifies, and rejects a wrong password', async () => {
    const phc = await hasher.hash('correct horse battery staple');
    assert.match(phc, /^\$argon2id\$v=19\$m=256,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/u);
    assert.ok(await hasher.verify(phc, 'correct horse battery staple'));
    assert.ok(!(await hasher.verify(phc, 'correct horse battery stapl')));
  });

  it('salts every hash and treats equivalent Unicode forms alike', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('same password!!'),
      hasher.hash('same password!!'),
    ]);
    assert.notEqual(a, b);
    const composed = await hasher.hash('café au lait 123');
    assert.ok(await hasher.verify(composed, 'café au lait 123'));
  });

  it('keeps verifying hashes made with older parameters and flags them for a rehash', async () => {
    const old = await hasher.hash('old password value');
    const stronger = new PasswordHasher({ memory: 512, passes: 2, parallelism: 1 });
    assert.ok(await stronger.verify(old, 'old password value'));
    assert.ok(stronger.needsRehash(old));
    assert.ok(!hasher.needsRehash(old));
  });

  it('answers false, not an error, for a malformed stored value', async () => {
    for (const bad of [
      '',
      'plain',
      '$argon2i$v=19$m=256,t=1,p=1$AAAAAAAAAAA$AAAAAAAAAAAAAAAA',
      '$argon2id$x',
    ]) {
      assert.equal(await hasher.verify(bad, 'whatever'), false, bad);
      assert.ok(hasher.needsRehash(bad));
    }
  });

  it('spends a real verification on a dummy hash', async () => {
    await hasher.verifyDummy('anything at all');
  });

  it('serves more requests than it runs at once without losing any', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => hasher.hash(`password number ${String(i)}`)),
    );
    assert.equal(new Set(results).size, 12);
  });
});

describe('tokens and recovery codes', () => {
  it('makes distinct 256-bit session tokens and hashes them to 64 hex characters', () => {
    const a = newSessionToken();
    assert.notEqual(a, newSessionToken());
    assert.match(a, /^[A-Za-z0-9_-]{43}$/u);
    assert.match(hashToken(a), /^[0-9a-f]{64}$/u);
    assert.equal(hashToken(a), hashToken(a));
  });

  it('makes ten distinct recovery codes in the XXXX-XXXX-XXXX form', () => {
    const codes = newRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    for (const code of codes) {
      assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/u);
    }
  });

  it('normalizes what a person types, and nothing else', () => {
    const code = newRecoveryCode();
    const raw = code.replaceAll('-', '');
    assert.equal(normalizeRecoveryCode(code), raw);
    assert.equal(normalizeRecoveryCode(` ${code.toLowerCase()} `), raw);
    assert.equal(normalizeRecoveryCode(raw.slice(1)), null);
    assert.equal(
      normalizeRecoveryCode('0000-0000-0000'),
      null,
      'look-alike characters are not in the alphabet',
    );
    assert.equal(normalizeRecoveryCode('123456'), null);
  });

  it('hashes a code deterministically and apart from session token hashes', () => {
    const raw = 'ABCDEFGHJKLM';
    assert.equal(recoveryCodeHash(raw), recoveryCodeHash(raw));
    assert.notEqual(recoveryCodeHash(raw), hashToken(raw));
  });

  it('tells an authenticator code from a recovery code', () => {
    assert.ok(looksLikeTotpCode('123456'));
    assert.ok(looksLikeTotpCode('123 456'));
    assert.ok(!looksLikeTotpCode('12345'));
    assert.ok(!looksLikeTotpCode('ABCD-EFGH-JKLM'));
    assert.ok(!looksLikeTotpCode('1234567'));
  });
});

describe('cookies and limits', () => {
  it('reads one cookie and ignores the rest', () => {
    assert.equal(readCookie('a=1; sw_session=abc123; b=2', 'sw_session'), 'abc123');
    assert.equal(readCookie('sw_session=first; sw_session=second', 'sw_session'), 'first');
    assert.equal(readCookie('other=1', 'sw_session'), undefined);
    assert.equal(readCookie(undefined, 'sw_session'), undefined);
    assert.equal(readCookie('sw_session=', 'sw_session'), undefined);
    assert.equal(readCookie(`sw_session=${'x'.repeat(300)}`, 'sw_session'), undefined);
    assert.equal(readCookie('no equals sign; sw_session=ok', 'sw_session'), 'ok');
  });

  it('allows a number of hits per window, per key, and starts over after the window', () => {
    let now = 0;
    const limiter = new WindowLimiter(3, 1000, () => now);
    assert.deepEqual(
      [1, 2, 3, 4].map(() => limiter.hit('a')),
      [true, true, true, false],
    );
    assert.ok(limiter.hit('b'), 'another key has its own window');
    now = 1000;
    assert.ok(limiter.hit('a'), 'the window is over');
  });
});
