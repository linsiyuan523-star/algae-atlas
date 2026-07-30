import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ContentType } from "@algae-atlas/content-schema";

export type ServerCommandAction =
  | "connection"
  | "status"
  | "capabilities"
  | "pending-status"
  | "publish-status"
  | "sync-status"
  | "sync-pending"
  | "list"
  | "publish"
  | "queue-upload"
  | "delete";

type ServerCommandEnvelope = {
  ok: boolean;
  action: ServerCommandAction | string;
  code?: string;
  errorCode?: string;
  message: string;
  logTail?: string;
  retryable?: boolean;
  userMessage?: string;
  technicalSummary?: string;
  failedStage?: string;
  transactionId?: string;
};

export type ServerCommandResult<
  TData extends object = Record<string, unknown>,
> = ServerCommandEnvelope &
  Partial<TData> & {
    data?: TData;
  };

export type ServerContentItem = {
  contentType: ContentType;
  stableId: string;
  title?: string;
  titleZh?: string;
  url?: string;
  zhUrl?: string;
  urlZh?: string;
  status?: string;
  updatedAt?: string;
};

export type ServerContentListData = {
  items: ServerContentItem[];
};

export type ServerStatusData = {
  ready: boolean;
  contentRepositoryReady: boolean;
  serviceActive: boolean;
  healthy: boolean;
  publishProtocolVersion?: number;
  queueProtocolVersion?: number;
  currentRelease?: string | null;
  previousRelease?: string | null;
};

export type ServerProtocolMode = "incompatible" | "legacy" | "queue";

export type ServerCapabilitiesData = ServerStatusData & {
  protocolMode: ServerProtocolMode;
  queueModeActive: boolean;
};

export type PendingStatusData = {
  schema_version: number;
  published_content_commit: string;
  pending_content_commit: string;
  syncing_content_commit: string | null;
  has_pending_changes: boolean;
  pending_upload_count: number;
  latest_upload_transaction_id: string | null;
  active_sync_transaction_id: string | null;
  last_sync_transaction_id: string | null;
  last_sync_status: SyncTransactionStatus | null;
  blocked_content_commit: string | null;
  next_scheduled_sync_at: string;
  sync_timer_active: boolean;
  server_time: string;
  site_commit: string;
  queue_protocol_version: number;
  sync_protocol_version: number;
};

export type ServerPublishRequest = {
  repositoryPath: string;
  contentType: ContentType;
  stableId: string;
  transactionId: string;
};

export type ServerPublishStatusRequest = {
  transactionId: string;
};

export type ServerSyncStatusRequest = {
  transactionId?: string;
};

export type ServerDeleteRequest = {
  contentType: ContentType;
  stableId: string;
};

export type ServerQueueDeleteRequest = ServerDeleteRequest & {
  repositoryPath: string;
  transactionId: string;
};

export type ServerPublishData = {
  contentType?: ContentType;
  stableId?: string;
  url?: string;
  releaseSha?: string;
  contentSha?: string;
  publishedAt?: string;
  updatedAt?: string;
  transactionId?: string;
  bundleSha256?: string;
  status?: PublishTransactionStatus | QueueUploadStatus;
  stage?: PublishStage;
  stageStartedAt?: string;
  startedAt?: string;
  elapsedMs?: number;
  attempt?: number;
  retryable?: boolean;
  errorCode?: string;
  userMessage?: string;
  technicalSummary?: string;
  failedStage?: string;
  releaseId?: string;
  siteCommit?: string;
  contentCommit?: string;
  switchCompleted?: boolean;
  sourceMethod?: "" | "cache" | "archive" | "clone";
  stageDurationsMs?: Partial<Record<PublishStage, number>>;
  bundleUploadedAt?: string;
  bundleUploadDurationMs?: number;
  bundleGenerationDurationMs?: number;
  sha256DurationMs?: number;
  serverValidationDurationMs?: number;
  queueTotalDurationMs?: number;
  schemaVersion?: number;
  sourceCommit?: string;
  queuedAt?: string;
  coalescedIntoCommit?: string;
  includedInSyncTransactionId?: string;
  publishedReleaseId?: string;
  localDraftUpdatedAt?: string;
};

