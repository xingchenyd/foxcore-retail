> **2026-10-26 工作人员微信小程序**：原生 WXML/WXSS/TypeScript，复用同一业务 API 和 MariaDB。查看 [开发、导入、权限与验证说明](docs/miniprogram/README.md)。本次小程序独立分支交付；上次网页改进已由 PR #1 合并 main，合并前旧版保存在 `backup/main-before-web-review-20261026`。

> **2026-10-24 历史审查交付**：请先阅读 [系统审查与课程设计](docs/course-review/README.md)、[离线可视化手册](docs/course-review/index.html) 与 [本轮验证记录](docs/course-review/验证记录.md)。本轮已修复业务边界并更新 UI，重新生成 34 张可编辑图；旧 PDF/旧图和下文历史验证不能替代本轮证据。通过独立分支 `codex/retail-review-ui-docs-20261024` 交付，不合并 main，未部署线上。

<!-- foxcore-fixes-current -->
> 本轮修复：实现与验证状态以 [修复说明](docs/fixes/README.md)、[决策](docs/fixes/decisions.md)、[验证记录](docs/fixes/verification.md) 和 `docs/use-cases.json` 为准。下文未更新的历史运行统计不代表本轮通过。PDF/既有图片是旧基线派生物，尚未重新生成；修复后以 Markdown、源码及新合同为准。
<!-- /foxcore-fixes-current -->

# Foxcore Retail · 现场销售管理系统

Foxcore Retail（Ivey 案例编号 9B18E016 / 9B18E017）的独立教学实现：React + TypeScript + Vite、Node.js + Fastify、MariaDB 和 Docker Compose。覆盖原案例的九个核心实体与真实库存、销售、退货、佣金、权限、审计全流程——系统只记录线下收付款确认，不处理银行卡。

## 业务背景

Foxcore Retail 在展会、市集等**七类活动**（商贸展、肋排节、滨水节、音乐节、啤酒节、体育赛事、街头节）中设展位销售商品：**17 名**全职销售顾问、**超过 28 种**在售商品、成交价允许现场协商但不得低于底价、销售归属需精确到"活动 → 展位 → 班次 → 销售员"。原纸笔流程存在漏记错抄、无核价核库存、佣金争议、退货划改原单、数据难聚合等问题，本系统针对这些问题逐项给出机制化解法。

## 功能特性（10 个页面模块）

| 路由 | 模块 | 管理员 | 销售员 | 主要功能 |
|---|---|:-:|:-:|---|
| `/` | 工作台 | √ | √ | 汇总概览入口 |
| `/events` | 活动与展位 | √ | √（只读） | 场地 / 七类活动 / 展位维护与开放控制 |
| `/products` | 商品 | √ | √（脱敏） | SKU、批发成本、底价、建议价维护 |
| `/people` | 人员与班次 | √ | √（本人） | 员工建档、佣金率、排班、开班/关班 |
| `/stock` | 库存 | √ | √（本展位） | 主仓收货、交接式调拨、差额盘点、库位余额 |
| `/sales` | 销售工作台 | √ | √ | 草稿 → 准备收款 → 确认成交 三步录入 |
| `/returns` | 退货与核对 | √ | — | 退货授权、退款登记、按行限量核对 |
| `/commissions` | 佣金 | √ | √（本人） | 结算准备（占用流水）与线下支付登记 |
| `/reports` | 报表 | √ | √（本人） | 活动/商品/员工三维度聚合，CSV 导出 |
| `/audit` | 操作日志 | √ | — | 与业务同事务写入的审计查询 |

## 系统架构

B/S 单体同源架构：客户端仅需浏览器；服务端为 Node.js 单进程 Fastify 应用，通过 `@fastify/static` 在同一端口（3000）同源托管前端静态资源与 `/api/v1` 接口（共 46 个业务路径，另有 2 个健康检查路径），无跨域配置；数据层为 MariaDB 11.8。

```
浏览器 (React SPA)
   │  同源 HTTP :3000
   ▼
Fastify 应用 ── 静态资源 (apps/web 构建产物)
   │  └─ /api/v1/*  59 个业务方法操作（显式服务端输入校验）
   │  └─ 会话 Cookie + CSRF；错误处理器：4 类约束冲突 → 409
   ▼
mysql2 连接池 · READ COMMITTED · 关键行 FOR UPDATE
   ▼
MariaDB 11.8（25 张业务表 + 1 张迁移版本表）
```

生产部署以 Docker Compose 编排三个服务：

- **db** — MariaDB 11.8，位于 `internal: true` 后端网络，端口不对外暴露；
- **migrate** — 一次性执行 `db/migrations` 迁移；
- **app** — Fastify 应用，健康检查通过后对外提供 3000 端口。

数据库密码与初始管理员口令经 **Docker secrets** 挂载（独立私有卷），不写入环境变量明文。

## 技术栈

