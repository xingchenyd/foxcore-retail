> 作业文档与图纸仓库：https://github.com/xingchenyd/foxcore-retail —— 文档位于 `docs/`，图纸位于 [docs/diagrams](https://github.com/xingchenyd/foxcore-retail/tree/main/docs/diagrams)（实体类图 class-diagram.png/svg、物理 ERD physical-erd.png、概念 ERD core-barker.png/svg、架构图、业务序列图、用例图、状态图等全套 .puml/.svg/.png）。

# 05 软件测试与验收说明（STD）

**Foxcore Retail — Software Test Description & Acceptance**

---

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | Foxcore Retail 软件测试与验收说明（STD） |
| 文档编号 | FC-STD-001 |
| 版本 | 1.1 |
| 状态 | 基线发布（Baselined） |
| 编制日期 | 2026-09-27 |
| 测试对象 | Foxcore Retail v1.0（Fastify API + React SPA + MariaDB 11.8） |
| 上游文档 | [02 SRS](02-SRS.md)、[03 SDD](03-SDD.md)、[04 数据库设计](04-database.md) |
| 证据目录 | `docs/evidence/`（浏览器截图）、命令行输出（本报告引用） |

## 修订历史

| 版本 | 日期 | 修订人 | 修订说明 |
|---|---|---|---|
| 0.5 | 2026-09-25 | 项目组 | 首轮测试执行与结果记录 |
| 1.0 | 2026-09-27 | 项目组 | 汇总 10 单元 / 集成场景 / 16 不变量 / 2 浏览器用例结果 |
| 1.1 | 2026-09-27 | 项目组 | 按正式 STD 结构重组：测试策略、TC-001~TC-016 详细用例、数据完整性测试、缺陷与限制、追踪矩阵 |

## 目录

