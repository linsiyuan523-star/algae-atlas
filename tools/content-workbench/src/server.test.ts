import { expect, test, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  normalizeServerContentItem,
  tauriServerApi,
} from "./server";

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
  await tauriServerApi.publishContent({
    repositoryPath: "D:\\worktree",
    contentType: "team-news",
    stableId: "example",
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
      "publish_content_to_server",
      {
        request: {
          repositoryPath: "D:\\worktree",
          contentType: "team-news",
          stableId: "example",
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
