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
import type { MediaApi, StagedImage } from "../media";

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
    formatVersion: 4,
    draftId: "11111111-1111-4111-8111-111111111111",
    recordDraft: completed.recordDraft,
    bodyZh: "",
    bodyEn: "",
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

function makeMachinePublishedEnglishDraft(): Draft {
  const article = makeScienceArticleDraft();
  const recordDraft = structuredClone(article.recordDraft) as Record<
    string,
    unknown
  >;
  const locales = recordDraft.locales as Record<string, unknown>;
  locales.en = {
    state: "published",
    title: "Fictional English article",
    summary: "Fictional English summary.",
    bodyFile: "en.md",
    fields: {
      topic: "Fictional algae topic",
      targetAudienceLabel: "General public",
    },
    translationOrigin: "machine-assisted",
    review: {
      status: "reviewed",
      updatedAt: "2026-07-23",
      reviewedAt: "2026-07-23",
      version: "1.0",
      reviewerIds: ["fictional-reviewer"],
      references: [],
    },
    publishedAt: "2026-07-23T09:00:00Z",
  };
  return {
    ...article,
    recordDraft,
    bodyEn: "## Fictional English body\n",
  };
}

function createApi(): DraftApi {
  return {
    createDraft: vi.fn(async (input) => ({
      ...draft,
      recordDraft: input.recordDraft,
      bodyZh: input.bodyZh,
      bodyEn: input.bodyEn,
      parkedEnglishLocale: input.parkedEnglishLocale,
    })),
    listDrafts: vi.fn(async () => [draft]),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(async (input) => ({
      ...draft,
      recordDraft: input.recordDraft,
      bodyZh: input.bodyZh,
      bodyEn: input.bodyEn,
      parkedEnglishLocale: input.parkedEnglishLocale,
      updatedAt: "2026-07-23T09:00:00Z",
    })),
    deleteDraft: vi.fn(async () => undefined),
    takeRecoveryDraft: vi.fn(async () => null),
  };
}

function makeStagedImage(): StagedImage {
  return {
    formatVersion: 1,
    draftId: draft.draftId,
    id: "22222222-2222-4222-8222-222222222222",
    originalName: "fictional-cover.png",
    stagedName: "22222222-2222-4222-8222-222222222222.png",
    targetPath:
      "public/images/uploads/2026/07/22222222-2222-4222-8222-222222222222.png",
    mimeType: "image/png",
    bytes: 1024,
    width: 640,
    height: 480,
    sha256: "a".repeat(64),
    uploadedAt: "2026-07-24T08:00:00Z",
    purpose: "cover",
    metadata: {
      creatorOrProvider: "",
      sourceUrl: "",
      licenseIdentifier: "",
      licenseName: "",
      licenseUrl: "",
      attribution: "",
      usageScope: "internal-only",
      rightsStatus: "pending",
      identificationStatus: "not-applicable",
      identifiablePeople: false,
      consentState: "not-applicable",
      consentReference: "",
      altZh: "",
      altEn: "",
      captionZh: "",
      captionEn: "",
    },
  };
}

function createMediaApi(images: StagedImage[] = []): MediaApi {
  return {
    stageImage: vi.fn(async () => images[0] ?? makeStagedImage()),
    listImages: vi.fn(async () => images),
    saveMetadata: vi.fn(async (_draftId, imageId, metadata) => ({
      ...(images.find((image) => image.id === imageId) ?? makeStagedImage()),
      metadata,
    })),
  };
}

function formControl(id: string) {
  const element = document.getElementById(id);
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    throw new Error(`missing form control: ${id}`);
  }
  return element;
}

