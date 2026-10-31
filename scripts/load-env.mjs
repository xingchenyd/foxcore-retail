import {fileURLToPath} from 'node:url';

/** Optional root .env, including production; never overrides real process variables. */
export function loadEnvironment(path = fileURLToPath(new URL('../.env', import.meta.url))) {
  try { process.loadEnvFile(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
loadEnvironment();
