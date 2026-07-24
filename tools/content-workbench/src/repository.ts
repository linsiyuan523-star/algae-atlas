import { invoke } from "@tauri-apps/api/core";
import {
  CONTENT_TYPES,
  parseMedia,
  parseRecord,
  serializeMedia,
  serializeRecord,
  validateMarkdown,
} from "@algae-atlas/content-schema";
import type {
  ContentType,
  Locale,
  ValidationIssue,
} from "@algae-atlas/content-schema";
import type { Draft } from "./drafts";
import {
  createMediaRecordCandidate,
  recordMediaIds,
} from "./media";
import type { StagedImage } from "./media";

export type ToolDiagnostic = {
  available: boolean;
  version?: string;
};

export type ProjectScript = {
  name: string;
  command: string;
};

export type RepositoryDiagnostics = {
  selectedPath: string;
  canonicalRoot?: string;
  isGitRepository: boolean;
  currentBranch?: string;
  headSha?: string;
  worktreeClean?: boolean;
  status: string[];
  remotes: string[];
  git: ToolDiagnostic;
  node: ToolDiagnostic;
  projectScripts: ProjectScript[];
};

export type PlannedTarget = {
  path: string;
  category: "content" | "image";
  state: "new" | "existing" | "case-conflict" | "unsafe" | "unchecked";
};

export type DryRunConflict = {
  code: string;
  path?: string;
  message: string;
};

export type PlannedGitOperation = {
  program: string;
  args: string[];
  description: string;
};

export type RepositoryDryRunRequest = {
  repositoryPath: string;
  recordId: string;
  contentType: ContentType;
  branchName: string;
  contentTargets: string[];
  imageTargets: string[];
};

export type RepositoryDryRunResult = {
  diagnostics: RepositoryDiagnostics;
  contentTargets: PlannedTarget[];
  imageTargets: PlannedTarget[];
  conflicts: DryRunConflict[];
  plannedGitOperations: PlannedGitOperation[];
  repositoryReady: boolean;
};

export type RepositoryTextFile = {
  path: string;
  contents: string;
};

export type RepositoryImageFile = {
  path: string;
  stagedName: string;
};

export type RepositoryLocalCommitRequest = {
  plan: RepositoryDryRunRequest;
  expectedHeadSha: string;
  expectedBaseBranch: string;
  draftId: string;
  textFiles: RepositoryTextFile[];
  imageFiles: RepositoryImageFile[];
  confirmed: boolean;
};

export type RepositoryLocalCommitResult = {
  branchName: string;
  previousHeadSha: string;
  commitSha: string;
  commitMessage: string;
  committedPaths: string[];
};

export type ExportSchemaResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type ExportDryRunResult = RepositoryDryRunResult & {
  schema: ExportSchemaResult;
  ready: boolean;
};

export type RepositoryApi = {
  dryRun: (request: RepositoryDryRunRequest) => Promise<RepositoryDryRunResult>;
  commit: (
    request: RepositoryLocalCommitRequest,
  ) => Promise<RepositoryLocalCommitResult>;
};

export const tauriRepositoryApi: RepositoryApi = {
  dryRun: (request) =>
    invoke<RepositoryDryRunResult>("repository_export_dry_run", { request }),
  commit: (request) =>
    invoke<RepositoryLocalCommitResult>("repository_local_commit", { request }),
};

export const unavailableRepositoryApi: RepositoryApi = {
  dryRun: async () => {
    throw new Error("仓库诊断仅在桌面应用中可用。");
  },
  commit: async () => {
    throw new Error("本地内容提交仅在桌面应用中可用。");
  },
};

type ExportPlan = {
  request: Omit<RepositoryDryRunRequest, "repositoryPath">;
  schema: ExportSchemaResult;
  draftId: string;
  textFiles: RepositoryTextFile[];
  imageFiles: RepositoryImageFile[];
};

export async function runRepositoryExportDryRun(
  api: RepositoryApi,
  repositoryPath: string,
  draft: Draft,
  stagedImages: readonly StagedImage[],
  now = new Date(),
): Promise<ExportDryRunResult> {
  const plan = createExportPlan(draft, stagedImages, now);
  const repository = await api.dryRun({
    repositoryPath,
    ...plan.request,
  });
  return {
    ...repository,
    schema: plan.schema,
    ready: repository.repositoryReady && plan.schema.valid,
  };
}