function makeEmptyTeamNewsDraft(): Draft {
  const prepared = createSharedRecordDraft(
    {
      contentType: "team-news",
      stableId: "draft-b",
      titleZh: "Draft B",
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  return {
    ...draft,
    draftId: "33333333-3333-4333-8333-333333333333",
    recordDraft: prepared.recordDraft,
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
  expect(screen.queryByText("中文标题不能为空。")).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("稳定 ID"), "fictional-draft");
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
      zh: { state: "draft", title: "" },
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
  vi.mocked(api.saveDraft).mockClear();
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

test("clears draft A values when switching to draft B", async () => {
  const user = userEvent.setup();
  const draftA = makeDraft("Draft A");
  const recordA = structuredClone(draftA.recordDraft) as Record<string, unknown>;
  const localesA = recordA.locales as Record<string, unknown>;
  const zhA = localesA.zh as Record<string, unknown>;
  const sharedA = recordA.shared as Record<string, unknown>;
  zhA.summary = "A-only summary";
  sharedA.eventDate = "2026-07-24";
  recordA.id = "draft-a";
  draftA.recordDraft = recordA;
  const draftB = makeEmptyTeamNewsDraft();
  const byId = new Map([
    [draftA.draftId, draftA],
    [draftB.draftId, draftB],
  ]);
  const api = createApi();
  api.listDrafts = vi.fn(async () => [draftA, draftB]);
  api.openDraft = vi.fn(async (draftId) => {
    const selected = byId.get(draftId);
    if (!selected) {
      throw new Error("draft not found");
    }
    return selected;
  });

  render(<DraftsPage api={api} initialDraft={draftA} />);

  await waitFor(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      ".draft-list-panel button",
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[1]).toBeEnabled();
  });
  const listButtons = document.querySelectorAll<HTMLButtonElement>(
    ".draft-list-panel button",
  );
  await user.click(listButtons[1]!);

  await waitFor(() => {
    expect(formControl("draft-title-zh")).toHaveValue("Draft B");
    expect(formControl("draft-stable-id")).toHaveValue("draft-b");
    expect(formControl("team-news-summaryZh")).toHaveValue("");
    expect(formControl("team-news-eventDate")).toHaveValue("");
    expect(formControl("team-news-category")).toHaveValue("");
  });
  expect(formControl("team-news-summaryZh")).not.toHaveValue("A-only summary");
  expect(formControl("team-news-eventDate")).not.toHaveValue("2026-07-24");
});

test("reattaches a safely staged image after an interrupted draft autosave", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const image = makeStagedImage();
  render(<DraftsPage api={api} mediaApi={createMediaApi([image])} />);

  await user.click(await screen.findByRole("button", { name: "打开 初始标题" }));
  expect(await screen.findByText("1 张已暂存图片")).toBeVisible();
  expect(screen.getByText("等待自动保存")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  const saved = vi.mocked(api.saveDraft).mock.calls[0]?.[0];
  expect(saved?.recordDraft).toMatchObject({
    media: [image.id],
    shared: { coverMediaId: image.id },
  });
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

test("opens a live localized detail preview from the draft editor", async () => {
  const user = userEvent.setup();
  render(<DraftsPage api={createApi()} initialDraft={draft} />);

  await user.click(screen.getByRole("button", { name: "预览详情页" }));
  expect(screen.getByRole("heading", { name: "初始标题", level: 1 })).toBeVisible();
  expect(screen.getByText("仅用于组件测试的虚构摘要。")).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "中文正文编辑区" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "English" }));
  expect(
    screen.getByText("英文版本缺失").closest('[role="status"]'),
  ).toHaveTextContent("不会生成英文详情页");
  await user.click(screen.getByRole("button", { name: "返回编辑" }));
  expect(await screen.findByRole("textbox", { name: "中文正文编辑区" })).toBeVisible();
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
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft).toMatchObject({
    shared: { eventDate: "" },
  });
  vi.mocked(api.saveDraft).mockClear();

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
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft).toMatchObject({
    locales: { zh: { summary: "" } },
  });
  vi.mocked(api.saveDraft).mockClear();

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

test("saves a minimum draft without publication fields", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const incomplete = makeEmptyTeamNewsDraft();
  api.listDrafts = vi.fn(async () => [incomplete]);
  render(<DraftsPage api={api} initialDraft={incomplete} />);

  await user.clear(screen.getByLabelText("中文标题"));
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  const saved = vi.mocked(api.saveDraft).mock.calls[0]?.[0];
  expect(saved).toMatchObject({
    bodyZh: "",
    bodyEn: "",
    recordDraft: {
      locales: {
        zh: { title: "", summary: "" },
        en: { state: "missing" },
      },
      authors: [],
      shared: {
        eventDate: "",
        category: "",
        disclosureStatus: "",
      },
    },
  });
});

test("persists the safe Chinese body and its Markdown file reference", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const bodyDraft = { ...draft, bodyZh: "虚构正文\n" };
  api.listDrafts = vi.fn(async () => [bodyDraft]);
  render(<DraftsPage api={api} initialDraft={bodyDraft} />);

  expect(
    await screen.findByRole("textbox", { name: "中文正文编辑区" }),
  ).toHaveTextContent("虚构正文");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  const saved = vi.mocked(api.saveDraft).mock.calls[0]?.[0];
  expect(saved?.bodyZh).toBe("虚构正文\n");
  expect(saved?.recordDraft).toMatchObject({
    locales: { zh: { bodyFile: "zh.md" } },
  });
});

test("adds optional English while leaving new records missing by default", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<DraftsPage api={api} initialDraft={draft} />);

  const englishSwitch = screen.getByRole("switch", { name: "英文版本" });
  expect(englishSwitch).not.toBeChecked();
  expect(screen.queryByLabelText(/英文标题/)).not.toBeInTheDocument();

  await user.click(englishSwitch);
  expect(englishSwitch).toBeChecked();
  expect(screen.getByLabelText(/英文标题/)).toBeVisible();
  expect(screen.getByLabelText(/英文摘要/)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "英文正文编辑区" })).toBeVisible();
  expect(screen.getByLabelText("英文图片文字")).toHaveAttribute(
    "placeholder",
    "在英文正文插入图片占位后填写",
  );

  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0]).toMatchObject({
    bodyEn: "",
    recordDraft: { locales: { en: { state: "draft" } } },
  });
});

