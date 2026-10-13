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
