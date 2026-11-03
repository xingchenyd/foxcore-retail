# PostgreSQL 部署补充

适用分支：`codex/workbuddy-deploy-pg-20261103`。准备 Node 22.12+ 或 24、专用 PostgreSQL 数据库和 WorkBuddy 私密配置。本地容器使用 PostgreSQL 16 和独立的 pg_data 卷；旧 MariaDB 卷原样保留。SQL 初始化只用于新空库。

1. 在 TiDB Cloud 控制台确认实例类型为 **PostgreSQL-compatible Starter**。从 Connect 面板复制主机、端口与含实例前缀的角色名；在 SQL Editor 创建测试库、另建专用空库 `foxcore`。不要在已有业务库运行探针。
2. 用测试库设置 DB_HOST、DB_PORT=5432、DB_NAME、DB_USER、DB_PASSWORD 或 DB_PASSWORD_FILE，远端 DB_SSL=true。若系统信任链不够，使用供应商 CA 的 PEM 文件并设置 DB_SSL_CA_FILE，保持证书和主机名校验。
3. 先执行 `npm ci --include=dev`，再设置 `DB_PG_SMOKE_CONFIRM=DISPOSABLE:<测试库名>`，运行 `node scripts/pg-smoke.mjs`。探针创建随机命名的测试表并清理。还要在目标测试库单独验证 CREATE ROLE / GRANT / REVOKE、独立角色重连及应用实际权限。如果实例不支持迁移锁、事务 DDL、行锁或约束，暂停该目标的初始化；请改用原生 PostgreSQL 或等确认有等价实现。受限角色不支持时，只可在隔离测试库临时用管理员验证，并记录生产门槛未满足。
4. 应用账号与迁移账号分开。参见 `scripts/runtime-migrate.mjs` 的权限清单：业务表 SELECT/INSERT、指定表 UPDATE、仅 sale_lines/commission_claims DELETE、序列 USAGE、迁移记录 SELECT。禁止应用更新/删除审计、库存与佣金流水，禁止改表；以运行角色实测拒绝。不要在共享数据库盲目执行本地容器脚本。
5. 验证通过后，切换到专用空库。运行 `npm run build:cloud`。用私密迁移账号、至少 32 字符的 OWNER_PASSWORD 或文件，及 `APP_ENV=production`、`ALLOW_PRODUCTION_MIGRATION=yes` 显式执行 `npm run setup:cloud`；移除这些一次性变量。首次登录改密码。再按 WorkBuddy 指南做 health-only、HTTPS 域名、就绪与登录验收。
6. 若旧 MariaDB 中已有业务记录，暂不切流量：要另做迁移演练、冻结写入窗口、全量对账、序列校准和回滚预案。新建 PostgreSQL 库不包含旧库数据。

[PingCAP PostgreSQL 兼容范围](https://docs.pingcap.com/tidbcloud/postgresql-compatibility/) · [运行结果](verification.json)
