import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { DraftsPage, NewDraftPage } from "./DraftPages";
import type { Draft, DraftApi } from "../drafts";

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
    listDrafts: vi.fn(async () => [draft]),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(async (input) => ({
      ...draft,
      ...input,
      updatedAt: "2026-07-23T09:00:00Z",
    })),
    deleteDraft: vi.fn(async () => undefined),
  };
}

test("creates a draft only after the explicit create command", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const onCreated = vi.fn();
  render(<NewDraftPage api={api} onCreated={onCreated} />);

  expect(api.createDraft).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "新建基础草稿" }));

  expect(api.createDraft).toHaveBeenCalledOnce();
  expect(onCreated).toHaveBeenCalledWith(draft);
});

test("lists, opens, manually saves, and deletes a draft", async () => {
  const user = userEvent.setup();
  const api = createApi();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DraftsPage api={api} />);

  const openButton = await screen.findByRole("button", { name: "打开 未命名草稿" });
  await user.click(openButton);
  expect(api.openDraft).toHaveBeenCalledWith(draft.draftId);

  await user.type(screen.getByLabelText("内容类型（占位）"), "placeholder-news");
  await user.type(screen.getByLabelText("稳定 ID"), "fictional-draft");
  await user.type(screen.getByLabelText("中文标题"), "虚构标题");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  expect(api.saveDraft).toHaveBeenCalledWith({
    draftId: draft.draftId,
    contentType: "placeholder-news",
    stableId: "fictional-draft",
    titleZh: "虚构标题",
  });
  expect(await screen.findByText("草稿已保存。")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除“虚构标题”？");
  expect(api.deleteDraft).toHaveBeenCalledWith(draft.draftId);
  expect(await screen.findByText("目前没有草稿。")).toBeVisible();
});
