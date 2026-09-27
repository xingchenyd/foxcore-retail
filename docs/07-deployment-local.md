# 07 本地部署、运维与验收

## 前提和启动

需要 Docker Engine / Docker Desktop 与 Docker Compose v2，给容器至少 2 GB 可用内存及约 2 GB 镜像/数据库余量。解压 ZIP 后进入含 `compose.yaml` 的 `foxcore-retail` 目录，运行：

```sh
docker compose up -d --build
docker compose ps
```

等待 `db` 变为 healthy、`migrate` 退出码 0、`app` 变为 healthy。随后访问 [http://localhost:3000](http://localhost:3000)。首次启动下载并构建 Node 24 与 MariaDB 11.8 镜像，需要网络。主机只映射 `127.0.0.1:3000`，数据库没有主机端口。Compose 自动生成随机数据库密码和首位管理员临时密码，无需手写 `.env`。获取管理员密码：

```sh
docker compose exec app cat /run/foxcore-app/owner_initial_password
```

用户名 `owner`；首次登录立即改密，成功后文件会删除。普通重启 `docker compose down && docker compose up -d` 不删除数据库。**不要执行 `docker compose down -v`**，它会移除持久卷。

## 首次验收

```sh
docker compose config --quiet
docker compose ps
docker compose logs --tail=100 migrate app
curl http://localhost:3000/health/ready
```

`/health/ready` 应返回 `status: ready` 与迁移版本。按 [STD](05-STD.md) AT-01 至 AT-12 创建少量真实测试业务，验证登录、库存、成交、退款、报表和重启持久化。发布包默认是**空业务库**，不会自动放入合成演示销售。若仅供训练，可在独立测试实例手动执行 `npm run seed:sample`；这需要本地 Node 安装、登录凭据及正确 API URL，不能在生产经营库运行。

## 配置和可迁移性

`compose.yaml` 是本地一键启动配置。通用 `Dockerfile`、`Dockerfile.db` 与 `.env.example` 提供标准生产构建和环境变量入口。换主机或其他环境时，设置 `PUBLIC_ORIGIN` 为浏览器实际同源地址、HTTPS 下设置 `COOKIE_SECURE=true`，并用安全方式注入 `DB_PASSWORD_FILE` 或 `DB_PASSWORD`；不要把真实口令写进镜像或发布 ZIP。应用容器只需要受限数据库用户，迁移使用独立管理员身份。对外访问时应另行配置 TLS、备份、访问控制和审计告警；这属于后续部署工作。

## 日志、备份和恢复

查看 `docker compose logs -f app` 与 `docker compose logs -f db`；日志已遮蔽 Cookie、CSRF 与密码字段。备份前安排停写窗口，备份文件仅留在自己控制的本机磁盘且须加密、限制访问。示例命令在 Linux/macOS shell 中运行：

```sh
docker compose exec -T db sh -c 'exec mariadb-dump --single-transaction --routines --triggers -u root -p"$(cat /run/foxcore-root/password)" foxcore' > foxcore-backup.sql
```

PowerShell 中请使用合适的二进制安全导出方式或运行 `sh` 脚本，避免重定向编码改变 SQL。恢复须先在**独立测试卷**验证：新建空实例，将 SQL 导入后核对表数、单据与 `db/check-invariants.sql`，再制定正式恢复步骤。不要把 `foxcore-backup.sql` 放进交付 ZIP。

## 故障处理

若 `migrate` 失败，先看日志。迁移文件 SHA-256 与 `schema_migrations` 不一致时，应恢复原版本文件或另加新迁移，不能改已应用文件。MariaDB DDL 有隐式提交；迁移中途失败须备份后修复/恢复，不能盲目反复改表。若端口占用，先释放 3000；若无法连接数据库，检查 `db` 健康状态和卷权限。不要在日志、工单或截图公开临时密码。
