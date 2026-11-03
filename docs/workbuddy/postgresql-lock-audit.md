# PostgreSQL 行锁审计

以 d8cca2a 的 83 个 FOR UPDATE 位置为底稿。普通单表或内连接锁沿用；汇总和非锁定外连接分开执行。

| 原位置 | 原 SQL（定位摘要） | 结论 |
|---|---|---|
| auth.ts:58 | SELECT * FROM users WHERE username=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| auth.ts:95 | SELECT * FROM users WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog-updates.ts:15 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog-updates.ts:26 | SELECT * FROM shifts WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog-updates.ts:44 | SELECT * FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog-updates.ts:60 | SELECT * FROM salespeople WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:57 | SELECT * FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:66 | SELECT * FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:81 | SELECT * FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:105 | SELECT * FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:146 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:147 | SELECT b.*,e.start_date,e.end_date,e.status,e.business_timezone FROM booths b JOIN events e ON e.id=b.event_id WHERE b.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:149 | SELECT * FROM salespeople WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:161 | SELECT s.*,e.status AS event_status FROM shifts s JOIN events e ON e.id=s.event_id WHERE s.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:165 | SELECT id FROM salespeople WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| catalog.ts:174 | SELECT * FROM shifts WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| commissions.ts:32 | SELECT id FROM salespeople WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| commissions.ts:36 | SELECT sale_id FROM returns WHERE id=ce.source_id))) AND (sa.return_days IS NULL OR e.status='CLOSED')) ORDER BY ce.id FOR UPDATE | 已改：锁员工行，唯一占用键防重；流水继续只追加 |
| commissions.ts:46 | SELECT * FROM commission_settlements WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| commissions.ts:54 | SELECT * FROM commission_settlements WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:12 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:17 | SELECT * FROM exchanges WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:27 | SELECT * FROM sales WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:47 | SELECT state FROM sales WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:47 | SELECT state FROM returns WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| exchanges.ts:48 | SELECT * FROM stock_holds WHERE sale_id=? AND status='ACTIVE' ORDER BY product_id FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| index.ts:57 | SELECT id FROM salespeople WHERE id=? AND active=TRUE FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| index.ts:66 | SELECT * FROM users WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:22 | SELECT status FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:27 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:28 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:68 | SELECT id FROM products WHERE id=? AND active=TRUE FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:69 | SELECT * FROM stock_locations WHERE code='MAIN' FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:83 | SELECT currency FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:100 | SELECT id FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| inventory.ts:101 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:24 | SELECT status FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:25 | SELECT id FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:34 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:43 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:44 | .currency,e.business_timezone,e.end_date,e.status AS event_status,e.return_days FROM shifts s JOIN events e ON e.id=s.event_id WHERE s.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:77 | SELECT * FROM stock_transfers WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:85 | SELECT * FROM stock_transfers WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:93 | SELECT id FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:94 | SELECT * FROM damage_records WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:101 | SELECT * FROM cash_handovers WHERE shift_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:107 | SELECT * FROM cash_handovers WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:114 | SELECT id FROM salespeople WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:114 | SELECT * FROM shift_extensions WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:123 | SELECT response_json FROM idempotency_keys WHERE actor_id=? AND operation=? AND command_key=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:127 | SELECT role FROM users WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:135 | SELECT id FROM users WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:135 | SELECT revision FROM sale_workspaces WHERE owner_id=? AND workspace_key=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| operations.ts:141 | SELECT * FROM ${target.table} WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| return-target.ts:15 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| return-target.ts:25 |      WHERE l.id=? FOR UPDATE | 已改：先锁事件，再锁库位；存在展位时单独锁展位 |
| returns.ts:30 | SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:56 | SELECT * FROM returns WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:68 | SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:70 | SELECT * FROM returns WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:75 | SELECT * FROM return_lines WHERE return_id=? ORDER BY sale_line_no FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:79 | SELECT * FROM sale_lines WHERE sale_id=? AND line_no=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:99 | SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:100 | SELECT * FROM returns WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:109 | SELECT * FROM return_lines WHERE return_id=? ORDER BY line_no FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:113 | SELECT id FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| returns.ts:118 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:18 | async function getSale(db:Db,saleId:string,lock=false):Promise<Sale> {const s=await first<Sale>(db,saleSql+(lock?' FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:53 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:54 | tus AS shift_status,sh.planned_start,sh.planned_end,e.status AS event_status FROM shifts sh JOIN events e ON e.id=sh.event_id WHERE sh.id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:69 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:94 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:99 | SELECT * FROM stock_holds WHERE sale_id=? AND status='ACTIVE' ORDER BY product_id FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:109 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:114 | SELECT * FROM sale_lines WHERE sale_id=? ORDER BY product_id FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:117 | SELECT * FROM products WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:119 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:138 | SELECT id FROM events WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:148 | SELECT * FROM sale_lines WHERE sale_id=? ORDER BY product_id FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:150 | SELECT * FROM stock_holds WHERE sale_id=? AND line_no=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| sales.ts:151 | SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| workspaces.ts:13 | SELECT id FROM users WHERE id=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
| workspaces.ts:14 | SELECT revision,payload_json FROM sale_workspaces WHERE owner_id=? AND workspace_key=? FOR UPDATE | 保留：行级锁，非聚合、无外连接可空侧 |
