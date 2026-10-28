# SK-B03 修复记录

2026-10-28；用户已授权修复并扩展业务。assessment和旧失败证据保留。

作用文件：apps/web/src/lib/commands.ts、components/command-recovery.tsx。详细机制及权限边界见`specs/002-retail-operations/spec.md`的OR-12。修复先保留已有事务、状态、版本和幂等保护，再补缺失恢复路径。未将本机适配器当作微信真机证据。

相关验证：`tests/review/spec-kit-review.test.ts`实际生产路径回归（4项），另有`tests/unit/web-commands.test.ts`、`tests/integration/operations-concurrency.test.ts`和两组实际Page控制器测试。
