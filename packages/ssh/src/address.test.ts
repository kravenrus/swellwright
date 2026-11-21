import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertTargetAddress,
  classifyAddress,
  resolveTargetAddress,
  validateTargetAddress,
  type AddressKind,
} from './address.js';
import { SshInputError } from './errors.js';

const CASES: readonly (readonly [string, AddressKind])[] = [
  // IPv4
  ['8.8.8.8', 'public'],
  ['1.1.1.1', 'public'],
  ['10.1.2.3', 'private'],
  ['172.16.0.1', 'private'],
  ['172.31.255.255', 'private'],
  ['172.32.0.1', 'public'],
  ['192.168.1.1', 'private'],
  ['100.64.0.1', 'private'],
  ['100.127.255.255', 'private'],
  ['100.128.0.1', 'public'],
  ['127.0.0.1', 'loopback'],
  ['127.255.255.254', 'loopback'],
  ['169.254.1.1', 'link_local'],
  ['169.254.169.254', 'metadata'],
  ['100.100.100.200', 'metadata'],
  ['0.0.0.0', 'unspecified'],
  ['0.1.2.3', 'unspecified'],
  ['224.0.0.1', 'multicast'],
  ['239.255.255.250', 'multicast'],
  ['240.0.0.1', 'reserved'],
  ['255.255.255.255', 'reserved'],
  ['198.18.0.1', 'reserved'],
  ['203.0.113.10', 'documentation'],
  ['192.0.2.1', 'documentation'],
  ['198.51.100.9', 'documentation'],
  // IPv6
  ['::1', 'loopback'],
  ['::', 'unspecified'],
  ['fe80::1', 'link_local'],
  ['fe80::1%eth0', 'link_local'],
  ['febf::1', 'link_local'],
  ['fec0::1', 'public'],
  ['fc00::1', 'private'],
  ['fd12:3456:789a::1', 'private'],
  ['ff02::1', 'multicast'],
  ['2001:db8::1', 'documentation'],
  ['2606:4700:4700::1111', 'public'],
  ['fd00:ec2::254', 'metadata'],
  ['[::1]', 'loopback'],
  // IPv6 forms that carry an IPv4 address
  ['::ffff:127.0.0.1', 'loopback'],
  ['::ffff:7f00:1', 'loopback'],
  ['::ffff:169.254.169.254', 'metadata'],
  ['::ffff:10.0.0.1', 'private'],
  ['::ffff:8.8.8.8', 'public'],
  ['::127.0.0.1', 'loopback'],
  ['64:ff9b::7f00:1', 'loopback'],
  ['0:0:0:0:0:ffff:127.0.0.1', 'loopback'],
  // names
  ['localhost', 'loopback'],
  ['LOCALHOST.', 'loopback'],
  ['api.localhost', 'loopback'],
  ['ip6-localhost', 'loopback'],
  ['metadata.google.internal', 'metadata'],
  ['METADATA', 'metadata'],
  ['node1.example.com', 'hostname'],
  ['my_node-1.example.org.', 'hostname'],
  ['127.0.0.1.example.com', 'hostname'],
  ['cafe.example', 'hostname'],
  // things that are not addresses, or that a resolver would read differently from how they look
  ['', 'invalid'],
  ['   ', 'invalid'],
  ['127.1', 'invalid'],
  ['2130706433', 'invalid'],
  ['0x7f.1', 'invalid'],
  ['0x7f000001', 'invalid'],
  ['0177.0.0.1', 'invalid'],
  ['1.2.3', 'invalid'],
  ['256.1.1.1', 'invalid'],
  ['a..b', 'invalid'],
  ['-bad.example.com', 'invalid'],
  ['exa mple.com', 'invalid'],
  ['host:22', 'invalid'],
  ['http://example.com', 'invalid'],
  ['example.com/path', 'invalid'],
  ['::g', 'invalid'],
  ['1:2:3:4:5:6:7:8:9', 'invalid'],
  ['a'.repeat(254), 'invalid'],
  ['bad\nhost', 'invalid'],
];

describe('classifyAddress', () => {
  for (const [input, kind] of CASES) {
    it(`${JSON.stringify(input.length > 40 ? `${input.slice(0, 20)}...` : input)} is ${kind}`, () => {
      assert.equal(classifyAddress(input), kind);
    });
  }
});

