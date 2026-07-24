# Stage 8C 端到端验收报告

- 阶段：Stage-08C - 端到端验收与文档
- 基线提交：`485088f5058f71128cafa6d5b4d6c316439d037c`
- 分支：`local/stage-08c-acceptance`
- 日期：2026-07-24
- 结论：`PASS_WITH_LIMITATIONS`

## 验收场景

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 创建中文版团队动态 | PASS | 前端验收测试从共享 Schema 默认值生成 `team-news` 候选 |
| 英文保持 `missing` | PASS | 记录为 `{ state: "missing" }`，导出目标不存在 `en.md` |
| 封面图和正文图 | PASS | 两张图片、一个封面缩略图，共 3 个二进制目标 |
| 作者、许可、署名和中文 alt | PASS | 两份媒体记录通过共享 Schema 和发布候选检查 |
| 桌面/手机预览 | PASS | 集成组件测试切换两种宽度并验证正文图与署名 |
| 英文缺失预览 | PASS | English 视图明确提示不生成英文详情页 |
| 导出到测试仓库 | PASS | 原生测试使用干净、无 remote 的临时 Git 仓库 |
| 本地分支与单个提交 | PASS | 创建 `content/20260724-stage-08c-team-news`，7 个文件，基础 `main` 未前移 |
| Bundle 与 SHA256 | PASS | 生成完整历史 Bundle、sidecar 和 7 个交接文件 |
| 第二仓库导入 | PASS | 脚本只创建 `import/...` 分支，当前分支与 HEAD 不变 |
| Windows 候选摘要 | PASS | 安装程序 SHA256 与 Stage-08B 清单完全一致 |
| Windows 候选启动 | PASS | `0.1.0` 安装成功并显示首次启动与本地诊断页面 |

测试数据均为虚构数据，不写入项目生产内容。

## 自动化测试

- `npm run check`：PASS。
- `npm test`：首次被 Stage-04 遗留的打包断言阻止；更新为 Stage-08B NSIS 契约后，已通过全部组成项。
- Schema Node 测试：58/58 PASS。
- Schema 浏览器契约：PASS。
- 桌面脚手架：1/1 PASS。
- 桌面 Vitest：159/159 PASS，含新增 Stage-08C 场景。
- Vinext 网站构建：PASS。
- 渲染 HTML：25/25 PASS。
- IndexNow：1/1 PASS。
- `npm run build:next`：PASS，97 个静态页面生成完成。
- Rust：37/37 PASS，含真实提交、Bundle 和导入验收。
- Rust formatter：PASS。

## 安装候选

- 文件：`content-workbench_0.1.0_x64-setup.exe`
- SHA256：`51227623E19C502233B1954A46E2F2DF0669D7DDA48A07DF2E501B1278A22602`
- 安装：当前用户静默安装返回 0。
- 签名：未签名，符合 Stage-08B 已记录限制。

## 限制与已知问题

- 没有独立干净 Windows VM；候选在当前 Windows 主机的干净产品安装状态启动。
- Windows 自动化运行时能读取完整界面树，但点击与 `set_value` 均被运行时拒绝；没有观察到候选应用异常。完整交互由前端集成测试与原生真实 Git 测试覆盖。
- 首次启动页面把 MSVC Build Tools 和 WebView2 显示为“未检测到”，但本机 Rust 构建通过且候选 WebView 窗口正常运行；这是诊断误报，留给集成阶段评估。
- 既有 Vite 大块提示仍为非阻断项。

## 安全边界

- 未添加 remote，未执行 push、pull、PR、合并、Tag、Release 或部署。
- 未写入 Token、密码、私钥、真实 `.env` 或本机私有绝对路径。
- 未覆盖已有目标目录，未使用强制或破坏性 Git 命令。

## 结论

离线内容发布候选的数据、预览、Git 与 Bundle 链路已通过自动化验收。Stage-08C 可交给最终集成主机，同时保留上述 Windows GUI 自动化和诊断误报限制。
