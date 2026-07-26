import { invoke } from "@tauri-apps/api/core";
import type { ContentType } from "@algae-atlas/content-schema";

export type ServerCommandAction =
  | "connection"
  | "status"
  | "list"
  | "publish"
  | "delete";

type ServerCommandEnvelope = {
  ok: boolean;
  action: ServerCommandAction | string;
  code?: string;
  message: string;
  logTail?: string;
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
  currentRelease?: string | null;
  previousRelease?: string | null;
};

export type ServerPublishRequest = {
  repositoryPath: string;
  contentType: ContentType;
  stableId: string;
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
};

export type ServerApi = {
  testConnection: () => Promise<ServerCommandResult<{ host?: string }>>;
  getStatus: () => Promise<ServerCommandResult<ServerStatusData>>;
  listContent: () => Promise<ServerCommandResult<ServerContentListData>>;
  publishContent: (
    request: ServerPublishRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
  deleteContent: (
    request: ServerDeleteRequest,
  ) => Promise<ServerCommandResult<ServerPublishData>>;
};

export const tauriServerApi: ServerApi = {
  testConnection: () => invokeServer("test_server_connection"),
  getStatus: () => invokeServer("get_server_status"),
  listContent: () => invokeServer("list_server_content"),
  publishContent: (request) =>
    invokeServer("publish_content_to_server", { request }),
  deleteContent: (request) =>
    invokeServer("delete_server_content", { request }),
};

export const unavailableServerApi: ServerApi = {
  testConnection: async () => unavailableResult("connection"),
  getStatus: async () => unavailableResult("status"),
  listContent: async () =>
    unavailableResult("list") as ServerCommandResult<ServerContentListData>,
  publishContent: async () => unavailableResult("publish"),
  deleteContent: async () => unavailableResult("delete"),
};

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
  const logTail = result.logTail?.trim();
  return `${result.message || "服务器请求失败"}${detail}${logTail ? `：${logTail}` : ""}`;
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
