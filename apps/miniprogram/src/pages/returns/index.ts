import {request} from '../../lib/api';
import {requireSession} from '../../lib/session';
import {cents,stateLabel,errorText} from '../../lib/format';
import type {PageResult,ReturnRow,TapEvent} from '../../lib/types';
type Item=ReturnRow&{label:string;money:string};
Page({data:{loading:false,error:'',items:[] as Item[],hasMore:false,total:0},onShow(){void this.load();},onPullDownRefresh(){void this.load();},onReachBottom(){if(this.data.hasMore)void this.load(true);},
  async load(more:boolean|TapEvent=false){if(!requireSession(true)||this.data.loading){wx.stopPullDownRefresh();return;}const append=more===true;this.setData({loading:true,error:''});try{const page=await request<PageResult<ReturnRow>>('/returns?limit=20&offset='+(append?this.data.items.length:0));const items=page.items.map(x=>({...x,label:stateLabel(x.state),money:cents(x.total_cents)}));this.setData({items:append?this.data.items.concat(items):items,hasMore:page.hasMore,total:page.total});}catch(error){this.setData({error:errorText(error)});}finally{this.setData({loading:false});wx.stopPullDownRefresh();}},
  create(){wx.navigateTo({url:'/pages/return-create/index'});},detail(e:TapEvent){wx.navigateTo({url:'/pages/return-detail/index?id='+e.currentTarget.dataset.id});},more(){void this.load(true);}
});
