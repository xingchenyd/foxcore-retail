import { test,expect,type Page,type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
const box=(page:Page,title:string)=>page.locator('section.box').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function write(page:Page,method:string,path:string,action:()=>Promise<unknown>){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+path&&r.request().method()===method);
  await action();const response=await pending;
  expect(response.status(),`${method} ${path}`).toBe(200);expect(response.request().headers()['content-type']).toContain('application/json');
  return response.json();
}
const button=(form:Locator,name:string)=>form.getByRole('button',{name,exact:true}).click();
async function login(page:Page,username:string,password:string){await page.goto('/');await page.getByLabel('用户名',{exact:true}).fill(username);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录系统 →'}).click();}
async function get(page:Page,path:string){const r=await page.request.get('/api/v1'+path);expect(r.status()).toBe(200);return r.json();}

test('F01–F07 real forms: configure, stock, sale, refund, settlement, staff and cancellation',async({page,browser})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const suffix=randomUUID().slice(0,8),day=DateTime.now().setZone('America/Toronto');
  const password=readFileSync(process.env.TEST_OWNER_PASSWORD_FILE!,'utf8');await login(page,'owner',password);
  await expect(page.getByRole('heading',{name:'运营工作台'})).toBeVisible();
  await page.goto('/events');let form=box(page,'新增场地');
  for(const [label,value] of [['场地名称','UI Venue '+suffix],['街道','1 Synthetic St'],['城市','Toronto'],['省份','Ontario'],['邮编','M5V 2T6']])await form.getByLabel(label,{exact:true}).fill(value);
  const venue=await write(page,'POST','/venues',()=>button(form,'保存场地'));
  form=box(page,'新增活动');await form.getByLabel('活动名称',{exact:true}).fill('UI Event '+suffix);await form.getByLabel('场地',{exact:true}).selectOption(venue.id);
  const categories=await get(page,'/categories');await form.getByLabel('类别',{exact:true}).selectOption(categories.items[0].id);
  await form.getByLabel('开始日期',{exact:true}).fill(day.minus({days:1}).toISODate()!);await form.getByLabel('结束日期',{exact:true}).fill(day.toISODate()!);
  // Intentionally leave tax empty / policy unchecked; this must be a recoverable draft.
  const event=await write(page,'POST','/events',()=>button(form,'保存活动草稿'));
  form=box(page,'新增展位');await form.getByLabel('活动',{exact:true}).selectOption(event.id);await form.getByLabel('位置编码').fill('UI-'+suffix);
  const booth=await write(page,'POST','/booths',()=>button(form,'保存展位'));
  form=page.getByTestId('event-configuration');await form.getByLabel('待配置活动').selectOption(event.id);await form.getByLabel('活动税率 bps').fill('1300');await form.getByLabel('确认此活动政策').check();
  await write(page,'PATCH',`/events/${event.id}`,()=>button(form,'保存活动配置'));
  await write(page,'POST',`/events/${event.id}/open`,()=>box(page,'活动清单').locator('tr').filter({hasText:'UI Event '+suffix}).getByRole('button',{name:'开放',exact:true}).click());

  await page.goto('/people');form=box(page,'新增员工');await form.getByLabel('名',{exact:true}).fill('UI');await form.getByLabel('姓',{exact:true}).fill(suffix);
  const person=await write(page,'POST','/salespeople',()=>button(form,'保存员工'));
  form=page.getByTestId('commission-configuration');await form.getByLabel('待配置员工').selectOption(person.id);await form.getByLabel('新佣金率 bps').fill('500');
  await write(page,'PATCH',`/salespeople/${person.id}/commission`,()=>button(form,'保存佣金配置'));
  form=box(page,'安排班次');await form.getByLabel('员工',{exact:true}).selectOption(person.id);await form.getByLabel('展位',{exact:true}).selectOption(booth.id);
  await form.getByLabel('开始 ISO（含偏移）').fill(day.startOf('day').toISO()!);await form.getByLabel('结束 ISO（含偏移）').fill(day.endOf('day').toISO()!);
  const shift=await write(page,'POST','/shifts',()=>button(form,'保存班次'));
  await write(page,'POST',`/shifts/${shift.id}/start`,()=>box(page,'班次清单').locator('tr').filter({hasText:suffix}).getByRole('button',{name:'开班',exact:true}).click());
  const staffUser='ui_'+suffix,staffInitial='Initial-'+randomUUID(),staffPassword='Changed-'+randomUUID();
  form=box(page,'分配登录账户');await form.getByLabel('员工',{exact:true}).selectOption(person.id);await form.getByLabel('用户名',{exact:true}).fill(staffUser);await form.getByLabel('临时密码（至少 16 字符）').fill(staffInitial);
  await write(page,'POST','/users',()=>button(form,'创建账户'));

  await page.goto('/products');form=box(page,'新增商品');for(const [label,value] of [['SKU','UI-'+suffix],['名称','UI Product '+suffix],['批发成本 CAD','4.00'],['最低售价 CAD','8.00'],['建议售价 CAD','10.00']])await form.getByLabel(label,{exact:true}).fill(value);
  const product=await write(page,'POST','/products',()=>button(form,'保存商品'));
  await page.goto('/stock');const locations=await get(page,'/stock/locations'),main=locations.items.find((x:any)=>x.code==='MAIN'),location=locations.items.find((x:any)=>x.booth_id===booth.id);
  form=box(page,'主仓接收');await form.getByLabel('商品',{exact:true}).selectOption(product.id);await form.getByLabel('数量',{exact:true}).fill('4');await form.getByLabel('接收依据').fill('Synthetic UI receipt');await write(page,'POST','/stock/receive',()=>button(form,'确认接收'));
  form=box(page,'库存调拨');await form.getByLabel('商品',{exact:true}).selectOption(product.id);await form.getByLabel('数量',{exact:true}).fill('4');await form.getByLabel('来源库位').selectOption(main.id);await form.getByLabel('目标库位').selectOption(location.id);await form.getByLabel('交接依据').fill('Synthetic UI handover');await form.getByLabel('我确认实物已经完成交接').check();await write(page,'POST','/stock/transfer',()=>button(form,'登记调拨'));

  await page.goto('/sales');form=box(page,'新建销售草稿');await form.getByLabel('进行中班次').selectOption(shift.id);await form.getByLabel('商品 1',{exact:true}).selectOption(product.id);await form.getByLabel('数量',{exact:true}).fill('3');await form.getByLabel('协商单价 CAD').fill('10.00');
  const sale=await write(page,'POST','/sales',()=>button(form,'保存草稿'));
  const prepared=await write(page,'POST',`/sales/${sale.id}/prepare`,()=>page.getByRole('button',{name:'准备收款并锁定库存'}).click());expect(prepared.totalCents).toBe('3390');
  await page.getByLabel('现金实收 CAD').fill('34.00');await write(page,'POST',`/sales/${sale.id}/post`,()=>page.getByRole('button',{name:'确认已收款并完成销售'}).click());
  await page.reload();await page.getByLabel('选择已有单据').selectOption(sale.id);await expect(page.getByText('成交凭证',{exact:false})).toBeVisible();
  const persisted=await get(page,`/sales/${sale.id}`);expect(persisted.sale.state).toBe('POSTED');expect(persisted.sale.total_cents).toBe('3390');
  const stock=(await get(page,`/stock/balances?locationId=${location.id}`)).items.find((x:any)=>x.product_id===product.id);expect(String(stock.on_hand)).toBe('1');expect(String(stock.reserved)).toBe('0');

  await page.goto('/returns');form=box(page,'创建退货草稿');await form.getByLabel('原销售 ID').fill(sale.id);await form.getByLabel('原单行号').fill('1');await form.getByLabel('退货数量').fill('1');await form.getByLabel('入库库位（主仓或原活动开放展位）').selectOption(main.id);await form.getByLabel('退货原因').fill('Synthetic UI return');
  const ret=await write(page,'POST','/returns',()=>button(form,'保存退货草稿'));await write(page,'POST',`/returns/${ret.id}/authorize`,()=>page.getByRole('button',{name:'授权退款',exact:true}).click());await page.getByLabel('线下退款参考号').fill('UI-'+suffix);await write(page,'POST',`/returns/${ret.id}/post`,()=>page.getByRole('button',{name:'确认退款已完成'}).click());
  const report=(await get(page,`/reports/sales?group=product&eventId=${event.id}`)).items[0];expect(String(report.quantity)).toBe('2');expect(String(report.net_cents)).toBe('2000');expect(String(report.commission_cents)).toBe('100');
  await page.goto('/reports');await page.getByLabel('汇总维度',{exact:true}).selectOption('product');await page.getByLabel('报表活动筛选').selectOption(event.id);
  await expect(page.getByRole('link',{name:'导出 CSV'})).toHaveAttribute('href',`/api/v1/reports/sales.csv?group=product&eventId=${event.id}`);
  await page.goto('/commissions');form=box(page,'准备结算');await form.getByLabel('员工',{exact:true}).selectOption(person.id);const settlement=await write(page,'POST','/commissions/prepare',()=>button(form,'占用未结流水'));expect(settlement.totalCents).toBe('100');
  const row=box(page,'结算单').locator('tr').filter({has:page.getByText('#'+settlement.id,{exact:true})});await row.getByPlaceholder('线下付款参考号').fill('UI-PAY-'+suffix);await write(page,'POST',`/commissions/${settlement.id}/pay`,()=>row.getByRole('button',{name:'登记已付',exact:true}).click());

  // A real salesperson browser uses the same production form, including first-login password change.
  const context=await browser.newContext({baseURL:process.env.TEST_BASE_URL,viewport:page.viewportSize()??undefined});const staffPage=await context.newPage();
  try{
    staffPage.on('pageerror',e=>errors.push(e.message));await login(staffPage,staffUser,staffInitial);
    await staffPage.getByLabel('当前密码',{exact:true}).fill(staffInitial);await staffPage.getByLabel('新密码（至少 16 字符）').fill(staffPassword);await write(staffPage,'POST','/auth/password',()=>staffPage.getByRole('button',{name:'保存新密码'}).click());
    await expect(staffPage.getByRole('heading',{name:'登录工作台'})).toBeVisible();await login(staffPage,staffUser,staffPassword);await expect(staffPage.getByRole('heading',{name:'运营工作台'})).toBeVisible();
    await staffPage.goto('/sales');form=box(staffPage,'新建销售草稿');await form.getByLabel('进行中班次').selectOption(shift.id);await form.getByLabel('商品 1',{exact:true}).selectOption(product.id);await form.getByLabel('数量',{exact:true}).fill('1');await form.getByLabel('协商单价 CAD').fill('10.00');const own=await write(staffPage,'POST','/sales',()=>button(form,'保存草稿'));
    await write(staffPage,'POST',`/sales/${own.id}/prepare`,()=>staffPage.getByRole('button',{name:'准备收款并锁定库存'}).click());await staffPage.getByLabel('现金实收 CAD').fill('12.00');await write(staffPage,'POST',`/sales/${own.id}/post`,()=>staffPage.getByRole('button',{name:'确认已收款并完成销售'}).click());
    const me=await get(staffPage,'/auth/me');const denied=await staffPage.request.patch(`/api/v1/salespeople/${person.id}/commission`,{headers:{'X-CSRF-Token':me.csrf,'Idempotency-Key':randomUUID()},data:{version:2,commissionBps:1000}});expect(denied.status()).toBe(403);
    const safe=(await get(staffPage,`/reports/sales?group=product&eventId=${event.id}`)).items[0];expect(safe.estimated_margin_cents).toBeUndefined();expect((await staffPage.request.get('/api/v1/audit')).status()).toBe(403);
  }finally{await context.close();}

  // Historical unused shift: a separate employee avoids overlap with the current active shift.
  await page.goto('/people');form=box(page,'新增员工');await form.getByLabel('名',{exact:true}).fill('Absent');await form.getByLabel('姓',{exact:true}).fill(suffix);const absent=await write(page,'POST','/salespeople',()=>button(form,'保存员工'));
  form=box(page,'安排班次');await form.getByLabel('员工',{exact:true}).selectOption(absent.id);await form.getByLabel('展位',{exact:true}).selectOption(booth.id);await form.getByLabel('开始 ISO（含偏移）').fill(day.minus({days:1}).startOf('day').toISO()!);await form.getByLabel('结束 ISO（含偏移）').fill(day.minus({days:1}).endOf('day').toISO()!);const expired=await write(page,'POST','/shifts',()=>button(form,'保存班次'));
  const cancelRow=box(page,'班次清单').locator('tr').filter({hasText:'Absent '+suffix});await cancelRow.getByRole('button',{name:'取消班次',exact:true}).click();await cancelRow.getByLabel(`班次 ${expired.id} 取消原因`).fill('Synthetic no-show');await write(page,'POST',`/shifts/${expired.id}/cancel`,()=>cancelRow.getByRole('button',{name:'确认取消班次'}).click());
  expect((await get(page,'/shifts?status=CANCELLED&limit=100')).items.some((x:any)=>x.id===expired.id)).toBe(true);
  expect(errors).toEqual([]);
});
