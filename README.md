# 广东海洋大学藻类团队网站

广东海洋大学藻类团队（Algae Research Team, Guangdong Ocean University）的中英双语网站。网站用于介绍团队定位、微藻与大型海藻研究方向、连接微藻研究与水产养殖应用的生物饵料特色板块、近岸藻华研究专题、合作与交流入口、经核实的科研成果、面向本科生的实验学习资源，以及作为公众科学栏目保留的“藻境 · Algae Atlas”。生物饵料和近岸藻华都是跨方向研究与教学入口，不代表团队被划分为第三个或第四个独立研究部门。

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
- `/[locale]/research/algal-blooms`：近岸藻华与赤潮监测专题，不是独立研究部门
- `/[locale]/live-feeds`：生物饵料与浮游动物研究总览
- `/[locale]/live-feeds/rotifers`：轮虫类群介绍
- `/[locale]/live-feeds/copepods`：桡足类类群介绍
- `/[locale]/live-feeds/cladocerans`：枝角类类群介绍
- `/[locale]/live-feeds/[slug]`：由统一数据生成的生物饵料类群详情结构
- `/[locale]/collaboration`：六类合作方向、沟通准备清单、评估流程与合作边界
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

基础图鉴、科普内容、品牌与导航位于 `lib/site-data.ts`；团队研究、成员、成果、仪器教程、新生入门和动态结构位于 `lib/team-data.ts`；生物饵料类群、研究主题和培养教程位于 `lib/live-feeds-data.ts`；六类合作方向、沟通准备清单、流程和边界位于 `lib/collaboration-data.ts`；四类研究能力说明位于 `lib/research-capabilities-data.ts`；统一审核模型位于 `lib/content-review.ts`，页面展示由 `components/ContentReviewPanel.tsx` 负责。

更新时应当：

1. 同时维护中文与英文；
2. 只添加已由团队确认的信息；
3. 成员资料不得使用虚构姓名、职称、照片或人数；
4. 成果不得虚构论文、DOI、专利号、项目编号、奖项或数量；
5. 新闻必须包含可核实日期和正文，不把示例观察或科普文章写成团队事件；
6. 教程的安全要求、型号、参数和操作步骤必须经过实验室审核；
7. 联系信息仅使用确认可公开的团队渠道，不提交个人或敏感信息；
8. 未提供或未确认公共邮箱、实验室地址时，必须继续显示 `待补充 / Pending`，不得从个人主页、地图或搜索结果中猜测；
9. 不得承诺合作获批、项目立项、实验阳性结果、培养效果、生产能力、固定回复时间或其他尚未确认的结果。

添加内容的具体位置：

- 新增或调整研究方向：编辑 `lib/team-data.ts` 的 `researchAreas` 与 `researchTopics`，为中英文标题、摘要和研究范围提供经过确认的文本；研究方向详情页会按 `id` 自动生成。
- 新增仪器教程：在 `tutorials` 中添加条目，先保留未经审核的流程字段为空；审核后再依次补充检查、SOP、参数、数据、安全与管理字段，并同步增加测试断言。
- 新增团队动态：在 `news` 中按既有类型加入中英文标题、摘要、日期、分类、正文和可选图片；发布前核对事件真实性、日期、图片授权和是否适合公开。
- 新增成果：在 `outputs` 中选择正确分类，只录入可核实的正式信息与公开链接，不使用占位记录制造数量。
- 新增藻类条目或图片：编辑 `lib/site-data.ts`，同时维护双语内容、科学名称、图片替代文本语境和 `imageCredits`。
- 新增或调整合作方向：编辑 `lib/collaboration-data.ts`，不要把合作内容直接写死在页面组件中。
- 更新研究能力：编辑 `lib/research-capabilities-data.ts` 中对应的能力条目；公开范围与实际资源有变化时，应先完成内部确认，再修改能力说明和审核信息。

教程数据已经为用途、适用实验、使用前检查、SOP、常用参数、数据导出、清洁关机、常见错误、安全事项、预约管理和更新时间预留字段。审核完成前应保留空数组和审核提示。

## 统一内容审核维护

图鉴条目、生物饵料类群与研究主题、培养教程、仪器教程、合作方向和研究能力统一使用 `ContentReview`。不要再为生物饵料内容新增旧式的 `lastReviewed` 字段，也不要用其他业务字段代替审核记录。最小可用写法如下：

```ts
review: {
  status: "draft",
  updatedAt: "2026-07-12",
  version: "0.1",
}
```

字段维护规则：

1. `status` 只使用 `draft`、`internal-review` 或 `reviewed`。
   - `draft`：资料仍在整理，不能放入具体敏感参数、未经确认的能力或效果结论。
   - `internal-review`：内容已提交实验室内部核对，但尚未确认可以按当前版本公开。
   - `reviewed`：当前版本已完成内部审核；它不代表合作、项目或实验已经获批。
