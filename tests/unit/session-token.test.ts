import { describe, expect, it, vi } from 'vitest';
vi.mock('../../apps/server/src/db.js', () => ({ pool: {}, exec: vi.fn(), first: vi.fn(), tx: vi.fn() }));
import { sessionToken } from '../../apps/server/src/session-token.js';

const token = 'a'.repeat(43);
describe('session credential transport', () => {
  it('accepts existing browser cookies', () => expect(sessionToken(undefined, token)).toBe(token));
  it('accepts the mini-program bearer without cookies', () => expect(sessionToken('Bearer ' + token, undefined)).toBe(token));
  it('rejects mixed credentials even if they are identical', () => expect(() => sessionToken('Bearer ' + token, token)).toThrow());
  it.each(['Basic x', 'Bearer invalid', 'Bearer ' + token + '\n', ['Bearer ' + token]])('rejects malformed credentials', value => {
    expect(() => sessionToken(value, undefined)).toThrow();
  });
  it('does not use a valid cookie as fallback for invalid bearer', () => expect(() => sessionToken('invalid', token)).toThrow());
  it('treats absent or invalid cookies as unauthenticated', () => {
    expect(sessionToken(undefined, undefined)).toBeUndefined();
    expect(sessionToken(undefined, 'bad')).toBeUndefined();
  });
});
