# Foxcore · WorkBuddy 部署与小程序交接

复核日期：2026-10-31。基线：已合入 main 的经营流程最终版本（PR #4，合并提交 `ef6fd92b6904f18eb8007312be72bca1eb65722e`）。本轮适配分支：`codex/workbuddy-deploy-20261031`。**不要从旧备份分支重新开始。**

本说明根据用户提供的 2026-10-28 指南复核后修订。原文件是参考材料，其中的“全链路 ¥0”、旧表数、旧迁移、平台参数、sharecode 有效期和已验证 TiDB 等说法不能作为当前验收结论。

## 1. WorkBuddy 能省去哪些步骤

官方目前支持网站发布、公网链接、原生小程序托管上传/提审，以及按需接入云数据库、身份认证和文件存储。微信扫码授权、账号主体、备案、类目、隐私和审核仍需按页面提示由账号所有者处理。

无账号时可选择 WorkBuddy **试用版**：官方说明有效期 14 天、最多 15 人、不能直接转正式版；体验版和正式版需要自己的小程序账号。试用/体验无法覆盖本项目“100 员工、30 同时在线”的完整验收。

本分支采用保守的迁移路径：

```text
电脑 Web ───────────┐
员工原生微信小程序 ──┴─ HTTPS → 单端口 Fastify（静态 Web + /api/v1）
                                      │ MySQL 协议 + 远程验证 TLS
                                      └→ 现有数据库或另建 TiDB MySQL-compatible Starter
```

现有 MariaDB 数据不会自动搬到 TiDB。新实例初始化只是空库建表，不能声称完成旧数据迁移。WorkBuddy 内置云数据库/登录/文件存储也不会自动接管本项目 mysql2、事务、会话、审计和权限；本轮不重写这些业务。以后若改用内置云数据库，需要单独验证 SQL 方言、事务/锁、约束、权限、数据迁移和回滚。

## 2. 免费额度的准确含义

截至复核日，官方云服务页按会员列出：体验版 10 个云服务应用、每应用每月 5,000 资源点；标准版 30/25,000，高级版 50/50,000，旗舰版 99/150,000。数据库、调用、文件存储容量/读写/流量共同消耗资源点，**不是固定无限 GB 的免费网盘**。账号实际权益和托管运行限制以自己的控制台为准，未读取本用户的会员/余额。

资源点用尽会暂停云服务；官方说明体验/标准/高级版暂停数据保留 30 天，旗舰版 60 天，到期仍未恢复可能永久删除，暂停时无法导出。需要正常运行时主动备份，不能保证无限保留。

TiDB 的免费额度属于另一家数据库服务：每组织前五个符合条件的 MySQL-compatible Starter 实例，每实例 5 GiB 行存储、5 GiB 列存储、每月 5,000 万 RU。免费模式超额限制连接/读写；设置 spending limit 后超额可能计费。**RU 不是 API 请求次数**，不能用本机 9,900 请求换算月成本。不开付费能力、不填写预算上限，先检查控制台模式；本轮不注册、不购买、不启用计费。

不能保证当前正式运营规模永久免费；TiDB 的数据库额度也不等于 WorkBuddy 文件存储额度。

## 3. WorkBuddy 获取正确代码

在 WorkBuddy 新任务中提供仓库及分支：

```sh
git clone --branch codex/workbuddy-deploy-20261031 https://github.com/xingchenyd/foxcore-retail.git
cd foxcore-retail
node --version
npm ci --include=dev
npm run build:cloud
```

支持 Node **22.12+ 的 22.x 或 24.x**；本轮测试的具体版本见 verification.json。不能改成任意 `>=20`：当前 Vite 依赖要求更高的最低次版本，Node 20 已结束维护。平台版本不符合时，先调整受支持运行时；不要绕过 engines 假装兼容。

`build:cloud` 只构建 Web+server。原 `build` 仍含 14 页小程序的 TypeScript/WXML 检查和文件复制，不依赖微信开发者工具，但它不等于微信引擎编译。

## 4. 私下配置数据库

