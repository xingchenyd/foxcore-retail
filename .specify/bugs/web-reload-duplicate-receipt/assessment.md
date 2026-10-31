# Bug Assessment: 网页重载后丢失幂等键，可重复登记同一收货

- **Slug**: web-reload-duplicate-receipt (auto-generated for this non-interactive assessment)
- **Created**: 2026-10-27
- **Source**: Agent source review and tests/review/spec-kit-review.test.ts
- **Verdict**: valid
- **Severity**: high (P1)

## Report

网页重载后丢失幂等键，可重复登记同一收货。不是用户原文的逐字引用，而是本轮发现后形成的可测缺陷描述。

## Symptom

期望：一件实物只登记一次，刷新后继续原请求应返回原结果，库存为 1。

实际：真实 API 先提交，再在客户端注入响应丢失；重建网页 hook 内存后重试，库存实测为 2。

## Reproduction

使用 README 的专用回环测试环境运行 `vitest run tests/review/spec-kit-review.test.ts -t SK-B03`；具体准备、操作和断言见该用例。

证据边界：原始 useAction 的 TS 转译/VM 重载 + 真实 HTTP/MariaDB；不是实际浏览器网络拦截或微信真机。

## Suspected Code Paths

- `apps/web/src/main.tsx:16`
- `apps/web/src/main.tsx:31`
- `apps/server/src/core.ts:65`

## Root Cause Hypothesis

Confidence: high. pending 仅为模块内 Map；页面重载后原 UUID 丢失。服务端只知道不同 UUID 是不同命令。已核对 main 744c36a 也使用该内存机制。

## Proposed Remediation

引入用户隔离的持久命令收件箱，发送前存原 UUID/原体；恢复入口重放原请求，存储失败阻断发送；补多标签页和改体冲突策略。

## Tests to add or update

将现有红色验收转绿并保留；补并发、会话/存储恢复与必要状态冲突回归。不得通过跳过或改为 expected failure 使结果显示通过。

## Risks & Considerations

保留现有金额/库存/权限与已过账快照；只在专用库测试。原始 useAction 的 TS 转译/VM 重载 + 真实 HTTP/MariaDB；不是实际浏览器网络拦截或微信真机。

## Open Questions

具体产品交互策略在修复前细化；这不影响当前缺陷已复现的判定。未执行 bug.fix。
