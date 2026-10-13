import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { actor, owner } from './auth.js';
import { rows } from './db.js';
import { buildReportQuery } from './report-query.js';
import { listPage, readSnapshot, parsePage } from './pagination.js';
import { salesCsv, MAX_EXPORT_GROUPS } from './csv.js';

const basis='原活动累计：已成交销售减已过账退货；毛利为标准成本估计';
export function registerReports(app: FastifyInstance): void {
  app.get('/api/v1/reports/sales',async req => {
    const a=await actor(req), q=req.query as Record<string,unknown>;
    const {sql,values}=buildReportQuery(q,a);
    const page=await listPage(sql,values,q);
    return {...page,basis};
  });
  app.get('/api/v1/reports/sales.csv',async(req,reply) => {
    const a=await actor(req); owner(a);
    const q=req.query as Record<string,unknown>;
    parsePage(q); // Reject invalid paging values, but deliberately export ALL matching groups.
    const {sql,values}=buildReportQuery(q,a);
    const items=await readSnapshot(db=>rows<RowDataPacket>(db,sql+' LIMIT ?',[...values,MAX_EXPORT_GROUPS+1]));
    const csv=salesCsv(items); // Over-limit is an explicit 413, never a successful truncated export.
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="foxcore-report.csv"');
    return csv;
  });
}
