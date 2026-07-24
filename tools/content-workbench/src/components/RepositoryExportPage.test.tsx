import {
  validMarkdownFixture,
  validRecordFixtures,
} from "@algae-atlas/content-schema/fixtures";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Draft, DraftApi } from "../drafts";
import type { MediaApi, StagedImage } from "../media";
import type {
  RepositoryApi,
  RepositoryDryRunResult,
} from "../repository";
import { RepositoryExportPage } from "./RepositoryExportPage";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const RECORD_ID = "fictional-export-page";

function draftFixture(): Draft {
  const record = structuredClone(validRecordFixtures["science-article"]);
  record.id = RECORD_ID;
  record.media = [IMAGE_ID];
  (record.shared as Record<string, unknown>).coverMediaId = IMAGE_ID;
  return {
    formatVersion: 4,
    draftId: DRAFT_ID,
    recordDraft: record,
    bodyZh: validMarkdownFixture,
    bodyEn: "",
    createdAt: "2026-07-24T08:00:00Z",
    updatedAt: "2026-07-24T08:00:00Z",
  };
}

function imageFixture(): StagedImage {
  return {
    formatVersion: 2,
    draftId: DRAFT_ID,
    id: IMAGE_ID,
    originalName: "fictional-cover.png",
    stagedName: `${IMAGE_ID}.webp`,
    targetPath: `public/images/uploads/2026/07/${IMAGE_ID}.webp`,
    mimeType: "image/webp",
    bytes: 2048,
    width: 960,
    height: 640,
    sha256: "b".repeat(64),
    uploadedAt: "2026-07-24T08:00:00Z",
    purpose: "cover",
    metadata: {
      creatorOrProvider: "Fictional provider",
      sourceUrl: "",
      licenseIdentifier: "permission-granted",
      licenseName: "Fictional permission",
      licenseUrl: "",
      attribution: "Fictional fixture only",
      usageScope: "public-site",
      rightsStatus: "approved",
      identificationStatus: "not-applicable",
      identifiablePeople: false,
      consentState: "not-applicable",
      consentReference: "",
      altZh: "虚构测试封面",
      altEn: "",
      captionZh: "",
      captionEn: "",
    },
    processing: {
      sourceSha256: "c".repeat(64),
      sourceMimeType: "image/png",
      sourceBytes: 4096,
      privacyMetadataRemoved: true,
      originalRetained: false,
      thumbnail: {
        stagedName: `${IMAGE_ID}.thumbnail.webp`,
        targetPath: `public/images/uploads/2026/07/${IMAGE_ID}.thumbnail.webp`,
        mimeType: "image/webp",
        bytes: 512,
        width: 480,
        height: 320,
        sha256: "d".repeat(64),
      },
    },
  };
}

function draftApi(draft: Draft): DraftApi {
  return {
    createDraft: vi.fn(),
    listDrafts: vi.fn(async () => [draft]),
    openDraft: vi.fn(async () => draft),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    takeRecoveryDraft: vi.fn(async () => null),
  };
}

function emptyDraftApi(): DraftApi {
  return {
    createDraft: vi.fn(),
    listDrafts: vi.fn(async () => []),
    openDraft: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    takeRecoveryDraft: vi.fn(async () => null),
  };
}

function mediaApi(image: StagedImage): MediaApi {
  return {
    stageImage: vi.fn(),
    listImages: vi.fn(async () => [image]),
    saveMetadata: vi.fn(),
  };
}

function backendResult(
  request: Parameters<RepositoryApi["dryRun"]>[0],
  blocked = false,
): RepositoryDryRunResult {
  return {
    diagnostics: {
      selectedPath: request.repositoryPath,
      canonicalRoot: request.repositoryPath,
      isGitRepository: true,
      currentBranch: "main",
      headSha: "a".repeat(40),
      worktreeClean: !blocked,
      status: blocked ? ["?? operator-note.txt"] : [],
      remotes: [],
      git: { available: true, version: "git version 2.51.0.windows.1" },
      node: { available: true, version: "v22.23.1" },
      projectScripts: [
        { name: "check", command: "npm run check:schema && tsc --noEmit" },
      ],
    },
    contentTargets: request.contentTargets.map((path) => ({
      path,
      category: "content",
      state: "new",
    })),
    imageTargets: request.imageTargets.map((path) => ({
      path,
      category: "image",
      state: "new",
    })),
    conflicts: blocked
      ? [
          {
            code: "WORKTREE_DIRTY",
            message: "工作区包含已修改、已暂存或未跟踪文件。",
          },
        ]
      : [],
    plannedGitOperations: [
      {
        program: "git",
        args: ["switch", "-c", request.branchName],
        description: "创建本地内容分支",
      },
    ],
    repositoryReady: !blocked,
  };
}

