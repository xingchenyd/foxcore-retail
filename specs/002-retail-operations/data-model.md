# 数据模型与不变量

物理结构以 `db/migrations/001_core.sql` 至 `005_event_timezone_consistency.sql` 为准，实际结构元数据在 `docs/retail-operations/schema.json`。共33业务表+1迁移记录表。

新增业务表：business_settings、stock_transfers、damage_records、cash_handovers、shift_extensions、sale_workspaces、sale_workspace_revisions、exchanges。其他表只添加币种、价格口径、期限、现金归属、换货关联等必要字段。既有001文件不改；迁移校验接受同内容LF/CRLF，记录不被覆写。

销售金额、税、佣金、成本保持冻结快照；退货按原行累计比例分摊并冲原销售员。换货一头关联原单退入，一头关联新销售，避免在销售行上原地改写。库存用来源、在途、目标/损坏三个账户记录移动。短缺不进入目标可售余额。现金退款归实际支付班次，换货仅净差价进入现金交班，关联退入/换出不双计。

工作区主键为(owner_id,workspace_key)，版本历史主键再加revision。保存销售与消费工作区revision在同一事务中。历史表无UPDATE/DELETE权限。账号重置只存口令哈希，网页待核对记录中的敏感操作只保存请求摘要，不保存口令。

31项实际一致性检查分布于 `db/check-invariants.sql`、`db/check-fix-invariants.sql`、`db/check-operations-invariants.sql`；图纸包括全表物理ERD、库存模块、销售财务模块、账号草稿审批模块。概念类图描述领域职责，项目的实际代码组织是函数模块，不声称存在ORM实体类。

临时口令未知结果：管理员可通过待核对面板核对已完成请求，或为未执行的旧UUID建立禁止迟到执行的结束记录，再重新设置；口令原文不进入持久化请求。员工和OWNER受控恢复均保留审计。