describe('validateTargetAddress', () => {
  it('refuses loopback, link-local, metadata, unspecified, multicast, reserved and malformed input by default', () => {
    for (const bad of [
      '127.0.0.1',
      '::1',
      'localhost',
      '169.254.1.1',
      'fe80::1',
      '169.254.169.254',
      'fd00:ec2::254',
      'metadata.google.internal',
      '0.0.0.0',
      '::',
      '224.0.0.1',
      '255.255.255.255',
      '2130706433',
      '',
      '::ffff:127.0.0.1',
    ]) {
      const check = validateTargetAddress(bad);
      assert.equal(check.allowed, false, bad);
      if (!check.allowed) assert.ok(check.reason.length > 0);
    }
  });

  it('allows public, private, documentation addresses and host names by default', () => {
    for (const good of [
      '8.8.8.8',
      '10.20.30.40',
      '192.168.0.10',
      '100.64.1.1',
      '203.0.113.10',
      'fd12::1',
      '2606:4700::1111',
      'node.example.com',
    ]) {
      assert.deepEqual(validateTargetAddress(good).allowed, true, good);
    }
  });

  it('lets each exception be switched on separately', () => {
    assert.equal(validateTargetAddress('127.0.0.1', { allowLoopback: true }).allowed, true);
    assert.equal(validateTargetAddress('localhost', { allowLoopback: true }).allowed, true);
    assert.equal(validateTargetAddress('::1', { allowLoopback: true }).allowed, true);
    assert.equal(validateTargetAddress('169.254.5.5', { allowLinkLocal: true }).allowed, true);
    assert.equal(validateTargetAddress('fe80::1', { allowLinkLocal: true }).allowed, true);
    // Link-local does not include the metadata service, and loopback does not include link-local.
    assert.equal(validateTargetAddress('169.254.169.254', { allowLinkLocal: true }).allowed, false);
    assert.equal(validateTargetAddress('169.254.169.254', { allowMetadata: true }).allowed, true);
    assert.equal(validateTargetAddress('169.254.5.5', { allowLoopback: true }).allowed, false);
    assert.equal(
      validateTargetAddress('127.0.0.1', { allowLinkLocal: true, allowMetadata: true }).allowed,
      false,
    );
    // Nothing switches on the addresses that are never a server.
    for (const never of ['0.0.0.0', '::', '224.0.0.1', '255.255.255.255', '2130706433']) {
      assert.equal(
        validateTargetAddress(never, {
          allowLoopback: true,
          allowLinkLocal: true,
          allowMetadata: true,
          allowPrivate: true,
          allowHostnames: true,
        }).allowed,
        false,
        never,
      );
    }
  });

  it('can refuse private ranges and host names', () => {
    assert.equal(validateTargetAddress('10.0.0.1', { allowPrivate: false }).allowed, false);
    assert.equal(validateTargetAddress('fd12::1', { allowPrivate: false }).allowed, false);
    assert.equal(validateTargetAddress('8.8.8.8', { allowPrivate: false }).allowed, true);
    assert.equal(
      validateTargetAddress('node.example.com', { allowHostnames: false }).allowed,
      false,
    );
    assert.equal(validateTargetAddress('8.8.8.8', { allowHostnames: false }).allowed, true);
  });

  it('reports the kind and the address it judged', () => {
    assert.deepEqual(validateTargetAddress('8.8.8.8'), {
      allowed: true,
      kind: 'public',
      address: '8.8.8.8',
    });
    const refused = validateTargetAddress('127.0.0.1');
    assert.equal(refused.kind, 'loopback');
    assert.equal(refused.address, '127.0.0.1');
  });
});

describe('assertTargetAddress', () => {
  it('throws SshInputError for a refused address and returns for an allowed one', () => {
    assert.throws(() => {
      assertTargetAddress('169.254.169.254');
    }, SshInputError);
    assert.doesNotThrow(() => {
      assertTargetAddress('203.0.113.10');
    });
    assert.doesNotThrow(() => {
      assertTargetAddress('127.0.0.1', { allowLoopback: true });
    });
  });
});

describe('resolveTargetAddress', () => {
  it('checks a literal address and returns it without resolving anything', async () => {
    assert.deepEqual(await resolveTargetAddress('203.0.113.10'), {
      address: '203.0.113.10',
      addresses: ['203.0.113.10'],
    });
    assert.deepEqual(await resolveTargetAddress('[2001:db8::1]'), {
      address: '2001:db8::1',
      addresses: ['2001:db8::1'],
    });
    await assert.rejects(resolveTargetAddress('127.0.0.1'), SshInputError);
    await assert.rejects(resolveTargetAddress('169.254.169.254'), SshInputError);
  });

  it('resolves a name and refuses it when any answer is forbidden', async () => {
    // "localhost" resolves to loopback addresses on every machine.
    await assert.rejects(resolveTargetAddress('localhost'), SshInputError);
    const allowed = await resolveTargetAddress('localhost', { allowLoopback: true });
    assert.equal(classifyAddress(allowed.address), 'loopback');
    assert.ok(allowed.addresses.length >= 1);
    for (const address of allowed.addresses) assert.equal(classifyAddress(address), 'loopback');
  });

  it('refuses a name that does not resolve', async () => {
    await assert.rejects(resolveTargetAddress('no-such-host.invalid'), SshInputError);
  });
});