test("selects a draft and renders repository, target, Schema and Git dry-run output", async () => {
  const user = userEvent.setup();
  const draft = draftFixture();
  const commit = vi.fn(async (request: Parameters<RepositoryApi["commit"]>[0]) => ({
    branchName: request.plan.branchName,
    previousHeadSha: request.expectedHeadSha,
    commitSha: "b".repeat(40),
    commitMessage: `content: publish ${request.plan.recordId}`,
    committedPaths: [...request.plan.contentTargets, ...request.plan.imageTargets],
  }));
  const repositoryApi: RepositoryApi = {
    dryRun: vi.fn(async (request) => backendResult(request)),
    commit,
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
  };
  render(
    <RepositoryExportPage
      draftApi={draftApi(draft)}
      mediaApi={mediaApi(imageFixture())}
      repositoryApi={repositoryApi}
      now={() => new Date(2026, 6, 24)}
    />,
  );

  expect(await screen.findByRole("option", { name: /fictional-export-page/ })).toBeVisible();
  await user.type(screen.getByLabelText("仓库根目录"), "D:\\fictional-worktree");
  await user.click(screen.getByRole("button", { name: "诊断并预演" }));

  expect(await screen.findByText("预演通过")).toBeVisible();
  expect(screen.getByRole("heading", { name: "仓库诊断" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Schema 结果" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "拟执行 Git 操作" })).toBeVisible();
  expect(
    screen.getAllByText(
      `content/records/science-article/${RECORD_ID}/record.json`,
    )[0],
  ).toBeVisible();
  expect(
    screen.getAllByText(`public/images/uploads/2026/07/${IMAGE_ID}.webp`)[0],
  ).toBeVisible();
  expect(screen.getByText(`git switch -c content/20260724-${RECORD_ID}`)).toBeVisible();
  expect(repositoryApi.dryRun).toHaveBeenCalledWith(
    expect.objectContaining({ repositoryPath: "D:\\fictional-worktree" }),
  );

  expect(screen.getByRole("heading", { name: "本地内容提交" })).toBeVisible();
  const commitButton = screen.getByRole("button", { name: "创建本地提交" });
  expect(commitButton).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "确认创建上述本地分支，并仅提交所列文件",
    }),
  );
  await user.click(commitButton);

  expect(await screen.findByText("本地提交完成")).toBeVisible();
  expect(screen.getByText("b".repeat(40))).toBeVisible();
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmed: true,
      expectedBaseBranch: "main",
      expectedHeadSha: "a".repeat(40),
    }),
  );
});

test("shows repository conflicts as a blocked dry-run", async () => {
  const user = userEvent.setup();
  const draft = draftFixture();
  const repositoryApi: RepositoryApi = {
    dryRun: vi.fn(async (request) => backendResult(request, true)),
    commit: vi.fn(),
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
  };
  render(
    <RepositoryExportPage
      draftApi={draftApi(draft)}
      mediaApi={mediaApi(imageFixture())}
      repositoryApi={repositoryApi}
      now={() => new Date(2026, 6, 24)}
    />,
  );

  await screen.findByRole("option", { name: /fictional-export-page/ });
  await user.type(screen.getByLabelText("仓库根目录"), "D:\\dirty-worktree");
  await user.click(screen.getByRole("button", { name: "诊断并预演" }));

  expect(await screen.findByText("预演被阻止")).toBeVisible();
  expect(screen.getByText("WORKTREE_DIRTY")).toBeVisible();
  expect(screen.getByText("?? operator-note.txt")).toBeVisible();
});

test("preflights and exports an offline bundle after restart without a draft", async () => {
  const user = userEvent.setup();
  const branchName = `content/20260724-${RECORD_ID}`;
  const headSha = "c".repeat(40);
  const bundlePreflight = vi.fn(
    async (request: Parameters<RepositoryApi["bundlePreflight"]>[0]) => ({
      repositoryPath: request.repositoryPath,
      canonicalRepositoryPath: request.repositoryPath,
      destinationDirectory: request.destinationDirectory,
      branchName,
      headSha,
      baseCommitSha: "a".repeat(40),
      bundleFileName: `content-20260724-${RECORD_ID}-v1.bundle`,
      importBranchName: `import/content-20260724-${RECORD_ID}`,
      changedFiles: [`content/records/science-article/${RECORD_ID}/record.json`],
      conflicts: [],
      ready: true,
    }),
  );
  const exportBundle = vi.fn(
    async (request: Parameters<RepositoryApi["exportBundle"]>[0]) => ({
      branchName: request.expectedBranchName,
      headSha: request.expectedHeadSha,
      destinationDirectory: request.destinationDirectory,
      bundleFileName: `content-20260724-${RECORD_ID}-v1.bundle`,
      bundleSizeBytes: 4096,
      sha256: "D".repeat(64),
      importBranchName: `import/content-20260724-${RECORD_ID}`,
      artifactNames: [
        `content-20260724-${RECORD_ID}-v1.bundle`,
        `content-20260724-${RECORD_ID}-v1.bundle.sha256.txt`,
        "MANIFEST.txt",
        "HANDOFF.md",
        "TEST-SUMMARY.txt",
        "CHANGED-FILES.txt",
        "Import-Bundle.ps1",
      ],
    }),
  );
  const repositoryApi: RepositoryApi = {
    dryRun: vi.fn(),
    commit: vi.fn(),
    bundlePreflight,
    exportBundle,
  };
  render(
    <RepositoryExportPage
      draftApi={emptyDraftApi()}
      mediaApi={mediaApi(imageFixture())}
      repositoryApi={repositoryApi}
    />,
  );

  expect(await screen.findByText("目前没有可导出的草稿。")).toBeVisible();
  await user.type(screen.getByLabelText("源仓库根目录"), "D:\\fictional-worktree");
  await user.type(screen.getByLabelText("目标交接目录"), "E:\\content-handoff");
  await user.click(screen.getByRole("button", { name: "预检 Bundle" }));

  expect(await screen.findByText("Bundle 预检通过")).toBeVisible();
  expect(screen.getByText(`content-20260724-${RECORD_ID}-v1.bundle`)).toBeVisible();
  const exportButton = screen.getByRole("button", { name: "导出离线交接包" });
  expect(exportButton).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: "确认导出完整分支并创建上述交接目录",
    }),
  );
  await user.click(exportButton);

  expect(await screen.findByText("离线交接包已验证")).toBeVisible();
  expect(screen.getByText("Import-Bundle.ps1")).toBeVisible();
  expect(exportBundle).toHaveBeenCalledWith({
    repositoryPath: "D:\\fictional-worktree",
    destinationDirectory: "E:\\content-handoff",
    expectedBranchName: branchName,
    expectedHeadSha: headSha,
    confirmed: true,
  });
});