1. [引言](#1-引言)
2. [测试策略](#2-测试策略)
3. [测试环境与工具](#3-测试环境与工具)
4. [单元测试](#4-单元测试)
5. [集成与系统测试用例](#5-集成与系统测试用例)
6. [数据完整性测试](#6-数据完整性测试)
7. [浏览器与界面测试](#7-浏览器与界面测试)
8. [静态、安全与配置测试](#8-静态安全与配置测试)
9. [测试结果汇总](#9-测试结果汇总)
10. [已知限制与未执行项](#10-已知限制与未执行项)
11. [可追踪矩阵](#11-可追踪矩阵)
12. [附录：证据清单](#附录证据清单)

---

## 1 引言

### 1.1 目的

本文档定义 Foxcore Retail 的**测试策略、测试用例与执行结果**，用于：

1. 证明系统满足 [SRS](02-SRS.md) 中定义的功能与非功能需求；
2. 提供可复现的验收步骤，供首次启动与周期性回归使用；
3. 如实记录**未执行**的测试项及其原因，避免将"未测"误读为"通过"。

### 1.2 范围

覆盖：金额计算单元测试、HTTP+数据库集成测试、数据不变量核查、浏览器端到端测试、类型检查与生产构建、依赖安全审计、Compose 配置静态校验、发布包完整性复验。

不覆盖：性能基准（10000 条规模）、跨平台镜像构建、容器端到端启动（见 §10）、渗透测试与代码审计工具扫描。

### 1.3 定义与缩写

| 术语 | 定义 |
|---|---|
| **UT** | Unit Test，单元测试（本项目的金额与格式计算） |
| **TC** | Test Case，本报告中的集成/系统级验收用例 |
| **IV** | Invariant Verification，数据完整性核查项 |
| **E2E** | End-to-End，浏览器端到端测试 |
| **Pass / Fail / Blocked** | 通过 / 失败 / 因环境或权限受限无法执行 |
| **合成数据** | 为测试构造的虚构业务数据，非课程案例人物与真实交易 |

### 1.4 参考文献

| 编号 | 文献 |
|---|---|
| REF-01 | [02 SRS](02-SRS.md) —— 验收准则来源 |
| REF-02 | [03 SDD](03-SDD.md) —— 设计约定（加锁顺序、幂等、快照） |
| REF-03 | [04 数据库设计](04-database.md) —— 16 项不变量定义 |
| REF-04 | [07 部署运维](07-deployment-local.md) —— 环境准备与验收检查表 |
| REF-05 | `tests/unit/money.test.ts`、`tests/integration/workflow.test.ts`、`tests/e2e/workbench.spec.ts` |

### 1.5 概述

测试分六个层次自下而上执行：**静态类型与构建 → 金额计算单元 → HTTP+数据库集成 → 数据不变量 → 浏览器端到端 → 配置与发布完整性**。已执行项全部通过；容器端到端启动因本机 Docker 服务不可用而列为受阻（§10），需在具备容器环境时补验。

---

## 2 测试策略

### 2.1 测试层级

| 层级 | 方法 | 工具 | 验收标准 |
|---|---|---|---|
| L1 静态 | TypeScript 严格模式类型检查；Vite/tsc 生产构建 | `tsc`, `vite build` | 无错误 |
| L2 计算 | 金额解析、格式化、half-up 舍入、退款分摊 | Vitest | 全部断言通过 |
| L3 事务 | HTTP + 真实 MariaDB：并发抢库存、幂等重试、销售/退货/佣金 | Vitest + fetch | 无超卖、无重复过账；预期拒绝为 409 |
| L4 数据 | 16 项不变量 SQL 核查 | `npm run db:check` | 所有差异数为 0 |
| L5 浏览器 | Chromium 桌面与 iPhone 13 视口 | Playwright | 登录、导航、刷新成功，无页面异常 |
| L6 配置与发布包 | Compose 静态解析；依赖审计；发布包 SHA-256 复验 | `docker compose config`, `npm audit`, 校验脚本 | 解析成功、0 已知漏洞、逐文件校验通过 |

### 2.2 准入与准出准则

**准入（Entry）**

- 应用在 `127.0.0.1:3000` 可访问，`/health/ready` 返回 `status: ready` 与迁移版本；
- `TEST_CONFIRM=yes` 且 `TEST_BASE_URL` 为 localhost（集成测试的安全前置）；
- 管理员口令通过 `TEST_OWNER_PASSWORD` 或 `TEST_OWNER_PASSWORD_FILE` **私有**提供（不写入仓库或发布包）。

**准出（Exit）**

- L1–L6 全部通过；
- 16 项不变量差异全为 0；
- 无未关闭的阻塞级缺陷；
- 已知限制已记录于 §10。

### 2.3 测试数据策略

- **全部为合成数据**：由 `npm run seed:sample` 或测试脚本经 HTTP API 创建；
- 课程案例中的人物与交易**未导入**；
- 集成测试使用随机 UUID 前缀隔离数据（如 `INT-<tag>`），避免相互污染；
- 生产/演示库禁止执行种子脚本（见 [07](07-deployment-local.md)）。

---

## 3 测试环境与工具

| 项 | 版本/配置 |
|---|---|
| 操作系统 | Windows（本机开发机） |
| 运行时 | Node 24（项目 `.node-version` 约束 ≥ 24） |
| 数据库 | MariaDB 11.8.9（独立本地实例） |
| 浏览器 | Chromium（Playwright 托管） |
| 测试框架 | Vitest（单元与集成）、Playwright（E2E） |
| 关键命令 | `npm run typecheck`、`npm run test:unit`、`npm run test:integration`、`npm run build`、`npm run db:check`、`npm run test:e2e` |

**安全前置说明**：集成测试脚本会校验 `TEST_BASE_URL` 必须匹配 `^http://(localhost|127.0.0.1):\d+$` 且 `TEST_CONFIRM=yes`，防止误对远程环境执行破坏性操作；E2E 测试口令从 `TEST_OWNER_PASSWORD_FILE` 指向的私有文件读取，该文件**不得进入发布包**。

---

## 4 单元测试

**对象**：`apps/server/src/amounts.ts`（`halfUp`、`parseMoney`/`money`、`moneyText`）。
**文件**：`tests/unit/money.test.ts`。
**结果**：**10/10 通过**。

| ID | 用例 | 断言要点 | 结果 |
|---|---|---|---|
| UT-01 | 解析精确分与格式化 | `'0'→0n`；`'12.3'→1230n`；`'90071992547.01'→9007199254701n`；`moneyText(-1234n)→'-12.34'` | Pass |
| UT-02 | 拒绝 `1e2` | 抛异常 | Pass |
| UT-03 | 拒绝 `1,000.00`（千分位） | 抛异常 | Pass |
| UT-04 | 拒绝 `0.001`（超过分精度） | 抛异常 | Pass |
| UT-05 | 拒绝 `-1`（负金额输入） | 抛异常 | Pass |
| UT-06 | 拒绝 `+1` | 抛异常 | Pass |
| UT-07 | 拒绝 `true`（布尔） | 抛异常 | Pass |
| UT-08 | 拒绝 `[]`（数组） | 抛异常 | Pass |
| UT-09 | 拒绝 `null` | 抛异常 | Pass |
| UT-10 | half-up 舍入与退款分摊 | `halfUp(1005n*1300n)=131n`；原税 2 分、3 件的三次分摊为 `[1,0,1]` 且合计 = 原税（**不丢分、不多退**） | Pass |

**UT-10 的意义**：多次部分退款时，按累计比例分摊原税额并逐次求差，保证分摊序列之和**恰好等于**原始税额，避免"多退一分"或"少退一分"的累积误差。

---

## 5 集成与系统测试用例

**对象**：真实 MariaDB + Fastify HTTP API。
**文件**：`tests/integration/workflow.test.ts`（1 个复合场景，超时 120 s）。
**环境前置**：`TEST_CONFIRM=yes`、`TEST_BASE_URL=http://127.0.0.1:3000`、`TEST_OWNER_PASSWORD`。

| ID | 测试目标 | 前置条件 | 操作步骤 | 预期结果 | 关联需求 | 结果 |
|---|---|---|---|---|---|---|
| **TC-001** | 管理员登录与角色识别 | owner 账号已激活且已改密 | `POST /auth/login` | 200；`user.role='OWNER'`；`mustChangePassword=false`；返回 CSRF 令牌 | FR-01 | Pass |
| **TC-002** | 主数据创建链路 | 已登录 OWNER | 依次创建场地 → 取首个类别 → 创建活动（`taxBps=1300`, `policyConfirmed=true`）→ 创建展位 → 开放活动 → 创建商品（成本 4.00 / 底价 8.00 / 建议价 10.00）→ 创建员工（`commissionBps=500`）→ 创建销售员账号 → 创建班次 → 开班 | 全部 2xx；活动状态 OPEN；班次 ACTIVE | FR-02~FR-05 | Pass |
| **TC-003** | 底价拦截 | 商品底价 8.00 | 以单价 `7.99` 建单并调用 `prepare` | **409**（低于最低成交价） | FR-08, BR-价格 | Pass |
| **TC-004** | 数量合法性 | 同上 | 建单 `quantity=0` | **400** | FR-08 | Pass |
| **TC-005** | 收货与调拨 | 主仓 `MAIN` 与展位库位存在 | 收货 1 件入主仓；调拨 1 件至展位（`handoverConfirmed=true`） | 两端余额与流水相抵；展位可售量 1 | FR-06 | Pass |
| **TC-006** | **并发抢最后一件** | 展位可售量 = 1 | 并行创建 20 张草稿，再并行 `prepare` | **恰 1 个 200，19 个 409**；无超卖 | NFR-PERF-02 | Pass |
| **TC-007** | **幂等重试不重复过账** | TC-006 中成功的单据 | 用**同一** `Idempotency-Key` 并行 20 次 `post`（现金实收 12.00） | 20 次均 200 且响应**完全相同**（集合大小 = 1）；仅一份库存流水与佣金流水 | NFR-REL-01 | Pass |
| **TC-008** | 同键异体请求被拒 | 同上 | 用同一键提交**不同**请求体（实收 13.00） | **409**（请求摘要不一致） | NFR-REL-01 | Pass |
| **TC-009** | 金额计算正确 | 单价 10.00、税率 1300 bps | 查询成交单详情 | `total_cents = '1130'`（1000 + 130 税） | FR-09 | Pass |
| **TC-010** | **角色隔离** | 销售员账号登录 | 分别请求 `/salespeople`、`/audit`、`/stock/locations` | 均 **403** | NFR-SEC-02 | Pass |
| **TC-011** | **成本不泄露** | 同上 | 销售员请求 `/products` | 目标商品的 `wholesale_cost_cents` **为 undefined** | NFR-SEC-03 | Pass |
| **TC-012** | 本人单据可见 | 同上 | 销售员请求其参与的单据详情 | 200（按 `salesperson_id` 限定范围内） | NFR-SEC-02 | Pass |
| **TC-013** | 毛利口径隔离 | 同上 | 销售员请求 `/reports/sales?group=product` | 目标行 `estimated_margin_cents` **为 undefined** | NFR-SEC-03 | Pass |
| **TC-014** | 退货授权与过账 | TC-007 已过账单 | 建退货单（原行、1 件、RESTOCK、目标主仓）→ 授权 → 过账 | 授权 `totalCents='1130'`；过账 200；生成负向佣金与回库流水 | FR-10 | Pass |
| **TC-015** | 报表口径（已过账减已过账退货） | 该活动仅 1 笔销售且已全退 | `GET /reports/sales?group=event` | 该活动 `net_cents='0'` | FR-12 | Pass |
| **TC-016** | 未知路由处理 | 已登录 | `GET /api/v1/no-such-route` | **404** | NFR-错误模型 | Pass |

---

## 6 数据完整性测试

**命令**：`npm run db:check`（执行 `db/check-invariants.sql`）。
**执行时机**：样例数据导入后 + 并发测试后，在真实 MariaDB 上执行。
**结果**：**16/16 差异为 0**。

| ID | 核查项 | 预期 | 结果 |
|---|---|---|---|
| IV-01 | 销售-班次活动一致 | 0 | Pass |
| IV-02 | 班次-展位活动一致 | 0 | Pass |
| IV-03 | 余额 = 流水汇总 | 0 | Pass |
| IV-04 | 流水必有余额 | 0 | Pass |
| IV-05 | 占用 = 有效 hold 汇总 | 0 | Pass |
| IV-06 | 可售量非负 | 0 | Pass |
| IV-07 | 已过账销售金额一致 | 0 | Pass |
| IV-08 | 已过账销售必有库存流水 | 0 | Pass |
| IV-09 | 已过账销售必有佣金 | 0 | Pass |
| IV-10 | 已过账退货金额一致 | 0 | Pass |
| IV-11 | 退货不超原销量 | 0 | Pass |
| IV-12 | 退货行指向真实原行 | 0 | Pass |
| IV-13 | 已过账退货必有回库流水 | 0 | Pass |
| IV-14 | 已过账退货必有负佣金 | 0 | Pass |
| IV-15 | 取消结算无占用 | 0 | Pass |
| IV-16 | 结算金额 = 明细合计 | 0 | Pass |

完整定义见 [04 第 5 章](04-database.md#5-数据完整性与不变量)。

---

## 7 浏览器与界面测试

**工具**：Playwright + Chromium；视口：桌面与 iPhone 13。
**结果**：**2/2 通过**（`tests/e2e/workbench.spec.ts`）。

| ID | 步骤 | 预期 | 结果 |
|---|---|---|---|
| E2E-01（桌面） | 打开 `/` → 填用户名/密码 → 点击"登录系统 →" | 显示"运营工作台"标题 | Pass |
| | 点击"进入销售工作台 →" | 显示"销售工作台"与"新建销售草稿" | Pass |
| | `page.reload()` | 刷新后仍显示"销售工作台"（会话保持） | Pass |
| | 导航至 `/reports` | 显示"经营报表" | Pass |
| | 点击"导出 CSV" | 触发下载，文件名 `foxcore-report.csv` | Pass |
| | 断言 `pageerror` 收集数组 | **为空**（无未捕获页面异常） | Pass |
| E2E-02（iPhone 13） | 同上流程，移动视口 | 同上；布局可用 | Pass |

**证据**：`docs/evidence/<project>-sales.png`（桌面与移动各一份）。

---

## 8 静态、安全与配置测试

| ID | 项目 | 命令/方式 | 预期 | 结果 |
|---|---|---|---|---|
| ST-01 | 类型检查 | `npm run typecheck`（双工作区严格模式） | 无错误 | Pass |
| ST-02 | 生产构建 | `npm run build` | Vite 86 模块；前端 JS 约 299 KB 原始大小 | Pass |
| ST-03 | 依赖安全 | `npm audit`（2026-09-27） | 0 项已知漏洞 | Pass |
| ST-04 | Compose 静态校验 | `docker compose config --quiet` | 解析成功 | Pass |
| ST-05 | 迁移脚本幂等性 | 独立 MariaDB 上首次应用 / 再次校验 | 首次建表并收紧授权；第二次跳过 | Pass |
| ST-06 | 管理员初始化幂等 | `runtime-owner.mjs` 首次生成 / 第二次运行 | 首次生成临时口令；第二次跳过 | Pass |
| ST-07 | 发布包完整性 | 逐文件 SHA-256 校验；新目录 `npm ci` | 校验通过；`npm ci` 后 0 已知漏洞，类型检查/构建/10 项单测/Compose 校验全部通过 | Pass |
| ST-08 | 安全响应头 | 人工核对响应头 | CSP、`frame-ancestors`、`no-sniff`、API `Cache-Control: no-store` 均已设置 | Pass |
| ST-09 | 错误模型 | 触发各类错误 | 统一 `{code,message,requestId}`；500 **不回显 SQL 栈** | Pass |

---

## 9 测试结果汇总

| 类别 | 总数 | 通过 | 失败 | 受阻 | 通过率 |
|---|---|---|---|---|---|
| 单元测试（UT） | 10 | 10 | 0 | 0 | 100% |
| 集成/系统用例（TC） | 16 | 16 | 0 | 0 | 100% |
| 数据不变量（IV） | 16 | 16 | 0 | 0 | 100% |
| 浏览器用例（E2E） | 2 | 2 | 0 | 0 | 100% |
| 静态安全配置（ST） | 9 | 9 | 0 | 0 | 100% |
| **合计** | **53** | **53** | **0** | **0** | **100%** |

**未执行（Blocked）项**见 §10，不计入通过率。

---

## 10 已知限制与未执行项

### 10.1 未执行项（诚实声明）

| 编号 | 项目 | 原因 | 建议补验时机 |
|---|---|---|---|
| BLK-01 | `docker compose up -d --build` 完整启动 | 本机 Docker Desktop 服务未运行，且当前 Windows 进程无权启动该服务 | 具备容器环境后的首次启动（按 [07](07-deployment-local.md) 检查表） |
| BLK-02 | 容器健康检查与自愈行为 | 依赖 BLK-01 | 同上 |
| BLK-03 | 备份与恢复实际演练 | 依赖容器环境 | 正式环境上线前，在独立空卷演练 |
| BLK-04 | 跨平台镜像构建（如 linux/arm64） | 本机无构建环境 | 如需在非 x86 主机部署时补验 |

**说明**：Compose **结构**、首次迁移/管理员脚本逻辑、以及本地真实 MariaDB 上的业务行为均已分别验证，但这**不能替代**容器端到端验收。

### 10.2 系统边界（非缺陷）

| 项 | 说明 |
|---|---|
| 资金渠道 | 系统登记线下收款、退款与佣金支付的**依据**，不与任何支付渠道自动核对 |
| 税率与佣金率 | 由管理员填写并确认，系统不校验其税务合规性 |
| 毛利口径 | 报表毛利为**商品标准成本估算**，不含活动费、差旅与工资 |
| 分页与规模 | 销售列表每页 100 笔（`sales.ts` 默认 `limit=100`）、目录类列表每页 20 笔（`catalog.ts` 默认 `limit=20`），两类上限均为 100；商品/活动等选择器最多载入 100 项；**未做** 10000 条规模性能测试 |
| 时区 | 单一时区 `America/Toronto`，不支持跨时区门店 |

### 10.3 缺陷记录

缺陷按下表登记：

| 字段 | 说明 |
|---|---|
| 缺陷编号 | `DEF-<序号>` |
| 关联用例 | TC / UT / E2E 编号 |
| 严重级别 | Blocker / Critical / Major / Minor |
| 复现步骤 | 环境 + 操作 + 数据 |
| 期望与实际 | — |
| 状态 | Open / Fixed / Retest / Closed |

---

## 11 可追踪矩阵

| 需求 | 测试用例 | 设计章节 | 状态 |
|---|---|---|---|
| FR-01 认证 | TC-001, E2E-01 | SDD 2.3.1 | Pass |
| FR-02/03 场地活动展位 | TC-002 | SDD 2.3.2 | Pass |
| FR-04 商品 | TC-002, TC-011 | SDD 2.3.2 | Pass |
| FR-05 员工班次 | TC-002 | SDD 2.3.2 | Pass |
| FR-06/07 库存 | TC-005, IV-03~IV-06 | SDD 2.3.3 | Pass |
| FR-08 销售草稿与准备 | TC-003, TC-004, TC-006 | SDD 2.3.4 | Pass |
| FR-09 过账与取消 | TC-007~TC-009, IV-07~IV-09 | SDD 2.3.4 | Pass |
| FR-10 退货 | TC-014, IV-10~IV-14 | SDD 2.3.5 | Pass |
| FR-11 佣金 | TC-014, IV-15, IV-16 | SDD 2.3.6 | Pass |
| FR-12 报表 | TC-015, E2E-01（CSV） | SDD 2.3.7 | Pass |
| NFR-PERF-02 并发不超卖 | TC-006 | SDD 4.4 | Pass |
| NFR-REL-01 重试幂等 | TC-007, TC-008 | SDD 2.3.8 | Pass |
| NFR-SEC-02 角色隔离 | TC-010, TC-012 | SDD 2.3.1 | Pass |
| NFR-SEC-03 成本不泄露 | TC-011, TC-013 | SDD 2.3.8 | Pass |
| NFR-ERR 错误模型 | TC-016, ST-09 | SDD 2.3.8 | Pass |
| NFR-AUD 审计 | ST-08 及代码审查 | SDD 2.3.8 | Pass（人工） |

---

## 附录：证据清单

| 文件/输出 | 内容 |
|---|---|
| `docs/evidence/*-sales.png` | 桌面与 iPhone 13 视口的销售工作台截图 |
| Vitest 输出 | 单元测试 10/10；集成场景通过 |
| `npm run db:check` 输出 | 16 项不变量差异全为 0 |
| `npm audit` 输出（2026-09-27） | 0 项已知漏洞 |
| `docker compose config --quiet` | 退出码 0 |
| SHA-256 校验结果 | 发布包逐文件一致 |

**复现命令**

```sh
npm run typecheck
npm run test:unit
npm run test:integration      # 需 TEST_CONFIRM=yes 与本地口令
npm run build
npm run db:check
npm run test:e2e              # 需 TEST_OWNER_PASSWORD_FILE
docker compose config --quiet
```

---

**文档结束。** 上游设计与数据定义见 [03 SDD](03-SDD.md)、[04 数据库设计](04-database.md)；部署与验收检查表见 [07](07-deployment-local.md)。
