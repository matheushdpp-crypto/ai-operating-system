import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { authService } from '../../src/modules/auth/auth.service.js';

describe('Auth & RBAC Security Unit Tests', () => {
  const orgId = 'org_auth_test_1';

  test('creates user with salted hash and authenticates successfully', async () => {
    const user = await authService.createUser({
      organization_id: orgId,
      name: 'Security Admin',
      email: 'secadmin@enterprise.com',
      password: 'SuperSecurePassword2026!',
      role: 'ADMIN',
    });

    assert.equal(user.email, 'secadmin@enterprise.com');
    assert.equal(user.role, 'ADMIN');

    // Successful authentication
    const authUser = await authService.authenticate('secadmin@enterprise.com', 'SuperSecurePassword2026!');
    assert.ok(authUser);
    assert.equal(authUser.id, user.id);

    // Failed authentication with incorrect password
    const wrongAuth = await authService.authenticate('secadmin@enterprise.com', 'WrongPassword!');
    assert.equal(wrongAuth, null);
  });

  test('generates valid JWT token and verifies payload integrity', async () => {
    const user = await authService.createUser({
      organization_id: orgId,
      name: 'Operator User',
      email: 'operator@enterprise.com',
      password: 'OperatorPassword2026!',
      role: 'OPERATOR',
    });

    const token = authService.generateToken(user);
    assert.ok(token);
    assert.equal(typeof token, 'string');
    assert.equal(token.split('.').length, 3);

    const payload = authService.verifyToken(token);
    assert.ok(payload);
    assert.equal(payload.userId, user.id);
    assert.equal(payload.organizationId, orgId);
    assert.equal(payload.role, 'OPERATOR');
  });

  test('rejects tampered or forged JWT tokens', () => {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrZXIiLCJyb2xlIjoiQURNSU4ifQ.forgedSignature';
    const payload = authService.verifyToken(forgedToken);
    assert.equal(payload, null);
  });
});
