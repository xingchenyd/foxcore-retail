# 08 · 云端部署（Vercel + TiDB Cloud）

> **2026-10-31 更新**：这是保留的 Vercel 路径说明，不能作为当前 TiDB 公网验收证据。当前有 34 张表、5 个迁移，ready 的最新 schema 应为 `005_event_timezone_consistency.sql`。WorkBuddy 适配、免费额度核实及外部验收边界见 [WorkBuddy 部署说明](workbuddy/README.md)。初始密码现在必须私下提供，绝不打印在日志中；生产环境也会读取可选根 `.env`，真实进程变量优先。TiDB 方言、约束执行、权限和业务事务必须在实际实例重新验收。

本文档描述如何把 Foxcore Retail 部署到 Vercel，获得一个所有人都能访问的公开链接。
**本地 Docker 部署（见 `07-deployment-local.md`）保持不变**：云端方案完全是增量式的，
所有代码改动均由环境变量门控（`VERCEL`、`DB_SSL`），不设置这些变量时本地行为与原版一致。

## 架构对照

| 层 | 本地部署 | 云端部署 |
|---|---|---|
| 前端 | Fastify 通过 `@fastify/static` 分发 `apps/web/dist` | Vercel 静态托管直接分发（全球 CDN） |
| API | 同一 Fastify 进程（端口 3000） | Vercel Serverless 函数（`api/index.js` → `apps/server/dist/index.js`） |
| 数据库 | Docker 容器内 MariaDB 11.8 | TiDB Cloud Starter（MySQL 协议兼容，TLS 连接） |
| 密码/密钥 | Docker 私有卷（`/run/foxcore-app`） | Vercel 环境变量 |
| 迁移 | `runtime-migrate.mjs`（root + GRANT） | `scripts/vercel-setup.mjs`（应用账号，无 GRANT，幂等） |

## 第 0 步 · 前置条件

- GitHub 账号（仓库 `foxcore-retail`，`vercel-deploy` 分支）
- Vercel 账号（免费 Hobby 档即可，用 GitHub 登录）
- TiDB Cloud 账号（免费 Starter 档，无需信用卡）

## 第 1 步 · 创建 TiDB Cloud 免费数据库

1. 打开 <https://tidbcloud.com>，注册/登录。
2. 创建组织后，选择 **Starter**（免费档：5 GiB 行存储 + 5 GiB 列存储 + 5000 万 RU/月）。
3. 创建集群：区域任选（建议新加坡或东京，离 Vercel 香港节点近），集群名如 `foxcore`。
4. 集群创建完成后，在集群页点击 **Connect**：
   - 选择 **Node.js** 连接示例；
   - 先按提示创建数据库密码（保存好）；
   - 记录连接参数：Host（形如 `gateway01.<region>.prod.aws.tidbcloud.com`）、Port（一般 `4000`）、User（形如 `<前缀>.root`）。
5. 在集群的 **SQL 控制台**执行 `CREATE DATABASE IF NOT EXISTS foxcore;`（TiDB 免费档每个集群自带一个 `test` 库，需另建业务库）。

## 第 2 步 · 在 Vercel 导入项目

1. 打开 <https://vercel.com/new>，找到 `xingchenyd/foxcore-retail` 仓库，**Import**。
2. Framework Preset 选择 **Other**（我们用 vercel.json 显式配置）。
3. 在 **Environment Variables** 中添加以下变量（全部环境：Production + Preview）：

   | 变量名 | 值 | 说明 |
   |---|---|---|
   | `DB_HOST` | TiDB 的 Host | 第 1 步第 4 项 |
   | `DB_PORT` | `4000` | TiDB 默认端口 |
   | `DB_USER` | TiDB 用户名（含前缀） | 如 `xxxxxxxx.root` |
   | `DB_PASSWORD` | TiDB 数据库密码 | 与 `DB_NAME` 同级的明文密码 |
   | `DB_NAME` | `foxcore` | 第 1 步第 5 项创建的库 |
   | `DB_SSL` | `true` | TiDB 强制 TLS，必填 |
   | `APP_ENV` | `production` | 启用生产门控；可选 `.env` 兜底，真实进程变量优先 |
   | `NODE_ENV` | `production` | |
   | `ALLOW_PRODUCTION_MIGRATION` | `yes` | 允许构建期运行初始化脚本 |
   | `OWNER_PASSWORD` | ≥32 字符随机串 | 首次部署创建 `owner` 用；登录后会被强制修改 |
   | `COOKIE_SECURE` | `true` | HTTPS 下必须 |
   | `PUBLIC_ORIGIN` | `https://<你的域名>.vercel.app` | **首次部署后回填**，见第 4 步 |

4. 点击 **Deploy**。构建过程会自动：安装依赖 → 构建前端/后端 → 运行 `scripts/vercel-setup.mjs`（建表 + 初始化 owner）。

## 第 3 步 · 验证

1. 打开分配的 `https://<域名>.vercel.app`，应看到登录页。
2. 访问 `https://<域名>.vercel.app/health/ready`，应返回 `{"status":"ready","schema":"001_core.sql"}`。
3. 用 `owner` + `OWNER_PASSWORD` 登录，系统会强制修改初始密码；修改后即可正常使用。

## 第 4 步 · 回填 PUBLIC_ORIGIN 并重新部署

首次部署完成后，把 Vercel 分配的域名（或后续绑定的自定义域名）填入环境变量 `PUBLIC_ORIGIN`
（协议、域名、端口需完全一致，不要带尾部斜杠），然后在 Vercel 项目页 **Deployments → Redeploy**。
该变量用于登录接口的 Origin 校验，不回填会导致登录被拒（403）。

## 与本地部署的差异说明

- **权限模型**：本地迁移脚本用 root 给应用账号发 GRANT；TiDB 云端不允许（也不需要），
  `vercel-setup.mjs` 直接用应用账号建表。
- **静态资源**：云端由 Vercel CDN 分发，Serverless 函数内不再注册 `@fastify/static`
  （`apps/web/dist` 不在函数包内，`index.ts` 的 `existsSync` 检查会自动跳过）。
- **冷启动**：Serverless 空闲后首个请求有 1–2 秒冷启动延迟，属正常现象。
- **数据持久性**：数据存于 TiDB Cloud，与 Vercel 部署解耦；重新部署不丢数据。

## 免费额度与限制

- **Vercel Hobby**：免费，仅限非商业用途；函数执行时长本项目配置为 30s（够用）。
- **TiDB Cloud Starter**：5 GiB 存储 + 5000 万 RU/月，教学演示规模远用不完；超量后拒绝新连接（不会产生账单）。

## 故障处理

| 现象 | 原因与处理 |
|---|---|
| 构建日志报 `Migration checksum changed` | 远端已应用过同版本号但内容不同的迁移：不得修改 `db/migrations` 中已发布的 SQL，应新增版本文件 |
| 登录返回 403 `FORBIDDEN` | `PUBLIC_ORIGIN` 与实际访问域名不一致（含协议/端口），回填后 Redeploy |
| 登录返回连接超时 | 检查 `DB_HOST/DB_PORT/DB_SSL`，TiDB 必须走 4000 端口 + TLS |
| 函数日志报 `Missing DB_HOST` | Vercel 环境变量未保存到当前环境（Production/Preview 勾选） |
| argon2 模块加载失败 | 极少见：Vercel 运行时区域与预编译二进制不匹配时，在项目设置中把 Node 版本固定为 24.x 后重试 |
