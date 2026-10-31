import { request } from '../../lib/api';
import { requireSession } from '../../lib/session';
import { errorText } from '../../lib/format';
import type { Balance, PageResult, InputEvent, TapEvent } from '../../lib/types';
type Item=Balance & {available:string;key:string};
Page({
  data:{owner:false,loading:false,error:'',items:[] as Item[],visible:[] as Item[],total:0,hasMore:false,query:''},
  onShow(){void this.load();},onPullDownRefresh(){void this.load();},onReachBottom(){if(this.data.hasMore)void this.load(true);},
  async load(more:boolean|TapEvent=false){const s=requireSession();if(!s||this.data.loading){wx.stopPullDownRefresh();return;}const append=more===true;this.setData({owner:s.user.role==='OWNER',loading:true,error:''});try{const page=await request<PageResult<Balance>>('/stock/balances?limit=20&offset='+(append?this.data.items.length:0));const rows=page.items.map(x=>({...x,key:x.location_id+':'+x.product_id,available:String(Number(x.on_hand)-Number(x.reserved))}));this.setData({items:append?this.data.items.concat(rows):rows,total:page.total,hasMore:page.hasMore});this.apply();}catch(error){this.setData({error:errorText(error)});}finally{this.setData({loading:false});wx.stopPullDownRefresh();}},
  search(e:InputEvent){this.setData({query:e.detail.value});this.apply();},
  apply(){const q=this.data.query.trim().toLowerCase();this.setData({visible:this.data.items.filter(x=>!q||[x.product_name,x.sku,x.location_name].join(' ').toLowerCase().includes(q))});},
  action(e:TapEvent){wx.navigateTo({url:e.currentTarget.dataset.type==='transfer'?'/pages/operations/index?type=transfers':'/pages/inventory-action/index?type='+e.currentTarget.dataset.type});},
  more(){void this.load(true);}
});
