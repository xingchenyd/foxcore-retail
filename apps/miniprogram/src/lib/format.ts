const labels: Record<string, string> = { DRAFT: '草稿', CHECKOUT: '待核对收款', POSTED: '已过账', CANCELLED: '已取消', AUTHORIZED: '已授权退款', PREPARED: '待付款核对', PAID: '已结算', ACTIVE: '进行中', PLANNED: '待开班', CLOSED: '已关闭' };
export const stateLabel = (state: string): string => labels[state] || state;
export function cents(value: string | number | null | undefined): string {
  const raw = String(value ?? '0');
  if (!/^-?\d+$/.test(raw)) return '—';
  const negative = raw.startsWith('-'), digits = (negative ? raw.slice(1) : raw).padStart(3, '0');
  return (negative ? '-' : '') + digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + digits.slice(-2);
}
export function parseMoney(value: string): number {
  if (!/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value)) throw new Error('金额最多两位小数，请勿输入符号或逗号');
  const [whole, fraction = ''] = value.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n > 9_000_000_000_000) throw new Error('金额超过允许范围');
  return n;
}
export function quantity(value: string, allowZero = false): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('数量必须为整数');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > 1_000_000) throw new Error('数量超出允许范围');
  return n;
}
export function localText(value: string | undefined): string { return value ? value.replace('T', ' ').slice(0, 16) : '—'; }
export function errorText(error: unknown): string { return error instanceof Error ? error.message : '操作失败，请重试'; }
export const rawMoney = (value: string): string => cents(value).replace(/,/g, '');
