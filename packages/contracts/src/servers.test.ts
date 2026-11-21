import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AddAccessRequestSchema,
  CreateServerRequestSchema,
  FingerprintSchema,
  isValidServerAddress,
  PinHostKeyRequestSchema,
  type RouteDef,
  routes,
  ServerAddressSchema,
  ServerListQuerySchema,
  ServerNameSchema,
  UpdateAccessRequestSchema,
  UpdateServerRequestSchema,
} from './index.js';

const FINGERPRINT = `SHA256:${'A'.repeat(43)}`;
const SECRET = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

describe('server names', () => {
  it('takes letters, digits, spaces, dots, dashes and underscores, 1 to 64 characters', () => {
    for (const ok of ['a', 'web-01', 'edge 1', 'build_box.2', 'x'.repeat(64)]) {
      assert.ok(ServerNameSchema.safeParse(ok).success, ok);
    }
    for (const bad of ['', '   ', 'x'.repeat(65), 'a/b', 'a;b', 'café', 'line\nbreak']) {
      assert.ok(!ServerNameSchema.safeParse(bad).success, JSON.stringify(bad));
    }
  });

  it('trims the name before it checks the length', () => {
    assert.equal(ServerNameSchema.parse('  edge  '), 'edge');
  });
});

describe('server addresses', () => {
  it('takes host names, IPv4 and IPv6 addresses', () => {
    for (const ok of [
      'example.com',
      'a.b.example.org',
      'host-1.example.net',
      'localhost',
      '192.0.2.10',
      '198.51.100.255',
      '2001:db8::1',
      '2001:db8:0:0:0:0:0:1',
    ]) {
      assert.ok(isValidServerAddress(ok), ok);
    }
  });

  it('refuses what is not an address', () => {
    for (const bad of [
      '',
      ' ',
      'host name',
      'host_name.example.com',
      '-bad.example.com',
      'bad-.example.com',
      'example..com',
      'example.com.',
      '999.1.1.1',
      '192.0.2',
      'http://example.com',
      'example.com:22',
      'fe80::1%eth0',
      `${'a'.repeat(64)}.example.com`,
      `${'a.'.repeat(130)}com`,
    ]) {
      assert.ok(!isValidServerAddress(bad), bad);
    }
  });

  it('trims the address', () => {
    assert.equal(ServerAddressSchema.parse(' 192.0.2.1 '), '192.0.2.1');
  });
});

describe('host key fingerprints', () => {
  it('takes SHA256: and 43 base64 characters whose last character fits 256 bits', () => {
    assert.ok(FingerprintSchema.safeParse(FINGERPRINT).success);
    assert.ok(FingerprintSchema.safeParse(`SHA256:${'a'.repeat(42)}w`).success);
    assert.ok(FingerprintSchema.safeParse(`SHA256:${'+/'.repeat(21)}0`).success);
  });

  it('refuses everything else', () => {
    for (const bad of [
      '',
      'SHA256:',
      `SHA256:${'A'.repeat(42)}`,
      `SHA256:${'A'.repeat(44)}`,
      `SHA256:${'A'.repeat(42)}B`,
      `SHA256:${'A'.repeat(42)}=`,
      `sha256:${'A'.repeat(43)}`,
      `MD5:${'A'.repeat(43)}`,
      `SHA256:${'A'.repeat(41)}-A`,
      'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99',
    ]) {
      assert.ok(!FingerprintSchema.safeParse(bad).success, bad);
    }
  });

  it('needs an algorithm the way OpenSSH names it', () => {
    const base = { fingerprintSha256: FINGERPRINT };
    for (const ok of [
      'ssh-ed25519',
      'ecdsa-sha2-nistp256',
      'rsa-sha2-512',
      // A security-key type carries a domain after an at sign; built here so that it is not read as an address.
      ['sk-ssh-ed25519', 'openssh.com'].join('@'),
    ]) {
      assert.ok(PinHostKeyRequestSchema.safeParse({ ...base, algorithm: ok }).success, ok);
    }
    for (const bad of ['', 'x', 'SSH-ED25519', 'ssh ed25519', 'ssh-ed25519\nx']) {
      assert.ok(!PinHostKeyRequestSchema.safeParse({ ...base, algorithm: bad }).success, bad);
    }
  });
});

