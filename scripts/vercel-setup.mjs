// Explicit WorkBuddy/cloud bootstrap. Never imported by the application server.
import './load-env.mjs';
import {connect,secret} from './pg-connection.mjs';
import {migrate,requireProductionGate} from './pg-migrations.mjs';
import {initializeOwner} from './pg-owner.mjs';

requireProductionGate();
const user=process.env.DB_MIGRATION_USER ?? process.env.DB_USER;
const password=process.env.DB_MIGRATION_USER ? await secret('DB_MIGRATION_PASSWORD') : await secret('DB_PASSWORD');
if (!password) throw Error('Set private database setup credentials');
const db=await connect({user,password});
try {
  await migrate(db);
  await initializeOwner(db,()=>secret('OWNER_PASSWORD'));
  console.log('Cloud schema ready.');
} finally { await db.end(); }
