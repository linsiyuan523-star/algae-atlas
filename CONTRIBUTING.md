# Contributing

本项目使用以 `main` 为唯一长期分支的轻量工作流。

## 分支

先同步 `main`，再创建一个短期分支：

```text
feature/<功能名>
fix/<问题名>
chore/<维护任务>
docs/<文档任务>
```

不要创建长期 `develop`、`old`、`new`、`final`、`backup` 或 `agent/*` 分支。不要直接向 `main` 提交或推送。

## 修改范围

- 一个 PR 只处理一个明确目标。
- 中文和英文内容必须同步维护。
- 研究内容、成员、成果、项目、联系方式和实验流程只使用已核实资料。
- 图片必须有明确来源、许可和署名；人物或团队自有素材还应确认公开范围。
- 不要在内容维护 PR 中顺便压缩图片、调整裁切、引入 CDN 或修改生产缓存。
- 不得提交密码、Token、SSH 私钥、证书私钥、云密钥、`.env.production` 或其他秘密。

## 本地验证

首次检出或锁文件变化后运行：

```bash
npm ci
```

提交 PR 前必须运行：

```bash
npm run check
npm test
npm run build:next
```

不得通过关闭 TypeScript、忽略 ESLint、删除测试、使用旧构建产物或跳过 `build:next` 来绕过失败。

## Pull Request

1. 使用仓库 PR 模板描述变更、页面范围、双语同步、图片许可、验证、部署影响和回滚方式。
2. PR 应从最新 `main` 创建并保持可审查。
3. 推荐使用 squash merge；提交历史需要独立保留时，应在合并前说明。
4. 正式部署只能在 PR 合并后从 `origin/main` 执行，不能部署 PR 分支。
5. 合并后删除源分支；若分支包含需要永久保留但不会进入 `main` 的提交，先创建 annotated archive tag。

## 发布

每次正式发布都应：

- 更新 `CHANGELOG.md`；
- 从已验证并已部署的 `main` commit 创建 `vMAJOR.MINOR.PATCH` annotated tag；
- 创建对应 GitHub Release；
- 记录生产 SHA、已知问题和回滚依据。

详细步骤见 [发布流程](docs/RELEASE-PROCESS.md) 和 [仓库维护](docs/REPOSITORY-MAINTENANCE.md)。
