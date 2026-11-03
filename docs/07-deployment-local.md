# PostgreSQL 16 本地部署

本分支采用全新的 PostgreSQL 数据卷；已有 MariaDB 数据仍在原卷。本地空库安装：`docker compose up -d --build`。数据库不映射到宿主机，内部端口 5432。可用 `docker compose logs migrate` 查看五个迁移结果，以 `/health/ready` 检查 API 就绪。

通过本机 `docker compose exec app cat /run/foxcore-app/owner_initial_password` 获取一次性口令。登录后立即改密；口令请留在本机。应用使用受限角色，只有 migrate 容器能读取数据库管理员口令文件。

`npm run verify:full` 只针对独立 Docker 验收项目，含 pg_dump/psql 备份恢复路径。Docker 运行及备份恢复以 [本轮验证](workbuddy/verification.json) 为准。历史 MariaDB 部署请查 [旧分支](https://github.com/xingchenyd/foxcore-retail/tree/codex/workbuddy-deploy-20261031)。云端参见 [PostgreSQL 部署补充](workbuddy/postgresql.md)。
