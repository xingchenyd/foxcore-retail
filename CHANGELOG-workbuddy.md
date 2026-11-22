# WorkBuddy 适配交付（2026-10-31）

用户提供的旧指南以 `backup/retail-before-operations-20261028` 为基线；本次改用已合并 PR #4 的最终版本 `ef6fd92`，保留完整经营流程和恢复修复。main 合并前已备份为 `backup/main-before-operations-merge-20261031`（744c36a）。本适配在 `codex/workbuddy-deploy-20261031`，不合入 main。

## F1–F8 对照

| 原清单 | 实际处理 | 验收及边界 |
|---|---|---|
| F1 环境配置 | `apps/server/src/db.ts` 生产环境也读取可选根 `.env`；新增 `scripts/load-env.mjs`，真实进程变量优先，只忽略文件不存在 | 子进程测试；Node22 生产启动实际从干净副本 `.env` 读取 DB，平台 PORT 覆盖文件 PORT；无 `.env` 的 Node24 正常启动 |
| F2 云端初始化 | 复用 `scripts/vercel-setup.mjs`；增加 `.env`/私密文件、独立迁移账号、LF/CRLF 校验兼容，初始化和 owner 同一命名锁；生产门控仍必须显式 yes | 独立 MariaDB 空库首次及重复初始化通过；owner hash 不变、密码未输出、CRLF 兼容通过。实际 TiDB 未测，不靠 WORKBUDDY/VERCEL 绕过确认 |
| F3 HOST/PORT | server 缺省 0.0.0.0:3000；新增 `start:cloud` 校验并使用平台 PORT | 独立进程实际以注入 PORT=4567/4569 启动并请求通过；云平台绑定待测 |
| F4 Node | engines 与 lock 同步为 `^22.12.0 \|\| ^24.0.0`，不采用任意 >=20 | Node22.23.4 干净 npm ci、全量静态构建测试；Node24.19.0 静态与真实业务回归。Node20不声明支持 |
| F5 构建拆分 | 新增 `build:cloud`，仅 Web+server；原 build 保留 | 两个版本均无微信工具即可构建；mini:build 本身是 TypeScript+复制/WXML 绑定检查，独立于微信引擎 |
| F6 模板 | 新增 `.env.workbuddy.example`；忽略真实 `.env.workbuddy*`，保留模板；setup-only 凭据不用于正常启动 | 跟踪/打包清单排除真实口令；模板需用户私下配置，未读取或代填实际云凭据 |
| F7 健康检查 | 保留 ready；新增 `check:cloud` 检查 live、最新 schema、真实 SPA/JS/CSS、匿名与受保护接口 | 本机真实 7 项检查通过；bootstrap 仅 live=200，ready/业务=503，验收脚本拒绝误判成功 |
| F8 小程序配置 | `--api` > FOXCORE_MINI_API_URL > HTTPS PUBLIC_ORIGIN；本地 HTTP 仅显式 --development；原 AppID/release 门控保留 | 两个 Node 版本构建14页通过；CLI与环境优先级、发布HTTPS/AppID门控另测；微信引擎/扫码/真机/域名未测 |

## 额外修正

- 新增 `scripts/cloud-config.mjs`、`start-cloud.mjs`、`check-cloud.mjs`，初始化从正常启动分离；首次域名分配可使用 health-only 模式，避免未知来源下开启登录。
- `tests/unit/cloud-deployment.test.ts` 覆盖生产 .env、平台变量优先、Node范围、不安全来源/SQL/PORT拒绝、bootstrap及迁移门控，共5项；单元总数89项。
- npm audit 新报告静态依赖链 3 项 moderate（实际对应 glob/minimatch 两个公告及上游影响）。限定 @fastify/static 的 glob 为14.0.2、minimatch为11.0.1，保留原插件公共接口，干净安装审计为0。验证实际 JS/CSS分发、类型构建、业务回归；不使用 npm audit fix --force 降级 Fastify 插件。
- 更新根说明、当前交付状态和旧 Vercel 指南的版本提示；新增详细 WorkBuddy 交接文档，明确内置 CloudBase 服务不会自动替代现有 SQL/会话/权限。
- **db/migrations/001–005 内容均未修改**。未搬运既有业务数据、未注册账号、未开通计费、未部署到公网、未提交微信审核。

## 可复验命令

```sh
npm ci --include=dev
npm run verify:static
npm run build:cloud
# 在私下配置并确认的独立测试库执行，不能盲目指向生产库：
npm run setup:cloud
npm run start:cloud
npm run check:cloud -- --url https://实际域名
```

实际结果及外部 NOT_RUN 项见 [docs/workbuddy/verification.json](docs/workbuddy/verification.json)。本机原生 MariaDB 证据不是 TiDB、Docker、WorkBuddy 或微信真机验收。
