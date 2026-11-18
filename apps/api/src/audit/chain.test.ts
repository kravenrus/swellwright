import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalDetails,
  chainHash,
  type ChainFields,
  checkEvent,
  GENESIS_HASH,
  START_OF_CHAIN,
  type StoredEvent,
} from './chain.js';

const base: ChainFields = {
  seq: 1n,
  occurredAt: new Date('2026-11-18T12:00:00.000Z'),
  actorId: '0193a0b0-0000-7000-8000-000000000001',
  actorName: 'owner',
  action: 'auth.login.succeeded',
  outcome: 'success',
  objectType: 'user',
  objectId: '0193a0b0-0000-7000-8000-000000000001',
  ip: '203.0.113.7',
  requestId: 'req-1',
  details: '{"method":"totp"}',
  prevHash: GENESIS_HASH,
};

const stored = (fields: ChainFields): StoredEvent => ({ ...fields, hash: chainHash(fields) });

describe('canonical details', () => {
  it('writes one text for one set of facts, whatever the order they were given in', () => {
    assert.equal(
      canonicalDetails({ b: 1, a: 'x', c: true, d: null }),
      '{"a":"x","b":1,"c":true,"d":null}',
    );
    assert.equal(canonicalDetails({ a: 'x', b: 1 }), canonicalDetails({ b: 1, a: 'x' }));
    assert.equal(canonicalDetails({}), '{}');
  });

  it('refuses anything that is not a flat record of short values', () => {
    assert.throws(() => canonicalDetails({ nested: { a: 1 } } as never));
    assert.throws(() => canonicalDetails({ list: [1] } as never));
    assert.throws(() => canonicalDetails({ ratio: 0.5 }));
    assert.throws(() => canonicalDetails({ text: 'x'.repeat(201) }));
    assert.throws(() => canonicalDetails({ 'Bad Key': 'x' }));
  });
});

describe('chain hash', () => {
  it('is a SHA-256 hex digest that does not change', () => {
    const hash = chainHash(base);
    assert.match(hash, /^[0-9a-f]{64}$/u);
    assert.equal(chainHash({ ...base }), hash);
    // Pinned: a change here means every stored chain stops verifying (bump the format version instead).
    assert.equal(hash, '0dafc08f03d1678975cd82f08c4c0cd01c87470ab90f3e3cf8ed8c2032f199a8');
  });

  it('changes with every field it covers', () => {
    const changed: Partial<Record<keyof ChainFields, ChainFields[keyof ChainFields]>> = {
      seq: 2n,
      occurredAt: new Date('2026-11-18T12:00:00.001Z'),
      actorId: '0193a0b0-0000-7000-8000-000000000002',
      actorName: 'other',
      action: 'auth.logout',
      outcome: 'failure',
      objectType: 'route',
      objectId: 'x',
      ip: '203.0.113.8',
      requestId: 'req-2',
      details: '{"method":"recovery_code"}',
      prevHash: 'a'.repeat(64),
    };
    const original = chainHash(base);
    for (const [field, value] of Object.entries(changed)) {
      assert.notEqual(chainHash({ ...base, [field]: value }), original, field);
    }
  });

  it('tells an absent value from an empty one, and one field from its neighbour', () => {
    assert.notEqual(chainHash({ ...base, ip: null }), chainHash({ ...base, ip: '' }));
    assert.notEqual(
      chainHash({ ...base, actorName: 'ab', action: 'c' }),
      chainHash({ ...base, actorName: 'a', action: 'bc' }),
    );
  });
});

describe('checking an event at its place', () => {
  it('accepts an intact first event and an intact second one', () => {
    const first = stored(base);
    assert.equal(checkEvent(first, START_OF_CHAIN), null);
    const second = stored({ ...base, seq: 2n, prevHash: first.hash });
    assert.equal(checkEvent(second, { nextSeq: 2n, prevHash: first.hash }), null);
  });

  it('reports a number that is not the expected one as missing', () => {
    assert.equal(checkEvent(stored({ ...base, seq: 3n }), START_OF_CHAIN), 'missing');
    assert.equal(checkEvent(stored(base), { nextSeq: 2n, prevHash: GENESIS_HASH }), 'missing');
  });

  it('reports a wrong predecessor as a broken link', () => {
    assert.equal(checkEvent(stored({ ...base, prevHash: 'b'.repeat(64) }), START_OF_CHAIN), 'link');
  });

  it('reports changed content as content', () => {
    const tampered: StoredEvent = { ...stored(base), outcome: 'failure' };
    assert.equal(checkEvent(tampered, START_OF_CHAIN), 'content');
    assert.equal(checkEvent({ ...stored(base), hash: 'c'.repeat(64) }, START_OF_CHAIN), 'content');
  });
});
