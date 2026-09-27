/** Pure integer-cent CAD helpers; safe to test without a database connection. */
export function parseMoney(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value)) {
    throw new RangeError('Invalid nonnegative CAD decimal amount');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function moneyText(cents: bigint | number | string): string {
  const n = BigInt(cents);
  const sign = n < 0n ? '-' : '';
  const abs = n < 0n ? -n : n;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function halfUp(numerator: bigint, divisor = 10000n): bigint {
  if (numerator < 0n || divisor <= 0n) throw new RangeError('halfUp requires nonnegative numerator and positive divisor');
  return (numerator + divisor / 2n) / divisor;
}
