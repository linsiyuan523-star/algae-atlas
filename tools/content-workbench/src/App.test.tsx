import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import App from "./App";
import type { Draft, DraftApi } from "./drafts";
import type { OnboardingApi, OnboardingStatus } from "./onboarding";
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

function onboardingStatus(configured: boolean): OnboardingStatus {
  return {
    configured,
    ...(configured
      ? {
          configuration: {
            formatVersion: 1,
            repositoryPath: "D:\\fictional-worktree",
            draftsDirectory: "D:\\drafts",
            stagingDirectory: "D:\\staging",
          },
        }
      : {}),
    defaults: {
      draftsDirectory: "D:\\drafts",
      stagingDirectory: "D:\\staging",
    },
    activeStorage: {
      draftsDirectory: "D:\\drafts",
      stagingDirectory: "D:\\staging",
    },
    restartRequired: false,
    diagnostics: {
      tools: [],
      paths: [],
      localGit: {
        inspected: false,
        isRepository: false,
        statusEntries: 0,
      },
      imageCapabilities: {
        supportedInputFormats: ["JPEG", "PNG", "WebP"],
        outputFormat: "WebP",
        maxSourceBytes: 20 * 1024 * 1024,
        privacyMetadataRemoved: true,
      },
      applicationData: {
        appDataDirectory: "D:\\app-data",
        configurationFile: "D:\\app-data\\configuration.json",
        draftCount: 0,
        stagedImageCount: 0,
      },
    },
  };
}

function createOnboardingApi(): OnboardingApi {
  return {
    status: vi.fn(async () => onboardingStatus(false)),
    saveConfiguration: vi.fn(async () => onboardingStatus(true)),
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

test("rehydrates every saved field after leaving and reopening the same draft", async () => {
  const user = userEvent.setup();
  const storage: { draft: Draft | null } = { draft: null };
  const api: DraftApi = {
    createDraft: vi.fn(async (input) => {
      storage.draft = {
        ...draft,
        recordDraft: input.recordDraft,
        bodyZh: input.bodyZh,
        bodyEn: input.bodyEn,
        parkedEnglishLocale: input.parkedEnglishLocale,
      };
      return storage.draft;
    }),
    listDrafts: vi.fn(async () => (storage.draft ? [storage.draft] : [])),
    openDraft: vi.fn(async (draftId) => {
      if (!storage.draft || storage.draft.draftId !== draftId) {
        throw new Error("draft not found");
      }
      return storage.draft;
    }),
    saveDraft: vi.fn(async (input) => {
      if (!storage.draft) {
        throw new Error("draft not found");
      }
      storage.draft = {
        ...storage.draft,
        recordDraft: input.recordDraft,
        bodyZh: input.bodyZh,
        bodyEn: input.bodyEn,
        parkedEnglishLocale: input.parkedEnglishLocale,
        updatedAt: "2026-07-23T09:00:00Z",
      };
      return storage.draft;
    }),
    deleteDraft: vi.fn(async () => undefined),
    takeRecoveryDraft: vi.fn(async () => null),
  };

  render(<App draftApi={api} />);

  await user.type(formControl("new-stable-id"), "reopen-regression");
  await user.type(formControl("new-title-zh"), "Initial title");
  await user.click(
    document.querySelector<HTMLButtonElement>(
      ".new-draft-action button[type='submit']",
    )!,
  );
  await waitFor(() => expect(document.getElementById("draft-title-zh")).not.toBeNull());

  await user.clear(formControl("draft-title-zh"));
  await user.type(formControl("draft-title-zh"), "Saved title");
  await user.clear(formControl("team-news-summaryZh"));
  await user.type(formControl("team-news-summaryZh"), "Saved summary");
  await user.clear(formControl("team-news-eventDate"));
  await user.type(formControl("team-news-eventDate"), "2026-07-25");
  await user.selectOptions(formControl("team-news-category"), "teaching");
  await user.selectOptions(formControl("team-news-disclosureStatus"), "approved");
  await user.click(
    document.querySelector<HTMLButtonElement>(
      ".draft-editor-actions button[type='submit']",
    )!,
  );

  await waitFor(() => expect(api.saveDraft).toHaveBeenCalledOnce());
  expect(storage.draft?.recordDraft).toMatchObject({
    id: "reopen-regression",
    locales: {
      zh: { title: "Saved title", summary: "Saved summary" },
    },
    shared: { eventDate: "2026-07-25", category: "teaching", disclosureStatus: "approved" },
  });

  const navigation = screen.getByRole("navigation");
  const navigationButtons = within(navigation).getAllByRole("button");
  await user.click(navigationButtons[0]!);
  await user.click(navigationButtons[1]!);

  await waitFor(() => {
    const listButton = document.querySelector<HTMLButtonElement>(
      ".draft-list-panel button",
    );
    expect(listButton).not.toBeNull();
    expect(listButton).toBeEnabled();
  });
  await user.click(document.querySelector<HTMLButtonElement>(".draft-list-panel button")!);

  await waitFor(() => {
    expect(formControl("draft-title-zh")).toHaveValue("Saved title");
    expect(formControl("team-news-summaryZh")).toHaveValue("Saved summary");
    expect(formControl("team-news-eventDate")).toHaveValue("2026-07-25");
    expect(formControl("team-news-category")).toHaveValue("teaching");
    expect(formControl("team-news-disclosureStatus")).toHaveValue("approved");
  });
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

test("holds the workbench behind first-run configuration until local paths are saved", async () => {
  const user = userEvent.setup();
  const onboardingApi = createOnboardingApi();
  render(<App draftApi={createApi()} onboardingApi={onboardingApi} />);

  expect(await screen.findByRole("heading", { name: "首次启动设置", level: 2 })).toBeVisible();
  expect(screen.queryByRole("navigation", { name: "工作台导航" })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText("本地仓库"), "D:\\fictional-worktree");
  await user.click(screen.getByRole("button", { name: "保存本地配置" }));

  expect(await screen.findByRole("navigation", { name: "工作台导航" })).toBeVisible();
  expect(onboardingApi.saveConfiguration).toHaveBeenCalledWith({
    repositoryPath: "D:\\fictional-worktree",
    draftsDirectory: "D:\\drafts",
    stagingDirectory: "D:\\staging",
  });
});
