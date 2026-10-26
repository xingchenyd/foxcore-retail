import { request, command, confirm } from '../../lib/api';
import { requireSession } from '../../lib/session';
import { stateLabel, errorText } from '../../lib/format';
import type { PageResult, Sale, Shift, TapEvent } from '../../lib/types';
Page({
  data: { username: '', owner: false, loading: false, busy: false, error: '', active: '—', pending: '—', shifts: [] as (Shift & { label: string })[] },
  onShow() { void this.load(); }, onPullDownRefresh() { void this.load(); },
  async load() {
    const s = requireSession(); if (!s || this.data.loading) { wx.stopPullDownRefresh(); return; }
    this.setData({ username: s.user.username, owner: s.user.role === 'OWNER', loading: true, error: '', active: '—', pending: '—' });
    try {
      const [shifts, sales] = await Promise.all([request<PageResult<Shift>>('/shifts?limit=20'), request<PageResult<Sale>>('/sales?limit=20')]);
      this.setData({ shifts: shifts.items.map(x => ({ ...x, label: stateLabel(x.status) })), active: String(shifts.items.filter(x => x.status === 'ACTIVE').length), pending: String(sales.items.filter(x => x.state === 'CHECKOUT').length) });
    } catch (error) { this.setData({ error: errorText(error), shifts: [] }); }
    finally { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
  },
  newSale() { wx.navigateTo({ url: '/pages/sale-edit/index' }); },
  sales() { wx.switchTab({ url: '/pages/sales/index' }); },
  inventory() { wx.switchTab({ url: '/pages/inventory/index' }); },
  commissions() { wx.switchTab({ url: '/pages/commissions/index' }); },
  returns() { wx.navigateTo({ url: '/pages/returns/index' }); },
  async shiftAction(e: TapEvent) {
    if (this.data.busy) return;
    const id = String(e.currentTarget.dataset.id), action = String(e.currentTarget.dataset.action);
    if (!['start','close'].includes(action) || !await confirm(action === 'start' ? '开始班次' : '结束班次', action === 'start' ? '确认已到岗，开始本次现场销售？' : '结束前需要处理所有草稿及待收款销售。确认结束？')) return;
    this.setData({ busy: true, error: '' });
    try { await command('/shifts/' + id + '/' + action); await this.load(); }
    catch (error) { this.setData({ error: errorText(error) }); }
    finally { this.setData({ busy: false }); }
  }
});
