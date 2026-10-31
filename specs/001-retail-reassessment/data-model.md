# Data model comparison

## Retained physical model

25 业务表 + `schema_migrations`；本轮迁移未改变。销售以班次和活动复合归属，明细保存冻结价格/费率/成本；库存余额与事实流水、占用分离；原单退货生成负佣金；结算认领流水防重复。

数据库幂等以 `(actor_id, operation, command_key)` 标识同一写命令。它可以防止同一个 UUID 重试，无法自行识别客户端重新生成 UUID 的“同一批实物”，因此账平、流水平不等于没有重复业务单。

## Desired client model (proposal)

| Concept | Required fields | State / constraints | Current gap |
|---|---|---|---|
| PendingCommand | owner, operation/path, method, UUID, immutable payload, createdAt | SAVED → SENDING → UNCERTAIN → CONFIRMED / explicitly rejected; persist before send | 小程序已有核心实现；网页只有内存 Map |
| LocalDraft | owner, saleId, baseVersion, lines, updatedAt | LOCAL_EDIT / SERVER_CONFLICT / SUBMITTED; never auto-overwrite a newer server version | 已有服务器草稿编辑会写本机但 load 忽略副本 |
| Initial stock precondition | locationId, productId, expectedAbsence or version | 缺行前提与实际首次建行版本统一，序列化并发 | 客户端缺行为 0，数据库新行默认 1 |

这些不要求直接增加业务数据库表；具体持久介质、多标签页协调与清理策略应在修复前设计。审计和库存流水继续追加，不删除故障测试所产生的合法事实。
