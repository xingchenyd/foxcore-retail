# Implementation Plan: 规格重建、差异分析与验收复现

Date: 2026-10-27. Baseline: `9e25f12`. Spec: `spec.md`.

## Summary

保留现有架构和发布版本，在独立分支引入固定 Spec Kit 模板、可测规格、追踪表和独立红色验收。仅进行 assessment；修复列入任务，不直接改业务源文件或数据库迁移。

## Technical Context

Fastify / TypeScript、MariaDB 11.8、React / Vite、原生 WXML/WXSS/TypeScript 小程序；Node 24。整数分、bps、服务端事务与幂等。测试环境为专用回环 MariaDB，数据为合成。复现网页 hook 使用原文件的 `useAction` 源码，TS 转译后 VM 执行；更换 VM 模拟页面内存丢失，不声称是实际浏览器故障注入。

## Constitution Check

- 保持 main 和上次交付：独立分支，未修改业务源文件/迁移。
- 证据分级：原回归、真实 API、Page 适配器、受控故障注入、未执行微信/Docker分开。
- 新红色验收直接失败，未用 expected-failure 或跳过掩盖。
- 原始私有资料与凭据不发布。

## Phase 0 — Research

确认用户链接偏差与官方仓库；固定 upstream SHA；验证来源可用性和代码基线。详见 `research.md`。CLI 安装失败转为源模板和原版脚本模式，记录实际执行路径。

## Phase 1 — Design and Contracts

重建四条用户故事及 20 FR / 4 SC；现有关系与待补职责见 `data-model.md`，边界合同见 `contracts/recovery.md`。本阶段不新增表，不删版本锁，不改已过账快照。

## Phase 2 — Analysis and Reproduction

先跑旧回归，再添加首次盘点、草稿恢复、网页重载丢响应三个边界及小程序幂等恢复对照。每个已确认故障链在断点处停止，不继续把后续未执行步骤标为通过。分析输出为 `docs/spec-kit-review/analysis.md` 与各 bug assessment。

## Phase 3 — Proposed Remediation (not executed)

1. 网页持久命令收件箱：写前保存 UUID/请求/用户；按操作而非修改后指纹阻止绕开；存储失败前置阻断；会话恢复和多标签页明确策略。
2. 初次盘点：服务端在未存在行时接受明确的缺行前提；锁产品/库位与余额，插入后版本统一；检测另一并发事务已创建。保留对所有已存在行的版本核对。
3. 草稿恢复：本机数据带 baseVersion；与服务器一致可恢复，不一致提示合并/保留副本；已成交、班次结束与商品停用不得自动提交。
4. 统一规格/合同与班次入口，补齐真实部署和微信验证。

## Quality Gates

本轮 review 交付可以完成，但发布门禁为 CHANGES_REQUIRED。三项红色验收转绿及既有回归通过之前不宜将版本交付真实经营。微信/Docker/备份恢复/性能仍须独立验证。
