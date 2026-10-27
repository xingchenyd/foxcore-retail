# Recovery acceptance contracts (proposed; no API change in this review)

## Uncertain writes

Prepare durable `{owner,path,method,key,payload}` before request. Lost response/5xx keeps identity. Replay under the same authorized actor with the original UUID and exact semantic body. Do not create a second request merely because a page was reloaded. Account switch cannot expose or replay another user's queue. Storage failure blocks first send. Never re-execute offline payment automatically.

## First count

Client-observed missing balance must have a server-supported precondition. It is not equivalent to “ignore expectedVersion”. Concurrent receipt/count creating the row requires refresh/conflict rather than overwriting that new fact. A real absent row and valid count 3 must be representable without a fictional receiving transaction.

## Saved draft

Load server state/version and any user-scoped local copy. Matching baseVersion may restore local edits with explicit local-state wording. Changed server version or non-DRAFT state requires conflict display; preserve a recoverable copy and do not silently submit stale data. A displayed “saved locally” promise includes restoring existing-draft edits, not just new-sale drafts.

## Existing business API

Read `docs/openapi.json` + `docs/miniprogram/openapi-extension.json` and source. Actual baseline: 51 paths, 61 HTTP operations including 2 health operations. Preserve web Cookie + CSRF and native Bearer + CSRF transport separation. These counts are baseline facts, not proof all contracts have complete schemas or test coverage.
