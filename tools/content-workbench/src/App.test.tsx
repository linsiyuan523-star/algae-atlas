import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { expect, test, vi } from "vitest";
import App from "./App";
import type { Draft, DraftApi } from "./drafts";
import type { OnboardingApi, OnboardingStatus } from "./onboarding";
import type { RepositoryApi } from "./repository";
import { createSharedRecordDraft } from "./schema-drafts";
import type { ServerApi } from "./server";
import { openPublicSiteUrl } from "./external-navigation";
import {
  emptyTeamNewsFormValues,
  validateTeamNewsRecordDraft,
} from "./forms/team-news";

vi.mock("./external-navigation", () => ({
  openPublicSiteUrl: vi.fn(),
}));

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

function createServerApi(): ServerApi {
  return {
    testConnection: vi.fn(async () => ({
      ok: true,
      action: "connection",
      message: "SSH available",
    })),
    getStatus: vi.fn(async () => ({
      ok: true,
      action: "status",
      message: "Server ready",
      ready: true,
      contentRepositoryReady: true,
      serviceActive: true,
      healthy: true,
      publishProtocolVersion: 1,
    })),
    listContent: vi.fn(async () => ({
      ok: true,
      action: "list",
      message: "Listed",
      items: [],
    })),
    getPublishStatus: vi.fn(async ({ transactionId }) => ({
      ok: false,
      action: "publish-status",
      code: "TRANSACTION_NOT_FOUND",
      message: "Publish transaction was not found",
      transactionId,
    })),
    publishContent: vi.fn(async () => ({
      ok: true,
      action: "publish",
      message: "Published",
    })),
    deleteContent: vi.fn(async () => ({
      ok: true,
      action: "delete",
      message: "Deleted",
    })),
  };
}

function makePublishableDraft(): Draft {
  const base = makeDraft("可发布虚构标题");
  const prepared = validateTeamNewsRecordDraft(base.recordDraft, {
    ...emptyTeamNewsFormValues(),
    summaryZh: "仅用于直发集成测试的虚构摘要。",
    eventDate: "2026-07-26",
    category: "research",
    authorName: "虚构作者",
    sourceTitle: "",
    sourceUrl: "",
    disclosureStatus: "",
  });
  if (!prepared.success) {
    throw new Error("publishable test draft must be valid");
  }
  return {
    ...base,
    recordDraft: prepared.recordDraft,
    bodyZh: "## 仅用于测试的虚构正文\n",
  };
}

function createRepositoryApi(): RepositoryApi {
  return {
    dryRun: vi.fn(async (request) => ({
      diagnostics: {
        selectedPath: request.repositoryPath,
        canonicalRoot: request.repositoryPath,
        isGitRepository: true,
        currentBranch: "main",
        headSha: "a".repeat(40),
        worktreeClean: true,
        status: [],
        remotes: [],
        git: { available: true, version: "git version test" },
        node: { available: true, version: "v22.0.0" },
        projectScripts: [],
      },
      contentTargets: request.contentTargets.map((path: string) => ({
        path,
        category: "content" as const,
        state: "new" as const,
      })),
      imageTargets: request.imageTargets.map((path: string) => ({
        path,
        category: "image" as const,
        state: "new" as const,
      })),
      conflicts: [],
      plannedGitOperations: [],
      repositoryReady: true,
    })),
    commit: vi.fn(async (request) => ({
      branchName: request.plan.branchName,
      previousHeadSha: request.expectedHeadSha,
      commitSha: "b".repeat(40),
      commitMessage: `content: publish ${request.plan.recordId}`,
      committedPaths: [
        ...request.plan.contentTargets,
        ...request.plan.imageTargets,
      ],
    })),
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
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
  expect(screen.getByRole("heading", { name: "内容列表", level: 2 })).toBeVisible();

  const navigation = screen.getByRole("navigation", { name: "工作台导航" });
  expect(within(navigation).getAllByRole("button")).toHaveLength(7);

  await user.click(within(navigation).getByRole("button", { name: "新建内容" }));
  expect(screen.getByRole("button", { name: "新建草稿" })).toBeVisible();

  const draftsButton = within(navigation).getByRole("button", { name: "草稿箱" });
  await user.click(draftsButton);
  expect(draftsButton).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(await screen.findByText("目前没有草稿。")).toBeVisible();

  for (const title of ["服务器内容", "媒体库"] as const) {
    const navigationButton = within(navigation).getByRole("button", { name: title });
    await user.click(navigationButton);

    expect(navigationButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  }

  const serverSettingsButton = within(navigation).getByRole("button", {
    name: "服务器设置",
  });
  await user.click(serverSettingsButton);
  expect(serverSettingsButton).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "服务器设置", level: 2 })).toBeVisible();
  expect(screen.getByText("algae-server")).toBeVisible();

  const repositoryButton = within(navigation).getByRole("button", {
    name: "导入与导出",
  });
  await user.click(repositoryButton);
  expect(repositoryButton).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { name: "导入与导出", level: 2 })).toBeVisible();
  expect(await screen.findByText("目前没有可导出的草稿。")).toBeVisible();
  expect(screen.queryByText("GitHub Draft PR")).not.toBeInTheDocument();
  expect(within(navigation).queryByRole("button", { name: "已提交" })).not.toBeInTheDocument();
  expect(within(navigation).queryByRole("button", { name: "设置" })).not.toBeInTheDocument();
});

