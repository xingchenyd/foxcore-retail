import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';

// The policy tests never connect to a database or load the project's local environment.
vi.mock('../../apps/server/src/db.js', () => ({ pool: {}, exec: vi.fn(), first: vi.fn(), tx: vi.fn() }));
import { writable, type Actor } from '../../apps/server/src/auth.js';

const actor: Actor = { id: '1', username: 'temporary', role: 'SALESPERSON', salespersonId: '1', mustChangePassword: true, csrf: 'valid-token' };
const request = (url: string, csrf = actor.csrf) => ({ url, headers: { 'x-csrf-token': csrf } } as unknown as FastifyRequest);

describe('forced password change write policy', () => {
  it('allows the temporary account to terminate its session', () => {
    expect(() => writable(request('/api/v1/auth/logout'), actor)).not.toThrow();
  });
  it('allows changing the temporary password', () => {
    expect(() => writable(request('/api/v1/auth/password'), actor)).not.toThrow();
  });
  it('continues to forbid business mutations before the password is changed', () => {
    expect(() => writable(request('/api/v1/sales'), actor)).toThrow(expect.objectContaining({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' }));
  });
  it('still requires CSRF for logout', () => {
    expect(() => writable(request('/api/v1/auth/logout', 'incorrect'), actor)).toThrow(expect.objectContaining({ status: 403, code: 'CSRF' }));
  });
});
