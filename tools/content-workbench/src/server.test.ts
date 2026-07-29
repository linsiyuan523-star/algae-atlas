import { beforeEach, expect, test, vi } from "vitest";

const { invokeMock, listenMock, unlistenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  unlistenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

import {
  createPublishTransactionId,
  isServerPublishProgress,
  normalizeServerContentItem,
  tauriServerApi,
} from "./server";

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  unlistenMock.mockReset();
  listenMock.mockResolvedValue(unlistenMock);
});

test("uses the backend command names and payload envelopes", async () => {
  invokeMock.mockResolvedValue({
    ok: true,
    action: "publish",
    message: "published",
    url: "https://example.invalid/zh/example",
  });

  await tauriServerApi.testConnection();
  await tauriServerApi.getStatus();
  await tauriServerApi.listContent();
  await tauriServerApi.getPublishStatus({
    transactionId: "1".repeat(32),
  });
  await tauriServerApi.publishContent({
    repositoryPath: "D:\\worktree",
    contentType: "team-news",
    stableId: "example",
    transactionId: "1".repeat(32),
  });
  await tauriServerApi.deleteContent({
    contentType: "team-news",
    stableId: "example",
  });

  expect(invokeMock.mock.calls).toEqual([
    ["test_server_connection"],
    ["get_server_status"],
    ["list_server_content"],
    [
      "get_publish_status",
      {
        request: {
          transactionId: "1".repeat(32),
        },
      },
    ],
    [
      "publish_content_to_server",
      {
        request: {
          repositoryPath: "D:\\worktree",
          contentType: "team-news",
          stableId: "example",
          transactionId: "1".repeat(32),
        },
      },
    ],
    [
      "delete_server_content",
      {
        request: {
          contentType: "team-news",
          stableId: "example",
        },
      },
    ],
  ]);
});

test("flattens legacy nested data while preserving flat fields", async () => {
  invokeMock.mockResolvedValue({
    ok: true,
    action: "publish",
    message: "published",
    data: {
      url: "https://example.invalid/legacy",
      releaseSha: "legacy-sha",
    },
    url: "https://example.invalid/current",
  });

  const result = await tauriServerApi.publishContent({
    repositoryPath: "D:\\worktree",
    contentType: "team-news",
    stableId: "example",
    transactionId: "2".repeat(32),
  });

  expect(result.url).toBe("https://example.invalid/current");
  expect(result.releaseSha).toBe("legacy-sha");
});

test("normalizes title and URL aliases from server list items", () => {
  expect(
    normalizeServerContentItem({
      contentType: "team-news",
      stableId: "example",
      title: "Example title",
      urlZh: "https://example.invalid/zh/example",
      status: "online",
    }),
  ).toEqual({
    contentType: "team-news",
    stableId: "example",
    titleZh: "Example title",
    urlZh: "https://example.invalid/zh/example",
    status: "published",
    updatedAt: "",
  });
});

test("returns a structured failure when Tauri invocation fails", async () => {
  invokeMock.mockRejectedValue(new Error("SSH unavailable"));

  await expect(tauriServerApi.getStatus()).resolves.toMatchObject({
    ok: false,
    action: "status",
    code: "TAURI_INVOKE_FAILED",
    message: "SSH unavailable",
  });
});

test("creates lowercase fixed-width transaction ids", () => {
  const first = createPublishTransactionId();
  const second = createPublishTransactionId();

  expect(first).toMatch(/^[0-9a-f]{32}$/);
  expect(second).toMatch(/^[0-9a-f]{32}$/);
  expect(second).not.toBe(first);
});

test("forwards only matching progress events and releases the listener", async () => {
  const transactionId = "3".repeat(32);
  const onProgress = vi.fn();
  listenMock.mockImplementation(async (_event, handler) => {
    handler({
      payload: {
        transactionId: "4".repeat(32),
        status: "running",
        stage: "uploading_bundle",
        message: "foreign transaction",
        updatedAt: "2026-07-29T12:00:00Z",
        elapsedMs: 100,
        attempt: 1,
      },
    });
    handler({
      payload: {
        transactionId,
        status: "running",
        stage: "uploading_bundle",
        message: "Uploading Bundle",
        updatedAt: "2026-07-29T12:00:01Z",
        elapsedMs: 1_000,
        attempt: 1,
        isUploading: true,
      },
    });
    return unlistenMock;
  });
  invokeMock.mockResolvedValue({
    ok: true,
    action: "publish",
    message: "Published",
    transactionId,
    status: "succeeded",
    stage: "succeeded",
    updatedAt: "2026-07-29T12:00:20Z",
    elapsedMs: 20_000,
    attempt: 1,
  });

  await tauriServerApi.publishContent(
    {
      repositoryPath: "D:\\worktree",
      contentType: "team-news",
      stableId: "example",
      transactionId,
    },
    onProgress,
  );

  expect(listenMock).toHaveBeenCalledWith(
    "server-publish-progress",
    expect.any(Function),
  );
  expect(onProgress).toHaveBeenCalledTimes(2);
  expect(onProgress.mock.calls[0]?.[0]).toMatchObject({
    transactionId,
    stage: "uploading_bundle",
    isUploading: true,
  });
  expect(onProgress.mock.calls[1]?.[0]).toMatchObject({
    transactionId,
    status: "succeeded",
  });
  expect(unlistenMock).toHaveBeenCalledOnce();
});

test("rejects unknown publish stages before they reach the UI", () => {
  expect(
    isServerPublishProgress(
      {
        ok: true,
        action: "publish-status",
        message: "Unknown stage",
        transactionId: "5".repeat(32),
        status: "running",
        stage: "unknown_stage" as never,
        updatedAt: "2026-07-29T12:00:00Z",
        elapsedMs: 1,
        attempt: 1,
      },
      "5".repeat(32),
    ),
  ).toBe(false);
});
