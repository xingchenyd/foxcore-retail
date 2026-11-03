# Foxcore Retail 数据库设计 · PostgreSQL

**FC-DBD-002 · 2026-11-03** · 本地验证 PostgreSQL 16；WorkBuddy 目标为 PostgreSQL-compatible TiDB Cloud Starter，目标实例待验收。

## 概念与逻辑模型

概念层保留九个案例核心实体：活动类别、场地、活动、展位、员工、班次、商品、销售与销售明细。销售单关联班次与活动，明细关联商品；退换货追溯原单，库存变动与佣金通过来源类型、单号和行号追溯。网页和工作人员小程序共享同一个 Fastify API 和业务数据库。

| 数据域 | 关键实体与边界 |
|---|---|
| 活动与班次 | 场地、类别、活动、展位、班次、延期申请、现金交班；组合外键保证班次、展位和销售归属一致 |
| 销售与退换 | 销售主从、库存预留、退货主从、独立换货单；通过原单控制时限、数量和退款差额 |
| 库存 | 库位、余额、库存单据与明细、库存流水、调拨和损坏记录；流水追加，余额与预留可对账 |
| 佣金 | 佣金流水、结算单、结算明细与占用；同一流水只能被有效结算占用一次 |
| 权限与运营 | 用户、会话、幂等键、审计、营业配置、工作台及修订历史；员工权限由服务端裁决 |

[概念 ERD](diagrams/core-barker.svg) · [完整物理 ERD](retail-operations/diagrams/03a-database-complete.svg) · [库存分图](retail-operations/diagrams/03b-stock-erd.svg) · [财务分图](retail-operations/diagrams/03c-financial-erd.svg)

## 物理模型与约束

当前为 **33 张业务表 + 1 张迁移记录表**。[物理字典 JSON](retail-operations/schema.json) 从 PostgreSQL 16 系统目录导出，包含字段类型、可空性、外键、约束、索引及迁移摘要。MariaDB 时期的课程图和报告保留原始设计语境，不能作为本分支的物理字典。

- 业务标识为 BIGINT IDENTITY；写入使用 RETURNING，BIGINT 经 API 仍以字符串传输。金额以整数分计算。
- 状态使用 VARCHAR 与 CHECK，外键、复合主键、唯一键按迁移定义执行。原无符号字段加非负约束；BIGINT 以 PostgreSQL 的有符号上限为界，业务请求已有更小的金额和数量限制。
- 业务日用 DATE；时间戳用 TIMESTAMP(3) 存 UTC，事件时区单独保留。API 保留 YYYY-MM-DD、YYYY-MM-DD HH:mm:ss.SSS、金额字符串及历史 0/1 字段。
- 登录用户名、SKU 与同活动展位使用 lower 表达式唯一索引保留大小写折叠；PostgreSQL 的重音、尾空格和排序规则与原 MariaDB 不保证等价。迁移真实数据前须审查文本键和边界值。
- 写入事务使用 READ COMMITTED；报表使用 REPEATABLE READ READ ONLY。库存、销售和退货锁定既定业务行；佣金准备锁定员工行，并依赖唯一占用键保护追加流水。

## 部署与验收

迁移 001–005 按顺序执行，校验 LF/CRLF 摘要；迁移事务与初始化管理员分别用事务咨询锁互斥。云端先在独立测试库验证身份列、锁、DDL 回滚、约束和角色，再给专用空库执行显式初始化。初始化不搬运 MariaDB 历史数据。已有业务数据的导出、转换、对账与回滚须单独安排。

[WorkBuddy 部署指南](workbuddy/README.md) · [验证记录](workbuddy/verification.json) · [锁审计](workbuddy/postgresql-lock-audit.md)

TiDB Cloud PostgreSQL 兼容版为公开预览；需要目标实例、实际权限、备份恢复和容量的独立证据，才能评估经营使用。
