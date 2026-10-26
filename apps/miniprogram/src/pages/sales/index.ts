import { request } from '../../lib/api';
import { requireSession } from '../../lib/session';
import { cents, stateLabel, errorText } from '../../lib/format';
import type { PageResult, Sale, InputEvent, TapEvent } from '../../lib/types';
type Item = Sale & { label: string; money: string };
Page({
  data: { loading: false, error: '', items: [] as Item[], visible: [] as Item[], total: 0, hasMore: false, query: '', filter: '', filters: [{ id: '', name: '全部' }, { id: 'DRAFT', name: '草稿' }, { id: 'CHECKOUT', name: '待收款' }, { id: 'POSTED', name: '已成交' }, { id: 'CANCELLED', name: '已取消' }] },
  onShow() { void this.load(); }, onPullDownRefresh() { void this.load(); }, onReachBottom() { if (this.data.hasMore) void this.load(true); },
  async load(more: boolean | TapEvent = false) {
    if (!requireSession() || this.data.loading) { wx.stopPullDownRefresh(); return; }
    const append = more === true; this.setData({ loading: true, error: '' });
    try {
      const page = await request<PageResult<Sale>>('/sales?limit=20&offset=' + (append ? this.data.items.length : 0));
      const rows = page.items.map(x => ({ ...x, label: stateLabel(x.state), money: cents(x.total_cents) }));
      this.setData({ items: append ? this.data.items.concat(rows) : rows, total: page.total, hasMore: page.hasMore }); this.applyFilter();
    } catch (error) { this.setData({ error: errorText(error) }); }
    finally { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
  },
  search(e: InputEvent) { this.setData({ query: e.detail.value }); this.applyFilter(); },
  filter(e: TapEvent) { this.setData({ filter: String(e.currentTarget.dataset.id) }); this.applyFilter(); },
  applyFilter() { const q = this.data.query.trim().toLowerCase(); this.setData({ visible: this.data.items.filter(x => (!this.data.filter || x.state === this.data.filter) && (!q || [x.id,x.sale_no || '',x.booth_location || ''].join(' ').toLowerCase().includes(q))) }); },
  clear() { this.setData({ query: '', filter: '' }); this.applyFilter(); },
  create() { wx.navigateTo({ url: '/pages/sale-edit/index' }); },
  detail(e: TapEvent) { wx.navigateTo({ url: '/pages/sale-detail/index?id=' + e.currentTarget.dataset.id }); },
  more() { void this.load(true); }
});
