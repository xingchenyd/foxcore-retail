import { RuleError } from './fix-rules.js';
export const MAX_EXPORT_GROUPS = 10_000;
const columns = ['id','name','quantity','net_cents','tax_cents','commission_cents','estimated_margin_cents'] as const;
function quoted(value: string): string { return '"' + value.replaceAll('"','""') + '"'; }
export function salesCsv(items: Record<string, unknown>[]): string {
  if (items.length > MAX_EXPORT_GROUPS) throw new RuleError(413,`导出超过 ${MAX_EXPORT_GROUPS} 个分组，请选择活动缩小范围；未导出部分文件`);
  const lines = items.map(row => columns.map(column => {
    const text = String(row[column] ?? '');
    if (column === 'name') {
      // Text is untrusted. Numeric columns are separately validated and keep legitimate negatives.
      return quoted(/^(?:[\s\uFEFF]*[=+@-]|[\t\r\n])/.test(text) ? "'"+text : text);
    }
    if (!/^-?(0|[1-9]\d*)$/.test(text)) throw new Error('Unexpected non-integer report value');
    return quoted(text);
  }).join(','));
  return '\uFEFF' + [columns.join(','),...lines].join('\r\n');
}
