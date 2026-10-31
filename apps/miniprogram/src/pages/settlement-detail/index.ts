import {request,command,confirm} from '../../lib/api';
import {requireSession} from '../../lib/session';
import {cents,stateLabel,errorText} from '../../lib/format';
import type {Settlement,InputEvent} from '../../lib/types';
interface Line {entry_id:string;amount_cents:string;source_kind:string;source_id:string;source_line_no:number}
Page({data:{id:'',owner:false,loading:false,busy:false,error:'',row:null as Settlement|null,lines:[] as (Line&{money:string})[],label:'',total:'0.00',reference:'',reason:'',paid:false,reconciled:false},
  onLoad(options:Record<string,string>){this.setData({id:options.id||''});},onShow(){void this.load();},onPullDownRefresh(){void this.load();},
  async load(){const s=requireSession();if(!s||this.data.loading){wx.stopPullDownRefresh();return;}this.setData({owner:s.user.role==='OWNER',loading:true,error:''});try{const d=await request<{settlement:Settlement;lines:Line[]}>('/commissions/settlements/'+this.data.id);this.setData({row:d.settlement,label:stateLabel(d.settlement.state),total:cents(d.settlement.total_cents),lines:d.lines.map(x=>({...x,money:cents(x.amount_cents)}))});}catch(error){this.setData({error:errorText(error)});}finally{this.setData({loading:false});wx.stopPullDownRefresh();}},
  input(e:InputEvent){const field=String(e.currentTarget.dataset.field);if(['reference','reason'].includes(field))this.setData({[field]:e.detail.value});},
  checks(e:WechatMiniprogram.CustomEvent<{value:string[]}>){this.setData({paid:e.detail.value.includes('paid'),reconciled:e.detail.value.includes('reconciled')});},
  async pay(){if(this.data.busy)return;this.setData({busy:true,error:''});try{if(!this.data.paid||!this.data.reference.trim())throw new Error('请确认线下付款已完成，并填写付款参考号');if(!await confirm('确认佣金付款登记','本次付款 '+(this.data.row?.currency??'CNY')+' '+this.data.total+'。确认已向员工支付并核对？'))return;await command('/commissions/'+this.data.id+'/pay',{paymentReference:this.data.reference.trim()});await this.load();}catch(error){this.setData({error:errorText(error)});}finally{this.setData({busy:false});}},
  async cancel(){if(this.data.busy)return;this.setData({busy:true,error:''});try{if(!this.data.reconciled||!this.data.reason.trim())throw new Error('请填写原因，确认线下付款未执行或已撤销');if(!await confirm('取消结算','将释放未付流水的认领，保留原结算记录。确认继续？'))return;await command('/commissions/'+this.data.id+'/cancel',{reason:this.data.reason.trim(),paymentReconciled:true});await this.load();}catch(error){this.setData({error:errorText(error)});}finally{this.setData({busy:false});}}
});