| 层 | 选型 | 版本 |
|---|---|---|
| 前端框架 | React / react-router-dom / @tanstack/react-query | 19.2.0 / 7.18.4 / 5.90.2 |
| 前端构建 | Vite（Rollup 产物由后端托管） | 7.3.7 |
| 语言 | TypeScript | 5.9.3 |
| 后端框架 | Fastify / @fastify/cookie / @fastify/static | 5.12.7 / 11.0.2 / 10.1.5 |
| 数据访问 | mysql2 | 3.24.4 |
| 数据库 | MariaDB | 11.8 |
| 安全 | argon2（Argon2id） | 0.44.0 |
| 时区 | luxon（业务时区 America/Toronto） | 3.7.2 |
| 测试 | Vitest / @playwright/test | 4.1.12 / 1.56.1 |
| 运行时 | Node.js（见 `package.json` engines：`>=24 <25`） | 24 |

## 数据库设计

物理设计共 **25 张业务表**（另含 1 张迁移版本表），覆盖主数据（场地/活动/展位/商品/员工）、班次、库存、销售、退货、佣金、账户与审计九个子域。完整字段级字典见 [docs/04-database.md](docs/04-database.md)，25 表 ERD 见 [新版 25 表 ERD](docs/course-review/diagrams/erd-00-overview.svg)。

关键设计：

- **归属一致性由复合外键保证**：如 `sales` 表以 `(shift_id, event_id)` 复合外键同时约束班次与活动的归属一致，杜绝"班次属于 A 活动、销售挂在 B 活动"的脏数据；
- **单据状态用 ENUM 约束**：`DRAFT → CHECKOUT → POSTED / CANCELLED`，状态迁移由应用层状态机统一控制；
- **余额与流水分离**：任何收货、调拨、盘点、销售、退货均写流水行，库位余额恒等于流水和（可执行核查验证）；
- **14 条 CHECK 约束**：数量为正、费率区间、状态合法性等在数据库层兜底；
- **行级快照**：成交行固化价格、税率、佣金率，历史单据不受主数据后续变更影响。

## 数据完整性不变量

系统以 **16 项可执行 SQL 核查**（[`db/check-invariants.sql`](db/check-invariants.sql)）持续验证完整性，包括：销售单与班次活动归属一致、班次与展位归属一致、余额账与流水差额为零、占用不大于在手、可售量非负、已过账销售额与流水合计一致、已过账必有佣金流水、退货不超原行累计量、已过账退货必有回库流水与佣金冲回、已取消结算无认领流水等。执行 `npm run db:check` 即可全量核查。

## 并发与一致性设计

现场高并发场景（多销售员争用同一展位库存）采用四项机制：

1. **固定加锁顺序**：幂等记录 → 活动 → 班次/销售 → 商品/库存 → 佣金/余额，全系统一致，减少死锁诱因，不能保证没有死锁；事务隔离级别 `READ COMMITTED`，关键行 `SELECT ... FOR UPDATE`；
2. **冲突重试**：事务捕获 `ER_LOCK_DEADLOCK`、`ER_LOCK_WAIT_TIMEOUT`、`ER_CHECKREAD` 三类错误后回滚，随机退避 20–70 ms 再重试，最多 3 次尝试；其余错误不重试。全局错误处理器仅将 `ER_DUP_ENTRY`、`ER_NO_REFERENCED_ROW_2`、`ER_ROW_IS_REFERENCED_2`、`ER_CHECK_CONSTRAINT_VIOLATED` 四类约束冲突映射为 409；
3. **幂等写入**：业务 POST 必须携带 UUID 幂等键，键、请求摘要与响应在同一事务提交——同键同体重试返回首次响应（不重复过账），同键异体返回 409；
4. **金额精确**：金额一律以整数分（bigint）存储运算，税与佣金按 bps 计算并 half-up 取整，杜绝浮点误差。

## 安全设计

- 口令以 **Argon2id** 散列存储，会话令牌仅存 SHA-256 摘要；
- Cookie `HttpOnly` + `SameSite=Lax` + CSRF 令牌校验；会话 12 小时绝对有效期、30 分钟空闲过期；改密后撤销其他会话；
- 全局响应 `Cache-Control: no-store` 与内容安全策略（CSP）；
- 角色中间件：越权返回 403；非本人资源返回 404（资源存在性不泄露）；
- 商品成本与毛利对销售员在序列化层裁剪，不进响应体；
- CSV 导出对 `=`、`+`、`@` 开头单元格加引号防公式注入。

## 测试

按六个层次组织，历史基线共列有 **53 项检查（并非本轮运行结果）**（详见 [docs/05-STD.md](docs/05-STD.md)）：

| 层次 | 内容 | 代表场景 |
|---|---|---|
| L1 单元 | 金额计算 | half-up 舍入、退款分摊不丢分 |
| L2 集成 | 工作流与并发 | 20 并发抢最后一件恰 1 成功 19 冲突；同幂等键 20 并发仅过账一次 |
| L3 端到端 | 桌面 + iPhone 13 视口 | 主流程、CSV 导出文件名 |
| L4 系统 | 场景级 | 退货冲回、底价校验、越权访问 |
| L5 不变量 | 16 项 SQL 断言 | `npm run db:check` |
| L6 配置 | 发布包检查 | 环境变量矩阵、secrets 卷 |