2. `updatedAt` 是本条公开内容最后一次实质修改日期，使用 `YYYY-MM-DD`。修改中英文正文、研究范围、流程、安全边界或引用时都要同步更新。
3. `reviewedAt` 只在确实完成当前版本审核时填写。已审核内容发生实质修改后，应先把 `status` 改回 `internal-review`，移除旧的 `reviewedAt`，等待重新审核。
4. `author`、`reviewer` 都是可选字段。只有本人或团队确认姓名可以公开时才填写；没有确认时保持省略，绝不能虚构姓名、职务或用开发者姓名代替实验室审核者。
5. `version` 用于识别公开内容版本；实质更新时递增，例如从 `0.1` 到 `0.2`。`references` 只记录可核实且适合公开的资料。

审核日期只说明内容核对状态，不等于实验操作许可。页面中的“实验室审核”应由统一 `review` 字段生成，维护者不要在组件里另写一个互相冲突的状态或日期。

## 合作与交流栏目维护

`lib/collaboration-data.ts` 当前维护六个稳定方向：`microalgae`、`live-feeds`、`algal-blooms`、`macroalgae`、`aquaculture` 和 `automation-training`。这些 `id` 同时用于页面锚点和站内链接，除非同步检查所有链接与测试，否则不要改名。

每个方向都应完整维护中英文 `title`、`summary`、`suitableFor`、`possibleTopics`、`partnerShouldProvide`、`teamMayContribute`、相关研究或教程链接、`status`、`caveat` 和 `review`。维护时还要注意：

1. 使用“可讨论”“可根据条件评估”“可能参与”等审慎表述，不写“保证开展”“确保成功”“可立即提供”等承诺；
2. 合作单位、案例、项目名、采样站位和结果只有在双方确认公开范围后才能加入；没有真实资料时保留正式空状态；
3. `collaborationPreparationItems` 是初次沟通前的准备清单，不要改造成上传表单，也不要收集隐私、保密或敏感文件；
4. `collaborationProcess` 和 `collaborationBoundaries` 涉及可行性、审批、生物安全、数据、署名、知识产权和对外发布，删改前必须确认不会形成不实承诺；
5. 修改某个方向时更新该方向的 `review`；修改整页通用说明、流程或边界时同步更新 `collaborationPageReview`。

## 研究能力说明维护

`lib/research-capabilities-data.ts` 统一维护四类 `ResearchCapability`：`microalgae`、`macroalgae`、`live-feeds` 和 `algal-blooms`。每项包含 `researchObjects`、`typicalQuestions`、`methodsAndMeasurements`、`availableResources`、`collaborationLinks`、`contentStatus` 和 `review`。

- `contentStatus` 只描述公开资料或能力范围的确认完整度，不能代替 `review`；内容审核状态和日期始终写在统一的 `review` 中。
- `availableResources` 只列出团队已经确认且可以公开的资源。仪器、藻株、动物材料、场地、人员和时间尚未确认时，应明确写成需要逐项评估，不得推断团队已经具备。
- `methodsAndMeasurements` 保持研究层级描述。在实验室审核并确定适用场景前，不写培养密度、投喂量、温盐度、光周期、保存剂、消毒剂、药物浓度或其他可被误用的具体参数。
- `collaborationLinks` 应指向对应合作方向；新增、改名或删除能力条目后，同时检查中文、英文路由、首页入口、站点地图与测试。

## 生物饵料栏目维护

生物饵料页面统一从 `lib/live-feeds-data.ts` 读取内容。维护时应保留 `LiveFeedEntry` 的统一字段，不要把某个类群的说明直接写死在页面组件中。`category` 使用 `rotifer`、`copepod`、`cladoceran` 或预留的 `other`；当前只有前三类有公开详情页。

### 新增浮游动物类群

1. 在 `lib/live-feeds-data.ts` 的类群数据中新增一项，使用稳定、简短的英文 `id` 作为网址 slug。
2. 同时填写 `name`、`environment`、`overview`、`morphology`、`ecologicalRole`、`researchFocus`、`cultureFactors`、`applications`、`limitations` 和 `imageAlt` 的中英文内容，不能只维护一种语言。
3. `scientificGroup` 用于 Rotifera、Copepoda、Cladocera 等较高分类单元，按规范以正体显示；只有经过确认的属名和种名使用斜体。没有可靠物种鉴定时使用较高分类名称或 `spp.`，不要自行确定种名。
4. 根据真实资料填写水体环境，并维护统一的 `review`。不得使用“容易培养”“营养价值最高”“最适合苗种”或“成本最低”等未经证实的主观标签。
5. 将获准公开的图片放入 `public/images`，填写双语替代文本，并在 `lib/site-data.ts` 的 `imageCredits` 中新增带稳定 `id` 的署名记录；类群条目的 `imageCreditId` 必须引用该 `id`。没有匹配署名与许可记录的图片不会在类群详情页公开显示。
6. 新增条目后检查中英文详情路由、语言切换、站点地图和测试；通用详情页会依据 `id` 生成，不要为没有实质内容的条目建立空页面。

### 新增培养教程