export type PublishTransactionStatus = "running" | "failed" | "succeeded";

export type QueueUploadStatus =
  | "FAILED"
  | "QUEUED"
  | "COALESCED"
  | "SYNCING"
  | "PUBLISHED";

export type SyncTransactionStatus =
  | "CREATED"
  | "SNAPSHOTTING"
  | "PREPARING_SOURCE"
  | "PREPARING_DEPENDENCIES"
  | "CHECKING"
  | "BUILDING"
  | "SWITCHING"
  | "VERIFYING"
  | "PUBLISHED"
  | "FAILED_RETRYABLE"
  | "FAILED_BLOCKED"
  | "RECOVERING"
  | "SKIPPED_NO_PENDING";

export type SyncTrigger = "scheduled" | "manual" | "recovery";

export type SyncTransactionData = {
  schema_version: number;
  sync_transaction_id: string;
  active_sync_transaction_id: string;
  last_sync_transaction_id: string;
  status: SyncTransactionStatus;
  stage: SyncTransactionStatus;
  trigger: SyncTrigger;
  content_commit: string;
  source_content_commit: string;
  site_commit: string;
  release_id: string;
  release_path: string;
  started_at: string;
  updated_at: string;
  completed_at: string;
  stage_started_at?: string;
  elapsed_ms: number;
  retryable: boolean;
  blocked: boolean;
  error_code: string;
  attempt: number;
  max_attempts: number;
  recovered: boolean;
  switch_completed: boolean;
  health_verified: boolean;
};

export type PublishStage =
  | "saving"
  | "checking_server"
  | "generating_bundle"
  | "verifying_sha256"
  | "uploading_bundle"
  | "bundle_uploaded"
  | "server_validating"
  | "connecting_server"
  | "verifying_bundle"
  | "checking_content_commit"
  | "checking_site_source_cache"
  | "preparing_site_source"
  | "preparing_dependencies"
  | "validating_site"
  | "building_site"
  | "creating_release"
  | "switching_release"
  | "restarting_service"
  | "verifying_production_url"
  | "confirming_server_status"
  | "succeeded";

export type ServerPublishProgress = ServerPublishData & {
  transactionId: string;
  status: PublishTransactionStatus;
  stage: PublishStage;
  message: string;
  updatedAt: string;
  elapsedMs: number;
  stageElapsedMs?: number;
  attempt: number;
  isUploading?: boolean;
  serverStarted?: boolean;
  safeToCancel?: boolean;
  safeToRetry?: boolean;
  bundleUploadedAt?: string;
  bundleUploadDurationMs?: number;
  retrying?: boolean;
  clientStartedAt?: string;
};

export type ServerQueuePublishState = ServerPublishData & {
  transactionId: string;
  status: QueueUploadStatus;
  message: string;
  contentCommit: string;
  sourceCommit: string;
  retryable: boolean;
};

export type ServerPublishTransaction =
  | ServerPublishProgress
  | ServerQueuePublishState;

export type PublishProgressListener = (progress: ServerPublishProgress) => void;

