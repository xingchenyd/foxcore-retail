<!-- foxcore-fixes-current -->
> 当前任务以 `docs/fixes/README.md` 为唯一修复状态表。F01–F08 有生产代码/测试实现；本次离线环境仅执行了纯逻辑及静态检查。Node 24 完整构建、MariaDB、浏览器和 Docker 验收尚未在作者环境执行。不得沿用旧 PASS。
<!-- /foxcore-fixes-current -->

# Foxcore 状态

- 当前阶段：G8 本地包已完成干净解压复验。本地 MariaDB 11.8.9 上九实体、认证、库存、销售、退货、佣金、报表的真实 API 流程通过；20 并发争最后一件、20 同键过账、销售员权限、16 项数据不变量、300 笔样例、桌面/手机浏览器测试已通过。A/B 原文及 B 第 3 页图已核对；KADA 七份 PDF 已下载并补读结构和关键页。
- 本地环境：Node 24.15.0；Docker CLI/Compose 配置校验通过，Docker Desktop 服务当前进程无权启动。因此无法在本机执行容器端到端启动，须在交付后目标 Docker 环境按 STD 首次验收。独立 MariaDB 测过容器迁移/受限授权/管理员初始化脚本两次运行。
- 架构决策：同源 Fastify + React，MariaDB，金额整数分，服务端会话。
- 范围修正：用户明确将本轮限定为本地 Docker Compose 交付，不做公网/云/GitHub 事项。
- ZIP 第二份干净解压目录已运行 `npm ci`（零漏洞）、类型检查、生产构建、10 项单元测试及 `docker compose config --quiet`，均通过。剩余容器端到端和备份恢复在目标 Docker 环境按 STD 验收。
