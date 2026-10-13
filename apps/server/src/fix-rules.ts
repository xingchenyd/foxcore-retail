/** Framework/database-independent business rules used by production route handlers. */
export class RuleError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string) {
    super(message); this.name = 'RuleError'; this.status = status;
    this.code = status === 409 ? 'CONFLICT' : status === 413 ? 'EXPORT_TOO_LARGE' : 'BAD_REQUEST';
  }
}
const invalid = (message: string): never => { throw new RuleError(400, message); };
export function parseId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return invalid('无效 ID');
  return value;
}
export function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value >= 4_294_967_295) return invalid('version 必须为可递增的正整数');
  return value;
}
export function parseRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) return invalid('费率必须为 0–10000 bps 的整数');
  return value;
}
export interface Pagination { limit: number; offset: number }
export function parsePage(q: Record<string, unknown>, defaultLimit = 20): Pagination {
  const integer = (value: unknown, fallback: number, min: number, max: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) return invalid('分页参数无效');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < min || result > max) return invalid('分页参数超出范围');
    return result;
  };
  return { limit: integer(q.limit, defaultLimit, 1, 100), offset: integer(q.offset, 0, 0, 10_000_000) };
}
export function sortedIds(ids: string[]): string[] {
  return [...new Set(ids.map(parseId))].sort((a,b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
}
export interface EventPolicy { status: string; version: number; tax_bps: number | null; policy_confirmed: number | boolean }
export function updateEventPolicy(old: EventPolicy, input: Record<string, unknown>) {
  const version = parseVersion(input.version);
  if (old.status !== 'DRAFT') throw new RuleError(409, '仅可完善草稿活动配置；开放后的税务口径不可改写');
  if (version !== old.version) throw new RuleError(409, '活动已被修改，请刷新后重新确认');
  if (input.taxBps === undefined && input.policyConfirmed === undefined) return invalid('至少提供税率或政策确认字段');
  const taxBps = input.taxBps === undefined ? old.tax_bps : input.taxBps === null ? null : parseRate(input.taxBps);
  const policyConfirmed = input.policyConfirmed === undefined ? Boolean(old.policy_confirmed) : input.policyConfirmed;
  if (typeof policyConfirmed !== 'boolean') return invalid('policyConfirmed 必须为布尔值');
  return { taxBps, policyConfirmed, version: version + 1 };
}
export interface CancelShift { status: string; version: number; actual_start: string | null; actual_end: string | null }
export function assertCancelableShift(shift: CancelShift, requestedVersion: unknown, hasSales: boolean): void {
  const version = parseVersion(requestedVersion);
  if (shift.version !== version) throw new RuleError(409, '班次已被修改，请刷新后重新操作');
  if (shift.status !== 'PLANNED') throw new RuleError(409, '仅可取消尚未开班的计划班次');
  if (shift.actual_start !== null || shift.actual_end !== null || hasSales) {
    throw new RuleError(409, '班次存在实际开班或销售关联，请管理员核对；不会自动删除数据');
  }
}
export interface ReturnDestination {
  id: string; kind: string; code: string; active: number | boolean; booth_id: string | null;
  booth_active: number | boolean | null; event_id: string | null; event_status: string | null;
}
export function assertReturnTarget(sourceEventId: string, target: ReturnDestination): void {
  if (!target.active) throw new RuleError(409, '目标库位已停用，请核对后取消并重新建立退货');
  if (target.kind === 'WAREHOUSE' && target.code === 'MAIN' && target.booth_id === null) return;
  if (target.kind !== 'BOOTH' || !target.booth_id || !target.booth_active ||
      target.event_id !== sourceEventId || target.event_status !== 'OPEN') {
    throw new RuleError(409, '退货仅可指向有效主仓 MAIN 或原销售活动内仍开放的有效展位');
  }
}
