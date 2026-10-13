import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { exec, first, tx, type Db } from './db.js';
import { actor, owner, writable } from './auth.js';
import { audit, body, command, id, missing, nonempty, requireKey, conflict } from './core.js';
import { assertCancelableShift, parseRate, parseVersion, updateEventPolicy, type CancelShift, type EventPolicy } from './fix-rules.js';

const params = (req: FastifyRequest) => req.params as Record<string, unknown>;
async function ownerWrite(req: FastifyRequest) { const a = await actor(req); owner(a); writable(req,a); return a; }

/** Parent event is the serialization point shared with event.close and sales commands. */
export async function lockShiftEvent(db: Db, shiftId: string): Promise<string> {
  const pre = await first<RowDataPacket>(db,'SELECT event_id FROM shifts WHERE id=?',[shiftId]);
  if (!pre) throw missing();
  const event = await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]);
  if (!event) throw missing();
  return String(event.id);
}
export function registerCatalogUpdates(app: FastifyInstance): void {
  app.post('/api/v1/shifts/:id/cancel',async req => {
    const a = await ownerWrite(req), shiftId = id(params(req).id);
    const d = body(req.body,['version','reason']), version = parseVersion(d.version), reason = nonempty(d.reason,500);
    const k = requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'shift.cancel',k,{shiftId,version,reason},async () => {
      const eventId = await lockShiftEvent(db,shiftId);
      const shift = await first<RowDataPacket & CancelShift & { event_id: string }>(db,'SELECT * FROM shifts WHERE id=? FOR UPDATE',[shiftId]);
      if (!shift) throw missing();
      if (shift.event_id !== eventId) throw conflict('班次归属已变化，请重新核对');
      // Any associated sale is suspicious for a never-started shift, including cancelled sales.
      const sale = await first<RowDataPacket>(db,'SELECT id FROM sales WHERE shift_id=? LIMIT 1',[shiftId]);
      assertCancelableShift(shift,version,Boolean(sale));
      await exec(db,"UPDATE shifts SET status='CANCELLED',version=version+1 WHERE id=?",[shiftId]);
      await audit(db,a.id,'SHIFT_CANCELLED','SHIFT',shiftId,{reason,previousVersion:version});
      return {id:shiftId,status:'CANCELLED',version:version+1};
    }));
  });

  app.patch('/api/v1/events/:id',async req => {
    const a = await ownerWrite(req), eventId = id(params(req).id);
    const d = body(req.body,['version','taxBps','policyConfirmed']);
    const k = requireKey(req.headers['idempotency-key']);
    parseVersion(d.version);
    return tx(db => command(db,a.id,'event.configure',k,{eventId,...d},async () => {
      const event = await first<RowDataPacket & EventPolicy>(db,'SELECT * FROM events WHERE id=? FOR UPDATE',[eventId]);
      if (!event) throw missing();
      const next = updateEventPolicy(event,d);
      await exec(db,'UPDATE events SET tax_bps=?,policy_confirmed=?,version=version+1 WHERE id=?',[next.taxBps,next.policyConfirmed,eventId]);
      await audit(db,a.id,'EVENT_CONFIGURED','EVENT',eventId,{
        before:{taxBps:event.tax_bps,policyConfirmed:Boolean(event.policy_confirmed),version:event.version}, after:next
      });
      return {id:eventId,status:'DRAFT',...next};
    }));
  });

  app.patch('/api/v1/salespeople/:id/commission',async req => {
    const a = await ownerWrite(req), salespersonId = id(params(req).id);
    const d = body(req.body,['version','commissionBps']);
    const version = parseVersion(d.version), rate = parseRate(d.commissionBps), k = requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'salesperson.commission',k,{salespersonId,version,commissionBps:rate},async () => {
      const person = await first<RowDataPacket>(db,'SELECT * FROM salespeople WHERE id=? FOR UPDATE',[salespersonId]);
      if (!person) throw missing();
      if (person.version !== version) throw conflict('员工资料已变化，请刷新后重新确认');
      await exec(db,'UPDATE salespeople SET commission_bps=?,version=version+1 WHERE id=?',[rate,salespersonId]);
      await audit(db,a.id,'SALESPERSON_COMMISSION_CONFIGURED','SALESPERSON',salespersonId,{
        before:person.commission_bps,after:rate,previousVersion:version,effective:'future sale.prepare only'
      });
      // Never recalculate CHECKOUT/POSTED sale lines or existing settlements here.
      return {id:salespersonId,commissionBps:rate,version:version+1};
    }));
  });
}
