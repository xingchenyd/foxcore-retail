# Foxcore Retail · 本地部署版

Foxcore Retail A+B 的独立教学实现：React + TypeScript + Vite、Node.js + Fastify、MariaDB 和 Docker Compose。包含九个原案例核心实体、真实库存、销售、退货、佣金、权限、审计与测试。它只记录线下收付款确认，不处理银行卡。

## 一键启动

解压发布 ZIP，进入 `foxcore-retail` 文件夹：

```sh
docker compose up -d --build
docker compose ps
```

待 `app` healthy 后打开 [http://localhost:3000](http://localhost:3000)。首次管理员用户为 `owner`；临时密码通过 `docker compose exec app cat /run/foxcore-app/owner_initial_password` 读取，登录后立即修改。数据库和密码存放在 Docker 私有卷中。普通 `docker compose down` 保留业务数据；**不要使用 `down -v`**。

完整步骤和故障处理见 [本地部署文档](docs/07-deployment-local.md)，业务操作见 [用户手册](docs/06-user-operations.md)。首次容器验收清单见 [STD](docs/05-STD.md)。

## 开发与核验

需要 Node 24、MariaDB 11.8 和 npm。复制 `.env.example` 为 `.env` 并填入仅用于本机开发的真实 DB 密码（不要提交/打包 `.env`）；迁移时数据库用户须有建表权限。执行 `npm ci`、`npm run db:migrate`。以私有进程环境设置 `OWNER_USERNAME` 和至少 16 字符的 `OWNER_PASSWORD`，再执行 `npm run owner:init`；随后 `npm run dev`。生产构建使用 `npm run build`。`npm run typecheck`、`npm run test:unit`、`npm run test:integration`、`npm run db:check` 和 `npm run test:e2e` 提供相应检查；集成与浏览器测试必须有隔离测试数据库/账号及 `TEST_OWNER_PASSWORD_FILE`，详见测试源码。样例种子 `npm run seed:sample` 只能向独立测试库写入合成数据。

## 文件导航

| 路径 | 内容 |
|---|---|
| `apps/web`, `apps/server` | 前端、后端完整 TypeScript 源码 |
| `db/migrations`, `db/check-invariants.sql` | 可重建 MariaDB 架构与数据不变量 |
| `tests/` | 单元、HTTP 事务与浏览器测试 |
| `docs/01`–`07` | 愿景、SRS、SDD、数据库、STD、用户和部署文档 |
| `docs/diagrams`, `docs/openapi.json` | ERD/UML 源和 API 合同 |
| `Dockerfile*`, `compose.yaml`, `.env.example` | 通用生产构建与本地启动配置 |

**实测说明**：真实本地 MariaDB 上业务、并发、数据不变量、生产构建及浏览器测试通过。本机 Docker Desktop 服务无法启动，因此 Compose 静态配置已验证，容器首次启动与备份恢复需要在目标 Docker 环境按 STD 验收。发布包不含案例原件、密码、数据库备份或任何公网部署配置。
