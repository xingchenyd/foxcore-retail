import {describe,it,expect,vi,afterEach} from 'vitest';
// business module imports DB configuration, so isolate only its DB dependency.
vi.mock('../../apps/server/src/db.js',()=>({first:vi.fn()}));
import {priceAmounts,assertReturnWindow} from '../../apps/server/src/business';
afterEach(()=>vi.useRealTimers());
describe('confirmed Chinese pricing and return window',()=>{
 it('splits inclusive 113.00 at 13% into net 100.00 and tax 13.00',()=>{expect(priceAmounts(11300n,1,1300,500,'INCLUSIVE')).toEqual({net:10000n,tax:1300n,commission:500n,total:11300n});});
 it('preserves legacy exclusive snapshots',()=>{expect(priceAmounts(10000n,2,1300,500,'EXCLUSIVE')).toEqual({net:20000n,tax:2600n,commission:1000n,total:22600n});});
 it('balances inclusive amounts with penny rounding and zero tax',()=>{const x=priceAmounts(1n,3,1300,1000,'INCLUSIVE');expect(x.net+x.tax).toBe(3n);expect(priceAmounts(999n,3,0,0,'INCLUSIVE').total).toBe(2997n);});
 it('enforces exact seven-day elapsed limit and preserves legacy policy',()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T08:00:00.000Z'));expect(()=>assertReturnWindow({return_days:7,posted_at:'2026-10-21 08:00:00.000'} as any)).not.toThrow();expect(()=>assertReturnWindow({return_days:7,posted_at:'2026-10-21 07:59:59.999'} as any)).toThrow('七天');expect(()=>assertReturnWindow({return_days:null,posted_at:'2020-01-01 00:00:00'} as any)).not.toThrow();});
});
