import './load-env.mjs';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {validateCloudEnvironment} from './cloud-config.mjs';

const config = validateCloudEnvironment(process.env);
process.env.HOST = config.host;
process.env.PORT = String(config.port);
process.env.NODE_ENV = 'production';
// Bootstrap credentials are used only by the explicit setup command.
function clearSetupCredentials(){for (const key of ['OWNER_PASSWORD','OWNER_PASSWORD_FILE','DB_MIGRATION_USER','DB_MIGRATION_PASSWORD','DB_MIGRATION_PASSWORD_FILE','ALLOW_PRODUCTION_MIGRATION']) delete process.env[key];}
clearSetupCredentials();
if (config.bootstrap) {
  // Obtain an assigned domain without exposing business routes or opening the DB.
  createServer((req,res) => {
    const live = req.url === '/health/live';
    res.writeHead(live ? 200 : 503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({status:live?'alive':'not-ready',mode:'bootstrap',message:'Configure PUBLIC_ORIGIN, run setup:cloud, then remove CLOUD_BOOTSTRAP and redeploy.'}));
  }).listen(config.port,config.host,() => console.log('Cloud health-only bootstrap listening; business routes are disabled.'));
} else {
  if (!existsSync(new URL('../apps/web/dist/index.html',import.meta.url)) || !existsSync(new URL('../apps/server/dist/index.js',import.meta.url))) throw Error('Missing artifacts; run npm run build:cloud first');
  await import('../apps/server/dist/index.js');
  // db.ts can also load the optional .env. Remove setup-only process values again.
  clearSetupCredentials();
}
