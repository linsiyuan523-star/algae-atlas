import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, DraftsPage, NewDraftPage } from "./DraftPages";
import type { Draft, DraftApi } from "../drafts";
import {
  createSharedRecordDraft,
  inspectRecordDraft,
} from "../schema-drafts";
import {
  emptyTeamNewsFormValues,
  validateTeamNewsRecordDraft,
} from "../forms/team-news";
import { batchOneFormAdapters } from "../forms/batch-one";

function makeDraft(titleZh = "初始标题"): Draft {
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
  const completed = validateTeamNewsRecordDraft(prepared.recordDraft, {
    ...emptyTeamNewsFormValues(),
    summaryZh: "仅用于组件测试的虚构摘要。",
    eventDate: "2026-07-23",
    category: "research",
    disclosureStatus: "pending",
  });
  if (!completed.success) {
    throw new Error("test team-news form must be valid");
  }
  return {
    formatVersion: 2,
    draftId: "11111111-1111-4111-8111-111111111111",
    recordDraft: completed.recordDraft,
    createdAt: "2026-07-23T08:00:00Z",
    updatedAt: "2026-07-23T08:00:00Z",
  };
}

const draft = makeDraft();

function makeScienceArticleDraft(): Draft {
  const prepared = createSharedRecordDraft(
    {
      contentType: "science-article",
      stableId: "fictional-science-article",
      titleZh: "虚构科普文章",
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  const adapter = batchOneFormAdapters["science-article"];
  const completed = adapter.validate(prepared.recordDraft, {
    ...adapter.emptyValues(),
    summaryZh: "仅用于组件测试的虚构科普摘要。",
    topic: "虚构藻类主题",
    targetAudienceLabel: "公众",
    articleKind: "foundation",
    publicationDate: "2026-07-23",
    targetAudience: "general",
    readingTimeMinutes: "8",
  });
  if (!completed.success) {
    throw new Error("test science-article form must be valid");
  }
  return { ...draft, recordDraft: completed.recordDraft };
}

function createApi(): DraftApi {
  return {
    createDraft: vi.fn(async (input) => ({ ...draft, recordDraft: input.recordDraft })),
    listDrafts: vi.fn(async () => [draft]),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(async (input) => ({
      ...draft,
      recordDraft: input.recordDraft,
      updatedAt: "2026-07-23T09:00:00Z",
    })),
    deleteDraft: vi.fn(async () => undefined),
    takeRecoveryDraft: vi.fn(async () => null),
  };
}

test("creates a draft from the shared content registry after field validation", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const onCreated = vi.fn();
  render(<NewDraftPage api={api} onCreated={onCreated} />);

  const typeSelect = screen.getByLabelText("内容类型");
  expect(within(typeSelect).getAllByRole("option")).toHaveLength(11);
  expect(within(typeSelect).getByRole("option", { name: "团队动态 / Team news" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "新建草稿" }));
  expect(api.createDraft).not.toHaveBeenCalled();
  expect(screen.getByText("必须使用小写英文、数字和单个连字符组成的稳定 ID")).toBeVisible();
  expect(screen.getByText("中文标题不能为空。")).toBeVisible();

  await user.type(screen.getByLabelText("稳定 ID"), "fictional-draft");
  await user.type(screen.getByLabelText("中文标题"), "虚构标题");
  await user.click(screen.getByRole("button", { name: "新建草稿" }));

  expect(api.createDraft).toHaveBeenCalledOnce();
  const input = vi.mocked(api.createDraft).mock.calls[0]?.[0];
  expect(input?.recordDraft).toMatchObject({
    schemaVersion: 1,
    id: "fictional-draft",
    type: "team-news",
    authors: [],
    tags: [],
    locales: {
      zh: { state: "draft", title: "虚构标题" },
      en: { state: "missing" },
    },
  });
  expect(onCreated).toHaveBeenCalledOnce();
});

test("lists, opens, manually saves, and deletes a schema-backed draft", async () => {
  const user = userEvent.setup();
  const api = createApi();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DraftsPage api={api} />);

  const openButton = await screen.findByRole("button", { name: "打开 初始标题" });
  await user.click(openButton);
  expect(api.openDraft).toHaveBeenCalledWith(draft.draftId);

  await user.selectOptions(screen.getByLabelText("内容类型"), "learning-resource");
  await user.type(screen.getByLabelText(/中文摘要/), "虚构学习资源摘要。");
  await user.type(screen.getByLabelText(/仪器或主题/), "虚构主题");
  await user.type(screen.getByLabelText(/适用对象说明/), "虚构读者");
  await user.type(screen.getByLabelText(/资源目的/), "虚构资源目的。");
  await user.type(screen.getByLabelText(/安全说明/), "不包含真实操作参数。");
  await user.type(
    screen.getByLabelText(/使用声明/),
    "不替代仪器手册、安全培训、监督或批准的 SOP。",
  );
  await user.selectOptions(screen.getByLabelText(/资源类型/), "beginner-guide");
  await user.selectOptions(
    screen.getByRole("combobox", { name: /^适用对象/ }),
    "students",
  );
  await user.type(screen.getByLabelText(/资源版本/), "1.0");
  await user.clear(screen.getByLabelText("稳定 ID"));
  await user.type(screen.getByLabelText("稳定 ID"), "fictional-article");
  await user.clear(screen.getByLabelText("中文标题"));
  await user.type(screen.getByLabelText("中文标题"), "虚构文章");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  const savedInput = vi.mocked(api.saveDraft).mock.calls[0]?.[0];
  expect(savedInput).toMatchObject({
    draftId: draft.draftId,
    recordDraft: {
      schemaVersion: 1,
      id: "fictional-article",
      type: "learning-resource",
      locales: { zh: { title: "虚构文章" } },
    },
  });
  expect(screen.getByText("已保存")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "删除" }));
  expect(window.confirm).toHaveBeenCalledWith("确定删除“虚构文章”？");
  expect(api.deleteDraft).toHaveBeenCalledWith(draft.draftId);
  expect(await screen.findByText("目前没有草稿。")).toBeVisible();
});

