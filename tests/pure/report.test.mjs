import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const load=x=>import(pathToFileURL(resolve(process.env.FOXCORE_COMPILED,'apps/server/src/'+x+'.js')));
const { buildReportQuery } = await load('report-query');
const { salesCsv } = await load('csv');
const owner={role:'OWNER',salespersonId:null};
test('FX-F04-01/04 event filter intersects salesperson scope in SQL bindings',()=>{
  const query=buildReportQuery({group:'product',eventId:'10'},{role:'SALESPERSON',salespersonId:'7'});
  assert.deepEqual(query.values,['10','7']); assert.match(query.sql,/f\.event_id=\?/); assert.match(query.sql,/f\.salesperson_id=\?/);
  assert.doesNotMatch(query.sql,/AS estimated_margin_cents/); assert.match(query.sql,/ORDER BY net_cents DESC, id ASC$/);
});
test('owner report preserves standard-cost margin and global scope',()=>{
  const q=buildReportQuery({},owner); assert.equal(q.values.length,0); assert.match(q.sql,/estimated_margin_cents/);
});
for(const query of [{group:'typo'},{group:['product']},{eventId:''},{eventId:'1 OR 1=1'},{eventId:'-2'}])
  test(`FX-F04-06 reject invalid report selector ${JSON.stringify(query)}`,()=>assert.throws(()=>buildReportQuery(query,owner),e=>e.status===400));
test('salesperson cannot accidentally get global report with missing identity',()=>assert.throws(()=>buildReportQuery({}, {role:'SALESPERSON',salespersonId:null})));
test('FX-F04-02/03 report facts retain POSTED sales and POSTED returns only',()=>{
  const q=buildReportQuery({group:'product'},owner);
  assert.match(q.sql,/sa\.state='POSTED'/); assert.match(q.sql,/r\.state='POSTED'/); assert.match(q.sql,/UNION ALL/);
  assert.match(q.sql,/IF\(rl\.disposition='RESTOCK'/);
});
// RFC-style state parser for tests: handles quoted commas, escaped quotes, CR/LF and BOM.
function parseCsv(csv) {
  const rows=[]; let row=[],cell='',quoted=false; csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++) {
    const c=csv[i]; if(quoted){if(c==='"'&&csv[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;}else cell+=c;}
    else if(c==='"')quoted=true; else if(c===','){row.push(cell);cell='';}
    else if(c==='\r'&&csv[i+1]==='\n'){row.push(cell);rows.push(row);cell='';row=[];i++;}
    else cell+=c;
  }
  assert.equal(quoted,false); if(cell.length||row.length){row.push(cell);rows.push(row);} return rows;
}
const row={id:'9007199254740993',name:'normal',quantity:'-1',net_cents:'-1000',tax_cents:'-130',commission_cents:'-50',estimated_margin_cents:'-600'};
test('FX-F07-06 CSV quotes commas, double quotes and line breaks',()=>{
  const data=parseCsv(salesCsv([{...row,name:'a,"b"\r\nc'}])); assert.equal(data[1][1],'a,"b"\r\nc'); assert.equal(data[1][0],row.id); assert.equal(data[1][2],'-1');
});
for(const name of ['=HYPERLINK("x")','+CMD','@SUM(A1:A2)','-CMD',' \t=1+1','\ttext','\n=1'])
  test(`CSV protects formula text ${JSON.stringify(name)}`,()=>assert.equal(parseCsv(salesCsv([{...row,name}]))[1][1],"'"+name));
test('FX-F07-02 CSV has every group beyond 100, not just the first page',()=>{
  const data=Array.from({length:101},(_,i)=>({...row,id:String(i+1)}));assert.equal(parseCsv(salesCsv(data)).length,102);
});
test('CSV rejects excess resource limit rather than partial success',()=>assert.throws(()=>salesCsv(Array.from({length:10001},()=>row)),e=>e.status===413));
test('CSV numeric columns cannot carry arbitrary spreadsheet formulas',()=>assert.throws(()=>salesCsv([{...row,net_cents:'=1+1'}])));