describe('creating and changing a server', () => {
  it('needs a name and an address, and fills nothing else in', () => {
    const parsed = CreateServerRequestSchema.parse({ name: 'edge', address: 'example.com' });
    assert.deepEqual(parsed, { name: 'edge', address: 'example.com' });
    assert.ok(!CreateServerRequestSchema.safeParse({ name: 'edge' }).success);
    assert.ok(!CreateServerRequestSchema.safeParse({ address: 'example.com' }).success);
  });

  it('checks the port, the country, the tags and the state', () => {
    const base = { name: 'edge', address: 'example.com' };
    assert.ok(CreateServerRequestSchema.safeParse({ ...base, sshPort: 65535 }).success);
    for (const sshPort of [0, 65536, 22.5, -1, '22']) {
      assert.ok(
        !CreateServerRequestSchema.safeParse({ ...base, sshPort }).success,
        String(sshPort),
      );
    }
    assert.equal(CreateServerRequestSchema.parse({ ...base, country: 'de' }).country, 'DE');
    for (const country of ['', 'D', 'DEU', 'D1']) {
      assert.ok(!CreateServerRequestSchema.safeParse({ ...base, country }).success, country);
    }
    assert.ok(
      CreateServerRequestSchema.safeParse({ ...base, tags: ['edge', 'eu:west', 'a.b_c-d'] })
        .success,
    );
    for (const tags of [
      ['has space'],
      ['-lead'],
      [''],
      ['x'.repeat(33)],
      Array.from({ length: 21 }, (_, i) => `t${String(i)}`),
    ]) {
      assert.ok(
        !CreateServerRequestSchema.safeParse({ ...base, tags }).success,
        JSON.stringify(tags),
      );
    }
    assert.ok(!CreateServerRequestSchema.safeParse({ ...base, state: 'running' }).success);
    assert.ok(!CreateServerRequestSchema.safeParse({ ...base, notes: 'n'.repeat(2001) }).success);
    assert.ok(!CreateServerRequestSchema.safeParse({ ...base, provider: 'p'.repeat(65) }).success);
  });

  it('refuses an empty change, and lets null clear the optional fields', () => {
    assert.ok(!UpdateServerRequestSchema.safeParse({}).success);
    const cleared = UpdateServerRequestSchema.parse({ country: null, provider: null, notes: null });
    assert.deepEqual(cleared, { country: null, provider: null, notes: null });
    assert.ok(!UpdateServerRequestSchema.safeParse({ name: null }).success);
  });

  it('filters the list by state, tag and text', () => {
    assert.deepEqual(ServerListQuerySchema.parse({ state: 'active', tag: 'eu', q: ' nl ' }), {
      state: 'active',
      tag: 'eu',
      q: 'nl',
    });
    assert.ok(!ServerListQuerySchema.safeParse({ state: 'gone' }).success);
  });
});

describe('access entries', () => {
  it('names a method, a login and a secret', () => {
    const ok = { method: 'password', username: 'root', secretId: SECRET };
    assert.ok(AddAccessRequestSchema.safeParse(ok).success);
    assert.ok(
      AddAccessRequestSchema.safeParse({ ...ok, sudoSecretId: SECRET, priority: 3 }).success,
    );
    for (const bad of [
      { ...ok, method: 'certificate' },
      { ...ok, username: 'Root' },
      { ...ok, username: '1root' },
      { ...ok, username: '' },
      { ...ok, username: 'a'.repeat(65) },
      { ...ok, secretId: 'not-a-uuid' },
      { ...ok, priority: -1 },
      { ...ok, priority: 1001 },
    ]) {
      assert.ok(!AddAccessRequestSchema.safeParse(bad).success, JSON.stringify(bad));
    }
  });

  it('lets a change drop the sudo secret with null, and refuses an empty change', () => {
    assert.ok(UpdateAccessRequestSchema.safeParse({ sudoSecretId: null }).success);
    assert.ok(!UpdateAccessRequestSchema.safeParse({}).success);
  });
});

describe('the server routes', () => {
  const mine = (routes as readonly RouteDef[]).filter((route) => route.tags.includes('servers'));

  it('declares a permission on every one, and none needs a step-up', () => {
    assert.equal(mine.length, 10);
    for (const route of mine) {
      assert.ok(
        route.permission === 'servers:read' || route.permission === 'servers:write',
        route.operationId,
      );
      assert.equal(route.stepUp, undefined, route.operationId);
    }
  });

  it('lets reading need only the read permission and every change the write permission', () => {
    for (const route of mine) {
      assert.equal(
        route.permission,
        route.method === 'get' ? 'servers:read' : 'servers:write',
        route.operationId,
      );
    }
  });
});
