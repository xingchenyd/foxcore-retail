> **2026-10-31**：用户已授权并完成 PR #4 合入 main（ef6fd92）；合并前 main 备份为 backup/main-before-operations-merge-20261031。WorkBuddy 部署适配在 codex/workbuddy-deploy-20261031 独立交付；当前增量证据见 docs/workbuddy/verification.json，云端和微信验收未完成。下方是历史记录。

> **当前版本：2026-10-28**。本轮已修复历史三项缺陷并扩展中国业务。请以[经营流程与设计v2](docs/retail-operations/README.md)、[可视化说明](docs/retail-operations/index.html)和当前验证JSON为准；以下日期段落是保留的历史基线。

> **2026-10-26 工作人员小程序**：用户已授权合并上次网页 PR #1 到 main（744c36a）；旧版远端备份为 `backup/main-before-web-review-20261026`（3393bc3）。本轮小程序仅在 `codex/staff-miniprogram-20261026`；当前结果以 `docs/miniprogram/README.md` 和 `verification.json` 为准，微信编译/真机/上传待用户账号与环境。以下均为历史记录。

> **2026-10-24 当前修订**：独立分支 `codex/retail-review-ui-docs-20261024`，依据本次用户要求交付 GitHub，不提交或合并 main，不部署公网。已完成 UI 与交互改善、3 项后端修复、34 张新图及课程报告。真实结果见 `docs/course-review/verification.json`：Node24 全量静态、50 单元、94 纯逻辑、原生 MariaDB HTTP 1+14 场景、19 不变量、浏览器 4+2 场景通过；Docker/备份恢复未验收。以下段落为保留的历史记录。
<!-- foxcore-fixes-current -->
> 当前任务以 `docs/fixes/README.md` 为唯一修复状态表。F01–F08 有生产代码/测试实现；本次离线环境仅执行了纯逻辑及静态检查。Node 24 完整构建、MariaDB、浏览器和 Docker 验收尚未在作者环境执行。不得沿用旧 PASS。
<!-- /foxcore-fixes-current -->

# Foxcore 状态

- 当前阶段：G8 本地包已完成干净解压复验。本地 MariaDB 11.8.9 上九实体、认证、库存、销售、退货、佣金、报表的真实 API 流程通过；20 并发争最后一件、20 同键过账、销售员权限、16 项数据不变量、300 笔样例、桌面/手机浏览器测试已通过。A/B 原文及 B 第 3 页图已核对；KADA 七份 PDF 已下载并补读结构和关键页。
- 本地环境：Node 24.15.0；Docker CLI/Compose 配置校验通过，Docker Desktop 服务当前进程无权启动。因此无法在本机执行容器端到端启动，须在交付后目标 Docker 环境按 STD 首次验收。独立 MariaDB 测过容器迁移/受限授权/管理员初始化脚本两次运行。
- 架构决策：同源 Fastify + React，MariaDB，金额整数分，服务端会话。
- 范围修正：用户明确将本轮限定为本地 Docker Compose 交付，不做公网/云/GitHub 事项。
- ZIP 第二份干净解压目录已运行 `npm ci`（零漏洞）、类型检查、生产构建、10 项单元测试及 `docker compose config --quiet`，均通过。剩余容器端到端和备份恢复在目标 Docker 环境按 STD 验收。
