import { readFile } from 'node:fs/promises';
import { pool } from '../apps/server/src/db.js';
import type { RowDataPacket } from 'mysql2/promise';

const sql=(await Promise.all(['db/check-invariants.sql','db/check-fix-invariants.sql','db/check-operations-invariants.sql'].map(p=>readFile(p,'utf8')))).map(x=>x.trim().replace(/;$/,'')).join('\nUNION ALL\n')+';';
const db=await pool.getConnection();
try {
  const [rows]=await db.query<RowDataPacket[]>(sql);
  let failed=false;
  for(const row of rows){console.log(`${row.issue}: ${row.violations}`);if(BigInt(row.violations)>0n) failed=true;}
  if(failed) process.exitCode=1;
} finally {db.release();await pool.end();}
