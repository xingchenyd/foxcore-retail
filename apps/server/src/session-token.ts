import { ApiError } from './core.js';

/** One explicit transport per request. Never fall back from a broken bearer to a cookie. */
export function sessionToken(authorization: unknown, cookie: unknown): string | undefined {
  if (authorization !== undefined) {
    if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization) || cookie !== undefined) {
      throw new ApiError(401, 'INVALID_SESSION_TRANSPORT', '登录凭证无效，请重新登录');
    }
    return authorization.slice(7);
  }
  return typeof cookie === 'string' && /^[A-Za-z0-9_-]{43}$/.test(cookie) ? cookie : undefined;
}
