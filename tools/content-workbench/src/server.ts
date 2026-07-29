import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ContentType } from "@algae-atlas/content-schema";

export type ServerCommandAction =
  | "connection"
  | "status"
  | "publish-status"
  | "list"
  | "publish"
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
  currentRelease?: string | null;
  previousRelease?: string | null;
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

export type ServerDeleteRequest = {
  contentType: ContentType;
  stableId: string;
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
  status?: PublishTransactionStatus;
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
};

export type PublishTransactionStatus = "running" | "failed" | "succeeded";

export type PublishStage =
  | "saving"
  | "checking_server"
  | "generating_bundle"
  | "verifying_sha256"
  | "uploading_bundle"
  | "bundle_uploaded"
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

export type PublishProgressListener = (progress: ServerPublishProgress) => void;

export type ServerApi = {
  testConnection: () => Promise<ServerCommandResult<{ host?: string }>>;
  getStatus: () => Promise<ServerCommandResult<ServerStatusData>>;
  listContent: () => Promise<ServerCommandResult<ServerContentListData>>;
  getPublishStatus: (
    request: ServerPublishStatusRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  publishContent: (
    request: ServerPublishRequest,
    onProgress?: PublishProgressListener,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  deleteContent: (
    request: ServerDeleteRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
};

export const tauriServerApi: ServerApi = {
  testConnection: () => invokeServer("test_server_connection"),
  getStatus: () => invokeServer("get_server_status"),
  listContent: () => invokeServer("list_server_content"),
  getPublishStatus: (request) =>
    invokeServer("get_publish_status", { request }),
  publishContent: (request, onProgress) => invokePublish(request, onProgress),
  deleteContent: (request) =>
    invokeServer("delete_server_content", { request }),
};

export const unavailableServerApi: ServerApi = {
  testConnection: async () => unavailableResult("connection"),
  getStatus: async () => unavailableResult("status"),
  listContent: async () =>
    unavailableResult("list") as ServerCommandResult<ServerContentListData>,
  getPublishStatus: async () => unavailableResult("publish-status"),
  publishContent: async () => unavailableResult("publish"),
  deleteContent: async () => unavailableResult("delete"),
};

export const PUBLISH_STAGE_ORDER: readonly PublishStage[] = [
  "saving",
  "checking_server",
  "generating_bundle",
  "verifying_sha256",
  "uploading_bundle",
  "bundle_uploaded",
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
    | "list_server_content"
    | "get_publish_status"
    | "publish_content_to_server"
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
  request: ServerPublishRequest,
  onProgress?: PublishProgressListener,
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
    let result = await invokeServer<ServerPublishData>("publish_content_to_server", {
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
      result = {
        ...result,
        ok: result.status !== "failed",
        action: "publish",
        code: result.status === "failed" ? result.errorCode || "PUBLISH_FAILED" : undefined,
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
    if (result.ok && result.transactionId === transactionId) {
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
  if (command === "list_server_content") {
    return "list";
  }
  if (command === "get_publish_status") {
    return "publish-status";
  }
  if (command === "publish_content_to_server") {
    return "publish";
  }
  return "delete";
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "桌面服务器命令调用失败。";
}
