import { describe, expect, it } from 'vitest';
import { halfUp, parseMoney as money, moneyText } from '../../apps/server/src/amounts.js';

describe('integer CAD calculations',()=>{
  it('parses exact cents and formats without floating point',()=>{
    expect(money('0')).toBe(0n);
    expect(money('12.3')).toBe(1230n);
    expect(money('90071992547.01')).toBe(9007199254701n);
    expect(moneyText(-1234n)).toBe('-12.34');
  });
  it.each(['1e2','1,000.00','0.001','-1','+1',true,[],null])('rejects invalid amount %s',value=>{
    expect(()=>money(value)).toThrow();
  });
  it('rounds line tax and cumulative refund shares half up',()=>{
    expect(halfUp(1005n*1300n)).toBe(131n);
    const originalTax=2n,originalQty=3n;
    const first=halfUp(originalTax*1n,originalQty);
    const second=halfUp(originalTax*2n,originalQty)-first;
    const third=halfUp(originalTax*3n,originalQty)-first-second;
    expect([first,second,third]).toEqual([1n,0n,1n]);
    expect(first+second+third).toBe(originalTax);
  });
});