1. 若已有正式数据库，先备份，记录当前迁移及受限账号；**不要对未知业务库运行初始化**。
2. 若选 TiDB，自己在控制台创建 MySQL-compatible Starter 免费实例和专用空库 `foxcore`，保存连接参数。TiDB 实例实际兼容性仍待验证，不继承历史 MariaDB 通过结果。
3. 优先用平台私密环境变量/密钥；若当前 WorkBuddy 只有项目文件配置，则从 `.env.workbuddy.example` 私下复制为仓库根 `.env`。真实进程变量优先，生产环境也读取 `.env` 兜底。
4. `.env` 已忽略，不得进 Git、压缩包、公开静态目录、聊天记录或部署截图。不要把数据库密码发给 Codex 对话；按 WorkBuddy 的私密配置界面填写。平台能否妥善注入私密配置需在账号内确认。
5. `DB_USER/DB_PASSWORD` 是应用运行账号；初始化时可另外提供 `DB_MIGRATION_USER/DB_MIGRATION_PASSWORD`（支持 `_FILE`），不要让长期应用用 root/DDL 管理账号。
6. 受限运行账号必须保留原权限边界：业务必要 SELECT/INSERT、指定表 UPDATE、sale_lines/commission_claims 所需 DELETE；`stock_ledger`、`commission_entries`、`audit_events`、`sale_workspace_revisions` 禁止 UPDATE/DELETE。对应本地权限基线见 `scripts/runtime-migrate.mjs`，云平台账号/授权语法由供应商控制台核对。未验证此项时，只能称联调，不能称生产就绪。

初始 owner 密码用本地密码管理器生成至少 32 字符，填 `OWNER_PASSWORD` 或私有 `OWNER_PASSWORD_FILE`。脚本不会生成后打印到日志，也不重置已有 owner。

## 5. 显式初始化，正常启动不自动迁移

确认目标库、备份和管理员凭据后，在部署环境显式执行一次：

```sh
# 通过私密环境配置设置 ALLOW_PRODUCTION_MIGRATION=yes
npm run setup:cloud
```

它不依赖 `VERCEL` 或 `WORKBUDDY`；生产环境始终要求明确的 `ALLOW_PRODUCTION_MIGRATION=yes`。迁移与 owner 初始化共用命名锁，已应用迁移核对内容校验和，重复执行不会重置 owner。兼容同一内容的 LF/CRLF。5 个现有迁移文件不修改。

成功后移除 `ALLOW_PRODUCTION_MIGRATION`、迁移管理员和 `OWNER_PASSWORD` 等初始化配置，再使用受限应用账号运行。DDL 部分失败可能已留下部分结构；**不要反复重试或删除生产表**，先检查失败语句/结构并恢复演练，不能把 checksum 校验关掉。

## 6. 发布单端口 Web/API

使用 WorkBuddy 当前版本可用的 Node 服务发布入口，选仓库根目录。官方公开说明未保证用户旧指南中的内部工具参数一直可用，以下给出稳定的构建/启动约定，具体按钮或参数由 WorkBuddy 当前界面决定：

| 配置 | 内容 |
|---|---|
| 安装 | `npm ci --include=dev` |
| 构建 | `npm run build:cloud` |
| 启动 | `npm run start:cloud` |
| 监听 | `HOST=0.0.0.0`；平台真实 `PORT` 优先，缺省 3000 |
| 生产模式 | `APP_ENV=production`、`NODE_ENV=production`、`COOKIE_SECURE=true` |
| 公网来源 | `PUBLIC_ORIGIN=https://实际域名`，不带路径、query、尾部 `/` |
| 数据库 | 远程必须 `DB_SSL=true`，不关闭证书校验 |

如果发布前不知道分配域名，可先设 `CLOUD_BOOTSTRAP=health-only` 发布：仅 `/health/live` 返回 alive，`/health/ready`、业务页面及所有 API 均返回 503，不连接数据库。取得域名后填 `PUBLIC_ORIGIN`，完成第 5 节初始化，移除 `CLOUD_BOOTSTRAP`，重新发布。最终必须再次检验 ready，不能把 bootstrap 的 alive 当成功。