test("creates a shared-schema draft and opens it in the drafts page", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.listDrafts = vi.fn(async () => [draft]);
  render(<App draftApi={api} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "新建内容",
    }),
  );
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

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "新建内容",
    }),
  );
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
  await user.click(within(navigation).getByRole("button", { name: "内容列表" }));
  await user.click(within(navigation).getByRole("button", { name: "草稿箱" }));

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
  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "导入与导出",
    }),
  );

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

test("tests the SSH connection and reads server status", async () => {
  const user = userEvent.setup();
  const serverApi = createServerApi();
  render(<App draftApi={createApi()} serverApi={serverApi} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "服务器设置",
    }),
  );
  expect(screen.getByText("尚未检测")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "测试连接" }));

  expect(await screen.findByText("连接可用")).toBeVisible();
  expect(serverApi.testConnection).toHaveBeenCalledOnce();
  expect(serverApi.getStatus).toHaveBeenCalledOnce();
});

test("clears the server connection error after a successful retry", async () => {
  const user = userEvent.setup();
  const serverApi = createServerApi();
  vi.mocked(serverApi.testConnection)
    .mockResolvedValueOnce({
      ok: false,
      action: "connection",
      code: "SSH_TIMEOUT",
      message: "SSH unavailable",
    })
    .mockResolvedValueOnce({
      ok: true,
      action: "connection",
      message: "SSH available",
    });
  render(<App draftApi={createApi()} serverApi={serverApi} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "服务器设置",
    }),
  );
  await user.click(screen.getByRole("button", { name: "测试连接" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("SSH unavailable");

  await user.click(screen.getByRole("button", { name: "测试连接" }));
  expect(await screen.findByText("连接可用")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("loads server aliases and opens or edits matching content", async () => {
  const user = userEvent.setup();
  const api = createApi();
  api.listDrafts = vi.fn(async () => [draft]);
  api.openDraft = vi.fn(async () => draft);
  const serverApi = createServerApi();
  serverApi.listContent = vi.fn(async () => ({
    ok: true,
    action: "list",
    message: "Listed",
    items: [
      {
        contentType: "team-news" as const,
        stableId: "fictional-draft",
        title: "服务器虚构标题",
        urlZh: "https://sycszy.icu/zh/news/fictional-draft",
        status: "online",
        updatedAt: "2026-07-25T08:00:00Z",
      },
    ],
  }));
  const open = vi.mocked(openPublicSiteUrl);
  open.mockResolvedValue(undefined);
  render(<App draftApi={api} serverApi={serverApi} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "服务器内容",
    }),
  );

  expect(await screen.findByText("服务器虚构标题")).toBeVisible();
  expect(screen.getByRole("link", {
    name: "https://sycszy.icu/zh/news/fictional-draft",
  })).toBeVisible();
  expect(screen.getByText("已发布")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "查看 服务器虚构标题" }));
  expect(open).toHaveBeenCalledWith("https://sycszy.icu/zh/news/fictional-draft");

  open.mockRejectedValueOnce(new Error("Windows could not open the public website."));
  await user.click(screen.getByRole("button", { name: "查看 服务器虚构标题" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法打开线上页面：Windows could not open the public website.",
  );

  await user.click(screen.getByRole("button", { name: "编辑 服务器虚构标题" }));
  expect(await screen.findByRole("heading", { name: "草稿箱", level: 2 })).toBeVisible();
  expect(screen.getByDisplayValue("虚构标题")).toBeVisible();
  expect(api.openDraft).toHaveBeenCalledWith(draft.draftId);
});

test("deletes server content after the exact single confirmation", async () => {
  const user = userEvent.setup();
  const serverApi = createServerApi();
  serverApi.listContent = vi.fn(async () => ({
    ok: true,
    action: "list",
    message: "Listed",
    items: [
      {
        contentType: "team-news" as const,
        stableId: "fictional-draft",
        titleZh: "待删除内容",
        zhUrl: "https://example.invalid/zh/fictional-draft",
      },
    ],
  }));
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App draftApi={createApi()} serverApi={serverApi} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "服务器内容",
    }),
  );
  await user.click(
    await screen.findByRole("button", { name: "删除 待删除内容" }),
  );

  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(
    "删除后该网页将从线上移除，但服务器会保留历史版本。确认删除？",
  );
  expect(serverApi.deleteContent).toHaveBeenCalledWith({
    contentType: "team-news" as const,
    stableId: "fictional-draft",
  });
  await waitFor(() =>
    expect(screen.queryByText("待删除内容")).not.toBeInTheDocument(),
  );
});

