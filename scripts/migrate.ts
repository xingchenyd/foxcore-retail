import './load-env.mjs';
import { connect, secret } from './pg-connection.mjs';
import { migrate, requireProductionGate } from './pg-migrations.mjs';

requireProductionGate();
const user=process.env.DB_MIGRATION_USER;
const password=user ? await secret('DB_MIGRATION_PASSWORD') : await secret('DB_PASSWORD');
if (!password) throw new Error('Set private database setup credentials');
const db=await connect({user,password});
try { await migrate(db); } finally { await db.end(); }
