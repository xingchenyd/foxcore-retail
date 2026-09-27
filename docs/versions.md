# 版本与构建基线

锁定日期：2026-09-27。`package-lock.json` 是 npm 包的准确解析基线；以下为关键直接依赖与容器运行基线。

| 组件 | 版本/约束 | 用途 |
|---|---|---|
| Node.js | 24.15.0 | 构建与运行镜像；根包约束 `>=24 <25` |
| MariaDB | 11.8.9 | `Dockerfile.db`，InnoDB 事务数据库 |
| React / React DOM | 见 `apps/web/package.json` 与 lockfile | 浏览器界面 |
| TypeScript | 5.9.3 | 静态类型 |
| Vite | 7.3.6 | 前端生产构建 |
| Fastify | 5.12.5 | HTTP API 与静态资源服务 |
| mysql2 | 3.24.4 | MariaDB 驱动 |
| Playwright | 1.56.1 | Chromium 桌面/移动视口验证 |
| Vitest | 4.1.11 | 单元与集成测试 |

本地构建使用 `npm ci`，不会在构建时升级依赖。`docker manifest inspect` 已确认上述 Node 与 MariaDB 标签在镜像仓库存在及包含 Linux 架构；镜像标签在 Dockerfile 中固定补丁版本。实际镜像摘要取决于拉取时的 registry 多架构清单；由于本机 Docker 服务不可用，本轮没有执行镜像构建。更换平台时应在目标环境锁定 digest、重建并执行 STD 验收。
