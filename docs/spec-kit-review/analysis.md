# Specification Analysis Report

2026-10-27。按固定上游 analyze 模板，在 spec/plan/tasks 齐备后只读分析；本文件是分析输出的保存件，未执行 remediation。无 extensions.yml hooks。

| ID | Category | Severity | Location | Summary | Recommendation |
|---|---|---|---|---|---|
| C1 | Constitution alignment | CRITICAL | apps/web/src/main.tsx:16,31; FR-003 | 违反原则 II 的同一不确定命令跨重载保留身份；SK-B03 实测一次收货变两次 | T009，发布前修复；工程缺陷严重度 high/P1 |
| I1 | Inconsistency | HIGH | inventory-action/index.ts:11; inventory.ts:99; migration:186 | 缺行版本 0 与初建行 1 不一致；SK-B01 | T010 定义原子缺行前提 |
| I2 | Inconsistency | HIGH | sale-edit/index.ts:17-25; FR-007 | 已保存本机的既有草稿副本未恢复；SK-B02 | T011 恢复与基础版本冲突策略 |
| U1 | Underspecification | MEDIUM | FR-008; contracts/recovery.md | 服务器草稿冲突的产品选择与清理规则仍待细化 | T011，保留副本、禁止静默覆盖 |
| G1 | Coverage / reachability | MEDIUM | home/index.ts:12; FR-016 | 可操作班次被最近 20 条截断的静态风险，未做规模复现 | T012 完整任务入口及测试 |
| I3 | Inconsistency | MEDIUM | docs/02-SRS.md:5,100; .ai/STATE.md:5 | 旧接口数、客户端约束与历史状态层叠 | T013 统一当前规格索引 |
| A1 | Ambiguity | MEDIUM | docs/02-SRS.md:201; SC-004 | 性能未明确硬件、分布、P95 与负载脚本 | T015 定义协议再测 |
| G2 | Validation gap | HIGH | SC-003/004; verification.json | 微信、容器、恢复、生产容量未验收 | T014/T015，不得标为 Converged |

## Coverage Summary

完整逐项表见 [traceability.csv](traceability.csv)。20 FR + 4 SC 均有至少一项已完成或待完成任务，计划任务覆盖 24/24 = 100%；这不是功能通过率。SC-002 失败、SC-003/004 未执行。

## Constitution Alignment Issues

C1 为一项 CRITICAL：工程严重度 high 的已复现缺陷违反命令耐久性 MUST 原则。不得通过弱化原则使报告变绿。没有发现本轮复核修改业务源或泄露凭据；仍需按发布门禁补原生与目标环境证据。

## Unmapped Tasks

T001/T002/T007/T008 为来源、原则、分析和交付等治理任务；不强行伪造成产品功能覆盖。其余任务均映射 FR/SC。

## Metrics

- Total Requirements: 24 (20 FR + 4 buildable SC)
- Total Tasks: 15 (8 complete review tasks; 7 pending remediation/validation tasks)
- Planned task coverage: 100% (24/24)
- Ambiguity Count: 1 consolidated item (A1)
- Duplication Count: 0 material product duplicates
- Critical Issues Count: 1 (C1)
- Confirmed functional defects: 3; does not include static risks or NOT_RUN items

## Next Actions

修复 C1/I1/I2 前不进入发布。后续按 bug.fix → bug.test 处理每个 slug，再重跑新增红色验收和原回归；T012…015 分别补规格、入口与运行证据。当前未执行这些修复，也未输出 Converged。
