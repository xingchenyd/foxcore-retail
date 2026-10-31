> **当前版本：2026-10-28**。本轮已修复历史三项缺陷并扩展中国业务。请以[经营流程与设计v2](docs/retail-operations/README.md)、[可视化说明](docs/retail-operations/index.html)和当前验证JSON为准；以下日期段落是保留的历史基线。

> **2026-10-26 工作人员小程序**：用户已授权合并上次网页 PR #1 到 main（744c36a）；旧版远端备份为 `backup/main-before-web-review-20261026`（3393bc3）。本轮小程序仅在 `codex/staff-miniprogram-20261026`；当前结果以 `docs/miniprogram/README.md` 和 `verification.json` 为准，微信编译/真机/上传待用户账号与环境。以下均为历史记录。

> **2026-10-24 当前修订**：独立分支 `codex/retail-review-ui-docs-20261024`，依据本次用户要求交付 GitHub，不提交或合并 main，不部署公网。已完成 UI 与交互改善、3 项后端修复、34 张新图及课程报告。真实结果见 `docs/course-review/verification.json`：Node24 全量静态、50 单元、94 纯逻辑、原生 MariaDB HTTP 1+14 场景、19 不变量、浏览器 4+2 场景通过；Docker/备份恢复未验收。以下段落为保留的历史记录。
<!-- foxcore-fixes-current -->
> 当前任务以 `docs/fixes/README.md` 为唯一修复状态表。F01–F08 有生产代码/测试实现；本次离线环境仅执行了纯逻辑及静态检查。Node 24 完整构建、MariaDB、浏览器和 Docker 验收尚未在作者环境执行。不得沿用旧 PASS。
<!-- /foxcore-fixes-current -->

# 任务与门禁

- [x] G0 阅读 START_HERE、手册、A/B 原文、B 图；核对九实体和 CASE-01…12
- [x] G0 补读 KADA 七份 PDF 的目录及关键章节并记录哈希
- [x] G1 核心规格、追踪表、ER/状态/权限
- [x] G2 MariaDB 首次迁移、认证与初始化
- [x] G3 主数据、活动、班次、备货的首条纵向链
- [x] G4 销售准备、确认、取消、幂等的首条纵向链；并发测试通过
- [x] G5 退货、佣金、报表、审计的首条纵向链
- [ ] G6 单元/并发/权限/浏览器验收通过；Docker 实例运行与恢复演练待目标环境完成
- [x] G7 SRS/SDD/STD/ERD/UML、用户与本地部署文档
- [x] G8 本地交付 ZIP 与干净解压复验（不把容器运行未测误标通过）
