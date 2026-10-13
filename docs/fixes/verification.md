# 执行记录与复现

## 本次真正执行的部分

工作环境：Linux x86_64，Node 22.16.0，全局 TypeScript 5.8.3。项目要求 Node 24，锁定 TypeScript 5.9.3；离线结果不是支持环境的全量验收。

| 检查 | 本次结果 | 边界 / 证据 |
|---|---|---|
| 从原生产 `api()` 提取函数复现请求头覆盖 | 原代码失败（预期） | `evidence/local/F01-before.log`，原生 Request 隔离实验，非完整 HTTP 服务 |
| 修复后的生产纯函数测试 | 94 PASS、0 FAIL、0 SKIP | `evidence/local/pure-tests-final.log`；包含 HTTP 参数构造、分页客户端、规则、SQL 生成、CSV、文档检查器单测 |
| 依赖无关模块严格 TS 类型检查 | 见 `local-checks.json` | 仅四个生产模块；不是 React/Fastify 全仓库类型检查 |
| 修改后 TS/TSX 语法转译、MJS/JSON/YAML检查 | 见 `local-checks.json` | 不验证外部库类型、数据库语义或浏览器交互 |
| `verify:full` 在不支持的 Node 上运行 | 非零退出 | 证明缺前提不伪装成功；`full-verification-blocked.json` |
| 原单元套件 / 全项目类型 / 构建 | NOT_RUN | 锁定依赖不可安装，Node 主版本不匹配 |
| MariaDB HTTP、竞争、不变量、真实 120 余额/101 分组 | NOT_RUN | 没有实际数据库运行组合 |
| Playwright 首登改密和桌面/移动视口业务 | NOT_RUN | 未启动完整应用与浏览器 |
| Docker 新安装、重复迁移、重启、备份/恢复 | NOT_RUN | 此处没有 Docker；只提供待执行流程 |

纯测试从 `apps/web/src/lib/api.ts`、`fix-rules.ts`、`report-query.ts`、`csv.ts` 等生产文件导入，而不是复制一份正确示例。测试中模拟 fetch 仅用于客户端单元边界；它不能代替真实 MariaDB/浏览器测试。SQL 字符串绑定断言也不证明该 SQL 已在 MariaDB 成功执行。

## 在完整原仓库中应用后执行

以下为 macOS/Linux 终端；Windows 完整验收建议在 Docker 已可用的 WSL2 中运行，原生 PowerShell 路线未验证。

```sh
node --version                     # 必须为 24.x
npm ci                             # 使用原 package-lock.json，不擅自升级依赖
npm run docs:sync                   # 交付安装器已经调用；重复执行应幂等
npm run docs:check
npx playwright install chromium    # 在你允许联网的本机下载浏览器
npm run verify:static
npm run verify:full
```

Linux 首次使用 Playwright 如缺系统库，根据实际报错和官方安装说明准备，不应在未知机器上自动执行提权命令。Docker Desktop/Engine 必须已经由用户启动。不要使用用户业务库密码填入测试环境。

### `verify:full` 实际会做什么

1. 拒绝非 Node 24、缺锁文件/依赖；检查 Docker/Compose、资料一致性、原单元、新纯逻辑、类型和构建。
2. 为本轮随机生成 `foxverify_<12位十六进制>` 项目名，检查没有同名容器、网络或卷；通过 `compose.verify.yaml` 新建独立实例。数据库名称在各隔离实例内部仍为 `foxcore`（原初始化器的固定名称），**隔离来自独立容器/网络/私有卷与随机项目身份，不依赖库名变更**。
3. 仅将应用映射到动态回环端口，DB 不暴露宿主端口；应用使用正常 `foxcore` 账号。凭据在临时私有目录/私有卷中生成，测试不借用 `.env` 或已有 3000 端口。
4. 实际浏览器执行首登改密，然后两个视口业务链；继续原 API 集成、新 HTTP 回归和原浏览器用例。需要写非法旧数据的用例只使用验证了 run 标签的测试容器，不在生产增加绕过校验的入口。
5. 执行原不变量文件和新增 3 项检查，核对持久数据摘要；重启但不删卷；重复迁移和管理员初始化；备份合成库，并恢复到第二个新建隔离实例核对。
6. 任何缺前提、测试失败、摘要不同或清理异常都返回非零。只清理本轮创建且核验身份的项目卷；不执行系统级 prune，不修改正常 `compose.yaml` 或远端账户。

脚本提供的是可执行实现，**以上步骤尚未在本环境运行成功**。它不覆盖任意旧库数据升级、故障注入、所有响应字段或全部平台。不能将脚本存在当作验收结果。

### 证据和失败定位

每次实际完整运行将安全摘要写至 `docs/fixes/evidence/verify-<run>/summary.json`；成功完成的不变量/持久化核对另存对应文件。记录开始/结束时间、运行环境、各阶段命令/退出码和代码摘要。

**原始日志在操作系统临时私有目录，可能包含密码、浏览器调用细节或合成库备份，禁止提交。** 控制台会给出位置；只检查需要的失败阶段。不得将整个临时目录上传 GitHub。原案例 PDF、`.env`、真实备份、登录 Cookie/CSRF 一律不进入版本库。

由于此包仅包含变更文件，不能在解压目录单独 `npm ci`；要先将它应用到完整原仓库。修改代码后重跑相关层，不要使用本次离线日志声称新改动通过。

## 升级与生产边界

本轮未改变已有迁移/表结构；新增接口使用既有 UPDATE 权限。对旧环境先备份，再只读执行 `db/preflight-fixes.sql`，人工核对异常。普通本地启动仍沿用原 `docker compose up -d --build`，但本次没有为该原命令提供新的成功运行证据。

不要直接合并到自动部署分支。本轮修复先提交独立分支，在完整验收通过及检查剩余清单后再决定合并；云端平台和数据库兼容性需单独验证。
