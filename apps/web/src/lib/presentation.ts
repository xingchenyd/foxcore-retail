/** Small, pure helpers used by the actual sales editor and loaded-record search. */
export function decimalCents(value: string): bigint | null {
  const text = value;
  // Match the API money contract, including the permitted upper bound and no leading zeros.
  if (!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function draftSubtotal(lines: Array<{ quantity: string; finalUnitPrice: string }>): bigint | null {
  let total = 0n;
  for (const line of lines) {
    const price = decimalCents(line.finalUnitPrice);
    if (price === null || !/^[1-9]\d{0,3}$/.test(line.quantity)) return null;
    total += price * BigInt(line.quantity);
  }
  return total;
}

export function matchesRecord(row: Record<string, unknown>, query: string, labels: Record<string, string>): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = Object.values(row).map(value => {
    if (value === null || value === undefined) return '';
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${raw} ${labels[raw] ?? ''}`;
  }).join(' ').toLocaleLowerCase();
  return terms.every(term => text.includes(term));
}
