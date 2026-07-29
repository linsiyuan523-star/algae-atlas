import {
  ExternalLink,
  FilePenLine,
  LoaderCircle,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import type { ServerConnectionState } from "./ServerSettingsPage";

export type ServerContentStatus = "published" | "updating" | "unknown";

export type ServerContentSummary = {
  stableId: string;
  titleZh: string;
  contentType: string;
  urlZh: string;
  status: ServerContentStatus;
  updatedAt: string;
};

type ServerContentPageProps = {
  items?: readonly ServerContentSummary[];
  loading?: boolean;
  error?: string | null;
  connectionState?: ServerConnectionState;
  onRefresh?: () => void;
  onView?: (item: ServerContentSummary) => void;
  onEdit?: (item: ServerContentSummary) => void;
  onDelete?: (item: ServerContentSummary) => void;
};

const statusLabels: Record<ServerContentStatus, string> = {
  published: "已发布",
  updating: "更新中",
  unknown: "状态未知",
};

export function ServerContentPage({
  items = [],
  loading = false,
  error = null,
  connectionState = "unchecked",
  onRefresh,
  onView,
  onEdit,
  onDelete,
}: ServerContentPageProps) {
  const canMutate = connectionState === "available";

  return (
    <div className="server-content-page">
      <header className="server-page-toolbar">
        <div className="server-target">
          <Server aria-hidden="true" size={20} />
          <div>
            <span>固定服务器</span>
            <code>algae-server</code>
          </div>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={!onRefresh || loading}
          onClick={onRefresh}
        >
          {loading ? (
            <LoaderCircle className="server-spinner" aria-hidden="true" size={17} />
          ) : (
            <RefreshCw aria-hidden="true" size={17} />
          )}
          {loading ? "正在读取" : "刷新"}
        </button>
      </header>

      {error ? (
        <p className="operation-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="server-content-table-wrap">
        <table className="server-content-table">
          <thead>
            <tr>
              <th scope="col">标题</th>
              <th scope="col">Stable ID</th>
              <th scope="col">内容类型</th>
              <th scope="col">中文 URL</th>
              <th scope="col">发布状态</th>
              <th scope="col">最后更新时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="server-table-empty" role="status">
                    <Server aria-hidden="true" size={26} strokeWidth={1.6} />
                    <span>{loading ? "正在读取服务器内容..." : "尚未读取服务器内容。"}</span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={`${item.contentType}:${item.stableId}`}>
                  <td className="server-content-title">{item.titleZh}</td>
                  <td>
                    <code>{item.stableId}</code>
                  </td>
                  <td>{item.contentType}</td>
                  <td>
                    <a
                      className="server-content-url"
                      href={item.urlZh}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="查看线上页面"
                      onClick={(event) => {
                        if (!onView) {
                          return;
                        }
                        event.preventDefault();
                        onView(item);
                      }}
                    >
                      {item.urlZh}
                    </a>
                  </td>
                  <td>
                    <span className="server-status-badge" data-status={item.status}>
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td>
                    <time dateTime={item.updatedAt}>{formatTimestamp(item.updatedAt)}</time>
                  </td>
                  <td>
                    <div className="server-row-actions">
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`查看 ${item.titleZh}`}
                        title="查看线上页面"
                        disabled={!onView}
                        onClick={() => onView?.(item)}
                      >
                        <ExternalLink aria-hidden="true" size={17} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`编辑 ${item.titleZh}`}
                        title="编辑"
                        disabled={!onEdit}
                        onClick={() => onEdit?.(item)}
                      >
                        <FilePenLine aria-hidden="true" size={17} />
                      </button>
                      <button
                        className="icon-button server-delete-button"
                        type="button"
                        aria-label={`删除 ${item.titleZh}`}
                        title={
                          canMutate
                            ? "从服务器删除"
                            : "服务器不可用，暂时不能删除"
                        }
                        disabled={!onDelete || loading || !canMutate}
                        onClick={() => onDelete?.(item)}
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
