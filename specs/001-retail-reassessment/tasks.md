# Tasks: Foxcore Spec Kit reassessment

## Phase 1: Setup and source baseline

- [x] T001 固定上游模板与项目源码基线；记录来源与安装限制 `.specify/README.md`、`docs/spec-kit-review/source-inventory.json`。
- [x] T002 建立原则与重建规格 `.specify/memory/constitution.md`、`spec.md`。
- [x] T003 建立模型、合同与逐项追踪 `data-model.md`、`contracts/recovery.md`、`docs/spec-kit-review/traceability.csv`。FR-001…020 / SC-001。

## Phase 2: Existing regressions and boundary probes

- [x] T004 运行原静态、73 单元、94 纯逻辑与构建 `docs/spec-kit-review/evidence/baseline-static.txt`。FR-017 / FR-020。
- [x] T005 真实专用 MariaDB 跑现有三条集成链与 19 不变量；覆盖销售、库存、退货、佣金和权限 `evidence/baseline-integration.txt`、`evidence/invariants.txt`。FR-001/002/006/009…015/018。
- [x] T006 执行独立边界与对照，保留 3 红 / 1 绿 `tests/review/spec-kit-review.test.ts`、`evidence/review-probes.json`。FR-003/004/005/007/008 / SC-002。
- [x] T007 按只读 analyze 和 bug.assess 流程形成分析与缺陷记录 `docs/spec-kit-review/analysis.md`、`.specify/bugs/*/assessment.md`。
- [x] T008 交付报告、证据、复现说明与比较表，独立分支上传；main 不变 `docs/spec-kit-review/README.md`。

## Phase 3: Remediation backlog — NOT IMPLEMENTED

- [ ] T009 [US1] 网页耐久待核对命令；存储失败、响应丢失、页面/会话恢复与多标签页测试 `apps/web/src/main.tsx` 与新的客户端恢复模块。FR-003 / FR-018 / SC-002。
- [ ] T010 [US2] 首次盘点缺行前提及并发建行协议 `apps/server/src/inventory.ts`、`apps/miniprogram/src/pages/inventory-action/index.ts`。FR-005/006 / SC-002。
- [ ] T011 [US3] 恢复已有草稿和基础版本冲突策略 `apps/miniprogram/src/pages/sale-edit/index.ts`。FR-007/008 / SC-002。
- [ ] T012 [US4] 可操作班次完整入口，避免仅最近 20 条 `apps/miniprogram/src/pages/home/index.ts`；补对应行为测试。FR-016。
- [ ] T013 同步主 SRS/SDD/STD、当前认证和接口/追踪表；不要再叠加互相矛盾的“唯一入口” `docs/02-SRS.md`、`docs/03-SDD.md`、`.ai/STATE.md`。FR-017。
- [ ] T014 实际微信编译和 iOS/Android、弱网、切后台、存储恢复验收 `docs/miniprogram/verification.json`。FR-020 / SC-003。
- [ ] T015 目标容器启动、备份恢复、HTTPS/账号运营配置、可重复容量脚本与指标 `docs/07-deployment-local.md` 与部署证据。FR-019/020 / SC-004。

Dependencies: T001→T002→T003；T004/T005 后形成 T006，T007 在 spec/plan/tasks 完整后执行；T008 捕获分析输出。T009…015 属后续修复/验收，不因本次复核交付而完成。无并行 Agent 授权，本轮未派生新子代理。
