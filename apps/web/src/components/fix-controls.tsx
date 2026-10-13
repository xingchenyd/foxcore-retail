import { useEffect, useState } from 'react';

type Row = Record<string, any>;
type Run = (path: string, method: 'POST' | 'PATCH', data?: Row) => Promise<Row>;

export function EventConfiguration({items,run,busy}:{items:Row[];run:Run;busy:boolean}) {
  const [selected,setSelected]=useState(''),[tax,setTax]=useState(''),[confirmed,setConfirmed]=useState(false);
  const item=items.find(x=>x.id===selected&&x.status==='DRAFT');
  useEffect(()=>{setTax(item?.tax_bps===null||item?.tax_bps===undefined?'':String(item.tax_bps));setConfirmed(Boolean(item?.policy_confirmed));},[item?.id,item?.version]);
  return <section className="box" data-testid="event-configuration"><h2>完善活动草稿配置</h2>
    <p className="small muted">空税率或未确认政策可以暂存。开放后不可通过此入口改写税务口径；0 bps 是有效税率。</p>
    <form className="inline-form" onSubmit={e=>{e.preventDefault();if(!item)return;void run(`/events/${item.id}`,'PATCH',{version:item.version,taxBps:tax===''?null:Number(tax),policyConfirmed:confirmed}).catch(()=>{});}}>
      <label className="field"><span>待配置活动</span><select required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">请选择</option>{items.filter(x=>x.status==='DRAFT').map(x=><option key={x.id} value={x.id}>{x.name} · 版本 {x.version}</option>)}</select></label>
      <label className="field"><span>活动税率 bps</span><input type="number" min="0" max="10000" step="1" value={tax} onChange={e=>setTax(e.target.value)} placeholder="可暂存为空"/></label>
      <label className="check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>确认此活动政策</label>
      <button className="primary" disabled={!item||busy}>保存活动配置</button>
    </form></section>;
}
export function CommissionConfiguration({items,run,busy}:{items:Row[];run:Run;busy:boolean}) {
  const [selected,setSelected]=useState(''),[rate,setRate]=useState('');const item=items.find(x=>x.id===selected);
  useEffect(()=>{setRate(item?.commission_bps===null||item?.commission_bps===undefined?'':String(item.commission_bps));},[item?.id,item?.version]);
  return <section className="box" data-testid="commission-configuration"><h2>配置员工佣金</h2><p className="small muted">新费率只影响下一次准备收款。已冻结单据、历史佣金及其退货冲回保持原口径。</p>
    <form className="inline-form" onSubmit={e=>{e.preventDefault();if(!item||rate==='')return;void run(`/salespeople/${item.id}/commission`,'PATCH',{version:item.version,commissionBps:Number(rate)}).catch(()=>{});}}>
      <label className="field"><span>待配置员工</span><select value={selected} onChange={e=>setSelected(e.target.value)} required><option value="">请选择</option>{items.map(x=><option key={x.id} value={x.id}>{x.first_name} {x.last_name} · 版本 {x.version}</option>)}</select></label>
      <label className="field"><span>新佣金率 bps</span><input type="number" min="0" max="10000" step="1" required value={rate} onChange={e=>setRate(e.target.value)}/></label>
      <button className="primary" disabled={!item||rate===''||busy}>保存佣金配置</button>
    </form></section>;
}
export function ShiftCancellation({item,run,busy}:{item:Row;run:Run;busy:boolean}) {
  const [expanded,setExpanded]=useState(false),[reason,setReason]=useState('');
  if(item.status!=='PLANNED')return null;
  return <div className="mini-action">{!expanded?<button disabled={busy} onClick={()=>setExpanded(true)}>取消班次</button>:<form onSubmit={e=>{e.preventDefault();void run(`/shifts/${item.id}/cancel`,'POST',{version:item.version,reason}).then(()=>{setReason('');setExpanded(false);}).catch(()=>{});}}>
    <label><span>取消原因</span><input aria-label={`班次 ${item.id} 取消原因`} value={reason} onChange={e=>setReason(e.target.value)} required maxLength={500}/></label>
    <button disabled={busy||!reason.trim()}>确认取消班次</button><button type="button" disabled={busy} onClick={()=>setExpanded(false)}>返回</button>
  </form>}</div>;
}
