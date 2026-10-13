import assert from 'node:assert/strict';
export function parseCsv(csv) {
  const rows=[]; let row=[],cell='',quoted=false; csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++) {
    const c=csv[i]; if(quoted){if(c==='"'&&csv[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;}else cell+=c;}
    else if(c==='"')quoted=true; else if(c===','){row.push(cell);cell='';}
    else if(c==='\r'&&csv[i+1]==='\n'){row.push(cell);rows.push(row);cell='';row=[];i++;}
    else cell+=c;
  }
  assert.equal(quoted,false); if(cell.length||row.length){row.push(cell);rows.push(row);} return rows;
}
