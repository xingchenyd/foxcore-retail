# 07 本地部署、运维与验收

**Foxcore Retail — Deployment, Operations & Acceptance Guide（本地形态）**

---

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | Foxcore Retail 本地部署、运维与验收手册 |
| 文档编号 | FC-DEP-001 |
| 版本 | 1.1 |
| 状态 | 基线发布（Baselined） |
| 编制日期 | 2026-09-27 |
| 部署形态 | Docker Compose（db + migrate + app 三服务） |
| 上游文档 | [03 SDD 第 4.5 章](03-SDD.md)、[04 第 6 章](04-database.md) |
| 相关文档 | [05 STD](05-STD.md)（验收用例）、[06 操作手册](06-user-operations.md)、[08 云端部署](08-deployment-vercel.md) |

## 修订历史

| 版本 | 日期 | 修订人 | 修订说明 |
|---|---|---|---|
| 0.5 | 2026-09-24 | 项目组 | 启动、验收与备份恢复初稿 |
| 1.0 | 2026-09-27 | 项目组 | 补充 Secret 卷说明与故障处置 |
| 1.1 | 2026-09-27 | 项目组 | 按正式部署文档结构重写：前提、服务拓扑、分步验收、配置矩阵、运维检查表、故障树 |

## 目录

1. [引言与前提](#1-引言与前提)
2. [服务拓扑与密钥设计](#2-服务拓扑与密钥设计)
3. [首次启动](#3-首次启动)
4. [首次验收检查表](#4-首次验收检查表)
5. [配置与可迁移性](#5-配置与可迁移性)
6. [日志、备份与恢复](#6-日志备份与恢复)
7. [日常运维检查表](#7-日常运维检查表)
8. [故障处置](#8-故障处置)
9. [附录：命令速查](#附录命令速查)

---

## 1 引言与前提

### 1.1 目的

本文档给出 Foxcore Retail **本地（或自有服务器）Docker 形态**的完整部署、首次验收、日常运维与故障处置规程。目标是"解压后一条命令可启动，启动后一份检查表可验收"。

### 1.2 前提条件

| 项 | 要求 |
|---|---|
| Docker | Docker Engine / Docker Desktop（含 Compose v2） |
| 内存 | 容器可用 ≥ 2 GB |
| 磁盘 | 镜像与数据库余量 ≈ 2 GB（随业务数据增长） |
| 网络 | 首次构建需访问镜像仓库与 npm registry |
| 端口 | 主机 `3000` 空闲（仅绑定 `127.0.0.1`） |
| 知识 | 具备基础命令行与 Docker Compose 操作能力 |

### 1.3 本文档不覆盖的内容

- 云端（Vercel + TiDB Cloud）部署 → 见 [08](08-deployment-vercel.md)；
- 业务操作步骤 → 见 [06 操作手册](06-user-operations.md)；
- 测试用例与判定 → 见 [05 STD](05-STD.md)。

---

## 2 服务拓扑与密钥设计

### 2.1 服务拓扑

```text
                      ┌─────────────── backend（internal: true）───────────────┐
                      │                                                         │
  127.0.0.1:3000 ───▶ │  app (Fastify + SPA)  ──▶ db (MariaDB 11.8)             │
                      │        ▲                       ▲                        │
                      │        │                       │                        │
                      │  migrate（一次性：建表 + 收紧权限）                       │
                      └─────────────────────────────────────────────────────────┘
```

| 服务 | 镜像 | 职责 | 网络 | 重启策略 |
|---|---|---|---|---|
| `db` | `foxcore-db:1.0.0`（`Dockerfile.db`） | MariaDB 11.8 数据持久化；健康检查 `mariadb-admin ping` | 仅 `backend`（内部网络） | `unless-stopped` |
| `migrate` | `foxcore-app:1.0.0` | 一次性：以管理员身份应用迁移，随后收紧运行账号权限 | `backend` | 退出码 0 即完成 |
| `app` | `foxcore-app:1.0.0` | Fastify API + 静态资源；入口 `runtime-owner.mjs && node apps/server/dist/index.js` | `backend` + `frontend` | `unless-stopped` |

**网络隔离要点**：`backend` 网络声明 `internal: true`，数据库**不映射任何主机端口**；只有 `app` 通过 `frontend` 网络向主机发布 `127.0.0.1:3000`。

### 2.2 密钥设计（无需手工配置口令）

| Secret 卷 | 内容 | 挂载方 | 说明 |
|---|---|---|---|
| `root_secret` | 数据库 root 口令（随机生成） | `db`（读写）、`migrate`（只读） | **不挂载给 `app`** |
| `app_secret` | 应用数据库口令 + 首位管理员初始口令 | `app` | 应用只持受限账号口令 |
| `db_data` | 命名卷：数据库文件 | `db` | **持久**，普通 `down` 不删除 |

**最小权限原则**：运行账号仅对必要表拥有 UPDATE/DELETE；**库存流水、佣金流水、审计表不授 UPDATE/DELETE**。

### 2.3 镜像构建要点

`Dockerfile` 为**两阶段构建**：

1. **build 阶段**：`node:24.15.0-bookworm-slim`，`npm ci` → `npm run build`，产出 `apps/server/dist` 与 `apps/web/dist`；
2. **运行阶段**：`npm ci --omit=dev`（仅生产依赖）→ 从 build 阶段复制产物 → 创建 `/run/foxcore-app` 并以 `USER node` 运行 → 声明 `HEALTHCHECK` 轮询 `/health/ready`。

---

## 3 首次启动

### 3.1 启动步骤

解压发布包后，进入含 `compose.yaml` 的 `foxcore-retail` 目录：

```sh
docker compose up -d --build
docker compose ps
```

**等待三个条件全部满足**（首次构建需下载镜像，耗时较长）：

| 服务 | 期望状态 |
|---|---|
| `db` | `healthy`（健康检查每 5 s 一次，最多重试 30 次） |
| `migrate` | `exited (0)` —— 退出码必须为 0 |
| `app` | `healthy`（`HEALTHCHECK` 轮询 `/health/ready`） |

随后访问 <http://localhost:3000>。

### 3.2 获取管理员初始口令

```sh
docker compose exec app cat /run/foxcore-app/owner_initial_password
```

- 用户名：`owner`；
- 口令：随机生成（≥ 32 字符），**首次登录强制改密**，改密成功后该文件自动删除；
- 改密后旧会话失效，需用新密码重新登录。

### 3.3 停止与重启

```sh
docker compose down            # 停止并移除容器：不删除数据
docker compose up -d           # 重新启动
```

> 注意：**严禁 `docker compose down -v`**：`-v` 会一并移除 `db_data` 命名卷，导致**全部业务数据丢失**。这不是一种"修复"手段。

---

## 4 首次验收检查表

**用途**：首次启动必须逐项执行并签字确认（对应 [05 STD](05-STD.md) 的 AT/TC 用例）。

```sh
docker compose config --quiet                  # 静态解析
docker compose ps                              # 三服务状态
docker compose logs --tail=100 migrate app     # 迁移与启动日志
curl http://localhost:3000/health/ready        # 就绪探针
```

| # | 检查项 | 判定标准 | 结论 |
|---|---|---|---|
| A-1 | Compose 静态解析 | `config --quiet` 退出码 0 | □ |
| A-2 | `db` 健康 | `healthy` | □ |
| A-3 | `migrate` 退出码 | `0` | □ |
| A-4 | `app` 健康 | `healthy` | □ |
| A-5 | 就绪探针 | 返回 `status: ready` 与迁移版本 | □ |
| A-6 | 首页可访问 | 浏览器打开 `http://localhost:3000` 显示登录页 | □ |
| A-7 | 管理员改密 | 取得临时口令 → 登录 → 改密 → 重新登录成功；旧会话失效 | □ |
| A-8 | 主数据链路 | 建场地 → 活动 → 展位 → 开放活动 → 建商品 → 建员工 → 排班 → 开班 | □ |
| A-9 | 库存链路 | 主仓收货 → 调拨至展位 → 确认交接 → 可售量正确 | □ |
| A-10 | 成交链路 | 建草稿 → 准备收款 → 线下收款 → 确认成交 → 单号唯一 | □ |
| A-11 | 幂等重试 | 同键重试返回相同响应；异体同键返回 409 | □ |
| A-12 | 并发抢库存 | 最后一件同时准备多单：恰 1 成功，其余 409；库存不为负 | □ |
| A-13 | 退货链路 | 部分退货成功；超额退货 409；原单保留 | □ |
| A-14 | 佣金链路 | 准备结算 → 登记付款；重复占用被拒 | □ |
| A-15 | 报表与导出 | 仅计已过账销售 − 已过账退货；CSV 限管理员 | □ |
| A-16 | 重启持久化 | `down` 后 `up -d`，单据仍在 | □ |
| A-17 | 不变量核查 | `npm run db:check` 16 项差异全为 0 | □ |

> **发布包默认为空业务库**，不会自动放入合成演示销售。若仅用于训练，可在**独立测试实例**手动执行 `npm run seed:sample`；这需要本地 Node 安装、登录凭据与正确的 API URL，**不可在生产经营库运行**。

---

## 5 配置与可迁移性

### 5.1 环境变量矩阵

| 变量 | 本地（compose 默认） | 说明 |
|---|---|---|
| `APP_ENV` | `local` | 环境标识 |
| `NODE_ENV` | `production` | 运行时模式 |
| `HOST` | `0.0.0.0` | 容器内监听地址（容器网络内可达即可） |
| `PORT` | `3000` | 监听端口 |
| `PUBLIC_ORIGIN` | `http://localhost:3000` | **必须与浏览器实际同源地址一致** |
| `COOKIE_SECURE` | `false` | **HTTPS 下必须设为 `true`** |
| `DB_HOST` / `DB_PORT` | `db` / `3306` | 数据库地址 |
| `DB_NAME` / `DB_USER` | `foxcore` / `foxcore` | 库名与受限账号 |
| `DB_PASSWORD_FILE` | `/run/foxcore-app/db_password` | 应用口令（Secret 文件）；亦支持 `DB_PASSWORD` 环境变量 |
| `OWNER_PASSWORD_FILE` | `/run/foxcore-app/owner_initial_password` | 管理员初始口令文件 |
| `DB_SSL` | 未设置（本地） | 云端设为 `true` 开启 TLS（见 [08](08-deployment-vercel.md)） |

### 5.2 迁移到 HTTPS / 其他主机

1. 设置 `PUBLIC_ORIGIN` 为浏览器实际访问的同源地址（如 `https://retail.example.com`）；
2. 设置 `COOKIE_SECURE=true`；
3. 以安全方式注入 `DB_PASSWORD_FILE` 或 `DB_PASSWORD`——**不要把真实口令写进镜像、仓库或发布包**；
4. 对外访问需另行配置 TLS 终止、备份、访问控制与审计告警，这属于部署方职责；
5. 应用容器只需受限数据库用户；迁移使用独立管理员身份（保持最小权限）。

### 5.3 可迁移性保证

- `Dockerfile` / `Dockerfile.db` 为通用标准构建，不绑定特定云平台；
- `.env.example` 提供全部环境变量入口与注释；
- **云端适配以环境变量门控**（`VERCEL`、`DB_SSL` 等），本地 Compose 流程零改动（约束 DC-07 / ADR-09）。

---

## 6 日志、备份与恢复

### 6.1 日志

```sh
docker compose logs -f app
docker compose logs -f db
docker compose logs --tail=100 migrate
```

**日志脱敏**：Cookie、CSRF 令牌与口令字段已遮蔽。排查问题时使用响应中的 `requestId` 与服务端日志对应。

### 6.2 备份

**原则**

- 备份前安排**停写窗口**（避免跨事务的不一致快照）；
- 备份文件仅留在自己控制的本机磁盘，**加密并限制访问**；
- **不要**把备份文件放进分发压缩包、网盘或聊天附件。

**逻辑导出（Linux/macOS shell）**

```sh
docker compose exec -T db sh -c \
  'exec mariadb-dump --single-transaction --routines --triggers \
   -u root -p"$(cat /run/foxcore-root/password)" foxcore' > foxcore-backup.sql
```

> **Windows PowerShell 注意**：请使用二进制安全导出方式或在 `sh` 中运行上述脚本，避免 PowerShell 重定向改变编码导致 SQL 文件损坏。

### 6.3 恢复

**必须先在独立空卷验证，再制定正式恢复步骤：**

| 步骤 | 操作 | 校验 |
|---|---|---|
| R-1 | 新建独立空实例（新 Compose 项目名 + 新卷） | `migrate` 退出 0 |
| R-2 | 导入备份 SQL | 无报错 |
| R-3 | 核对表数量 | 与 [04 数据字典](04-database.md) 一致（24 张 + `schema_migrations`） |
| R-4 | 核对单据数量与金额 | 与备份前一致 |
| R-5 | 执行 `db/check-invariants.sql` | 16 项差异全为 0 |
| R-6 | 验证通过后，才在正式环境执行恢复 | — |

---

## 7 日常运维检查表

| 频率 | 项目 | 命令/方式 |
|---|---|---|
| 每日收档 | 不变量核查 | `npm run db:check`（差异应为 0） |
| 每日收档 | 检查失败登录与锁定账号 | 【操作日志】或 `audit_events` 查询 |
| 每周 | 逻辑备份并异地/离线保存 | §6.2 |
| 每周 | 检查磁盘与卷占用 | `docker system df -v` |
| 每月 | 恢复演练（独立空卷） | §6.3 |
| 每季度 | 依赖安全审计 | `npm audit` |
| 变更时 | 迁移前备份、迁移后核查 | §8 F-01 |

---

## 8 故障处置

| 编号 | 现象 | 可能原因 | 处置 |
|---|---|---|---|
| F-01 | `migrate` 失败 | 迁移文件校验和不一致 / SQL 错误 / 权限不足 | 查看 `docker compose logs migrate`：① 若提示校验和不一致，**恢复原迁移文件**或**新增编号迁移**，不得编辑已应用文件；② MariaDB 的 DDL 会**隐式提交**，迁移中途失败须备份后修复或从受控备份恢复，不可盲目反复改表 |
| F-02 | 端口 3000 占用 | 主机已有服务占用 | 释放端口后再启动（或修改 compose 端口映射，注意同步 `PUBLIC_ORIGIN`） |
| F-03 | `app` 无法连接数据库 | `db` 未 healthy / 卷权限异常 | `docker compose ps` 检查 `db` 状态；检查 `db_data` 卷权限与磁盘空间 |
| F-04 | 健康检查反复失败 | 启动期较长或依赖未就绪 | 观察 `start-period=30s` 内是否恢复；查看 `docker compose logs app` |
| F-05 | 登录后立刻掉线 | `PUBLIC_ORIGIN` 与实际地址不一致 / HTTPS 下 `COOKIE_SECURE=false` | 校正 `PUBLIC_ORIGIN`；HTTPS 环境设 `COOKIE_SECURE=true` |
| F-06 | 不变量非 0 | 数据异常或程序缺陷 | **停止新交易** → 备份当前卷 → 保留现场与 `requestId` → 依据 [04 第 5 章](04-database.md) 定位 |
| F-07 | 忘记管理员密码 | — | 无法在线找回（口令仅存 Argon2id 散列）；须通过数据库层面由运维重置并强制改密，操作前先备份 |
| F-08 | 数据被误删 | 执行了 `down -v` 或手工删除 | 从最近的受控备份恢复（§6.3） |

> **禁止将临时口令、备份文件或含口令的日志粘贴到工单、截图或分发包中。**

---

## 附录：命令速查

```sh
# 启动与状态
docker compose up -d --build
docker compose ps
docker compose logs -f app

# 管理员初始口令
docker compose exec app cat /run/foxcore-app/owner_initial_password

# 就绪探针
curl http://localhost:3000/health/ready

# 不变量核查（需本地 Node 与数据库可达）
npm run db:check

# 停止（保留数据卷）
docker compose down

# 备份
docker compose exec -T db sh -c \
  'exec mariadb-dump --single-transaction --routines --triggers \
   -u root -p"$(cat /run/foxcore-root/password)" foxcore' > foxcore-backup.sql
```

---

**文档结束。** 云端部署见 [08](08-deployment-vercel.md)；验收用例见 [05 STD](05-STD.md)；数据库迁移细节见 [04](04-database.md)。