培养教程必须把面向公众或本科生的科普介绍与实验室正式 SOP 分开维护。在 `lib/live-feeds-data.ts` 的培养教程数据区新增条目时，应预留教程用途、适用对象、培训前提、所需材料、操作流程、数据记录、常见异常、安全与生物管理要求，并使用统一的 `review` 记录审核状态、更新日期和可选审核日期。

如果内容尚未经过实验室审核，只能发布用途、学习目标、记录框架和通用安全边界，具体流程字段应保持为空，并显示：

> 详细参数与操作流程须经实验室审核后发布。本页面不能替代现场培训和正式实验方案。

只有具有实质内容并完成相应审核后，才新增 `/[locale]/live-feeds/guides/[slug]` 页面；不要仅为预留网址创建内容空洞的教程页。

### 审核状态

- 生物饵料类群、研究主题和培养教程均在各自的 `review` 中维护 `draft`、`internal-review` 或 `reviewed`，规则与上文“统一内容审核维护”一致。
- 旧的顶层 `lastReviewed` 写法已经停用。最后更新日期写入 `review.updatedAt`，完成当前版本审核后再填写 `review.reviewedAt`；该状态仍不代表页面可以替代现场培训或正式实验方案。

类群介绍中的常见研究用途不等于团队已完成成果。没有真实论文、项目或实验结果时，“相关团队成果”必须保留正式空状态，不得使用占位论文、DOI、项目编号或效果数据填充。

### 培养参数与科学表述边界

在实验室提供并审核真实资料之前，禁止写入具体培养密度、投喂量、盐度、温度、光周期、消毒剂浓度、药物或抗生素处理方案，也不得使用“最佳条件”或“标准条件”。不得宣称提高成活率、增重率、抗病力或营养品质，不得虚构团队已有虫种、培养规模、生产能力、论文或项目。

“生物饵料”“浮游动物”和“微藻饵料”是不同概念；页面不能暗示所有浮游动物适用于所有水产苗种，也不能把一个类群的培养条件推广到其他类群。

## 图片与版权

图片位于 `public/images`。当前网站使用用户提供的 `zhutu.png`、`guandaofanyinqi.jpg`、`tidai.jpg`，以及来自 Wikimedia Commons 的 CSIRO 微藻培养科学影像。详细来源、许可和待确认状态展示在网站 About 页。

本轮合作栏目与藻华专题改造不更换图片、不改动图片署名，也不修改域名、`metadataBase` 或学校子域名。后续如需调整这些内容，应作为独立任务核对授权、链接和部署影响，不要顺手与文字维护混在同一次提交中。

新增或替换图片前应核对授权，并同步维护 `lib/site-data.ts` 中的 `imageCredits`。用户提供素材在公开许可范围确认前应保留“使用范围待确认”标记；团队自有图片需确认可公开范围，人物图片还需取得相应授权。

生物饵料图片优先使用团队原创显微或培养照片，其次使用有明确开放许可的科学影像，再其次使用中性占位图。不得直接复制搜索引擎图片、使用来源不明的商业养殖图片、用微藻显微图冒充浮游动物，或把单一物种照片无说明地标成整个类群。AI 生成图片不得作为物种鉴定依据。每张新增图片都必须记录作者或提供者、来源链接、许可方式和使用范围。

## 本地运行与检查

```bash
npm install
npm run dev
npm run check
npm test
npm run build:next
```

- `npm run check`：TypeScript 与 ESLint 检查。
- `npm test`：先执行 vinext 构建，再验证双语页面、核心路由、合作与藻华专题、生物饵料栏目与类群详情、导航和语言切换、SEO、内容边界、空态、图鉴回归和 404。
- `npm run build:next`：验证 Vercel 使用的 Next.js 构建。

## Preview 部署与生产保护

Vercel 使用 `vercel.json` 指定的 `npm run build:next`。日常维护遵循以下步骤：

1. 在单独的 Git 分支修改内容，不直接向 `main` 提交。
2. 在本地依次运行 `npm run check`、`npm test` 和 `npm run build:next`，全部通过后再提交。
3. 将分支推送到 GitHub，并创建或更新 **Draft Pull Request**。Draft 状态表示内容仍供团队检查，不等于获准发布。
4. 使用该 Draft PR 对应的 Vercel **Preview** 地址检查中文、英文、手机和电脑页面。Preview 只用于评审，不要在 Vercel 中执行 Promote to Production。
5. 只有用户明确确认正式发布后，才可以另行处理生产部署。确认前不得合并为正式发布、不得执行 `vercel --prod`、不得覆盖生产环境，也不得绑定或修改 `sycszy.icu`。

发布前应再次检查成员、成果、新闻、合作案例、研究能力、教程和联系方式是否已获团队确认，并确认所有临时图片署名仍准确。Preview 正常并不自动代表内容真实、审核完成或允许进入生产环境。

## 敏感信息

密码、令牌、API 密钥、数据库凭据和其他敏感信息不得写入代码或提交到 GitHub。真实环境值只配置在托管平台；本地值使用未提交的 `.env.local`。如需说明环境变量，仅在 `.env.example` 记录变量名称和用途，不写入真实值。
