import {
  validMarkdownFixture,
  validRecordFixtures,
} from "@algae-atlas/content-schema/fixtures";
import { createRecordDraftDefaults } from "@algae-atlas/content-schema";
import { expect, test, vi } from "vitest";
import type { Draft } from "./drafts";
import type { StagedImage } from "./media";
import {
  createExportPlan,
  runRepositoryBundleExport,
  runRepositoryBundlePreflight,
  runRepositoryExportDryRun,
  runRepositoryLocalCommit,
} from "./repository";
import type {
  RepositoryApi,
  RepositoryDryRunResult,
} from "./repository";

const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const RECORD_ID = "fictional-dry-run";

function draftFixture(): Draft {
  const record = structuredClone(validRecordFixtures["science-article"]);
  record.id = RECORD_ID;
  record.media = [IMAGE_ID];
  (record.shared as Record<string, unknown>).coverMediaId = IMAGE_ID;
  return {
    formatVersion: 4,
    draftId: "11111111-1111-4111-8111-111111111111",
    recordDraft: record,
    bodyZh: validMarkdownFixture,
    bodyEn: "",
    createdAt: "2026-07-24T08:00:00Z",
    updatedAt: "2026-07-24T08:00:00Z",
  };
}

function incompleteDraftFixture(): Draft {
  return {
    formatVersion: 4,
    draftId: "33333333-3333-4333-8333-333333333333",
    recordDraft: createRecordDraftDefaults(
      "team-news",
      "incomplete-dry-run",
      "2026-07-24T08:00:00Z",
    ),
    bodyZh: "",
    bodyEn: "",
    createdAt: "2026-07-24T08:00:00Z",
    updatedAt: "2026-07-24T08:00:00Z",
  };
}

function imageFixture(): StagedImage {
  return {
    formatVersion: 2,
    draftId: "11111111-1111-4111-8111-111111111111",
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
      sourceUrl: "https://example.invalid/image",
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
      originalRetained: true,
      originalStagedName: `${IMAGE_ID}.original.png`,
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

function backendResult(
  request: Parameters<RepositoryApi["dryRun"]>[0],
): RepositoryDryRunResult {
  return {
    diagnostics: {
      selectedPath: request.repositoryPath,
      canonicalRoot: request.repositoryPath,
      isGitRepository: true,
      currentBranch: "main",
      headSha: "a".repeat(40),
      worktreeClean: true,
      status: [],
      remotes: [],
      git: { available: true, version: "git version 2.51.0.windows.1" },
      node: { available: true, version: "v22.23.1" },
      projectScripts: [{ name: "check", command: "tsc --noEmit" }],
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
    conflicts: [],
    plannedGitOperations: [
      {
        program: "git",
        args: ["switch", "-c", request.branchName],
        description: "创建本地内容分支",
      },
    ],
    repositoryReady: true,
  };
}

test("plans exact record, Markdown, metadata and processed image targets", () => {
  const plan = createExportPlan(
    draftFixture(),
    [imageFixture()],
    new Date(2026, 6, 24, 10, 30),
  );

  expect(plan.schema).toEqual({ valid: true, issues: [] });
  expect(plan.request).toEqual({
    recordId: RECORD_ID,
    contentType: "science-article",
    branchName: `content/20260724-${RECORD_ID}`,
    contentTargets: [
      `content/records/science-article/${RECORD_ID}/record.json`,
      `content/records/science-article/${RECORD_ID}/zh.md`,
      `content/media/${IMAGE_ID}.json`,
    ],
    imageTargets: [
      `public/images/uploads/2026/07/${IMAGE_ID}.webp`,
      `public/images/uploads/2026/07/${IMAGE_ID}.thumbnail.webp`,
    ],
  });
  expect(JSON.stringify(plan.request)).not.toContain("original.png");
  expect(JSON.stringify(plan.request)).not.toContain("en.md");
  expect(plan.textFiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: `content/records/science-article/${RECORD_ID}/record.json`,
        contents: expect.stringContaining(`"id": "${RECORD_ID}"`),
      }),
      expect.objectContaining({
        path: `content/media/${IMAGE_ID}.json`,
        contents: expect.stringContaining(`"filePath": "public/images/uploads/2026/07/${IMAGE_ID}.webp"`),
      }),
    ]),
  );
  expect(plan.imageFiles).toEqual([
    {
      path: `public/images/uploads/2026/07/${IMAGE_ID}.webp`,
      stagedName: `${IMAGE_ID}.webp`,
    },
    {
      path: `public/images/uploads/2026/07/${IMAGE_ID}.thumbnail.webp`,
      stagedName: `${IMAGE_ID}.thumbnail.webp`,
    },
  ]);
});