test("keeps server content visible and disables deletion after an SSH failure", async () => {
  const user = userEvent.setup();
  const serverApi = createServerApi();
  serverApi.listContent = vi.fn(async () => ({
    ok: true,
    action: "list",
    message: "Listed",
    items: [
      {
        contentType: "team-news" as const,
        stableId: "fictional-draft",
        titleZh: "保留的线上内容",
        zhUrl: "https://example.invalid/zh/fictional-draft",
      },
    ],
  }));
  serverApi.deleteContent = vi.fn(async () => ({
    ok: false,
    action: "delete",
    code: "SSH_TIMEOUT",
    message: "SSH unavailable",
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App draftApi={createApi()} serverApi={serverApi} />);

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "服务器内容",
    }),
  );
  const deleteButton = await screen.findByRole("button", {
    name: "删除 保留的线上内容",
  });
  await user.click(deleteButton);

  expect(await screen.findByRole("alert")).toHaveTextContent("SSH unavailable");
  expect(screen.getByText("保留的线上内容")).toBeVisible();
  expect(deleteButton).toBeDisabled();
});

test("surfaces editor deletion failures without marking the server unavailable", async () => {
  const user = userEvent.setup();
  const draftApi = createApi();
  draftApi.listDrafts = vi.fn(async () => [draft]);
  draftApi.openDraft = vi.fn(async () => draft);
  const serverApi = createServerApi();
  serverApi.listContent = vi.fn(async () => ({
    ok: true,
    action: "list",
    message: "Listed",
    items: [
      {
        contentType: "team-news" as const,
        stableId: "fictional-draft",
        titleZh: "Published fixture",
        zhUrl: "https://example.invalid/zh/fictional-draft",
      },
    ],
  }));
  serverApi.deleteContent = vi.fn(async () => ({
    ok: false,
    action: "delete",
    code: "DELETE_VERIFICATION_FAILED",
    message: "Delete verification failed",
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<App draftApi={draftApi} serverApi={serverApi} />);

  const navigation = screen.getByRole("navigation");
  await user.click(
    within(navigation).getByRole("button", { name: "草稿箱" }),
  );
  await user.click(await screen.findByRole("button", { name: "打开 虚构标题" }));
  await user.click(
    await screen.findByRole("button", { name: "从服务器删除" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Delete verification failed",
  );
  expect(serverApi.deleteContent).toHaveBeenCalledOnce();

  await user.click(
    within(navigation).getByRole("button", { name: "服务器设置" }),
  );
  expect(screen.getByText("连接可用")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("checks SSH before creating one direct Bundle commit and publishing it", async () => {
  const user = userEvent.setup();
  const publishable = makePublishableDraft();
  const draftApi = createApi();
  draftApi.listDrafts = vi.fn(async () => [publishable]);
  draftApi.openDraft = vi.fn(async () => publishable);
  const onboardingApi = createOnboardingApi();
  onboardingApi.status = vi.fn(async () => onboardingStatus(true));
  const repositoryApi = createRepositoryApi();
  const serverApi = createServerApi();
  const open = vi.mocked(openPublicSiteUrl);
  open.mockResolvedValue(undefined);
  serverApi.publishContent = vi.fn<ServerApi["publishContent"]>(async () => ({
    ok: true,
    action: "publish",
    message: "Published",
    contentType: "team-news",
    stableId: "fictional-draft",
    url: "https://sycszy.icu/zh/news/fictional-draft",
    releaseSha: "c".repeat(40),
    publishedAt: "2026-07-26T09:00:00Z",
  }));

  render(
    <App
      draftApi={draftApi}
      onboardingApi={onboardingApi}
      repositoryApi={repositoryApi}
      serverApi={serverApi}
    />,
  );

  const navigation = await screen.findByRole("navigation", {
    name: "工作台导航",
  });
  await user.click(within(navigation).getByRole("button", { name: "草稿箱" }));
  await user.click(await screen.findByRole("button", { name: "打开 可发布虚构标题" }));
  await user.click(
    await screen.findByRole("button", { name: "发布到服务器" }),
  );

  await waitFor(() => expect(serverApi.testConnection).toHaveBeenCalled());
  await waitFor(() => expect(serverApi.getStatus).toHaveBeenCalled());
  await waitFor(() => expect(repositoryApi.dryRun).toHaveBeenCalledOnce());
  await waitFor(() => expect(repositoryApi.commit).toHaveBeenCalledOnce());
  await waitFor(() => expect(serverApi.publishContent).toHaveBeenCalledOnce());
  const dryRunRequest = vi.mocked(repositoryApi.dryRun).mock.calls[0]?.[0];
  const commitRequest = vi.mocked(repositoryApi.commit).mock.calls[0]?.[0];
  expect(dryRunRequest).toMatchObject({
    repositoryPath: "D:\\fictional-worktree",
    recordId: "fictional-draft",
    contentType: "team-news",
    directPublish: true,
  });
  expect(dryRunRequest?.branchName).toMatch(
    /^content\/direct-[0-9a-f]{32}-fictional-draft$/,
  );
  expect(commitRequest?.plan.branchName).toBe(dryRunRequest?.branchName);
  const recordFile = commitRequest?.textFiles.find((file) =>
    file.path.endsWith("/record.json"),
  );
  expect(recordFile).toBeDefined();
  expect(JSON.parse(recordFile?.contents ?? "{}")).toMatchObject({
    authors: [],
    shared: { disclosureStatus: "pending", sources: [] },
    locales: { zh: { fields: { authorName: "虚构作者" } } },
  });
  const publishRequest = vi.mocked(serverApi.publishContent).mock.calls[0]?.[0];
  expect(publishRequest).toMatchObject({
    repositoryPath: "D:\\fictional-worktree",
    contentType: "team-news",
    stableId: "fictional-draft",
    transactionId: expect.stringMatching(/^[0-9a-f]{32}$/),
  });
  expect(vi.mocked(serverApi.publishContent).mock.calls[0]?.[1]).toEqual(
    expect.any(Function),
  );
  expect(dryRunRequest?.branchName).toBe(
    `content/direct-${publishRequest?.transactionId}-fictional-draft`,
  );
  expect(vi.mocked(serverApi.testConnection).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(serverApi.getStatus).mock.invocationCallOrder[0]!,
  );
  expect(vi.mocked(serverApi.getStatus).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(repositoryApi.dryRun).mock.invocationCallOrder[0]!,
  );
  expect(vi.mocked(repositoryApi.dryRun).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(repositoryApi.commit).mock.invocationCallOrder[0]!,
  );
  expect(vi.mocked(repositoryApi.commit).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(serverApi.publishContent).mock.invocationCallOrder[0]!,
  );
  await waitFor(() =>
    expect(document.querySelector(".publish-result")).toHaveTextContent("Published"),
  );
  const publishedLink = screen.getByRole("link", { name: "打开线上页面" });
  expect(publishedLink).toHaveAttribute(
    "href",
    "https://sycszy.icu/zh/news/fictional-draft",
  );
  await user.click(publishedLink);
  expect(open).toHaveBeenCalledWith(
    "https://sycszy.icu/zh/news/fictional-draft",
  );

  open.mockRejectedValueOnce(new Error("Windows could not open the public website."));
  await user.click(publishedLink);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "无法打开线上页面：Windows could not open the public website.",
  );
  expect(screen.getByRole("button", { name: "保存并更新服务器" })).toBeEnabled();
});

test("rejects an old controller before creating a local publish commit", async () => {
  const user = userEvent.setup();
  const publishable = makePublishableDraft();
  const draftApi = createApi();
  draftApi.listDrafts = vi.fn(async () => [publishable]);
  draftApi.openDraft = vi.fn(async () => publishable);
  const onboardingApi = createOnboardingApi();
  onboardingApi.status = vi.fn(async () => onboardingStatus(true));
  const repositoryApi = createRepositoryApi();
  const serverApi = createServerApi();
  serverApi.getStatus = vi.fn(async () => ({
    ok: true,
    action: "status",
    message: "Legacy controller is healthy",
    ready: true,
    contentRepositoryReady: true,
    serviceActive: true,
    healthy: true,
  }));

  render(
    <App
      draftApi={draftApi}
      onboardingApi={onboardingApi}
      repositoryApi={repositoryApi}
      serverApi={serverApi}
    />,
  );

  const navigation = await screen.findByRole("navigation", {
    name: "工作台导航",
  });
  await user.click(within(navigation).getByRole("button", { name: "草稿箱" }));
  await user.click(await screen.findByRole("button", { name: "打开 可发布虚构标题" }));
  await user.click(screen.getByRole("button", { name: "发布到服务器" }));

  const panel = await screen.findByRole("region", { name: "当前发布状态" });
  expect(within(panel).getAllByText(/服务器控制器版本过旧/).length).toBeGreaterThan(0);
  expect(within(panel).getByText(/不会自动重试/)).toBeVisible();
  expect(screen.getByRole("button", { name: "结束本地事务" })).toBeEnabled();
  expect(serverApi.testConnection).toHaveBeenCalledOnce();
  expect(serverApi.getStatus).toHaveBeenCalledOnce();
  expect(repositoryApi.dryRun).not.toHaveBeenCalled();
  expect(repositoryApi.commit).not.toHaveBeenCalled();
  expect(serverApi.publishContent).not.toHaveBeenCalled();
});

test("queries and resumes the same transaction without another local commit", async () => {
  const user = userEvent.setup();
  const transactionId = "f".repeat(32);
  const publishable = makePublishableDraft();
  const draftApi = createApi();
  draftApi.listDrafts = vi.fn(async () => [publishable]);
  draftApi.openDraft = vi.fn(async () => publishable);
  const onboardingApi = createOnboardingApi();
  onboardingApi.status = vi.fn(async () => onboardingStatus(true));
  const repositoryApi = createRepositoryApi();
  const serverApi = createServerApi();
  serverApi.getPublishStatus = vi.fn(async () => ({
    ok: true,
    action: "publish-status",
    message: "Temporary source network failure",
    transactionId,
    status: "failed" as const,
    stage: "preparing_site_source" as const,
    failedStage: "preparing_site_source",
    updatedAt: "2026-07-29T12:00:00Z",
    elapsedMs: 12_000,
    attempt: 1,
    retryable: true,
  }));
  serverApi.publishContent = vi.fn(async (request) => ({
    ok: true,
    action: "publish",
    message: "Resumed publish succeeded",
    transactionId: request.transactionId,
    status: "succeeded" as const,
    stage: "succeeded" as const,
    updatedAt: "2026-07-29T12:00:20Z",
    elapsedMs: 32_000,
    attempt: 2,
    retryable: false,
    contentCommit: "1".repeat(40),
    siteCommit: "2".repeat(40),
    releaseId: "20260729T120020Z-resumed",
  }));
  localStorage.setItem(
    `algae-content-workbench:publish:${publishable.draftId}`,
    JSON.stringify({
      transactionId,
      status: "failed",
      stage: "preparing_site_source",
      failedStage: "preparing_site_source",
      message: "Temporary source network failure",
      updatedAt: "2026-07-29T12:00:00Z",
      elapsedMs: 12_000,
      attempt: 1,
      retryable: true,
      serverStarted: true,
      safeToRetry: true,
    }),
  );

  render(
    <App
      draftApi={draftApi}
      onboardingApi={onboardingApi}
      repositoryApi={repositoryApi}
      serverApi={serverApi}
    />,
  );
  const navigation = await screen.findByRole("navigation", {
    name: "工作台导航",
  });
  await user.click(within(navigation).getByRole("button", { name: "草稿箱" }));
  await user.click(await screen.findByRole("button", { name: "打开 可发布虚构标题" }));
  await user.click(await screen.findByRole("button", { name: "安全重试" }));

  await waitFor(() => expect(serverApi.getPublishStatus).toHaveBeenCalledOnce());
  await waitFor(() => expect(serverApi.publishContent).toHaveBeenCalledOnce());
  expect(serverApi.getPublishStatus).toHaveBeenCalledWith({ transactionId });
  expect(vi.mocked(serverApi.publishContent).mock.calls[0]?.[0]).toMatchObject({
    transactionId,
    stableId: "fictional-draft",
  });
  expect(serverApi.testConnection).not.toHaveBeenCalled();
  expect(repositoryApi.dryRun).not.toHaveBeenCalled();
  expect(repositoryApi.commit).not.toHaveBeenCalled();
  expect(vi.mocked(serverApi.getPublishStatus).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(serverApi.publishContent).mock.invocationCallOrder[0]!,
  );
  await waitFor(() =>
    expect(document.querySelector(".publish-result")).toHaveTextContent(
      "20260729T120020Z-resumed",
    ),
  );
});

test("keeps a transaction retryable when its recovery status query is interrupted", async () => {
  const user = userEvent.setup();
  const transactionId = "e".repeat(32);
  const publishable = makePublishableDraft();
  const draftApi = createApi();
  draftApi.listDrafts = vi.fn(async () => [publishable]);
  draftApi.openDraft = vi.fn(async () => publishable);
  const onboardingApi = createOnboardingApi();
  onboardingApi.status = vi.fn(async () => onboardingStatus(true));
  const repositoryApi = createRepositoryApi();
  const serverApi = createServerApi();
  serverApi.getPublishStatus = vi.fn(async () => ({
    ok: false,
    action: "publish-status",
    code: "SSH_TIMEOUT",
    message: "Status connection timed out",
  }));
  localStorage.setItem(
    `algae-content-workbench:publish:${publishable.draftId}`,
    JSON.stringify({
      transactionId,
      status: "failed",
      stage: "preparing_site_source",
      failedStage: "preparing_site_source",
      startedAt: "2026-07-29T12:00:00Z",
      updatedAt: "2026-07-29T12:00:12Z",
      elapsedMs: 12_000,
      attempt: 2,
      retryable: true,
      serverStarted: true,
      safeToRetry: true,
    }),
  );

  render(
    <App
      draftApi={draftApi}
      onboardingApi={onboardingApi}
      repositoryApi={repositoryApi}
      serverApi={serverApi}
    />,
  );
  const navigation = await screen.findByRole("navigation", {
    name: "工作台导航",
  });
  await user.click(within(navigation).getByRole("button", { name: "草稿箱" }));
  await user.click(await screen.findByRole("button", { name: "打开 可发布虚构标题" }));
  await user.click(await screen.findByRole("button", { name: "安全重试" }));

  await waitFor(() => expect(serverApi.getPublishStatus).toHaveBeenCalledWith({ transactionId }));
  expect(serverApi.publishContent).not.toHaveBeenCalled();
  expect(repositoryApi.dryRun).not.toHaveBeenCalled();
  expect(repositoryApi.commit).not.toHaveBeenCalled();
  await waitFor(() => {
    const stored = JSON.parse(
      localStorage.getItem(
        `algae-content-workbench:publish:${publishable.draftId}`,
      ) ?? "{}",
    );
    expect(stored).toMatchObject({
      transactionId,
      status: "failed",
      retryable: true,
      attempt: 2,
      errorCode: "SSH_TIMEOUT",
      failedStage: "confirming_server_status",
    });
  });
});
