import {connect,secret} from './pg-connection.mjs';
import {migrate,requireProductionGate} from './pg-migrations.mjs';

requireProductionGate();
const user=process.env.DB_USER;
if (!/^[a-z][a-z0-9_]{0,62}$/.test(user??'') || user==='postgres') throw Error('Invalid runtime database role');
const db=await connect({user:'postgres',password:await secret('DB_ROOT_PASSWORD')});
const principal='"'+user+'"';
const updateTables=['venues','events','booths','products','salespeople','shifts','users','sessions','sales','sale_lines','stock_locations','stock_balances','stock_holds','returns','return_lines','commission_settlements','idempotency_keys','business_settings','stock_transfers','damage_records','cash_handovers','shift_extensions','sale_workspaces','exchanges','commission_claims'];
try {
  await migrate(db,async()=>{
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query('GRANT USAGE ON SCHEMA public TO '+principal);
    await db.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM '+principal);
    await db.query('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM '+principal);
    await db.query('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO '+principal);
    await db.query('REVOKE INSERT ON schema_migrations FROM '+principal);
    await db.query('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO '+principal);
    await db.query('GRANT UPDATE ON '+updateTables.join(',')+' TO '+principal);
    await db.query('GRANT DELETE ON sale_lines, commission_claims TO '+principal);
  });
  console.log('Runtime grants restricted; schema ready.');
} finally { await db.end(); }
