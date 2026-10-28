import type {RowDataPacket} from 'mysql2/promise';
import {first,type Db} from './db.js';
import {bad,conflict,halfUp} from './core.js';
export async function settings(db:Db){const s=await first<RowDataPacket>(db,'SELECT * FROM business_settings WHERE id=1');if(!s)throw new Error('Business settings missing');return s;}
export function currency(value:unknown):string {if(value!=='CNY'&&value!=='CAD')throw bad('货币必须为 CNY 或 CAD');return value;}
export function priceAmounts(unit:bigint,quantity:number,taxBps:number,commissionBps:number,basis:string){
 const entered=unit*BigInt(quantity);
 const net=basis==='INCLUSIVE'?halfUp(entered*10000n,10000n+BigInt(taxBps)):entered;
 const tax=basis==='INCLUSIVE'?entered-net:halfUp(net*BigInt(taxBps));
 return {net,tax,commission:halfUp(net*BigInt(commissionBps)),total:net+tax};
}
export async function cashOpen(db:Db,shiftId:string){
 const h=await first<RowDataPacket>(db,"SELECT id FROM cash_handovers WHERE shift_id=? AND state IN ('SUBMITTED','VERIFIED')",[shiftId]);
 if(h)throw conflict('此班次已提交交班，请联系管理员退回交班后再处理现金业务');
}
export function assertReturnWindow(sale:RowDataPacket){
 if(sale.return_days!==null&&sale.return_days!==undefined&&Date.now()>Date.parse(String(sale.posted_at).replace(' ','T')+'Z')+Number(sale.return_days)*86400000)throw conflict('原单已超过七天退换货期限');
}
