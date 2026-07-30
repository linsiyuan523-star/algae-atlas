import {
  CircleAlert,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import type { ServerConnectionState } from "./ServerSettingsPage";
import type {
  PendingStatusData,
  ServerCapabilitiesData,
  SyncTransactionData,
} from "../server";

type ServerSynchronizationPanelProps = {
  connectionState: ServerConnectionState;
  capabilities: ServerCapabilitiesData | null;
  pending: PendingStatusData | null;
  sync: SyncTransactionData | null;
  loading: boolean;
  synchronizing: boolean;
  notice: string | null;
  error: string | null;
  onRefresh: () => void;
  onSyncNow: () => void;
};

export function ServerSynchronizationPanel({
  connectionState,
  capabilities,
  pending,
  sync,
  loading,
  synchronizing,
  notice,
  error,
  onRefresh,
  onSyncNow,
}: ServerSynchronizationPanelProps) {
  const mode = capabilities?.protocolMode;
  const queueMode = mode === "queue" && capabilities?.queueModeActive === true;
  const activeSync = Boolean(pending?.active_sync_transaction_id);

  return (
    <section
      className="server-synchronization-panel"
      aria-label="服务器同步状态"
    >
      <div className="server-synchronization-heading">
        <div>
          {connectionState === "unavailable" ? (
            <CloudOff aria-hidden="true" size={19} />
          ) : (
            <Server aria-hidden="true" size={19} />
          )}
          <div>
            <strong>服务器同步</strong>
            <span>{connectionLabel(connectionState)}</span>
          </div>
        </div>
        <div className="server-synchronization-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="刷新服务器同步状态"
            title="刷新状态"
            disabled={loading || synchronizing}
            onClick={onRefresh}
          >
            {loading ? (
              <LoaderCircle
                className="save-status-spinner"
                aria-hidden="true"
                size={17}
              />
            ) : (
              <RefreshCw aria-hidden="true" size={17} />
            )}
          </button>
          {queueMode ? (
            <button
              className="secondary-button"
              type="button"
              disabled={loading || synchronizing}
              onClick={onSyncNow}
            >
              {synchronizing ? (
                <LoaderCircle
                  className="save-status-spinner"
                  aria-hidden="true"
                  size={17}
                />
              ) : (
                <Zap aria-hidden="true" size={17} />
              )}
              {synchronizing
                ? "正在同步"
                : activeSync
                  ? "查看同步进度"
                  : "立即同步"}
            </button>
          ) : null}
        </div>
      </div>

      <dl className="server-synchronization-grid">
        <StatusRow label="连接" value={connectionLabel(connectionState)} />
        <StatusRow label="协议模式" value={modeLabel(mode)} />
        {queueMode && pending ? (
          <>
            <StatusRow
              label="当前生产内容"
              value={pending.published_content_commit}
              code
            />
            <StatusRow
              label="当前待同步内容"
              value={pending.pending_content_commit}
              code
            />
            <StatusRow
              label="当前同步内容"
              value={pending.syncing_content_commit || "无"}
              code={Boolean(pending.syncing_content_commit)}
            />
            <StatusRow
              label="待同步上传"
              value={`${pending.pending_upload_count} 项`}
            />
            <StatusRow
              label="下次自动同步"
              value={formatServerTime(pending.next_scheduled_sync_at)}
              dateTime={pending.next_scheduled_sync_at}
            />
            <StatusRow
              label="上次同步时间"
              value={formatServerTime(sync?.completed_at || sync?.updated_at || "")}
              dateTime={sync?.completed_at || sync?.updated_at}
            />
            <StatusRow
              label="上次同步结果"
              value={pending.last_sync_status || "无"}
            />
            <StatusRow
              label="正在同步"
              value={activeSync ? "是" : "否"}
            />
            <StatusRow
              label="blocked 内容"
              value={pending.blocked_content_commit || "无"}
              code={Boolean(pending.blocked_content_commit)}
            />
          </>
        ) : null}
      </dl>

      {mode === "legacy" ? (
        <p className="server-mode-note">
          服务器尚未启用异步同步，当前仍使用即时发布模式。
        </p>
      ) : null}
      {mode === "incompatible" ? (
        <p className="server-mode-error" role="alert">
          <CircleAlert aria-hidden="true" size={17} />
          服务器控制器版本过旧，需要升级后才能使用可靠发布事务。
        </p>
      ) : null}

      {queueMode && sync ? (
        <dl className="server-sync-transaction" aria-label="同步事务进度">
          <StatusRow label="同步事务" value={sync.sync_transaction_id} code />
          <StatusRow label="状态" value={syncStatusLabel(sync.status)} />
          <StatusRow label="阶段" value={syncStatusLabel(sync.stage)} />
          <StatusRow label="触发方式" value={syncTriggerLabel(sync.trigger)} />
          <StatusRow label="内容 SHA" value={sync.content_commit || "无"} code />
          <StatusRow
            label="当前阶段耗时"
            value={formatDuration(syncStageElapsed(sync))}
          />
          <StatusRow label="总耗时" value={formatDuration(sync.elapsed_ms)} />
          {sync.status === "PUBLISHED" ? (
            <>
              <StatusRow label="release" value={sync.release_id} code />
              <StatusRow
                label="网站源码 SHA"
                value={sync.site_commit || "无"}
                code
              />
              <StatusRow
                label="上线时间"
                value={formatServerTime(sync.completed_at)}
                dateTime={sync.completed_at}
              />
            </>
          ) : null}
        </dl>
      ) : null}

      {queueMode && sync?.status === "FAILED_RETRYABLE" ? (
        <p className="server-mode-note">
          服务器将在后续同步窗口重试，无需重新上传 Bundle。
        </p>
      ) : null}
      {queueMode && sync?.status === "FAILED_BLOCKED" ? (
        <p className="server-mode-error" role="alert">
          <CircleAlert aria-hidden="true" size={17} />
          当前内容无法自动继续同步，请上传修正后的新内容。
        </p>
      ) : null}

      {queueMode && pending ? (
        <p className="server-time-diagnostic">
          服务器时间：<code>{pending.server_time}</code>
        </p>
      ) : null}
      {notice ? <p className="operation-notice" role="status">{notice}</p> : null}
      {error ? <p className="operation-error" role="alert">{error}</p> : null}
    </section>
  );
}

function StatusRow({
  label,
  value,
  code = false,
  dateTime,
}: {
  label: string;
  value: string;
  code?: boolean;
  dateTime?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {dateTime ? (
          <time dateTime={dateTime}>{value}</time>
        ) : code && value !== "无" ? (
          <code>{value}</code>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function connectionLabel(state: ServerConnectionState) {
  return {
    unchecked: "尚未检测",
    checking: "正在连接",
    available: "连接可用",
    unavailable: "连接中断",
  }[state];
}

function modeLabel(mode: ServerCapabilitiesData["protocolMode"] | undefined) {
  if (!mode) {
    return "尚未协商";
  }
  return {
    incompatible: "不兼容",
    legacy: "Legacy 即时发布",
    queue: "Queue 异步同步",
  }[mode];
}

function formatServerTime(value: string) {
  if (!value) {
    return "无";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(parsed);
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "未记录";
  }
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} 秒`;
}

function syncStageElapsed(sync: SyncTransactionData) {
  const startedAt = Date.parse(sync.started_at);
  const stageStartedAt = Date.parse(sync.stage_started_at ?? "");
  if (Number.isNaN(startedAt) || Number.isNaN(stageStartedAt)) {
    return sync.elapsed_ms;
  }
  return Math.max(0, sync.elapsed_ms - Math.max(0, stageStartedAt - startedAt));
}

function syncStatusLabel(status: SyncTransactionData["status"]) {
  return {
    CREATED: "已创建",
    SNAPSHOTTING: "固定内容快照",
    PREPARING_SOURCE: "准备网站源码",
    PREPARING_DEPENDENCIES: "准备依赖",
    CHECKING: "校验网站",
    BUILDING: "构建网站",
    SWITCHING: "切换版本",
    VERIFYING: "验证线上状态",
    PUBLISHED: "已上线",
    FAILED_RETRYABLE: "临时失败，等待重试",
    FAILED_BLOCKED: "同步受阻",
    RECOVERING: "正在恢复",
    SKIPPED_NO_PENDING: "没有待同步内容",
  }[status];
}

function syncTriggerLabel(trigger: SyncTransactionData["trigger"]) {
  return {
    scheduled: "定时任务",
    manual: "手动",
    recovery: "恢复",
  }[trigger];
}
