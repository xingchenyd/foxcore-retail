# Bug Assessment: 已有销售草稿的本机修改不能恢复

- **Slug**: existing-draft-local-restore (auto-generated for this non-interactive assessment)
- **Created**: 2026-10-27
- **Source**: Agent source review and tests/review/spec-kit-review.test.ts
- **Verdict**: valid
- **Severity**: medium (P2)

## Report

已有销售草稿的本机修改不能恢复。不是用户原文的逐字引用，而是本轮发现后形成的可测缺陷描述。

## Symptom

期望：原数量 1 改为 3，看到本机保存成功，重开编辑页应恢复 3，或明确展示冲突。

实际：真实 Page 将数量 3 写入用户/单据隔离存储并显示 saved=true；重建 Page 后显示服务器数量 1，本机副本未读取使用。

## Reproduction

使用 README 的专用回环测试环境运行 `vitest run tests/review/spec-kit-review.test.ts -t SK-B02`；具体准备、操作和断言见该用例。

证据边界：真实 Page 控制器和存储适配器；服务器 GET 用固定响应隔离问题，非真机存储证据。

## Suspected Code Paths

- `apps/miniprogram/src/pages/sale-edit/index.ts:17`
- `apps/miniprogram/src/pages/sale-edit/index.ts:18`
- `apps/miniprogram/src/pages/sale-edit/index.ts:25`

## Root Cause Hypothesis

Confidence: high. load 在 saleId 存在时无条件加载服务器明细，仅新单分支使用 local。

## Proposed Remediation

恢复已有草稿副本时核对 baseVersion 和状态；服务器已变化时保留副本并提示冲突，不能无条件覆盖。

## Tests to add or update

将现有红色验收转绿并保留；补并发、会话/存储恢复与必要状态冲突回归。不得通过跳过或改为 expected failure 使结果显示通过。

## Risks & Considerations

保留现有金额/库存/权限与已过账快照；只在专用库测试。真实 Page 控制器和存储适配器；服务器 GET 用固定响应隔离问题，非真机存储证据。

## Open Questions

具体产品交互策略在修复前细化；这不影响当前缺陷已复现的判定。未执行 bug.fix。
