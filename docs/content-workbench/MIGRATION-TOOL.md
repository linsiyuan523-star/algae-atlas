# 旧内容迁移工具

本文说明 Stage-03 的仓库内迁移命令。工具把经过明确适配的 legacy 数据转换成 Stage-01 `record.json` 与 Markdown 候选，先生成完整计划并校验，再决定是否写入。

候选文件只是待审核的数据保存件，不是发布、事实批准、媒体授权或切换内容来源的许可。当前所有生产 selector 仍为 `legacy`。

## 范围与非目标

首批适配器只处理 `lib/site-data.ts` 的 3 条 `articles`：

- `what-are-algae`
- `why-water-turns-green`
- `photobioreactor-basics`

它们被保存为中英双语 `science-article` draft。现有摘要作为候选正文，作者、审核人和媒体引用保持为空，原始 legacy 文本与图片不修改。

`projects` 的 3 条记录没有足够证据确定正式内容类型，统一报告为 `MANUAL_CLASSIFICATION_REQUIRED`。空的 `news`、`outputs`、`teamMembers` 保持为空。藻类、教程、活体饵料、研究能力与合作内容留给后续独立适配器。

本工具不切换 selector，不创建路由或导航，不迁移图片字节，不执行 Git 发布、数据库、远程、部署或生产操作，也不删除 legacy 内容。

## 命令模式

无参数和显式 `--dry-run` 都是只读模式：

```powershell
npm.cmd run content:migrate
npm.cmd run content:migrate -- --dry-run
```

dry-run 会读取正式仓库、扫描冲突、构造候选、合并完整快照并运行 Stage-01 仓库校验，然后只向 stdout 输出摘要和 JSON 报告。它不会创建候选、账本或报告文件。

只有显式 `--write` 才授权写入：

```powershell
npm.cmd run content:migrate -- --write
```

可选报告必须与 `--write` 同时使用，并且只能是 allowlist 目录中的单个 `.json` 文件：

```powershell
npm.cmd run content:migrate -- --write --report delivery/migration-reports/stage-03-science-articles.json
```

绝对路径、路径穿越、子目录、非 JSON 名称、`--report` 单独使用，以及同时指定 `--dry-run`/`--write` 都会被拒绝。使用 `--help` 查看当前语法。

## 报告结构与稳定原因码

每份报告记录模式、操作时间和 schema/interface 版本，并包含以下六类结果：

- `migrated`：dry-run 中为 `planned`，成功 write 后为 `written`；每条都有 legacy 来源和目标记录路径。
- `skipped`：无需或不能在本批转换的来源，以及已存在的完整目标。常见码为 `MANUAL_CLASSIFICATION_REQUIRED`、`EMPTY_COLLECTION_PRESERVED`、`DEFERRED_ADAPTER`、`TARGET_EXISTS`、`LEDGER_EXISTS`。
- `missingFields`：legacy 中不存在的必需事实；当前为 `AUTHOR_MISSING`、`REVIEWER_MISSING`。
- `manualReview`：必须由授权人员确认的判断；当前包括 `AUTHOR_CONFIRMATION_REQUIRED`、`TRANSLATION_PROVENANCE_UNVERIFIED`、`TARGET_AUDIENCE_DERIVED`、`BODY_COMPLETENESS_REVIEW_REQUIRED`、`PUBLICATION_REVIEW_REQUIRED`。
- `conflicts`：阻止整批写入的问题，例如 `PARTIAL_TARGET_CONFLICT`、`TARGET_PATH_UNSAFE`、`LEDGER_CONFLICT`、`TARGET_WRITE_CONFLICT`、`REPORT_PATH_INVALID` 或 `WRITE_FAILED`。
- `missingImageAttribution`：legacy 图片路径、已匹配署名和未建立公开媒体记录的原因；当前为 `IMAGE_USAGE_SCOPE_PENDING`。

`validationIssues` 另行保留 Stage-01 schema/repository 校验问题。任一 `conflicts` 或 `validationIssues` 都会在调用写入器前返回非零状态。

## 发布阻断条件

首批候选有意保持不可公开：

- 中英状态均为 `draft`；
- 没有已确认的公开作者或审核人；
- 英文来源历史仍需人工确认；
- 正文只保存了现有摘要，完整性未审核；
- legacy 图片使用范围未确认，候选的 `media` 为空；
- 生产 `collectionSourceSelection` 的 11 个类型仍全部为 `legacy`；
- `content/migration-ledger.json` 明确记录 `parityStatus: blocked-review` 与 `sourceSwitchAllowed: false`。

后续批次只有在补齐事实、审核、媒体许可与完整 Stage-00 页面/路由/metadata/sitemap parity 证据后，才可以单独评审 selector 变更。

## 无覆盖、冲突与回滚

规划器用 `lstat` 检查普通目录/文件，不跟随候选目标中的符号链接或 junction：

- 三个目标文件都不存在：可以计划写入；
- `record.json`、`zh.md`、`en.md` 全部存在且正式仓库校验通过：报告 `TARGET_EXISTS`，不重复写入；
- 只存在部分目标，或路径不安全：报告冲突，整批不写；
- 确定性账本内容相同：报告 `LEDGER_EXISTS`；内容不同：报告 `LEDGER_CONFLICT`，不覆盖。

写入器在首个字节落盘前预检全部目标。每个文件先以 `wx` 创建同目录临时文件，写入并同步后，再用 `COPYFILE_EXCL` 排他复制到最终路径。报告与候选、账本属于同一个文件计划。

若任何复制失败，工具只逆序删除本次操作创建的临时文件、最终文件与现已为空的目录；不递归清理，不删除预存文件，不运行 `reset`、`clean`、`restore` 或 `stash`。自动化测试覆盖中途失败和最后报告失败的完整回滚。

已提交迁移的仓库回滚应使用普通 revert 提交并重新运行全部门禁；不要重写历史或删除无关工作。legacy 来源始终保留，因此生产输出无需通过候选回退。

## 正式仓库校验

无参数命令校验当前工作树的完整 `content/` 仓库：

```powershell
npm.cmd run content:validate
```

它复用 Stage-02 文件加载器和 Stage-01 `validateRepository`，诊断只使用仓库相对路径。既有单个 `record.json`、`--snapshot`、`--json`、`--help` 输入继续可用。

## 验证命令

聚焦门禁：

```powershell
npm.cmd run check:content-migration
npm.cmd run test:content-migration
npm.cmd run test:content-loader
npm.cmd run content:validate
git diff --check
```

完整阶段门禁：

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:next
```

还必须审查 selector 零差异：

```powershell
git diff -- lib/site-data.ts lib/team-data.ts lib/content-repository/default-repository.ts
```

该命令在 Stage-03 应无输出。任何未来 selector 切换都必须是另一个经过 parity 审核的明确批次。
