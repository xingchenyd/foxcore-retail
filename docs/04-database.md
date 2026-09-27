# 04 数据库与 ERD

版本 1.0 · 概念基线来自 Foxcore Retail A 第 3 页及 B 第 3 页 Exhibit 1。B 图有九个核心实体；A 的六类信息不等于只能建六张表。案例 PDF 不在发布包内。

## 概念与逻辑关系

可编辑的 [Barker 风格概念 ERD](diagrams/core-barker.svg) 用 `#` 标识标识符，`*` 表示必填属性，`o` 表示可选属性，关系线上注明一/多及子实体必需关系；另有 [物理 ER 源](diagrams/physical-erd.puml)。图示化简非关键字段，以 SQL 迁移为准。

```text
CATEGORY 1──N EVENT N──1 VENUE
EVENT 1──N BOOTH 1──N SALESPERSON_SHIFT N──1 SALESPERSON
SALESPERSON_SHIFT 1──N SALE；EVENT 1──N SALE
SALE 1──N PRODUCT_SALE N──1 PRODUCT
```

| B 实体 | 物理表 | 主键/关键关系 | 说明 |
|---|---|---|---|
| CATEGORY | `event_categories` | `id`，`code/type` 唯一 | 七种原文类别作为种子 |
| VENUE | `venues` | `id` | B 图拆分地址为 Street/City/Province/PCode；A 完整地址由界面组合显示 |
| EVENT | `events` | `id`，FK `venue_id`,`category_id` | 活动日期、状态与管理员确认的税率为运行补充 |
| BOOTH | `booths` | `id`，FK `event_id`，UNIQUE(`event_id`,`location`) | 开放活动前至少一有效展位 |
| PRODUCT | `products` | `id`，`sku` 唯一 | 原文的成本与最低价保留 |
| SALESPERSON | `salespeople` | `id` | A 中电话保留，可空；B 图未列电话不代表删除 |
| SALESPERSON_SHIFT | `shifts` | `id`；`(booth_id,event_id)` 复合 FK | 一班一展位，员工可有多班 |
| SALE | `sales` | `id`；`(shift_id,event_id)` 复合 FK | 保留 B 的 SALE → EVENT 和 SALE → SHIFT 双关联 |
| PRODUCT_SALE | `sale_lines` | PK(`sale_id`,`line_no`) | B 原有 Line_No、Quantity、Final_Price；本系统冻结额外快照 |

复合 FK 链：`booths UNIQUE(id,event_id)` → `shifts(booth_id,event_id)`；`shifts UNIQUE(id,event_id)` → `sales(shift_id,event_id)`，因此不能把销售强行归入另一个活动。核心九表使用 InnoDB 外键和 CHECK；已成交业务引用的主数据不使用级联删除。

## 运行扩展表（EXT）

| 表组 | 用途与关键约束 |
|---|---|
| `users`,`sessions` | 角色账号、散列密码、撤销的会话；销售员账号唯一关联档案 |
| `stock_locations`,`stock_documents`,`stock_document_lines` | 主仓/展位库位及交接/盘点依据 |
| `stock_balances`,`stock_ledger`,`stock_holds` | 余额缓存、不可覆盖增减流水和待收款占用；`on_hand >= reserved` |
| `returns`,`return_lines` | 授权后退款，关联原销售与行号，良品/损坏去向 |
| `commission_entries`,`commission_settlements`,`commission_settlement_lines`,`commission_claims` | 正负佣金流水、支付登记和一笔流水只被一个结算占用 |
| `idempotency_keys`,`audit_events`,`schema_migrations` | 同键请求去重、审计和迁移校验和 |

`db/migrations/001_core.sql` 为完整字段、索引、CHECK 和 FK 的可重建物理定义。`db/check-invariants.sql` 核查活动归属、余额=流水、占用=有效 hold、销售/退货金额和流水数量、累计退数及结算金额；`npm run db:check` 在差异不为零时退出非零。

## 迁移与恢复

迁移按文件名顺序执行，`schema_migrations` 保存 SHA-256。已应用文件内容变动会拒绝启动；新变更应新增编号迁移。MariaDB DDL 会隐式提交，故不能靠单一事务回滚一整份 DDL；迁移前应备份、失败时停止应用并修复迁移或从受控备份恢复。Compose 的 `migrate` 一次性服务在 `app` 之前运行。`db_data` 是命名卷，普通重启与 `docker compose down` 不删除数据；不要执行 `down -v` 来“修复”故障。

当前样例数据由独立 `npm run seed:sample` 从 HTTP 领域命令创建，不随正常启动自动导入；所有示例税率、成本与销量均为合成教学数据。