test("warns before discarding type-specific fields during a type switch", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<DraftsPage api={api} initialDraft={draft} />);

  await user.selectOptions(screen.getByLabelText("内容类型"), "learning-resource");
  expect(confirm).toHaveBeenCalledWith(
    "切换内容类型会清空当前类型的专用字段，确定继续？",
  );
  expect(screen.getByLabelText("内容类型")).toHaveValue("team-news");
  expect(screen.getByRole("heading", { name: "团队动态字段" })).toBeVisible();

  confirm.mockReturnValue(true);
  await user.selectOptions(screen.getByLabelText("内容类型"), "learning-resource");
  expect(screen.getByLabelText("内容类型")).toHaveValue("learning-resource");
  expect(screen.getByRole("heading", { name: "实验学习资源字段" })).toBeVisible();
});

test("validates and serializes the team-news pilot before saving", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<DraftsPage api={api} initialDraft={draft} />);

  expect(screen.getByRole("heading", { name: "团队动态字段" })).toBeVisible();
  expect(screen.getByLabelText("团队动态字段只读结构")).toHaveTextContent(
    '"shared.eventDate": "2026-07-23"',
  );

  await user.clear(screen.getByLabelText(/事件日期/));
  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(screen.getByText("事件日期不能为空。")).toBeVisible();

  await user.type(screen.getByLabelText(/事件日期/), "2026-07-25");
  await user.clear(screen.getByLabelText(/中文摘要/));
  await user.type(screen.getByLabelText(/中文摘要/), "更新后的虚构摘要。");
  await user.click(screen.getByLabelText("精选内容"));
  await user.type(screen.getByLabelText("负责作者稳定 ID"), "fictional-author");
  await user.type(screen.getByLabelText("主要来源标题"), "虚构来源");
  await user.type(
    screen.getByLabelText("主要来源链接"),
    "https://example.invalid/news",
  );
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft).toMatchObject({
    authors: ["fictional-author"],
    shared: {
      eventDate: "2026-07-25",
      pinned: true,
      sources: [{ href: "https://example.invalid/news" }],
    },
    locales: { zh: { summary: "更新后的虚构摘要。" } },
  });
});