export async function runRepositoryLocalCommit(
  api: RepositoryApi,
  repositoryPath: string,
  draft: Draft,
  stagedImages: readonly StagedImage[],
  dryRun: ExportDryRunResult,
  now = new Date(),
): Promise<RepositoryLocalCommitResult> {
  const plan = createExportPlan(draft, stagedImages, now);
  const expectedHeadSha = dryRun.diagnostics.headSha;
  const expectedBaseBranch = dryRun.diagnostics.currentBranch;
  if (
    !dryRun.ready ||
    !plan.schema.valid ||
    !expectedHeadSha ||
    !expectedBaseBranch ||
    plan.textFiles.length !== plan.request.contentTargets.length ||
    !samePathSet(
      plan.request.contentTargets,
      dryRun.contentTargets.map((target) => target.path),
    ) ||
    !samePathSet(
      plan.request.imageTargets,
      dryRun.imageTargets.map((target) => target.path),
    )
  ) {
    throw new Error("预演结果已失效，请重新诊断后再提交。");
  }

  return api.commit({
    plan: {
      repositoryPath,
      ...plan.request,
    },
    expectedHeadSha,
    expectedBaseBranch,
    draftId: plan.draftId,
    textFiles: plan.textFiles,
    imageFiles: plan.imageFiles,
    confirmed: true,
  });
}

export function createExportPlan(
  draft: Draft,
  stagedImages: readonly StagedImage[],
  now = new Date(),
): ExportPlan {
  const rawRecord = asRecord(draft.recordDraft);
  const recordId = requiredString(rawRecord?.id, "草稿缺少稳定 ID。");
  const contentType = requiredContentType(rawRecord?.type);
  const issues: ValidationIssue[] = [];
  const parsedRecord = parseRecord(draft.recordDraft);
  if (!parsedRecord.success) {
    issues.push(...parsedRecord.issues);
  }

  validateLocaleBody(
    draft.recordDraft,
    recordId,
    "zh",
    draft.bodyZh,
    issues,
  );
  validateLocaleBody(
    draft.recordDraft,
    recordId,
    "en",
    draft.bodyEn,
    issues,
  );

  const referencedIds = recordMediaIds(draft.recordDraft);
  const stagedById = new Map(stagedImages.map((image) => [image.id, image]));
  const selectedImages = referencedIds.flatMap((id) => {
    const image = stagedById.get(id);
    if (!image) {
      issues.push(
        schemaIssue(
          "MEDIA_STAGING_MISSING",
          "media",
          `找不到图片 ${id} 的本地暂存文件。`,
          "重新接收该图片，或从记录中移除无效引用。",
          recordId,
        ),
      );
      return [];
    }
    return [image];
  });

  for (const image of stagedImages) {
    if (!referencedIds.includes(image.id)) {
      issues.push({
        ...schemaIssue(
          "MEDIA_STAGING_UNREFERENCED",
          `media.${image.id}`,
          `暂存图片 ${image.originalName} 未被当前记录引用，不会导出。`,
          "在正文、封面或图集字段中引用该图片，或保留为本地暂存。",
          recordId,
        ),
        severity: "warning",
      });
    }
  }

  const parsedMedia = selectedImages.map((image) =>
    parseMedia(createMediaRecordCandidate(image)),
  );
  for (const [index, parsed] of parsedMedia.entries()) {
    if (!parsed.success) {
      issues.push(
        ...parsed.issues.map((issue) => ({
          ...issue,
          recordId,
          path: `media[${index}].${issue.path}`,
        })),
      );
    }
  }

  const recordRoot = `content/records/${contentType}/${recordId}`;
  const contentTargets = [`${recordRoot}/record.json`];
  if (localeBodyFile(draft.recordDraft, "zh") === "zh.md") {
    contentTargets.push(`${recordRoot}/zh.md`);
  }
  if (localeBodyFile(draft.recordDraft, "en") === "en.md") {
    contentTargets.push(`${recordRoot}/en.md`);
  }
  contentTargets.push(
    ...selectedImages.map((image) => `content/media/${image.id}.json`),
  );

  const imageTargets = selectedImages.flatMap((image) => [
    image.targetPath,
    ...(image.processing?.thumbnail
      ? [image.processing.thumbnail.targetPath]
      : []),
  ]);

  const textFiles: RepositoryTextFile[] = [];
  if (parsedRecord.success) {
    textFiles.push({
      path: `${recordRoot}/record.json`,
      contents: serializeRecord(parsedRecord.data),
    });
  }
  if (localeBodyFile(draft.recordDraft, "zh") === "zh.md") {
    textFiles.push({
      path: `${recordRoot}/zh.md`,
      contents: serializeMarkdown(draft.bodyZh),
    });
  }
  if (localeBodyFile(draft.recordDraft, "en") === "en.md") {
    textFiles.push({
      path: `${recordRoot}/en.md`,
      contents: serializeMarkdown(draft.bodyEn),
    });
  }
  for (const [index, image] of selectedImages.entries()) {
    const parsed = parsedMedia[index];
    if (parsed?.success) {
      textFiles.push({
        path: `content/media/${image.id}.json`,
        contents: serializeMedia(parsed.data),
      });
    }
  }

  const imageFiles = selectedImages.flatMap<RepositoryImageFile>((image) => [
    { path: image.targetPath, stagedName: image.stagedName },
    ...(image.processing?.thumbnail
      ? [
          {
            path: image.processing.thumbnail.targetPath,
            stagedName: image.processing.thumbnail.stagedName,
          },
        ]
      : []),
  ]);

  return {
    request: {
      recordId,
      contentType,
      branchName: `content/${localDateStamp(now)}-${recordId}`,
      contentTargets: unique(contentTargets),
      imageTargets: unique(imageTargets),
    },
    schema: {
      valid: !issues.some((issue) => issue.severity === "error"),
      issues: deduplicateIssues(issues),
    },
    draftId: draft.draftId,
    textFiles,
    imageFiles,
  };
}