export type ServerApi = {
  testConnection: () => Promise<ServerCommandResult<{ host?: string }>>;
  getStatus: () => Promise<ServerCommandResult<ServerStatusData>>;
  getCapabilities: () => Promise<ServerCommandResult<ServerCapabilitiesData>>;
  getPendingStatus: () => Promise<ServerCommandResult<PendingStatusData>>;
  listContent: () => Promise<ServerCommandResult<ServerContentListData>>;
  getPublishStatus: (
    request: ServerPublishStatusRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  publishContent: (
    request: ServerPublishRequest,
    onProgress?: PublishProgressListener,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  queueContent: (
    request: ServerPublishRequest,
    onProgress?: PublishProgressListener,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  queueDeleteContent: (
    request: ServerQueueDeleteRequest,
    onProgress?: PublishProgressListener,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  getSyncStatus: (
    request?: ServerSyncStatusRequest,
  ) => Promise<ServerCommandResult<SyncTransactionData>>;
  syncPendingNow: () => Promise<ServerCommandResult<SyncTransactionData>>;
  deleteContent: (
    request: ServerDeleteRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
};

export const tauriServerApi: ServerApi = {
  testConnection: () => invokeServer("test_server_connection"),
  getStatus: () => invokeServer("get_server_status"),
  getCapabilities: () => invokeServer("negotiate_server_capabilities"),
  getPendingStatus: () => invokeServer("get_pending_status"),
  listContent: () => invokeServer("list_server_content"),
  getPublishStatus: (request) =>
    invokeServer("get_publish_status", { request }),
  publishContent: (request, onProgress) => invokePublish(request, onProgress),
  queueContent: (request, onProgress) =>
    invokePublish(request, onProgress, "queue_content_to_server"),
  queueDeleteContent: (request, onProgress) =>
    invokePublish(request, onProgress, "queue_delete_content_from_server"),
  getSyncStatus: (request = {}) =>
    invokeServer("get_sync_status", { request }),
  syncPendingNow: () => invokeServer("sync_pending_now"),
  deleteContent: (request) =>
    invokeServer("delete_server_content", { request }),
};

export const unavailableServerApi: ServerApi = {
  testConnection: async () => unavailableResult("connection"),
  getStatus: async () => unavailableResult("status"),
  getCapabilities: async () => unavailableResult("capabilities"),
  getPendingStatus: async () => unavailableResult("pending-status"),
  listContent: async () =>
    unavailableResult("list") as ServerCommandResult<ServerContentListData>,
  getPublishStatus: async () => unavailableResult("publish-status"),
  publishContent: async () => unavailableResult("publish"),
  queueContent: async () => unavailableResult("queue-upload"),
  queueDeleteContent: async () => unavailableResult("queue-upload"),
  getSyncStatus: async () => unavailableResult("sync-status"),
  syncPendingNow: async () => unavailableResult("sync-pending"),
  deleteContent: async () => unavailableResult("delete"),
};

export const PUBLISH_STAGE_ORDER: readonly PublishStage[] = [
  "saving",
  "checking_server",
  "generating_bundle",
  "verifying_sha256",
  "uploading_bundle",
  "bundle_uploaded",
  "server_validating",
  "connecting_server",
  "verifying_bundle",
  "checking_content_commit",
  "checking_site_source_cache",
  "preparing_site_source",
  "preparing_dependencies",
  "validating_site",
  "building_site",
  "creating_release",
  "switching_release",
  "restarting_service",
  "verifying_production_url",
  "succeeded",
] as const;

export const PUBLISH_STAGE_LABELS: Record<PublishStage, string> = {
  saving: "保存当前内容",
  checking_server: "检查服务器与已有事务",
  generating_bundle: "生成 Bundle",
  verifying_sha256: "校验 SHA-256",
  uploading_bundle: "上传 Bundle",
  bundle_uploaded: "Bundle 已上传",
  server_validating: "服务器快速校验",
  connecting_server: "连接服务器控制器",
  verifying_bundle: "验证 Bundle",
  checking_content_commit: "检查内容提交",
  checking_site_source_cache: "检查源码缓存",
  preparing_site_source: "准备网站源码",
  preparing_dependencies: "准备依赖",
  validating_site: "执行网站校验",
  building_site: "构建网站",
  creating_release: "创建 release",
  switching_release: "切换版本",
  restarting_service: "启动或重载服务",
  verifying_production_url: "验证生产 URL",
  confirming_server_status: "确认服务器实际状态",
  succeeded: "发布成功",
};

export function createPublishTransactionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function normalizeServerContentItem(item: ServerContentItem) {
  return {
    stableId: item.stableId,
    titleZh: item.titleZh?.trim() || item.title?.trim() || item.stableId,
    contentType: item.contentType,
    urlZh: normalizeServerUrl(item.urlZh, item.zhUrl, item.url),
    status: normalizeServerContentStatus(item.status),
    updatedAt: item.updatedAt?.trim() || "",
  } as const;
}

export function normalizeServerUrl(...values: Array<string | undefined>) {
  for (const value of values) {
    const candidate = value?.trim();
    if (!candidate) {
      continue;
    }
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) {
        return parsed.href;
      }
    } catch {
      // Ignore malformed controller fields and continue through aliases.
    }
  }
  return "";
}

export function normalizeServerContentStatus(
  value: string | undefined,
): "published" | "updating" | "unknown" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "published" || normalized === "online") {
    return "published";
  }
  if (
    normalized === "updating" ||
    normalized === "building" ||
    normalized === "publishing"
  ) {
    return "updating";
  }
  return "unknown";
}

export function serverResultError(result: ServerCommandResult) {
  const detail = result.code ? `（${result.code}）` : "";
  return `${result.userMessage?.trim() || result.message || "服务器请求失败"}${detail}`;
}

export function serverDiagnosticSummary(result: ServerCommandResult) {
  return [
    result.code ?? result.errorCode,
    result.failedStage,
    result.transactionId,
    result.technicalSummary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" | ");
}

export function serverResultIndicatesUnavailable(result: ServerCommandResult) {
  return new Set([
    "SSH_UNAVAILABLE",
    "SSH_TOOL_UNAVAILABLE",
    "SSH_TIMEOUT",
    "SERVER_TOOL_UNAVAILABLE",
    "SERVER_TIMEOUT",
    "SERVER_PROCESS_FAILED",
    "TAURI_INVOKE_FAILED",
  ]).has(result.code ?? "");
}

async function invokeServer<TData extends object>(
  command:
    | "test_server_connection"
    | "get_server_status"
    | "negotiate_server_capabilities"
    | "get_pending_status"
    | "list_server_content"
    | "get_publish_status"
    | "get_sync_status"
    | "sync_pending_now"
    | "publish_content_to_server"
    | "queue_content_to_server"
    | "queue_delete_content_from_server"
    | "delete_server_content",
  args?: Record<string, unknown>,
): Promise<ServerCommandResult<TData>> {
  try {
    const result = args
      ? await invoke<ServerCommandResult<TData>>(command, args)
      : await invoke<ServerCommandResult<TData>>(command);
    return normalizeServerCommandResult(result);
  } catch (error) {
    return {
      ok: false,
      action: commandAction(command),
      code: "TAURI_INVOKE_FAILED",
      message: describeError(error),
    } as ServerCommandResult<TData>;
  }
}

async function invokePublish(
  request: ServerPublishRequest | ServerQueueDeleteRequest,
  onProgress?: PublishProgressListener,
  command:
    | "publish_content_to_server"
    | "queue_content_to_server"
    | "queue_delete_content_from_server" = "publish_content_to_server",
): Promise<ServerCommandResult<ServerPublishData>> {
  let stopped = false;
  let unlisten: (() => void) | undefined;
  if (onProgress) {
    try {
      unlisten = await listen<ServerPublishProgress>(
        "server-publish-progress",
        ({ payload }) => {
          if (payload.transactionId === request.transactionId) {
            onProgress(payload);
          }
        },
      );
    } catch {
      // Status polling below remains available when the event channel is unavailable.
    }
  }

  const polling = onProgress
    ? pollPublishStatus(request.transactionId, onProgress, () => stopped)
    : Promise.resolve();
  try {
    let result = await invokeServer<ServerPublishData>(command, {
      request,
    });
    while (result.ok && result.status === "running") {
      await wait(1_000);
      result = await invokeServer<ServerPublishData>("get_publish_status", {
        request: { transactionId: request.transactionId },
      });
      if (result.ok && result.transactionId === request.transactionId) {
        onProgress?.(result as ServerPublishProgress);
      }
    }
    if (isServerPublishProgress(result, request.transactionId)) {
      onProgress?.(result);
    }
    if (result.action === "publish-status") {
      const queueCommand = command !== "publish_content_to_server";
      result = {
        ...result,
        ok: !matchesFailedStatus(result.status),
        action: queueCommand ? "queue-upload" : "publish",
        code: matchesFailedStatus(result.status)
          ? result.errorCode || (queueCommand ? "UPLOAD_FAILED" : "PUBLISH_FAILED")
          : undefined,
      };
    }
    return result;
  } finally {
    stopped = true;
    await polling;
    unlisten?.();
  }
}

async function pollPublishStatus(
  transactionId: string,
  onProgress: PublishProgressListener,
  isStopped: () => boolean,
) {
  while (!isStopped()) {
    await wait(750);
    if (isStopped()) {
      return;
    }
    const result = await invokeServer<ServerPublishData>("get_publish_status", {
      request: { transactionId },
    });
    if (isServerPublishProgress(result, transactionId)) {
      onProgress(result as ServerPublishProgress);
    }
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function isServerPublishProgress(
  result: ServerCommandResult<ServerPublishData>,
  transactionId: string,
): result is ServerCommandResult<ServerPublishData> & ServerPublishProgress {
  return (
    result.transactionId === transactionId &&
    ["running", "failed", "succeeded"].includes(result.status ?? "") &&
    PUBLISH_STAGE_ORDER.includes(result.stage as PublishStage) &&
    typeof result.message === "string" &&
    typeof result.updatedAt === "string" &&
    typeof result.elapsedMs === "number" &&
    typeof result.attempt === "number"
  );
}

export function isQueuePublishState(
  result: ServerCommandResult<ServerPublishData>,
  transactionId: string,
): result is ServerCommandResult<ServerPublishData> & ServerQueuePublishState {
  return (
    result.transactionId === transactionId &&
    ["FAILED", "QUEUED", "COALESCED", "SYNCING", "PUBLISHED"].includes(
      result.status ?? "",
    ) &&
    typeof result.message === "string" &&
    typeof result.contentCommit === "string" &&
    typeof result.sourceCommit === "string" &&
    typeof result.retryable === "boolean"
  );
}

export function isQueuePublishTransaction(
  value: ServerPublishTransaction | null | undefined,
): value is ServerQueuePublishState {
  return Boolean(
    value &&
      ["FAILED", "QUEUED", "COALESCED", "SYNCING", "PUBLISHED"].includes(
        value.status,
      ),
  );
}

export function isSyncTerminalStatus(status: SyncTransactionStatus) {
  return [
    "PUBLISHED",
    "FAILED_RETRYABLE",
    "FAILED_BLOCKED",
    "SKIPPED_NO_PENDING",
  ].includes(status);
}

export function isSyncTransactionState(
  result: ServerCommandResult<SyncTransactionData>,
): result is ServerCommandResult<SyncTransactionData> & SyncTransactionData {
  return (
    typeof result.sync_transaction_id === "string" &&
    /^[0-9a-f]{32}$/.test(result.sync_transaction_id) &&
    typeof result.status === "string" &&
    [
      "CREATED",
      "SNAPSHOTTING",
      "PREPARING_SOURCE",
      "PREPARING_DEPENDENCIES",
      "CHECKING",
      "BUILDING",
      "SWITCHING",
      "VERIFYING",
      "PUBLISHED",
      "FAILED_RETRYABLE",
      "FAILED_BLOCKED",
      "RECOVERING",
      "SKIPPED_NO_PENDING",
    ].includes(result.status)
  );
}

function matchesFailedStatus(status: ServerPublishData["status"]) {
  return status === "failed" || status === "FAILED";
}

function normalizeServerCommandResult<TData extends object>(
  result: ServerCommandResult<TData>,
): ServerCommandResult<TData> {
  if (!result.data || typeof result.data !== "object") {
    return result;
  }
  return {
    ...result.data,
    ...result,
  } as ServerCommandResult<TData>;
}

function unavailableResult(action: ServerCommandAction) {
  return {
    ok: false,
    action,
    code: "SERVER_UNAVAILABLE",
    message: "服务器发布仅在桌面应用中可用。",
  } satisfies ServerCommandResult;
}

function commandAction(command: string): ServerCommandAction {
  if (command === "test_server_connection") {
    return "connection";
  }
  if (command === "get_server_status") {
    return "status";
  }
  if (command === "negotiate_server_capabilities") {
    return "capabilities";
  }
  if (command === "get_pending_status") {
    return "pending-status";
  }
  if (command === "list_server_content") {
    return "list";
  }
  if (command === "get_publish_status") {
    return "publish-status";
  }
  if (command === "get_sync_status") {
    return "sync-status";
  }
  if (command === "sync_pending_now") {
    return "sync-pending";
  }
  if (command === "publish_content_to_server") {
    return "publish";
  }
  if (command === "queue_content_to_server") {
    return "queue-upload";
  }
  if (command === "queue_delete_content_from_server") {
    return "queue-upload";
  }
  return "delete";
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "桌面服务器命令调用失败。";
}