test("validates and serializes a batch-one content form before saving", async () => {
  const user = userEvent.setup();
  const articleDraft = makeScienceArticleDraft();
  const api = createApi();
  api.listDrafts = vi.fn(async () => [articleDraft]);
  render(<DraftsPage api={api} initialDraft={articleDraft} />);

  expect(screen.getByRole("heading", { name: "科普文章字段" })).toBeVisible();
  expect(screen.getByLabelText(/阅读时长（分钟）/)).toHaveAttribute(
    "type",
    "number",
  );

  await user.clear(screen.getByLabelText(/中文摘要/));
  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(screen.getByText("中文摘要不能为空。")).toBeVisible();

  await user.type(screen.getByLabelText(/中文摘要/), "更新后的虚构科普摘要。");
  await user.clear(screen.getByLabelText(/阅读时长（分钟）/));
  await user.type(screen.getByLabelText(/阅读时长（分钟）/), "12");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft).toMatchObject({
    type: "science-article",
    shared: { readingTimeMinutes: 12 },
    locales: { zh: { summary: "更新后的虚构科普摘要。" } },
  });
});

test("debounces autosave, reports progress and failure, and warns while dirty", async () => {
  const user = userEvent.setup();
  const api = createApi();
  let resolveSave: ((saved: Draft) => void) | undefined;
  vi.mocked(api.saveDraft).mockImplementation(
    (input) =>
      new Promise((resolve) => {
        resolveSave = resolve;
        expect(inspectRecordDraft(input.recordDraft).fields.titleZh).toBe(
          "自动保存标题",
        );
      }),
  );
  render(
    <StrictMode>
      <DraftsPage api={api} initialDraft={draft} />
    </StrictMode>,
  );

  await user.clear(screen.getByLabelText("中文标题"));
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

  const recordDraft = vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft;
  await act(async () => {
    resolveSave?.({
      ...draft,
      recordDraft,
      updatedAt: "2026-07-23T09:00:00Z",
    });
    await Promise.resolve();
  });
  expect(screen.getByText("已保存")).toBeVisible();

  const cleanClose = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(cleanClose);
  expect(cleanClose.defaultPrevented).toBe(false);

  vi.mocked(api.saveDraft).mockRejectedValueOnce(new Error("磁盘已满"));
  await user.clear(screen.getByLabelText("稳定 ID"));
  await user.type(screen.getByLabelText("稳定 ID"), "retry-me");
  expect(
    await screen.findByText("保存失败：磁盘已满", undefined, {
      timeout: AUTOSAVE_DELAY_MS + 1_000,
    }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled();
});

test("shows field errors for an invalid stored record without invoking save", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const invalid: Draft = {
    ...draft,
    recordDraft: {
      schemaVersion: 99,
      id: "Bad ID",
      type: "unknown-type",
      locales: { zh: { title: "" } },
    },
  };
  api.listDrafts = vi.fn(async () => [invalid]);
  render(<DraftsPage api={api} initialDraft={invalid} />);

  expect(screen.getByText("请选择有效的内容类型。")).toBeVisible();
  expect(screen.getByText("必须使用小写英文、数字和单个连字符组成的稳定 ID")).toBeVisible();
  expect(screen.getByText("中文标题不能为空。")).toBeVisible();
  expect(screen.getByText("仅支持 Schema v1。")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(screen.getByText("保存失败：请修正标出的字段后重试。")).toBeVisible();
});