function serializeMarkdown(body: string) {
  const normalized = body.replace(/\r\n?/g, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function validateLocaleBody(
  recordDraft: unknown,
  recordId: string,
  locale: Locale,
  body: string,
  issues: ValidationIssue[],
) {
  const bodyFile = localeBodyFile(recordDraft, locale);
  const localized = localeRecord(recordDraft, locale);
  if (locale === "en" && localized?.state === "missing" && body.trim()) {
    issues.push(
      schemaIssue(
        "UNEXPECTED_ENGLISH_BODY",
        "locales.en.bodyFile",
        "英文状态为 missing 时不能导出 en.md。",
        "清空英文正文，或先创建英文草稿并完成字段校验。",
        recordId,
        "en",
      ),
    );
    return;
  }

  if (!bodyFile && body.trim()) {
    issues.push(
      schemaIssue(
        "MARKDOWN_BODY_UNDECLARED",
        `locales.${locale}.bodyFile`,
        `${locale}.md 正文存在，但记录没有对应 bodyFile。`,
        "保存草稿以同步正文引用后重新预演。",
        recordId,
        locale,
      ),
    );
    return;
  }
  if (bodyFile && !body.trim()) {
    issues.push(
      schemaIssue(
        "MARKDOWN_BODY_MISSING",
        `locales.${locale}.bodyFile`,
        `记录声明了 ${bodyFile}，但正文为空。`,
        "补充正文，或保存草稿以移除空正文引用。",
        recordId,
        locale,
      ),
    );
    return;
  }
  if (bodyFile) {
    issues.push(
      ...validateMarkdown(body, {
        path: `markdown.${recordId}/${bodyFile}`,
        recordId,
        locale,
      }),
    );
  }
}

function localeBodyFile(recordDraft: unknown, locale: Locale) {
  const bodyFile = localeRecord(recordDraft, locale)?.bodyFile;
  return typeof bodyFile === "string" ? bodyFile : undefined;
}

function localeRecord(recordDraft: unknown, locale: Locale) {
  const record = asRecord(recordDraft);
  return asRecord(asRecord(record?.locales)?.[locale]);
}

function schemaIssue(
  code: string,
  path: string,
  message: string,
  remedy: string,
  recordId: string,
  locale?: Locale,
): ValidationIssue {
  return {
    code,
    severity: "error",
    recordId,
    ...(locale ? { locale } : {}),
    path,
    message,
    remedy,
  };
}

function requiredString(value: unknown, message: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(message);
  }
  return value;
}

function requiredContentType(value: unknown): ContentType {
  const parsed = requiredString(value, "草稿缺少内容类型。");
  const record = parseRecordType(parsed);
  if (!record) {
    throw new Error("草稿内容类型未注册。");
  }
  return record;
}

function parseRecordType(value: string): ContentType | null {
  return (CONTENT_TYPES as readonly string[]).includes(value)
    ? (value as ContentType)
    : null;
}

function localDateStamp(date: Date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function samePathSet(left: readonly string[], right: readonly string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function deduplicateIssues(issues: readonly ValidationIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.locale ?? ""}|${issue.path}|${issue.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
