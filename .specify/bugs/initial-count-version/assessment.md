# Bug Assessment: 首次盘点缺行版本不一致，无法登记盘盈

- **Slug**: initial-count-version (auto-generated for this non-interactive assessment)
- **Created**: 2026-10-27
- **Source**: Agent source review and tests/review/spec-kit-review.test.ts
- **Verdict**: valid
- **Severity**: medium (P2)

## Report

首次盘点缺行版本不一致，无法登记盘盈。不是用户原文的逐字引用，而是本轮发现后形成的可测缺陷描述。

## Symptom

期望：新商品在 MAIN 尚无余额行，实物数 3，可合法登记首次盘点并建立余额。

实际：实际 Page 读缺行为 version 0；服务端临时建行默认 version 1，比较后返回 409。事务回滚，刷新仍读缺行，反复失败。

## Reproduction

使用 README 的专用回环测试环境运行 `vitest run tests/review/spec-kit-review.test.ts -t SK-B01`；具体准备、操作和断言见该用例。

证据边界：真实 Page 控制器 + wx.request 适配器 + HTTP/MariaDB；不含微信渲染。

## Suspected Code Paths

- `apps/miniprogram/src/pages/inventory-action/index.ts:11`
- `apps/server/src/inventory.ts:26`
- `apps/server/src/inventory.ts:99`
- `db/migrations/001_core.sql:186`

## Root Cause Hypothesis

Confidence: high. 客户端“尚无行”的 0 与数据库新行默认版本 1 没有统一协议。

## Proposed Remediation

明确缺行前提并在服务端序列化首次创建与盘点，保留已有行版本/占用检查；不能全局跳过版本核验。

## Tests to add or update

将现有红色验收转绿并保留；补并发、会话/存储恢复与必要状态冲突回归。不得通过跳过或改为 expected failure 使结果显示通过。

## Risks & Considerations

保留现有金额/库存/权限与已过账快照；只在专用库测试。真实 Page 控制器 + wx.request 适配器 + HTTP/MariaDB；不含微信渲染。

## Open Questions

具体产品交互策略在修复前细化；这不影响当前缺陷已复现的判定。未执行 bug.fix。
