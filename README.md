# 广东海洋大学藻类团队网站

广东海洋大学藻类团队（Algae Research Team, Guangdong Ocean University）的中英双语网站。网站用于介绍团队定位、微藻与大型海藻研究方向、经核实的科研成果、面向本科生的实验学习资源，以及作为公众科学栏目保留的“藻境 · Algae Atlas”。

当前仓库遵循“确认后公开”原则：成员、成果、项目、新闻、联系信息和实验流程缺少可靠资料时，明确显示“待补充”“整理中”或“等待实验室审核”，不使用推测内容填充。

## 技术栈

- Next.js 16、React 19、TypeScript
- vinext、Vite 与 Cloudflare 兼容构建
- 原生 CSS 响应式布局，不依赖重型 UI 框架
- Vercel Preview 用于非生产预览

请保留 `.openai/hosting.json`、`vite.config.ts`、`vercel.json` 及相关构建脚本，避免破坏 vinext/Cloudflare 与 Vercel 两套验证流程。

## 主要路由

- `/zh`、`/en`：双语首页
- `/[locale]/team`：团队定位、科研训练理念、成员与平台占位
- `/[locale]/research`：研究方向总览
- `/[locale]/research/microalgae`：微藻研究
- `/[locale]/research/macroalgae`：大型海藻研究
- `/[locale]/outputs`：论文、专利、科研项目与学生科研
- `/[locale]/tutorials`：仪器教程与新生入门主题
- `/[locale]/tutorials/[id]`：经审核后逐步补充的教程详情模板
- `/[locale]/algae`：藻境 · Algae Atlas 与环境筛选
- `/[locale]/algae/[id]`：藻类详情
- `/[locale]/news`：团队动态空态与联系入口
- `/[locale]/about`：网站说明、更新原则和图片来源
- `/[locale]/contact`：公共联系信息及待补字段
- `/[locale]/privacy`：隐私说明
- `/[locale]/insights`：保留的公众科普与示例观察内容，不代表团队动态或科研成果

旧 `/applications`、`/projects` 和相关详情路径继续保留为公众背景或示例观察内容，但不出现在主导航中。

## 内容维护

基础图鉴、科普内容、品牌与导航位于 `lib/site-data.ts`；团队研究、成员、成果、教程、新生入门和动态结构位于 `lib/team-data.ts`。

更新时应当：

1. 同时维护中文与英文；
2. 只添加已由团队确认的信息；
3. 成员资料不得使用虚构姓名、职称、照片或人数；
4. 成果不得虚构论文、DOI、专利号、项目编号、奖项或数量；
5. 新闻必须包含可核实日期和正文，不把示例观察或科普文章写成团队事件；
6. 教程的安全要求、型号、参数和操作步骤必须经过实验室审核；
7. 联系信息仅使用确认可公开的团队渠道，不提交个人或敏感信息。

添加内容的具体位置：

- 新增或调整研究方向：编辑 `lib/team-data.ts` 的 `researchAreas` 与 `researchTopics`，为中英文标题、摘要和研究范围提供经过确认的文本；研究方向详情页会按 `id` 自动生成。
- 新增仪器教程：在 `tutorials` 中添加条目，先保留未经审核的流程字段为空；审核后再依次补充检查、SOP、参数、数据、安全与管理字段，并同步增加测试断言。
- 新增团队动态：在 `news` 中按既有类型加入中英文标题、摘要、日期、分类、正文和可选图片；发布前核对事件真实性、日期、图片授权和是否适合公开。
- 新增成果：在 `outputs` 中选择正确分类，只录入可核实的正式信息与公开链接，不使用占位记录制造数量。
- 新增藻类条目或图片：编辑 `lib/site-data.ts`，同时维护双语内容、科学名称、图片替代文本语境和 `imageCredits`。

教程数据已经为用途、适用实验、使用前检查、SOP、常用参数、数据导出、清洁关机、常见错误、安全事项、预约管理和更新时间预留字段。审核完成前应保留空数组和审核提示。

## 图片与版权

图片位于 `public/images`。当前临时使用来自 Wikimedia Commons 的 NOAA、美国能源部、CSIRO 与 NASA 科学影像，详细署名、许可和来源链接展示在网站 About 页。

新增或替换图片前应核对授权，并同步维护 `lib/site-data.ts` 中的 `imageCredits`。团队自有图片需确认可公开范围；人物图片还需取得相应授权。

## 本地运行与检查

```bash
npm install
npm run dev
npm run check
npm test
npm run build:next
```

- `npm run check`：TypeScript 与 ESLint 检查。
- `npm test`：先执行 vinext 构建，再验证双语页面、核心路由、空态、图鉴详情和 404。
- `npm run build:next`：验证 Vercel 使用的 Next.js 构建。

## Preview 部署与生产保护

Vercel 使用 `vercel.json` 指定的 `npm run build:next`。日常评审只创建 Preview 部署；未经明确确认，不执行 `vercel --prod`，不覆盖生产环境，也不绑定或修改 `sycszy.icu`。

发布前应再次检查成员、成果、新闻、教程和联系方式是否已获团队确认，并确认所有临时图片署名仍准确。

## 敏感信息

密码、令牌、API 密钥、数据库凭据和其他敏感信息不得写入代码或提交到 GitHub。真实环境值只配置在托管平台；本地值使用未提交的 `.env.local`。如需说明环境变量，仅在 `.env.example` 记录变量名称和用途，不写入真实值。