## 快速开始（本地 Docker 一键启动）

```sh
docker compose up -d --build
docker compose ps
```

待 `app` healthy 后打开 [http://localhost:3000](http://localhost:3000)。首次管理员用户为 `owner`；临时密码通过 `docker compose exec app cat /run/foxcore-app/owner_initial_password` 读取，登录后立即修改。数据库和密码存放在 Docker 私有卷中。普通 `docker compose down` 保留业务数据；**不要使用 `down -v`**。

完整步骤、首次验收清单（17 项）与故障处理见 [本地部署文档](docs/07-deployment-local.md)，业务操作见 [用户手册](docs/06-user-operations.md)。

## 云端部署（可选）

如需一个所有人都能访问的公开链接，可使用 Vercel + TiDB Cloud（均有免费档）：静态资源走 CDN、接口走 Serverless 函数、数据库托管至云 MySQL 兼容服务并启用 TLS；本地 Docker 部署方式不受影响（所有改动经 `VERCEL` / `DB_SSL` 环境变量门控）。完整步骤见 [云端部署文档](docs/08-deployment-vercel.md)。

## 开发与核验

需要 Node 24、MariaDB 11.8 和 npm。复制 `.env.example` 为 `.env` 并填入仅用于本机开发的真实 DB 密码（不要提交/打包 `.env`）；迁移时数据库用户须有建表权限。执行 `npm ci`、`npm run db:migrate`。以私有进程环境设置 `OWNER_USERNAME` 和至少 16 字符的 `OWNER_PASSWORD`，再执行 `npm run owner:init`；随后 `npm run dev`。生产构建使用 `npm run build`。

常用命令：

| 命令 | 作用 |
|---|---|
| `npm run verify` | typecheck + 单元 + 集成 + 构建 + 不变量核查一键执行 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test:unit` / `test:integration` | 单元 / 集成测试（需隔离测试库，详见测试源码） |
| `npm run test:e2e` | Playwright 浏览器测试 |
| `npm run db:check` | 16 项数据完整性不变量核查 |
| `npm run seed:sample` | 向**独立测试库**写入合成种子数据（7 活动/14 展位/30 商品/17 销售员/300 笔销售） |

## 目录结构

```
foxcore-retail/
├── apps/web/            # React + TS 前端（10 个页面模块）
├── apps/server/         # Fastify 后端（路由、会话、事务、错误处理）
├── db/
│   ├── migrations/      # 可重建的 MariaDB 架构（25+1 表）
│   └── check-invariants.sql  # 16 项数据完整性不变量核查
├── tests/               # unit / integration / e2e 三层测试
├── scripts/             # 迁移、初始化、种子、Vercel 云端迁移脚本
├── docs/                # 全套设计文档与图表（见下）
├── api/index.js         # Vercel Serverless 入口
├── vercel.json          # Vercel 静态 CDN + API 重写配置
├── Dockerfile*          # 两阶段构建
└── compose.yaml         # db + migrate + app 三服务编排
```

## 文档导航

| 文档 | 内容 |
|---|---|
| [01-vision-business](docs/01-vision-business.md) | 愿景、AS-IS/TO-BE 业务建模、目标与业务规则 |
| [02-SRS](docs/02-SRS.md) | 软件需求规格：功能/非功能需求、用例规约、权限矩阵 |
| [03-SDD](docs/03-SDD.md) | 软件设计说明书：4+1 架构视图、设计决策 ADR-01~12 |
| [04-database](docs/04-database.md) | 数据库三层设计（概念/逻辑/物理）与 25 表字段字典 |
| [05-STD](docs/05-STD.md) | 系统测试报告：53 项测试、已知限制、复现命令 |
| [06-user-operations](docs/06-user-operations.md) | 用户手册：6 条核心流程、操作禁忌 |
| [07-deployment-local](docs/07-deployment-local.md) | 本地 Docker 部署：验收清单、备份恢复、故障处置 |
| [08-deployment-vercel](docs/08-deployment-vercel.md) | Vercel + TiDB Cloud 云端部署 |
| [diagrams/](docs/diagrams) · [openapi.json](docs/openapi.json) | PlantUML/SVG 架构图源 · 51 个路径（含健康检查）/ 61 个方法契约 |

**历史实测说明（本轮结果见新验证记录）**：真实本地 MariaDB 上业务、并发、数据不变量、生产构建及浏览器测试通过。本机 Docker Desktop 服务无法启动，因此 Compose 静态配置已验证，容器首次启动与备份恢复需要在目标 Docker 环境按 STD 验收。发布包不含案例原件、密码、数据库备份或任何公网部署凭据。

## 本轮修复验收入口

`npm run verify:static` 为快速检查；`npm run verify:full` 使用独立一次性 Compose 实例执行完整验证。需要 Node 24、锁定依赖、Docker Compose 和 Playwright Chromium；任何前提/阶段失败均非零退出，不计为通过。旧 `npm run verify` 保留兼容，但不代表完整浏览器验收。先阅读 `docs/fixes/verification.md`。
