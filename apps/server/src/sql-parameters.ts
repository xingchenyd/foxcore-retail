// Convert only bare bind markers. SQL values always travel separately via pg.
export function bind(sql: string, expected: number): string {
  let out = '', n = 0;
  for (let i = 0; i < sql.length;) {
    const start = i, c = sql[i], next = sql[i+1];
    if (c === "'" || c === '"') {
      const escape = c === "'" && /[eE]/.test(sql[i-1] ?? '') && !/[\w$]/.test(sql[i-2] ?? '');
      i++;
      while (i < sql.length) {
        const ch = sql[i++];
        if (escape && ch === '\\') i++;
        else if (ch === c) { if (sql[i] === c) i++; else break; }
      }
    } else if (c === '-' && next === '-') {
      while (i < sql.length && !/[\r\n]/.test(sql[i])) i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      let depth = 1;
      while (i < sql.length && depth) {
        const pair = sql.slice(i, i+2);
        if (pair === '/*') { depth++; i += 2; }
        else if (pair === '*/') { depth--; i += 2; }
        else i++;
      }
    } else if (c === '$' && /^\$(?:[a-zA-Z_]\w*)?\$/.test(sql.slice(i))) {
      const delimiter = sql.slice(i).match(/^\$(?:[a-zA-Z_]\w*)?\$/)![0];
      const end = sql.indexOf(delimiter, i + delimiter.length);
      i = end < 0 ? sql.length : end + delimiter.length;
    } else {
      i++;
      if (c === '?') { out += '$' + ++n; continue; }
    }
    out += sql.slice(start, i);
  }
  if (n !== expected) throw new Error('SQL bind parameter count mismatch');
  return out;
}
