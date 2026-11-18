import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { deriveKey } from './kdf.js';
import {
  decryptSecret,
  encryptSecret,
  formatRecoveryKey,
  newKek,
  newRecoveryKey,
  parseRecoveryKey,
  unwrapKekWithPassphraseKey,
  unwrapKekWithRecoveryKey,
  wrapKekUnderPassphraseKey,
  wrapKekUnderRecoveryKey,
} from './keys.js';

const identity = { id: '0193a0b0-0000-7000-8000-000000000001', version: 1, type: 'ssh_key' };

describe('the recovery key as text', () => {
  it('is thirteen groups of four, and reads back to the same bytes', () => {
    const key = newRecoveryKey();
    const text = formatRecoveryKey(key);
    assert.match(text, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){12}$/u);
    assert.deepEqual(parseRecoveryKey(text), key);
  });

  it('tolerates what people do when they copy a key: case, spaces, missing dashes', () => {
    const key = newRecoveryKey();
    const text = formatRecoveryKey(key);
    assert.deepEqual(parseRecoveryKey(text.toLowerCase()), key);
    assert.deepEqual(parseRecoveryKey(text.replace(/-/gu, ' ')), key);
    assert.deepEqual(parseRecoveryKey(`  ${text.replace(/-/gu, '')}\n`), key);
  });

  it('refuses text that cannot be a key', () => {
    const text = formatRecoveryKey(newRecoveryKey());
    for (const bad of [
      '',
      'nope',
      text.slice(0, -5),
      `${text}AAAA`,
      text.replace(/^./u, '1'),
      text.replace(/^./u, '!'),
    ]) {
      assert.equal(parseRecoveryKey(bad), null, JSON.stringify(bad));
    }
  });
});

describe('wrapping the key-encryption key', () => {
  it('opens only with the right key, and only for the slot it was made for', () => {
    const kek = newKek();
    const passphraseKey = randomBytes(32);
    const recoveryKey = randomBytes(32);
    const underPassphrase = wrapKekUnderPassphraseKey(kek, passphraseKey);
    const underRecovery = wrapKekUnderRecoveryKey(kek, recoveryKey);
    assert.deepEqual(unwrapKekWithPassphraseKey(underPassphrase, passphraseKey), kek);
    assert.deepEqual(unwrapKekWithRecoveryKey(underRecovery, recoveryKey), kek);
    assert.equal(unwrapKekWithPassphraseKey(underPassphrase, randomBytes(32)), null);
    assert.equal(unwrapKekWithRecoveryKey(underRecovery, randomBytes(32)), null);
    // Even with the right key, a blob does not open in the other slot.
    assert.equal(unwrapKekWithRecoveryKey(underPassphrase, passphraseKey), null);
    assert.equal(unwrapKekWithPassphraseKey(underRecovery, recoveryKey), null);
    assert.ok(!underPassphrase.includes(kek), 'the wrapped key does not contain the key');
  });

  it('does not open a blob that was altered or is not one', () => {
    const key = randomBytes(32);
    const blob = wrapKekUnderPassphraseKey(newKek(), key);
    const altered = Buffer.from(blob);
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1;
    assert.equal(unwrapKekWithPassphraseKey(altered, key), null);
    assert.equal(unwrapKekWithPassphraseKey(Buffer.from('short'), key), null);
  });
});

describe('encrypting a secret', () => {
  it('round-trips any text, and gives different bytes every time', () => {
    const kek = newKek();
    for (const value of [
      'hunter2',
      'пароль с юникодом ✓',
      'x'.repeat(32_768),
      '-----BEGIN KEY-----\nabc\n',
    ]) {
      const first = encryptSecret(kek, identity, value);
      const second = encryptSecret(kek, identity, value);
      assert.equal(decryptSecret(kek, identity, first), value);
      assert.notDeepEqual(first.ciphertext, second.ciphertext);
      assert.notDeepEqual(first.wrappedDek, second.wrappedDek);
    }
  });

  it('keeps the value out of what is stored', () => {
    const kek = newKek();
    const value = 'a-very-recognizable-secret-value';
    const { ciphertext, wrappedDek } = encryptSecret(kek, identity, value);
    assert.ok(!ciphertext.includes(value));
    assert.ok(!wrappedDek.includes(value));
  });

  it('does not open for another secret, version or type, or under another key', () => {
    const kek = newKek();
    const blobs = encryptSecret(kek, identity, 'value');
    for (const other of [
      { ...identity, id: '0193a0b0-0000-7000-8000-000000000002' },
      { ...identity, version: 2 },
      { ...identity, type: 'generic' },
    ]) {
      assert.throws(() => decryptSecret(kek, other, blobs), JSON.stringify(other));
    }
    assert.throws(() => decryptSecret(newKek(), identity, blobs));
  });

  it('does not open when either blob was altered or the two were taken from different secrets', () => {
    const kek = newKek();
    const a = encryptSecret(kek, identity, 'value a');
    const b = encryptSecret(kek, identity, 'value b');
    const flipped = Buffer.from(a.ciphertext);
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1;
    assert.throws(() => decryptSecret(kek, identity, { ...a, ciphertext: flipped }));
    assert.throws(() =>
      decryptSecret(kek, identity, { ciphertext: a.ciphertext, wrappedDek: b.wrappedDek }),
    );
  });
});

describe('hardening the passphrase', () => {
  const params = { memoryKib: 256, passes: 1, parallelism: 1 };

  it('gives the same key for the same passphrase, salt and cost, and another for anything else', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('correct horse battery staple', salt, params);
    assert.equal(key.length, 32);
    assert.deepEqual(await deriveKey('correct horse battery staple', salt, params), key);
    assert.notDeepEqual(await deriveKey('correct horse battery stapler', salt, params), key);
    assert.notDeepEqual(
      await deriveKey('correct horse battery staple', randomBytes(16), params),
      key,
    );
    assert.notDeepEqual(
      await deriveKey('correct horse battery staple', salt, { ...params, passes: 2 }),
      key,
    );
  });

  it('treats the same words typed another way as the same passphrase (NFKC)', async () => {
    const salt = randomBytes(16);
    const composed = await deriveKey('café au lait, please', salt, params);
    const decomposed = await deriveKey('café au lait, please', salt, params);
    assert.deepEqual(composed, decomposed);
  });

  it('runs several derivations asked for at once, one after another', async () => {
    const salt = randomBytes(16);
    const keys = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        deriveKey(`passphrase number ${String(i)}`, salt, params),
      ),
    );
    assert.equal(new Set(keys.map((k) => k.toString('hex'))).size, 4);
  });
});
