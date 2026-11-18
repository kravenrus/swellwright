import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildOpenApi } from './openapi.js';
import {
  AUDIT_ACTIONS,
  AuditDetailsSchema,
  AuditEventSchema,
  AuditQuerySchema,
  hasPermission,
  IMPLIED_PERMISSIONS,
  PERMISSION_INFO,
  PERMISSIONS,
  permissionsOf,
  ROLE_INFO,
  roleCatalog,
  RoleCatalogSchema,
  ROUTES_OPEN_TO_ANY_SESSION,
  routes,
  USER_ROLES,
} from './index.js';

type Json = Record<string, unknown>;

describe('permission catalogue', () => {
  it('names permissions as resource:action', () => {
    for (const permission of PERMISSIONS) {
      assert.match(permission, /^[a-z]+:[a-z]+$/u);
      assert.ok(PERMISSION_INFO[permission].length > 0, permission);
    }
  });

  it('gives the owner every permission, computed from the catalogue', () => {
    assert.deepEqual([...permissionsOf('owner')].sort(), [...PERMISSIONS].sort());
  });

  it('holds only catalogue permissions in every role, each once', () => {
    for (const role of USER_ROLES) {
      const held = permissionsOf(role);
      assert.equal(new Set(held).size, held.length, `${role} lists a permission twice`);
      for (const permission of held) {
        assert.ok(PERMISSIONS.includes(permission), `${role}: ${permission}`);
      }
    }
  });

  it('never grants a permission without the one it implies', () => {
    for (const role of USER_ROLES) {
      for (const permission of permissionsOf(role)) {
        const needed = IMPLIED_PERMISSIONS[permission];
        if (needed) {
          assert.ok(hasPermission(role, needed), `${role} has ${permission} but not ${needed}`);
        }
      }
    }
  });

  it('keeps the dangerous permissions with the owner', () => {
    for (const role of USER_ROLES.filter((r) => r !== 'owner')) {
      for (const permission of ['vault:reveal', 'vault:manage', 'users:write'] as const) {
        assert.ok(!hasPermission(role, permission), `${role} must not have ${permission}`);
      }
    }
    assert.ok(hasPermission('terminal', 'terminal:use'));
    assert.ok(!hasPermission('operator', 'terminal:use'));
    assert.ok(!hasPermission('observer', 'servers:write'));
    assert.ok(!hasPermission('operator', 'audit:read'));
  });

  it('lets only the auditor and the owner read the audit log', () => {
    const readers = USER_ROLES.filter((role) => hasPermission(role, 'audit:read'));
    assert.deepEqual(readers, ['owner', 'auditor']);
  });

  it('has a description for every role and an entry for every built-in role', () => {
    assert.deepEqual(Object.keys(ROLE_INFO).sort(), [...USER_ROLES].sort());
    for (const role of USER_ROLES) {
      assert.ok(ROLE_INFO[role].description.length > 0);
    }
  });

  it('sends a catalogue that matches its own schema', () => {
    const catalog = RoleCatalogSchema.parse(roleCatalog());
    assert.equal(catalog.roles.length, USER_ROLES.length);
    assert.equal(catalog.permissions.length, PERMISSIONS.length);
  });
});

describe('route permissions', () => {
  it('names a permission on every signed-in route, except the short open list', () => {
    for (const route of routes) {
      if (route.auth === 'none' || route.auth === 'pending') {
        assert.ok(
          !('permission' in route),
          `${route.operationId} is not for a signed-in user but names a permission`,
        );
        continue;
      }
      const open = ROUTES_OPEN_TO_ANY_SESSION.includes(route.operationId);
      const named = 'permission' in route;
      assert.ok(
        named !== open,
        open
          ? `${route.operationId} is on the open list and names a permission`
          : `${route.operationId} needs a permission (or a place on the open list)`,
      );
    }
  });

  it('keeps the open list short and real', () => {
    const ids: readonly string[] = routes.map((r) => r.operationId);
    for (const id of ROUTES_OPEN_TO_ANY_SESSION) {
      assert.ok(ids.includes(id), id);
    }
    assert.ok(ROUTES_OPEN_TO_ANY_SESSION.length <= 2);
  });

  it('puts the permission into the OpenAPI description', () => {
    const doc = buildOpenApi() as { paths: Record<string, Record<string, Json>> };
    assert.equal(doc.paths['/audit']?.['get']?.['x-sw-permission'], 'audit:read');
    assert.equal(doc.paths['/audit/verify-chain']?.['post']?.['x-sw-permission'], 'audit:verify');
    assert.equal(doc.paths['/roles']?.['get']?.['x-sw-permission'], 'roles:read');
    assert.equal(doc.paths['/auth/me']?.['get']?.['x-sw-permission'], undefined);
  });
});

describe('audit schemas', () => {
  it('names actions as area.subject.what', () => {
    for (const action of AUDIT_ACTIONS) {
      assert.match(action, /^[a-z]+(\.[a-z_]+){1,2}$/u, action);
    }
    assert.equal(new Set(AUDIT_ACTIONS).size, AUDIT_ACTIONS.length);
  });

  it('accepts only flat, short details', () => {
    assert.ok(
      AuditDetailsSchema.safeParse({ reason: 'locked', attempts: 5, ok: true, x: null }).success,
    );
    assert.ok(!AuditDetailsSchema.safeParse({ nested: { a: 1 } }).success);
    assert.ok(!AuditDetailsSchema.safeParse({ list: [1] }).success);
    assert.ok(!AuditDetailsSchema.safeParse({ ratio: 0.5 }).success);
    assert.ok(!AuditDetailsSchema.safeParse({ long: 'x'.repeat(201) }).success);
    assert.ok(!AuditDetailsSchema.safeParse({ 'Bad Key': 'x' }).success);
  });

  it('reads a query from strings, as it arrives in a URL', () => {
    const query = AuditQuerySchema.parse({ limit: '25', cursor: '120', outcome: 'denied' });
    assert.deepEqual(query, { limit: 25, cursor: 120, outcome: 'denied' });
    assert.ok(!AuditQuerySchema.safeParse({ limit: '0' }).success);
    assert.ok(!AuditQuerySchema.safeParse({ limit: '1000' }).success);
    assert.ok(!AuditQuerySchema.safeParse({ outcome: 'maybe' }).success);
    assert.ok(!AuditQuerySchema.safeParse({ actorId: 'not-a-uuid' }).success);
  });

  it('describes an event with its two hashes', () => {
    const event = AuditEventSchema.parse({
      seq: 1,
      occurredAt: '2026-11-18T12:00:00.000Z',
      actor: null,
      action: 'setup.owner.refused',
      outcome: 'failure',
      object: null,
      ip: null,
      requestId: null,
      details: { reason: 'invalid_token' },
      prevHash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    });
    assert.equal(event.seq, 1);
  });
});
