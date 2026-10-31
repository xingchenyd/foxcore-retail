import type { RowDataPacket } from 'mysql2/promise';
import { first, type Db } from './db.js';
import { conflict, missing } from './core.js';
import { assertReturnTarget, sortedIds, type ReturnDestination } from './fix-rules.js';

/** Acquire all involved events before sale/return/location locks, including legacy cross-event targets.
 * Invalid legacy documents must remain cancellable, so locking and policy validation are separate.
 */
export async function lockReturnEvents(db: Db, sourceEventId: string, locationId: string | null, extraEventIds:string[]=[]): Promise<Set<string>> {
  const destination = locationId === null ? undefined : await first<RowDataPacket>(db,
    'SELECT b.event_id FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id WHERE l.id=?',[locationId]);
  // Null/missing legacy targets can still be cancelled; validation is mandatory before writes.
  const ids = sortedIds([sourceEventId,...(destination?.event_id ? [String(destination.event_id)] : []),...extraEventIds]);
  for (const eventId of ids) {
    if (!await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[eventId])) throw missing();
  }
  return new Set(ids);
}

export async function validateReturnTarget(db: Db, sourceEventId: string, locationId: string | null, lockedEvents: Set<string>): Promise<void> {
  if (locationId === null) throw conflict('退货缺少目标库位，请核对线下状态后取消并重建');
  const target = await first<RowDataPacket & ReturnDestination>(db,
    `SELECT l.*,b.active AS booth_active,b.event_id,e.status AS event_status
     FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id LEFT JOIN events e ON e.id=b.event_id
     WHERE l.id=? FOR UPDATE`,[locationId]);
  if (!target) throw missing();
  if (!lockedEvents.has(sourceEventId) || (target.event_id && !lockedEvents.has(target.event_id))) {
    throw conflict('退货目标关联发生变化，请核对后重试');
  }
  assertReturnTarget(sourceEventId,target);
}
