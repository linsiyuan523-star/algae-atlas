import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import App from "./App";
import type { Draft, DraftApi } from "./drafts";
import { createSharedRecordDraft } from "./schema-drafts";

function makeDraft(titleZh = "虚构标题"): Draft {
  const prepared = createSharedRecordDraft(
    {
      contentType: "team-news",
      stableId: "fictional-draft",
      titleZh,
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  return {
    formatVersion: 4,
    draftId: "11111111-1111-4111-8111-111111111111",
    recordDraft: prepared.recordDraft,
    bodyZh: "",
    bodyEn: "",
    createdAt: "2026-07-23T08:00:00Z",
    updatedAt: "2026-07-23T08:00:00Z",
  };
}

const draft = makeDraft();

function createApi(): DraftApi {
  return {
    createDraft: vi.fn(async (input) => ({
      ...draft,
      recordDraft: input.recordDraft,
      bodyZh: input.bodyZh,
      bodyEn: input.bodyEn,
      parkedEnglishLocale: input.parkedEnglishLocale,
    })),
    listDrafts: vi.fn(async () => []),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(async (input) => ({
      ...draft,
      recordDraft: input.recordDraft,
      bodyZh: input.bodyZh,
      bodyEn: input.bodyEn,
      parkedEnglishLocale: input.parkedEnglishLocale,
    })),
    deleteDraft: vi.fn(async () => undefined),
    takeRecoveryDraft: vi.fn(async () => null),
  };
}

test("switches between all workbench pages", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<App draftApi={api} />);

  expect(
    screen.getByRole("heading", { name: "藻类团队内容发布工作台" }),
  ).toBeInTheDocument();
  expect(screen.getByText("版本 0.1.0")).toBeVisible();
  expect(screen.getByRole("button", { name: "新建草稿" })).toBeVisible();

  const navigation = screen.getByRole("navigation", { name: "工作台导航" });
  expect(within(navigation).getAllByRole("button")).toHaveLength(5);

  const draftsButton = within(navigation).getByRole("button", { name: "草稿箱" });
  await user.click(draftsButton);
  expect(draftsButton).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(await screen.findByText("目前没有草稿。")).toBeVisible();

  for (const [title, emptyState] of [
    ["已提交", "目前没有已提交内容。"],
    ["设置", "当前没有可配置项。"],
  ] as const) {
    const navigationButton = within(navigation).getByRole("button", { name: title });
    await user.click(navigationButton);

    expect(navigationButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    expect(screen.getByText(emptyState)).toBeVisible();
  }

  const repositoryButton = within(navigation).getByRole("button", {
    name: "仓库导出",
  });
  await user.click(repositoryButton);
  expect(repositoryButton).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "仓库导出", level: 2 })).toBeVisible();
  expect(await screen.findByText("目前没有可导出的草稿。")).toBeVisible();
});

test("creates a shared-schema draft and opens it in the drafts page", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.listDrafts = vi.fn(async () => [draft]);
  render(<App draftApi={api} />);

  await user.type(screen.getByLabelText("稳定 ID"), "fictional-draft");
  await user.type(screen.getByLabelText("中文标题"), "虚构标题");
  await user.click(screen.getByRole("button", { name: "新建草稿" }));

  expect(api.createDraft).toHaveBeenCalledOnce();
  expect(api.createDraft).toHaveBeenCalledWith({
    bodyEn: "",
    bodyZh: "",
    recordDraft: expect.objectContaining({
      schemaVersion: 1,
      id: "fictional-draft",
      type: "team-news",
    }),
  });
  expect(await screen.findByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "编辑草稿" })).toBeVisible();
  expect(screen.getByText(draft.draftId)).toBeVisible();
});

test("offers the most recent draft once after an interrupted session", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const recovered = makeDraft("待恢复草稿");
  api.takeRecoveryDraft = vi.fn(async () => recovered);
  api.listDrafts = vi.fn(async () => [recovered]);
  render(
    <StrictMode>
      <App draftApi={api} />
    </StrictMode>,
  );

  expect(
    await screen.findByRole("status", { name: "异常恢复" }),
  ).toHaveTextContent("最近草稿：待恢复草稿");
  await user.click(screen.getByRole("button", { name: "恢复草稿" }));

  expect(api.takeRecoveryDraft).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status", { name: "异常恢复" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(screen.getByDisplayValue("待恢复草稿")).toBeVisible();
});

test("uses read-only browser fallbacks when Tauri is unavailable", async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "仓库导出" }));

  expect(await screen.findByText("目前没有可导出的草稿。")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
