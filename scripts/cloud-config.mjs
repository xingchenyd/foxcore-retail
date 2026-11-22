import {isIP} from 'node:net';

export function validateCloudEnvironment(env, version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major === 24 || (major === 22 && minor >= 12))) throw Error('Cloud deployment requires Node 22.12+ or Node 24.x');
  if (env.APP_ENV !== 'production') throw Error('Set APP_ENV=production for the cloud launcher');
  if (env.VERCEL) throw Error('Use the Vercel entrypoint on Vercel, not start:cloud');
  const host = env.HOST ?? '0.0.0.0', port = Number(env.PORT ?? 3000);
  if (host !== '0.0.0.0') throw Error('Cloud HOST must be 0.0.0.0');
  if (!/^\d+$/.test(String(env.PORT ?? 3000)) || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be an integer from 1 to 65535');
  if (env.CLOUD_BOOTSTRAP && env.CLOUD_BOOTSTRAP !== 'health-only') throw Error('Unknown CLOUD_BOOTSTRAP mode');
  if (env.CLOUD_BOOTSTRAP === 'health-only') return {host, port, bootstrap:true};
  for (const key of ['DB_HOST','DB_USER','DB_NAME']) if (!env[key]?.trim()) throw Error('Missing '+key);
  if (!env.DB_PASSWORD && !env.DB_PASSWORD_FILE) throw Error('Missing DB_PASSWORD or DB_PASSWORD_FILE');
  if (!/^[a-z][a-z0-9_]*$/.test(env.DB_NAME)) throw Error('Invalid DB_NAME');
  if (!['localhost','127.0.0.1','::1'].includes(env.DB_HOST) && env.DB_SSL !== 'true') throw Error('Remote cloud database requires DB_SSL=true');
  if (env.COOKIE_SECURE !== 'true') throw Error('Cloud HTTPS requires COOKIE_SECURE=true');
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN); } catch { throw Error('Set PUBLIC_ORIGIN to the assigned HTTPS origin'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.PUBLIC_ORIGIN || origin.username || origin.password || isIP(origin.hostname) || !origin.hostname.includes('.') || /placeholder|[<>]|\.invalid$|\.example$|(^|\.)example\.(com|org|net)$/i.test(origin.hostname)) throw Error('PUBLIC_ORIGIN must be a real HTTPS origin without a path, query or trailing slash');
  return {host, port, bootstrap:false};
}
