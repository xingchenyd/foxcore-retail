# Foxcore 本地交付任务入口

- 业务基线仅为 Foxcore Retail A/B；原始课程 PDF 保存在私有来源目录，不进入发布包。
- 本轮目标：完整本地运行和验收。解压后使用 `docker compose up -d --build`，从 `http://localhost:3000` 操作。
- 不处理 GitHub、Pages、公网部署或外部账号；保持通用容器和环境配置可迁移。
- 必须使用真实 MariaDB、服务端授权、精确金额、事务、幂等、对账与审计。
- 查看 `.ai/STATE.md` 与 `.ai/TASKS.md`，每次修改后运行对应测试并记录真实结果。
- 不删除其他项目或数据库；测试数据仅在专用库内创建。不要将密码、课程原件、数据库备份打入 ZIP。
