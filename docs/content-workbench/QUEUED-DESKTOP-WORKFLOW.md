# Queue 桌面发布流程

本文说明 B3A 内容发布工作台如何在不改变生产激活边界的前提下兼容
Legacy 即时发布和 Queue 异步同步。

## 1. 能力协商

工作台启动、重新获得焦点和人工刷新时都会查询服务器能力。

- 控制器协议过旧时显示“需要升级服务器控制器”，不创建本地发布提交。
- Queue 协议存在但尚未初始化时仍按 Legacy 模式运行。
- 只有 `pending-status` 明确确认 Queue 已初始化后，工作台才启用
  `queue-upload`、Queue 删除和“立即同步”。
- Legacy 模式不显示 pending、下次同步时间或“立即同步”，并保留原即时发布与删除。

不得仅根据 `queueProtocolVersion` 推断 Queue 已激活。

## 2. Queue 上传

Queue 模式的发布顺序固定为：

```text
保存发布候选
-> 创建受控内容提交
-> 生成完整 Bundle
-> 计算 SHA-256
-> SCP 上传
-> queue-upload
-> publish-status
-> pending-status
```

`queue-upload` 成功表示服务器已接收并快速校验内容，不表示网站已经构建或上线。
此时工作台：

- 保存上传事务 ID；
- 显示 Bundle 生成、SHA-256、SCP 上传、服务器快速校验和入队耗时；
- 显示服务器返回的 pending 与下次同步时间；
- 不更新线上内容列表；
- 不把本地草稿标记为已发布；
- 不显示线上链接或“正式发布成功”。

Legacy 模式继续等待原同步发布流程完成，并显示完整服务器处理耗时。

## 3. 状态显示

上传事务使用以下状态：

- `QUEUED`：等待服务器同步，网站尚未更新。
- `COALESCED`：该版本已包含在后续上传中，将随最新版本同步。
- `SYNCING`：显示同步事务 ID，并由全局同步面板显示阶段、触发方式、内容 SHA 和耗时。
- `PUBLISHED`：此时才显示 release、上线时间、内容 SHA、网站源码 SHA 和线上页面入口。
- `FAILED`：显示受控诊断摘要，不暴露管理员命令。

同步事务的 `FAILED_RETRYABLE` 明确说明服务器将在后续窗口重试；
`FAILED_BLOCKED` 明确要求上传修正后的新内容。桌面界面不提供
`--retry-blocked`。

## 4. 立即同步

“立即同步”只在 Queue 已确认激活时出现：

1. 先查询 `pending-status`。
2. 没有 pending 时直接结束，不调用同步命令。
3. 已存在 active sync 时按其事务 ID 查询，不创建第二个事务。
4. 否则只调用 `sync-pending --trigger manual`。
5. 命令执行期间最多每 2 秒查询状态，终态后停止轮询。
6. 命令响应中断时，从重新查询到的 active/last 事务继续按原 ID 恢复。

桌面端不调用 `scheduled` trigger、`--retry-blocked` 或 `queue-init`。

## 5. 关闭与重开

上传事务 ID 和同步事务 ID 保存在本地工作台状态中，服务器始终是状态权威。
重新打开工作台时：

- `QUEUED`、`COALESCED`、`SYNCING` 和 `PUBLISHED` 都按原上传事务查询；
- 本地没有同步事务但服务器存在 active sync 时，复用服务器事务；
- 已接收的 Bundle 不重新 SCP；
- 不重复触发同步；
- `PUBLISHED` 恢复完整成功摘要和线上页面入口；
- 只有本地草稿在上传后没有继续编辑时，才把它记录为已发布。

## 6. Queue 删除

Queue 激活后，服务器内容删除不调用 legacy `delete`。工作台使用固定流程：

```text
删除本地目标记录
-> 创建 content: delete <stable-id> 提交
-> 生成并校验 Bundle
-> queue-upload
-> 等待同步
```

删除提交只允许删除目标记录的 `record.json`、`zh.md` 和可选 `en.md`。
它不得修改共享元数据、其他记录、共享图片或目标目录之外的路径。

删除入队后生产内容仍保持不变。后续上传可以把该删除事务标记为
`COALESCED`；只有同步完成后事务才变为 `PUBLISHED`，线上列表才刷新。

## 7. 生产激活边界

B3A 候选包不执行以下操作：

- 不部署生产服务器；
- 不执行生产 `queue-init`；
- 不启用或启动 timer；
- 不真实上传、删除或立即同步生产内容；
- 不公开安装包，不创建 Tag 或 Release。

生产服务器迁移、Queue 初始化和 timer 启用必须在后续经批准的运维阶段单独执行。
