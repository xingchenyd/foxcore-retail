import { RuleError, parseId } from './fix-rules.js';

const facts = `SELECT sa.event_id,sh.salesperson_id,sl.product_id,CAST(sl.quantity AS SIGNED) AS quantity,CAST(sl.line_net_cents AS SIGNED) AS net_cents,CAST(sl.line_tax_cents AS SIGNED) AS tax_cents,CAST(sl.line_commission_cents AS SIGNED) AS commission_cents,(sl.quantity*CAST(sl.cost_snapshot_cents AS SIGNED)) AS cost_cents FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id JOIN sale_lines sl ON sl.sale_id=sa.id WHERE sa.state='POSTED'
UNION ALL SELECT sa.event_id,sh.salesperson_id,sl.product_id,-CAST(rl.quantity AS SIGNED),-CAST(rl.net_cents AS SIGNED),-CAST(rl.tax_cents AS SIGNED),-CAST(rl.commission_cents AS SIGNED),IF(rl.disposition='RESTOCK',-CAST(rl.quantity AS SIGNED)*CAST(sl.cost_snapshot_cents AS SIGNED),0) FROM returns r JOIN sales sa ON sa.id=r.sale_id JOIN shifts sh ON sh.id=sa.shift_id JOIN return_lines rl ON rl.return_id=r.id JOIN sale_lines sl ON sl.sale_id=sa.id AND sl.line_no=rl.sale_line_no WHERE r.state='POSTED'`;

export interface ReportScope { role: 'OWNER' | 'SALESPERSON'; salespersonId: string | null }
export function buildReportQuery(q: Record<string, unknown>, scope: ReportScope): {sql: string; values: unknown[]} {
  const group = q.group === undefined ? 'event' : q.group;
  let col: string, join: string, label: string;
  switch (group) {
    case 'product': col='f.product_id'; join='JOIN products x ON x.id=f.product_id'; label='x.name'; break;
    case 'salesperson': col='f.salesperson_id'; join='JOIN salespeople x ON x.id=f.salesperson_id'; label="CONCAT(x.first_name,' ',x.last_name)"; break;
    case 'event': col='f.event_id'; join='JOIN events x ON x.id=f.event_id'; label='x.name'; break;
    default: throw new RuleError(400,'group 必须为 event、product 或 salesperson');
  }
  const conditions: string[] = [], values: unknown[] = [];
  if (q.eventId !== undefined) { conditions.push('f.event_id=?'); values.push(parseId(q.eventId)); }
  if (scope.role === 'SALESPERSON') {
    conditions.push('f.salesperson_id=?'); values.push(parseId(scope.salespersonId));
  }
  const margin = scope.role === 'OWNER' ? ',SUM(f.net_cents-f.cost_cents) AS estimated_margin_cents' : '';
  return {
    sql: `SELECT ${col} AS id,${label} AS name,SUM(f.quantity) AS quantity,SUM(f.net_cents) AS net_cents,SUM(f.tax_cents) AS tax_cents,SUM(f.commission_cents) AS commission_cents${margin} FROM (${facts}) f ${join} ${conditions.length?'WHERE '+conditions.join(' AND '):''} GROUP BY ${col},${label} ORDER BY net_cents DESC, id ASC`,
    values
  };
}
