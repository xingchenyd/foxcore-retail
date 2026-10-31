# Foxcore 的 Spec Kit 复核工作区

2026-10-27。使用 GitHub 官方 `github/spec-kit` 固定源码提交 `ee94598c3c87ae231027b22fb2be2b5a13e8820f`（源码版本 `1.2.4.dev0`），MIT 许可证见 `upstream/LICENSE`。

这是对现有项目的规格重建与缺陷评估，不是另写一套 ERP，也不是 Spec Kit 自动扫描器出具的认证。Agent 按官方 constitution → specify → plan → tasks → analyze 和 bug.assess 的文档流程执行；分析结果由 Agent 结合源码和可复现测试给出。

Specify CLI 在隔离 venv 安装时，默认镜像及官方 PyPI 文件下载均遭遇 SSL EOF；没有关闭证书校验、安装全局包或修改用户的 Codex 配置。改为从固定 Git 源码复制官方模板、分析命令和 Python 前置检查脚本，实际运行原版 `check_prerequisites.py`。**没有成功运行 `specify init`，没有把这些聊天工作流冒充为 shell 自动检测命令。**

`templates/`、`upstream/commands/`、`scripts/python/` 为未改动的上游文件，哈希见 `upstream/provenance.json`。没有安装第三方扩展或自动 hook，没有创建新的全局技能。`memory/constitution.md` 只是本仓库的项目原则，不是用户长期记忆。

当前 feature 为 `specs/001-retail-reassessment/`。复核报告入口 `docs/spec-kit-review/README.md`。未执行 bug.fix / implement；三项复现缺陷保持未修复，新增红色验收在 `tests/review/`，不混入已有通过统计。

```powershell
$env:SPECIFY_FEATURE_DIRECTORY='specs/001-retail-reassessment'
$env:SPECIFY_FEATURE_NO_PERSIST='1'
python .specify/scripts/python/check_prerequisites.py --json --require-spec --require-tasks --include-tasks
```

工具升级时应显式更新固定版本与哈希，不能静默替换为变化的 main。先查阅当前命令模板及本项目原则，再继续修复；不执行文档中未经用户授权的发布、消息或账号操作。
