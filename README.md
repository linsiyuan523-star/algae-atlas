# 广东海洋大学藻类团队网站

广东海洋大学藻类团队（Algae Research Team, Guangdong Ocean University）的中英双语网站。网站介绍团队定位、微藻与大型海藻研究、生物饵料、近岸藻华、合作交流、科研成果、实验学习资源和公众栏目“藻境 · Algae Atlas”。

正式网站：

- https://sycszy.icu/zh
- https://sycszy.icu/en

仓库遵循“确认后公开”原则。成员、成果、项目、新闻、联系方式和实验流程缺少可靠资料时，应继续显示待补充或审核状态，不得以推测内容填充。

## 技术栈

- Next.js 16、React 19、TypeScript
- 原生 CSS 响应式界面
- vinext、Vite 与 Cloudflare Worker 兼容构建
- Node.js 22.13 或更高版本
- Nginx、systemd 与原生 Next.js 生产服务

`.openai/hosting.json`、`vite.config.ts`、`vercel.json`、`build/`、`worker/`、`db/`、`drizzle/` 和 `examples/` 属于现有兼容或验证结构。没有独立审计和迁移计划时不要删除。

## 主要路由

- `/zh`、`/en`：中英文首页
- `/[locale]/team`：团队概况
- `/[locale]/research`：研究方向
- `/[locale]/live-feeds`：生物饵料与浮游动物
- `/[locale]/collaboration`：合作与交流
- `/[locale]/outputs`：科研成果
- `/[locale]/tutorials`：实验学习资源
- `/[locale]/algae`：藻类图鉴
- `/[locale]/news`：团队动态
- `/[locale]/about`、`contact`、`privacy`：网站信息

`applications`、`projects` 和 `insights` 中仍保留的公众背景内容不代表团队项目、新闻或成果。

## 本地运行

安装锁文件指定的依赖：

```bash
npm ci
```

启动原生 Next.js 开发服务器：

```bash
npm run dev:next
```

提交 PR 前运行：

```bash
npm run check
npm test
npm run build:next
```

`npm test` 会先执行 vinext 测试构建，再运行渲染测试。正式服务器使用 `npm run build:next`；不要用 `npm run build` 代替生产构建验证。

## 内容维护位置

| 内容 | 主要位置 |
| --- | --- |
| 品牌、导航、图鉴、科普和图片署名 | `lib/site-data.ts` |
| 团队、研究方向、成果、教程和新闻 | `lib/team-data.ts` |
| 生物饵料与浮游动物 | `lib/live-feeds-data.ts` |
| 合作方向与边界 | `lib/collaboration-data.ts` |
| 研究能力说明 | `lib/research-capabilities-data.ts` |
| 统一审核模型 | `lib/content-review.ts` |
| 页面组件 | `components/` |
| 图片文件 | `public/images/` |
| 路由、元数据与站点地图 | `app/` |
| 渲染与内容边界测试 | `tests/rendered-html.test.mjs` |

所有公开内容应同步维护中文和英文。新增或替换图片前必须确认来源、许可、署名和公开范围，并同步更新 `imageCredits`。

## 分支与发布

长期分支只有 `main`。日常工作从最新 `main` 创建短期 `feature/*`、`fix/*`、`chore/*` 或 `docs/*` 分支，通过 Pull Request 审核并优先 squash 合并。合并后删除源分支。

生产部署只允许来自 `origin/main`。正式发布使用 Semantic Versioning 的 annotated tag 和 GitHub Release 保存；历史临时分支如需删除，应先确认已合并或由 annotated archive tag 永久保留。

## 维护文档

- [架构说明](docs/ARCHITECTURE.md)
- [内容维护](docs/CONTENT-MAINTENANCE.md)
- [生产部署](docs/DEPLOYMENT.md)
- [发布流程](docs/RELEASE-PROCESS.md)
- [仓库维护](docs/REPOSITORY-MAINTENANCE.md)
- [2026-07-20 仓库审计](docs/REPOSITORY-AUDIT-2026-07-20.md)
- [贡献指南](CONTRIBUTING.md)
- [变更记录](CHANGELOG.md)

## 敏感信息

不得提交密码、Token、SSH 私钥、证书私钥、云平台密钥或真实生产环境文件。仓库只保留不含秘密的 `.env.example`；真实值应在对应托管环境中管理。
