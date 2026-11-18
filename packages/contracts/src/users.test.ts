import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AcceptInvitationRequestSchema,
  ChangePasswordRequestSchema,
  CreateUserRequestSchema,
  routes,
  UpdateUserRequestSchema,
  UserIdParamsSchema,
  UserListQuerySchema,
} from './index.js';

describe('user schemas', () => {
  it('takes a login name, a role and optional details to invite someone', () => {
    assert.ok(
      CreateUserRequestSchema.safeParse({ username: 'new-user', role: 'operator' }).success,
    );
    assert.ok(
      CreateUserRequestSchema.safeParse({
        username: 'new-user',
        role: 'observer',
        displayName: 'New User',
        email: 'new@example.org',
      }).success,
    );
    for (const bad of [
      { username: 'New User', role: 'operator' },
      { username: 'new-user', role: 'root' },
      { username: 'new-user' },
      { role: 'observer' },
      { username: 'new-user', role: 'observer', email: 'nope' },
      { username: 'new-user', role: 'observer', displayName: '' },
      { username: 'new-user', role: 'observer', displayName: 'x'.repeat(101) },
    ]) {
      assert.ok(!CreateUserRequestSchema.safeParse(bad).success, JSON.stringify(bad));
    }
  });

  it('wants at least one field to change, and lets null clear the optional ones', () => {
    assert.ok(!UpdateUserRequestSchema.safeParse({}).success);
    assert.ok(UpdateUserRequestSchema.safeParse({ role: 'auditor' }).success);
    assert.ok(UpdateUserRequestSchema.safeParse({ status: 'disabled' }).success);
    assert.ok(UpdateUserRequestSchema.safeParse({ displayName: null, email: null }).success);
    assert.ok(!UpdateUserRequestSchema.safeParse({ status: 'deleted' }).success);
    assert.ok(!UpdateUserRequestSchema.safeParse({ role: null }).success);
  });

  it('applies the password policy to a new password only', () => {
    assert.ok(
      ChangePasswordRequestSchema.safeParse({
        currentPassword: 'old',
        newPassword: 'a long enough one',
      }).success,
    );
    assert.ok(
      !ChangePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'short' })
        .success,
    );
    assert.ok(
      !AcceptInvitationRequestSchema.safeParse({ token: 'x'.repeat(43), password: 'short' })
        .success,
    );
    assert.ok(
      !AcceptInvitationRequestSchema.safeParse({ token: 'short', password: 'long enough password' })
        .success,
    );
  });

  it('reads a page request from strings, and an id as a UUID', () => {
    assert.deepEqual(UserListQuerySchema.parse({ limit: '50' }), { limit: 50 });
    assert.ok(!UserListQuerySchema.safeParse({ limit: '0' }).success);
    assert.ok(!UserListQuerySchema.safeParse({ cursor: 'nope' }).success);
    assert.ok(!UserIdParamsSchema.safeParse({ id: 'nope' }).success);
  });
});

describe('user routes', () => {
  const route = (id: string): { readonly auth: string; readonly permission?: string } | undefined =>
    routes.find((r) => r.operationId === id);

  it('reads with users:read, writes with users:write, and opens the invitation to anyone', () => {
    assert.equal(route('listUsers')?.permission, 'users:read');
    for (const id of ['createUser', 'updateUser', 'resetCredentials']) {
      assert.equal(route(id)?.permission, 'users:write', id);
    }
    assert.equal(route('acceptInvitation')?.auth, 'none');
    assert.equal(route('changePassword')?.auth, 'session');
    assert.equal(route('changePassword')?.permission, undefined);
  });
});
