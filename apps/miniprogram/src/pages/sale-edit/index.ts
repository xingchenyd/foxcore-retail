import { choices, request, command } from '../../lib/api';
import { requireSession } from '../../lib/session';
import { cents, rawMoney, parseMoney, quantity, errorText } from '../../lib/format';
import type { Product, Shift, DraftLine, InputEvent, TapEvent, SaleDetail, IdResult } from '../../lib/types';
interface LocalDraft { shiftId: string; lines: DraftLine[]; saleId: string; version: number }
Page({
  data: { loading: false, busy: false, error: '', shifts: [] as (Shift & { label: string })[], products: [] as Product[], visibleProducts: [] as Product[], productQuery:'',shiftIndex: -1, productIndex: -1, lines: [] as DraftLine[], subtotal: '0.00', saleId: '', version: 1, saved: false },
  onLoad(options: Record<string,string>) { void this.load(options.id || ''); },
  onPullDownRefresh() { wx.stopPullDownRefresh(); },
  draftKey() { return 'foxcore.draft.' + requireSession()?.user.id + '.' + (this.data.saleId || 'new'); },
  async load(saleId: string) {
    if (!requireSession()) return; this.setData({ loading: true, error: '', saleId });
    try {
      const [allShifts, products] = await Promise.all([choices<Shift>('/shifts?status=ACTIVE'), choices<Product>('/products')]);
      const now=Date.now(),shifts=allShifts.filter(x=>{const start=Date.parse(x.planned_start.replace(' ','T')+'Z'),end=Date.parse(x.planned_end.replace(' ','T')+'Z');return start<=now&&now<end;});
      this.setData({ shifts: shifts.map(x => ({ ...x, label: x.event_name + ' / ' + x.booth_location + ' / ' + x.first_name + ' ' + x.last_name })), products: products.filter(x => !!x.active),visibleProducts:products.filter(x=>!!x.active) });
      const local = wx.getStorageSync(this.draftKey()) as LocalDraft | undefined;
      if (saleId) {
        const detail = await request<SaleDetail>('/sales/' + saleId);
        if (detail.sale.state !== 'DRAFT') { wx.redirectTo({ url: '/pages/sale-detail/index?id=' + saleId }); return; }
        this.setData({ version: detail.sale.version, shiftIndex: shifts.findIndex(x => x.id === detail.sale.shift_id), lines: detail.lines.map(x => {
          const p = products.find(p => p.id === x.product_id);
          return { productId:x.product_id,name:x.current_name,sku:p?.sku || '',quantity:String(x.quantity),finalUnitPrice:rawMoney(x.final_unit_price_cents),minPrice:cents(p?.min_price_cents),subtotal:'' };
        }) });
      } else if (local && Array.isArray(local.lines) && local.lines.length <= 100) {
        this.setData({ shiftIndex: shifts.findIndex(x => x.id === local.shiftId), lines: local.lines, saved:true });
      } else if (shifts.length === 1) this.setData({ shiftIndex:0 });
      this.preview(false);
    } catch(error) { this.setData({ error:errorText(error) }); }
    finally { this.setData({ loading:false }); }
  },
  selectShift(e: InputEvent) { this.setData({ shiftIndex:Number(e.detail.value) }); this.persist(); },
  selectProduct(e: InputEvent) { this.setData({ productIndex:Number(e.detail.value) }); },
  searchProducts(e:InputEvent){const q=e.detail.value.trim().toLowerCase();this.setData({productQuery:e.detail.value,productIndex:-1,visibleProducts:this.data.products.filter(x=>!q||(x.name+' '+x.sku).toLowerCase().includes(q))});},
  add() {
    const p=this.data.visibleProducts[this.data.productIndex]; if(!p) { this.setData({ error:'请先选择商品' }); return; }
    if(this.data.lines.some(x=>x.productId===p.id)) { this.setData({ error:'此商品已在明细中，请直接调整数量' }); return; }
    if(this.data.lines.length >=100) { this.setData({ error:'每笔销售最多 100 行' }); return; }
    this.setData({ lines:this.data.lines.concat({ productId:p.id,name:p.name,sku:p.sku,quantity:'1',finalUnitPrice:rawMoney(p.suggested_price_cents??p.min_price_cents),minPrice:cents(p.min_price_cents),subtotal:'' }),error:'' }); this.preview();
  },
  inputLine(e: InputEvent) {
    const index=Number(e.currentTarget.dataset.index),field=String(e.currentTarget.dataset.field);
    if(!this.data.lines[index] || !['quantity','finalUnitPrice'].includes(field))return;
    this.setData({ ['lines['+index+'].'+field]:e.detail.value }); this.preview();
  },
  remove(e: TapEvent) { this.setData({ lines:this.data.lines.filter((_,i)=>i!==Number(e.currentTarget.dataset.index)) }); this.preview(); },
  preview(persist=true) {
    let total=0,valid=true;
    const lines=this.data.lines.map(line=>{ try{ const n=quantity(line.quantity)*parseMoney(line.finalUnitPrice); if(!Number.isSafeInteger(n)||n>9_000_000_000_000)throw new Error(); total+=n; return {...line,subtotal:cents(n)}; }catch{valid=false;return {...line,subtotal:'—'};} });
    this.setData({ lines,subtotal:valid && total<=9_000_000_000_000 ? cents(total) : '—' }); if(persist)this.persist();
  },
  persist() {
    const s=requireSession();if(!s)return;
    try { wx.setStorageSync(this.draftKey(),{ shiftId:this.data.shifts[this.data.shiftIndex]?.id || '',lines:this.data.lines,saleId:this.data.saleId,version:this.data.version }); this.setData({ saved:true }); }
    catch { this.setData({ saved:false,error:'本机草稿保存失败，请检查存储空间后重试' }); }
  },
  async save() {
    if(this.data.busy)return;this.setData({busy:true,error:''});
    try {
      const shift=this.data.shifts[this.data.shiftIndex];if(!shift)throw new Error('请选择有效的进行中班次');
      if(!this.data.lines.length)throw new Error('请至少添加一个商品');
      const lines=this.data.lines.map(x=>{ const p=this.data.products.find(p=>p.id===x.productId);const amount=parseMoney(x.finalUnitPrice);if(p && amount<Number(p.min_price_cents))throw new Error(x.name+' 低于当前最低价');return {productId:x.productId,quantity:quantity(x.quantity),finalUnitPrice:x.finalUnitPrice}; });
      const oldKey=this.draftKey();
      const result=await command<IdResult>(this.data.saleId?'/sales/'+this.data.saleId+'/edit':'/sales',this.data.saleId?{version:this.data.version,lines}:{shiftId:shift.id,lines});
      wx.removeStorageSync(oldKey); wx.redirectTo({url:'/pages/sale-detail/index?id='+result.id});
    }catch(error){this.setData({error:errorText(error)});}finally{this.setData({busy:false});}
  }
});
