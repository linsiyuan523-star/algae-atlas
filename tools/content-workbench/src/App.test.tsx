import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import App from "./App";
import type { Draft, DraftApi } from "./drafts";

const draft: Draft = {
  formatVersion: 1,
  draftId: "11111111-1111-4111-8111-111111111111",
  contentType: "",
  stableId: "",
  titleZh: "",
  createdAt: "2026-07-23T08:00:00Z",
  updatedAt: "2026-07-23T08:00:00Z",
};

function createApi(): DraftApi {
  return {
    createDraft: vi.fn(async () => draft),
    listDrafts: vi.fn(async () => []),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(async (input) => ({ ...draft, ...input })),
    deleteDraft: vi.fn(async () => undefined),
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
  expect(screen.getByRole("button", { name: "新建基础草稿" })).toBeVisible();

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
    ["诊断", "当前没有诊断信息。"],
  ] as const) {
    const navigationButton = within(navigation).getByRole("button", { name: title });
    await user.click(navigationButton);

    expect(navigationButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    expect(screen.getByText(emptyState)).toBeVisible();
  }
});

test("creates a basic draft and opens it in the drafts page", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.listDrafts = vi.fn(async () => [draft]);
  render(<App draftApi={api} />);

  await user.click(screen.getByRole("button", { name: "新建基础草稿" }));

  expect(api.createDraft).toHaveBeenCalledOnce();
  expect(await screen.findByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(screen.getByRole("heading", { name: "编辑草稿" })).toBeVisible();
  expect(screen.getByText(draft.draftId)).toBeVisible();
});