test("copies Chinese structure and exposes English image text placeholders", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const article = {
    ...makeScienceArticleDraft(),
    bodyZh: "## 虚构结构\n\n![中文图](media:fictional-image)\n",
  };
  api.listDrafts = vi.fn(async () => [article]);
  render(<DraftsPage api={api} initialDraft={article} />);

  await user.click(screen.getByRole("switch", { name: "英文版本" }));
  await user.click(screen.getByRole("button", { name: "复制中文结构" }));

  expect(screen.getByLabelText(/英文标题/)).toHaveValue("虚构科普文章");
  expect(screen.getByLabelText(/英文摘要/)).toHaveValue(
    "仅用于组件测试的虚构科普摘要。",
  );
  const imageText = screen.getByLabelText(/英文替代文字/);
  expect(imageText).toHaveValue("");
  await user.type(imageText, "Fictional microscopy image");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].bodyEn).toContain(
    "![Fictional microscopy image](media:fictional-image)",
  );
});

test("parks an English draft when disabled and restores it later", async () => {
  const user = userEvent.setup();
  const api = createApi();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<DraftsPage api={api} initialDraft={draft} />);

  const englishSwitch = screen.getByRole("switch", { name: "英文版本" });
  await user.click(englishSwitch);
  await user.type(screen.getByLabelText(/英文标题/), "Retained English draft");
  await user.click(englishSwitch);
  expect(englishSwitch).not.toBeChecked();
  expect(screen.queryByLabelText(/英文标题/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0]).toMatchObject({
    bodyEn: "",
    recordDraft: { locales: { en: { state: "missing" } } },
    parkedEnglishLocale: {
      contentType: "team-news",
      locale: { state: "draft", title: "Retained English draft" },
    },
  });

  await user.click(englishSwitch);
  expect(screen.getByLabelText(/英文标题/)).toHaveValue(
    "Retained English draft",
  );
});

test("moves Chinese to a publication candidate while English stays missing", async () => {
  const user = userEvent.setup();
  const api = createApi();
  render(<DraftsPage api={api} initialDraft={draft} />);

  const chineseWorkflow = screen.getByRole("region", {
    name: "中文语言状态",
  });
  await user.selectOptions(
    within(chineseWorkflow).getByLabelText("审核状态"),
    "reviewed",
  );
  await user.type(
    within(chineseWorkflow).getByLabelText("审核人稳定 ID"),
    "fictional-reviewer",
  );
  await user.type(
    within(chineseWorkflow).getByLabelText("审核日期"),
    "2026-07-23",
  );
  const state = within(chineseWorkflow).getByLabelText("语言状态");
  await user.selectOptions(state, "internal-review");
  await user.selectOptions(state, "approved");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveDraft).mock.calls[0]?.[0].recordDraft).toMatchObject({
    locales: {
      zh: { state: "approved", review: { status: "reviewed" } },
      en: { state: "missing" },
    },
  });
});

test("keeps complete validation on a publication candidate", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const incomplete = makeEmptyTeamNewsDraft();
  api.listDrafts = vi.fn(async () => [incomplete]);
  render(<DraftsPage api={api} initialDraft={incomplete} />);

  const chineseWorkflow = screen.getByRole("region", {
    name: "中文语言状态",
  });
  await user.selectOptions(
    within(chineseWorkflow).getByLabelText("审核状态"),
    "reviewed",
  );
  await user.type(
    within(chineseWorkflow).getByLabelText("审核人稳定 ID"),
    "fictional-reviewer",
  );
  await user.type(
    within(chineseWorkflow).getByLabelText("审核日期"),
    "2026-07-23",
  );
  const state = within(chineseWorkflow).getByLabelText("语言状态");
  await user.selectOptions(state, "internal-review");
  await user.selectOptions(state, "approved");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(screen.getByText("中文摘要不能为空。")).toBeVisible();
  expect(screen.getByText("事件日期不能为空。")).toBeVisible();
});

test("blocks machine-assisted published English without a human verifier", async () => {
  const user = userEvent.setup();
  const api = createApi();
  const published = makeMachinePublishedEnglishDraft();
  api.listDrafts = vi.fn(async () => [published]);
  render(<DraftsPage api={api} initialDraft={published} />);

  expect(screen.getByLabelText("英文来源")).toHaveValue("machine-assisted");
  expect(screen.getByLabelText("人工复核人稳定 ID")).toHaveValue("");
  await user.click(screen.getByRole("button", { name: "保存草稿" }));

  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(
    screen.getByText("机器辅助英文发布前必须记录人工复核人。"),
  ).toBeVisible();
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
  expect(screen.queryByText("中文标题不能为空。")).not.toBeInTheDocument();
  expect(screen.getByText("仅支持 Schema v1。")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "保存草稿" }));
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(screen.getByText("保存失败：请修正标出的字段后重试。")).toBeVisible();
});
