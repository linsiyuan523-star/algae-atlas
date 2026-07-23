import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, DraftsPage, NewDraftPage } from "./DraftPages";
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
    takeRecoveryDraft: vi.fn(async () => null),
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
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(screen.getByText("已保存")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除“虚构标题”？");
  expect(api.deleteDraft).toHaveBeenCalledWith(draft.draftId);
  expect(await screen.findByText("目前没有草稿。")).toBeVisible();
});

test("debounces autosave, reports progress and failure, and warns while dirty", async () => {
  const user = userEvent.setup();
  const api = createApi();
  let resolveSave: ((saved: Draft) => void) | undefined;
  vi.mocked(api.saveDraft).mockImplementation(
    (input) =>
      new Promise((resolve) => {
        resolveSave = resolve;
        expect(input.titleZh).toBe("自动保存标题");
      }),
  );
  render(
    <StrictMode>
      <DraftsPage api={api} initialDraft={draft} />
    </StrictMode>,
  );

  await user.type(screen.getByLabelText("中文标题"), "自动保存标题");
  expect(screen.getByText("等待自动保存")).toBeVisible();
  expect(api.saveDraft).not.toHaveBeenCalled();

  const dirtyClose = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirtyClose);
  expect(dirtyClose.defaultPrevented).toBe(true);

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce(), {
    timeout: AUTOSAVE_DELAY_MS + 1_000,
  });
  expect(screen.getByText("保存中...")).toBeVisible();

  await act(async () => {
    resolveSave?.({
      ...draft,
      titleZh: "自动保存标题",
      updatedAt: "2026-07-23T09:00:00Z",
    });
    await Promise.resolve();
  });
  expect(screen.getByText("已保存")).toBeVisible();

  const cleanClose = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanClose);
  expect(cleanClose.defaultPrevented).toBe(false);

  vi.mocked(api.saveDraft).mockRejectedValueOnce(new Error("磁盘已满"));
  await user.type(screen.getByLabelText("稳定 ID"), "retry-me");
  expect(
    await screen.findByText("保存失败：磁盘已满", undefined, {
      timeout: AUTOSAVE_DELAY_MS + 1_000,
    }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled();
});
