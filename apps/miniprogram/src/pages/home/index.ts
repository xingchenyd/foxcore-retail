import { choices, request, command, confirm } from '../../lib/api';
import { requireSession } from '../../lib/session';
import { stateLabel, errorText } from '../../lib/format';
import type { PageResult, Sale, Shift, TapEvent } from '../../lib/types';
Page({
  data: { username: '', owner: false, loading: false, busy: false, error: '', active: '—', pending: '—', openingCash:'0.00',shifts: [] as (Shift & { label: string })[] },
  onShow() { void this.load(); }, onPullDownRefresh() { void this.load(); },
  async load() {
    const s = requireSession(); if (!s || this.data.loading) { wx.stopPullDownRefresh(); return; }
    this.setData({ username: s.user.username, owner: s.user.role === 'OWNER', loading: true, error: '', active: '—', pending: '—' });
    try {
      const [shifts, sales] = await Promise.all([choices<Shift>('/shifts?actionable=true').then(items=>({items})), request<PageResult<Sale>>('/sales?state=CHECKOUT&limit=1')]);
      this.setData({ shifts: shifts.items.map(x => ({ ...x, label: stateLabel(x.status) })), active: String(shifts.items.filter(x => x.status === 'ACTIVE').length), pending: String(sales.total) });
    } catch (error) { this.setData({ error: errorText(error), shifts: [] }); }
    finally { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
  },
  opening(e:WechatMiniprogram.CustomEvent<{value:string}>){this.setData({openingCash:e.detail.value});},
  newSale() { wx.navigateTo({ url: '/pages/sale-edit/index' }); },
  sales() { wx.switchTab({ url: '/pages/sales/index' }); },
  inventory() { wx.switchTab({ url: '/pages/inventory/index' }); },
  commissions() { wx.switchTab({ url: '/pages/commissions/index' }); },
  operations() { wx.navigateTo({url:'/pages/operations/index'}); },
  returns() { wx.navigateTo({ url: '/pages/returns/index' }); },
  async shiftAction(e: TapEvent) {
    if (this.data.busy) return;
    const id = String(e.currentTarget.dataset.id), action = String(e.currentTarget.dataset.action);
    if (!['start','close'].includes(action) || !await confirm(action === 'start' ? '开始班次' : '结束班次', action === 'start' ? '确认已到岗，开始本次现场销售？' : '结束前须处理草稿、待收款销售并在业务中心提交现金交班单。确认结束？')) return;
    this.setData({ busy: true, error: '' });
    try { await command('/shifts/' + id + '/' + action,action==='start'?{openingCash:this.data.openingCash}:{}); await this.load(); }
    catch (error) { this.setData({ error: errorText(error) }); }
    finally { this.setData({ busy: false }); }
  }
});
