# 藻境 · Algae Atlas

面向公众的中英双语藻类科技展示与知识平台。当前版本为内容与视觉预览，不代表任何机构资质、商业项目或工程结论。

## 页面

- `/zh`、`/en`：双语首页
- `/[locale]/algae`：藻类图鉴与环境筛选
- `/[locale]/applications`：技术与应用
- `/[locale]/projects`：示例观察案例
- `/[locale]/insights`：知识文章
- `/[locale]/about`：项目说明与图片来源
- `/[locale]/contact`：预览阶段联系说明
- `/[locale]/privacy`：隐私说明

## 日常维护

主要内容集中在 `lib/site-data.ts`。新增或修改条目时，应同时维护中文和英文，并避免未经证实的商业、实验或健康宣称。

图片存放于 `public/images`。新增图片前应核对许可，并在“关于”页面的图片来源列表中补充作者、许可和来源链接。

## 本地检查

```bash
npm install
npm run dev
npm run check
npm test
npm run build:next
```

`npm run build` 验证 Build Web Apps / vinext 输出，`npm run build:next` 验证 Vercel 使用的 Next.js 输出。

## 部署

Vercel 使用 `vercel.json` 中指定的 `npm run build:next`。普通 `vercel` 命令创建 Preview；未经明确确认，不使用 `vercel --prod`，也不绑定 `sycszy.icu`。

真实环境值只应配置在托管平台中。本仓库不会提交 `.env.local`、令牌、密码或 API 密钥；`.env.example` 只记录变量名称。

## 图片许可

首版使用 Wikimedia Commons 上的 NOAA、美国能源部、CSIRO 与 NASA 科学影像。详细署名和许可链接见网站“关于”页面。