如果平台只能发布静态网站、不能运行本项目 Node 服务，则该入口不适合本架构；不要把 SQL 凭据放进前端，换支持常驻 Node/容器的托管入口。`start:cloud` 不执行初始化，不打印口令。平台重启/缩容、持久运行期限、自定义域名、出网/TLS和 sharecode 门禁仍需账号内实测。

## 7. 公网验收顺序

```sh
npm run check:cloud -- --url https://实际域名
```

自动检查 live、ready 最新迁移、真实 SPA、匿名会话和受保护用户接口。仅验证可达性，不用真实业务账号密码。如果重定向到平台门禁、返回 sharecode 登录页或 API 403，会失败；不要为小程序静默添加分享口令或跳过认证。

随后人工验收：owner 登录/强制改密 → 创建中国含税活动并确认税率 → 排班/开班 → 收货、调拨、签收、损坏登记 → 销售 → 原单退货、独立换货及差价 → 交班复核 → 活动结束佣金结转。再运行 `npm run db:check` 的 31 项约束检查，测试两端权限、重复命令和并发。

实际 TiDB 还需证明 CHECK/FK 约束执行、命名锁/事务、append-only 权限，备份独立库恢复和目标容量；MySQL 协议能连通不等于 MariaDB 等价。当前业务库不会自动拷贝到新库。

## 8. 小程序如何接入这个 API

先完成公网 API 验收，再构建小程序：

```sh
npm run mini:build -- --api https://实际API域名 --appid wx真实AppID
```

API 配置优先级：`--api` > `FOXCORE_MINI_API_URL` > `PUBLIC_ORIGIN` > 空；AppID 使用 `--appid` 或 `FOXCORE_MINI_APPID`。这是公开的客户端配置，绝不放 SQL 密码或 AppSecret。输出在 `apps/miniprogram/build`，WorkBuddy/开发者工具应使用这一目录，保留本项目原生页面和现有用户名会话机制。

WorkBuddy 可协助试用版扫码、已有账号绑定、上传和提审；本分支的 Node 构建不替代这些步骤，也没有直接调用第三方发布。选择长期运营时用自己的账号，不能把短期试用版当长期员工系统。

微信官方网络文档要求服务器域名按后台配置、HTTPS 和备案等规则执行。**“不校验合法域名”只应作开发调试设置，不能据此宣称体验版或正式版可正常访问。** WorkBuddy 临时域名/sharecode 是否能被 `wx.request` 直接访问，以及平台能否为已有项目提供合规代理/域名，必须真机核对。若只能浏览器访问，应先使用 Web，不能把分享链接直接当小程序 API。发布构建 `--release` 还要求真实 AppID 和 HTTPS 域名，但不会替你校验备案/白名单或审核资格。

## 9. 回退与交付边界

main 的此前最终版本已合入 PR #4；合并前 main 备份 `backup/main-before-operations-merge-20261031`（744c36a）。本分支只放部署适配，未合入 main。旧备份 `backup/retail-before-operations-20261028`（e7543ab）仍保留。

代码回退和数据库回退是两件事。若新增库只是本轮独立空库，可切回旧环境；已有生产库升级后，不能只换旧代码便声称数据库也回退，需按兼容性和备份恢复方案处理。

本轮状态见 [verification.json](verification.json) 和 [CHANGELOG-workbuddy.md](../../CHANGELOG-workbuddy.md)。尚未访问用户 WorkBuddy 会员控制台、创建云库、上传真实口令、获得公网链接、执行 TiDB 或微信真机验收。

## 官方参考（2026-10-31 核对）

- [WorkBuddy 网站应用发布](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Web-App)
- [WorkBuddy 小程序开发与发布：试用、体验、正式版](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Mini-Program)
- [WorkBuddy 云服务能力、资源点与暂停数据保留](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Cloud-Services)
- [TiDB Cloud Starter 额度与超量行为](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)
- [Vite Node 运行时要求](https://vite.dev/guide/)
- [Node 维护状态](https://nodejs.org/en/about/eol)
- [微信小程序网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)（本轮自动抓取可能受限；发布前由管理员在微信后台核对实际规则）
