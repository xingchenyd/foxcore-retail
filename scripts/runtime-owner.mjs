import {connect} from './pg-connection.mjs';
import {initializeOwner} from './pg-owner.mjs';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';

const db=await connect();
try {
  await initializeOwner(db,async()=>{
    const file=process.env.OWNER_PASSWORD_FILE;
    try { return (await readFile(file,'utf8')).trim(); }
    catch(error) {
      if(error.code!=='ENOENT') throw error;
      const initial=randomBytes(32).toString('base64url');
      await writeFile(file,initial,{mode:0o600,flag:'wx'});
      return initial;
    }
  });
} finally { await db.end(); }