test("blocks missing-English body and excludes unreferenced staged images", () => {
  const draft = draftFixture();
  draft.bodyEn = "English body that must not be exported.";
  (draft.recordDraft as Record<string, unknown>).media = [];
  delete (draft.recordDraft as { shared: Record<string, unknown> }).shared
    .coverMediaId;

  const plan = createExportPlan(
    draft,
    [imageFixture()],
    new Date(2026, 6, 24),
  );

  expect(plan.schema.valid).toBe(false);
  expect(plan.schema.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "UNEXPECTED_ENGLISH_BODY", severity: "error" }),
      expect.objectContaining({
        code: "MEDIA_STAGING_UNREFERENCED",
        severity: "warning",
      }),
    ]),
  );
  expect(plan.request.contentTargets).toEqual([
    `content/records/science-article/${RECORD_ID}/record.json`,
    `content/records/science-article/${RECORD_ID}/zh.md`,
  ]);
  expect(plan.request.imageTargets).toEqual([]);
});

test("keeps complete schema validation at repository export for incomplete drafts", async () => {
  const draft = incompleteDraftFixture();
  const plannedAt = new Date(2026, 6, 24);
  const commit = vi.fn();
  const api: RepositoryApi = {
    dryRun: vi.fn(async (request) => backendResult(request)),
    commit,
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
  };
  const result = await runRepositoryExportDryRun(
    api,
    "D:\\fictional-worktree",
    draft,
    [],
    plannedAt,
  );

  expect(result.ready).toBe(false);
  expect(result.schema.valid).toBe(false);
  expect(result.schema.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "locales.zh.title", severity: "error" }),
      expect.objectContaining({ path: "locales.zh.summary", severity: "error" }),
      expect.objectContaining({ path: "shared.eventDate", severity: "error" }),
    ]),
  );
  await expect(
    runRepositoryLocalCommit(
      api,
      "D:\\fictional-worktree",
      draft,
      [],
      result,
      plannedAt,
    ),
  ).rejects.toThrow("预演结果已失效");
  expect(commit).not.toHaveBeenCalled();
});

test("combines shared Schema validation with read-only repository diagnostics", async () => {
  const api: RepositoryApi = {
    dryRun: vi.fn(async (request) => backendResult(request)),
    commit: vi.fn(),
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
  };

  const result = await runRepositoryExportDryRun(
    api,
    "D:\\fictional-worktree",
    draftFixture(),
    [imageFixture()],
    new Date(2026, 6, 24),
  );

  expect(result.ready).toBe(true);
  expect(result.schema.valid).toBe(true);
  expect(api.dryRun).toHaveBeenCalledWith(
    expect.objectContaining({
      repositoryPath: "D:\\fictional-worktree",
      branchName: `content/20260724-${RECORD_ID}`,
    }),
  );
});

test("uses the approved dry-run snapshot for one confirmed local commit", async () => {
  const commit = vi.fn(async (request: Parameters<RepositoryApi["commit"]>[0]) => ({
    branchName: request.plan.branchName,
    previousHeadSha: request.expectedHeadSha,
    commitSha: "b".repeat(40),
    commitMessage: `content: publish ${request.plan.recordId}`,
    committedPaths: [...request.plan.contentTargets, ...request.plan.imageTargets].sort(),
  }));
  const api: RepositoryApi = {
    dryRun: vi.fn(async (request) => backendResult(request)),
    commit,
    bundlePreflight: vi.fn(),
    exportBundle: vi.fn(),
  };
  const draft = draftFixture();
  const images = [imageFixture()];
  const plannedAt = new Date(2026, 6, 24);
  const dryRun = await runRepositoryExportDryRun(
    api,
    "D:\\fictional-worktree",
    draft,
    images,
    plannedAt,
  );

  const result = await runRepositoryLocalCommit(
    api,
    "D:\\fictional-worktree",
    draft,
    images,
    dryRun,
    plannedAt,
  );

  expect(result.commitSha).toBe("b".repeat(40));
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmed: true,
      expectedBaseBranch: "main",
      expectedHeadSha: "a".repeat(40),
      draftId: draft.draftId,
      plan: expect.objectContaining({
        branchName: `content/20260724-${RECORD_ID}`,
      }),
      textFiles: expect.arrayContaining([
        expect.objectContaining({ path: expect.stringMatching(/record\.json$/) }),
      ]),
    }),
  );
});

test("binds a confirmed bundle export to the approved branch, HEAD and destination", async () => {
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
    artifactNames: ["MANIFEST.txt", "Import-Bundle.ps1"],
    }),
  );
  const api: RepositoryApi = {
    dryRun: vi.fn(),
    commit: vi.fn(),
    bundlePreflight,
    exportBundle,
  };

  const preflight = await runRepositoryBundlePreflight(
    api,
    "D:\\fictional-worktree",
    "E:\\content-handoff",
  );
  const result = await runRepositoryBundleExport(
    api,
    preflight,
    "D:\\fictional-worktree",
    "E:\\content-handoff",
  );

  expect(result.headSha).toBe(headSha);
  expect(exportBundle).toHaveBeenCalledWith({
    repositoryPath: "D:\\fictional-worktree",
    destinationDirectory: "E:\\content-handoff",
    expectedBranchName: branchName,
    expectedHeadSha: headSha,
    confirmed: true,
  });
  await expect(
    runRepositoryBundleExport(
      api,
      preflight,
      "D:\\fictional-worktree",
      "E:\\different-handoff",
    ),
  ).rejects.toThrow("Bundle 预检结果已失效");
  expect(exportBundle).toHaveBeenCalledTimes(1);
});
