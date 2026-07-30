import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ServerSynchronizationPanel } from "./ServerSynchronizationPanel";
import type {
  PendingStatusData,
  ServerCapabilitiesData,
  SyncTransactionData,
  SyncTransactionStatus,
} from "../server";

const queueCapabilities: ServerCapabilitiesData = {
  protocolMode: "queue",
  queueModeActive: true,
  ready: true,
  contentRepositoryReady: true,
  serviceActive: true,
  healthy: true,
  publishProtocolVersion: 1,
  queueProtocolVersion: 1,
};

const pending: PendingStatusData = {
  schema_version: 1,
  published_content_commit: "1".repeat(40),
  pending_content_commit: "2".repeat(40),
  syncing_content_commit: "2".repeat(40),
  has_pending_changes: true,
  pending_upload_count: 1,
  latest_upload_transaction_id: "a".repeat(32),
  active_sync_transaction_id: "b".repeat(32),
  last_sync_transaction_id: null,
  last_sync_status: null,
  blocked_content_commit: null,
  next_scheduled_sync_at: "2026-07-30T11:30:00.000Z",
  sync_timer_active: true,
  server_time: "2026-07-30T11:18:10.000Z",
  site_commit: "3".repeat(40),
  queue_protocol_version: 1,
  sync_protocol_version: 1,
};

function syncTransaction(status: SyncTransactionStatus): SyncTransactionData {
  const published = status === "PUBLISHED";
  const failed = status === "FAILED_RETRYABLE" || status === "FAILED_BLOCKED";
  return {
    schema_version: 1,
    sync_transaction_id: "b".repeat(32),
    active_sync_transaction_id: published || failed ? "" : "b".repeat(32),
    last_sync_transaction_id: published || failed ? "b".repeat(32) : "",
    status,
    stage: failed ? "BUILDING" : status,
    trigger: "manual",
    content_commit: "2".repeat(40),
    source_content_commit: "4".repeat(40),
    site_commit: published ? "3".repeat(40) : "",
    release_id: published ? "release-queue-test" : "",
    release_path: published ? "/srv/releases/release-queue-test" : "",
    started_at: "2026-07-30T11:18:00.000Z",
    stage_started_at: "2026-07-30T11:18:05.000Z",
    updated_at: "2026-07-30T11:18:10.000Z",
    completed_at: published || failed ? "2026-07-30T11:18:10.000Z" : "",
    elapsed_ms: 10_000,
    retryable: status === "FAILED_RETRYABLE",
    blocked: status === "FAILED_BLOCKED",
    error_code: failed ? "TEST_SYNC_FAILURE" : "",
    attempt: 1,
    max_attempts: 3,
    recovered: false,
    switch_completed: published,
    health_verified: published,
  };
}

function renderPanel({
  capabilities = queueCapabilities,
  pendingStatus = pending,
  sync = null,
}: {
  capabilities?: ServerCapabilitiesData;
  pendingStatus?: PendingStatusData | null;
  sync?: SyncTransactionData | null;
} = {}) {
  render(
    <ServerSynchronizationPanel
      connectionState="available"
      capabilities={capabilities}
      pending={pendingStatus}
      sync={sync}
      loading={false}
      synchronizing={false}
      notice={null}
      error={null}
      onRefresh={vi.fn()}
      onSyncNow={vi.fn()}
    />,
  );
}

test("keeps legacy mode free of queue-only status and actions", () => {
  renderPanel({
    capabilities: {
      ...queueCapabilities,
      protocolMode: "legacy",
      queueModeActive: false,
    },
  });

  expect(screen.getByText("服务器尚未启用异步同步，当前仍使用即时发布模式。")).toBeVisible();
  expect(screen.queryByText("下次自动同步")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "立即同步" })).not.toBeInTheDocument();
});

test("shows the controller upgrade requirement for incompatible servers", () => {
  renderPanel({
    capabilities: {
      ...queueCapabilities,
      protocolMode: "incompatible",
      queueModeActive: false,
    },
    pendingStatus: null,
  });

  expect(screen.getByRole("alert")).toHaveTextContent("需要升级");
  expect(screen.queryByRole("button", { name: "立即同步" })).not.toBeInTheDocument();
});

test("shows active sync identity, stage, trigger, and distinct elapsed times", () => {
  renderPanel({ sync: syncTransaction("BUILDING") });

  const transaction = screen.getByLabelText("同步事务进度");
  expect(transaction).toHaveTextContent("构建网站");
  expect(transaction).toHaveTextContent("手动");
  expect(transaction).toHaveTextContent("5.0 秒");
  expect(transaction).toHaveTextContent("10 秒");
});

test("shows the complete published synchronization identity", () => {
  renderPanel({ sync: syncTransaction("PUBLISHED") });

  const transaction = screen.getByLabelText("同步事务进度");
  expect(within(transaction).getByText("release").closest("div")).toHaveTextContent(
    "release-queue-test",
  );
  expect(within(transaction).getByText("网站源码 SHA").closest("div")).toHaveTextContent(
    "3".repeat(40),
  );
  expect(within(transaction).getByText("上线时间").closest("div")).toHaveTextContent(
    "2026",
  );
});

test.each([
  ["FAILED_RETRYABLE", "服务器将在后续同步窗口重试"],
  ["FAILED_BLOCKED", "请上传修正后的新内容"],
] as const)("explains the %s recovery action", (status, message) => {
  renderPanel({ sync: syncTransaction(status) });
  expect(screen.getByText(new RegExp(message))).toBeVisible();
  expect(screen.queryByText(/retry-blocked/)).not.toBeInTheDocument();
});
