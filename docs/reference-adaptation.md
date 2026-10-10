# 来源、核对与适配

本软件为独立教学实现，与 Foxcore、Ivey Publishing 及参考项目无官方关联。用户提供的 Foxcore Retail A（5 页，2018-12-21）和 B（4 页，2019-01-14）是**业务事实**来源；原 PDF 仅作为私有开发输入，未纳入发布包。执行端复核了全文及 B 第 3 页实体图，SHA-256 分别为 `4ea3ac5aebdb60042dee666ae0876fc374eeaf29dd69c5c70383dbd66634a196`、`61a6023d0f576759a7f604b8bda1a119b8ad6a1bee3e62ca7bca8c1738f85e3f`。

## 案例与实现的界线

- A 的六类信息与 B 图的九个实体共同构成核心模型；`CATEGORY`、`SALESPERSON_SHIFT`、`PRODUCT_SALE` 是 B 已有实体。B 的 `PRODUCT_SALE` 本来就有 `Line_No`、`Quantity` 和 `Final_Price`。
- `SALE` 同时关联 `EVENT` 与 `SALESPERSON_SHIFT`；复合外键防止跨活动归属错误。
- A 的销售员电话、完整场地地址需求仍保留；B 的地址按 Street/City/Province/PCode 拆分。
- 税率、佣金率、库存占用、退货、账户权限、会话及状态机是可运行系统的 `DERIVED/EXT/DEC` 规则，不能当作案例原文事实。

## 方法参考

| 来源 | 已核对范围 | 采用的方法 | 未搬入的内容 |
|---|---|---|---|
| KADA | README、文档目录及七份 PDF 的正文/目录/关键图；SRS、SDD、STD、UI/Flow、Proposal、Conceptual、Logical Design | 分文档组织需求、设计、测试、界面流程和概念/逻辑数据设计 | 合作社业务及 PHP 结构 |
| OpenLMIS | Mission and Vision、Functional Documentation、QA Guide 指定页面 | 愿景→用例→质量验收的追踪 | 医疗供应链及微服务 |
| ERPNext | README、Immutable Ledger、Sales Person 官方文档 | 已过账交易留轨、佣金计提与实际支付分开 | 会计总账、采购、多人分单 |
| FoodInsight | README、PRD、架构文档前段 | 明确范围、FR/NFR、选型与验收 | 其产品业务、原型技术组合 |
| Open Mercato | `.ai/specs/AGENTS.md` | 规格优先、变更记录、实现状态须有证据 | 整套企业目录和代理框架 |

外部参考仅提供文档结构与设计方法，不提供 Foxcore 的税率、定价或用户身份事实。参考站点与课程 PDF 不随发布包分发。
