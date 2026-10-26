import { describe, expect, it } from 'vitest';
import { decimalCents, draftSubtotal, matchesRecord } from '../../apps/web/src/lib/presentation.js';
import { parseMoney } from '../../apps/server/src/amounts.js';

describe('sales preview uses the API decimal contract', () => {
  it.each(['0', '0.1', '12.50', '9999999999999.99'])('preserves exact cents for %s', value => {
    expect(decimalCents(value)).toBe(parseMoney(value));
  });
  it.each(['', '1e2', '-1', '01.00', ' 12.50 ', '1.234', '10000000000000', '.50'])('does not preview invalid amount %s', value => {
    expect(decimalCents(value)).toBeNull();
    expect(() => parseMoney(value)).toThrow();
  });
  it('keeps cart multiplication exact beyond the safe integer range', () => {
    expect(draftSubtotal([{quantity:'9999',finalUnitPrice:'9999999999999.99'}, {quantity:'3',finalUnitPrice:'0.10'}])).toBe(9998999999999990031n);
  });
  it('shows no completed estimate while a quantity or price is incomplete', () => {
    expect(draftSubtotal([{quantity:'',finalUnitPrice:'10.00'}])).toBeNull();
    expect(draftSubtotal([{quantity:'1.5',finalUnitPrice:'10.00'}])).toBeNull();
    expect(draftSubtotal([{quantity:'1',finalUnitPrice:''}])).toBeNull();
  });
});

describe('loaded record search', () => {
  const row={id:'12',name:'秋季 Market',state:'POSTED',sku:'FOX-23',notes:null};
  const labels={POSTED:'已过账'};
  it('matches both localized state and case-insensitive terms across fields', () => {
    expect(matchesRecord(row, 'market 已过账', labels)).toBe(true);
    expect(matchesRecord(row, 'FOX-23 12', labels)).toBe(true);
  });
  it('requires every entered term and clears without mutating the record', () => {
    expect(matchesRecord(row, 'market 已取消', labels)).toBe(false);
    expect(matchesRecord(row, '   ', labels)).toBe(true);
    expect(row.state).toBe('POSTED');
  });
});
