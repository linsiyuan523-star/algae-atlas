import type { Dirent } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  CONTENT_TYPES,
  STABLE_ID_PATTERN,
  parseAuthor,
  parseMedia,
  parseRecord,
  validateRepository,
  type RepositorySnapshot,
  type ValidationIssue,
} from "@algae-atlas/content-schema";

import type { LoadedContentRepository } from "./types";

const IGNORED_DIRECTORY_ENTRIES = new Set([".gitkeep"]);
const RECORD_FILES = new Set(["record.json", "zh.md", "en.md"]);

function loaderIssue(
  code: string,
  relativePath: string,
  message: string,
  remedy: string,
): ValidationIssue {
  return {
    code,
    severity: "error",
    path: relativePath,
    message,
    remedy,
  };
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function repositoryPath(repositoryRoot: string, ...parts: string[]): string {
  return path.join(repositoryRoot, ...parts);
}

function sorted(entries: Dirent[]): Dirent[] {
  return entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
}

async function readDirectoryIfPresent(
  absolutePath: string,
  relativePath: string,
  issues: ValidationIssue[],
): Promise<Dirent[]> {
  let stats;
  try {
    stats = await lstat(absolutePath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return [];
    issues.push(
      loaderIssue(
        "CONTENT_DIRECTORY_READ_FAILED",
        relativePath,
        "无法读取内容目录",
        "确认目录可读，并且位于当前仓库 worktree 内。",
      ),
    );
    return [];
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    issues.push(
      loaderIssue(
        "CONTENT_DIRECTORY_UNSAFE",
        relativePath,
        "内容路径必须是仓库内的普通目录，不能是符号链接或 junction",
        "用普通目录替换该路径，并把内容保留在当前 worktree 内。",
      ),
    );
    return [];
  }

  try {
    return sorted(await readdir(absolutePath, { withFileTypes: true }));
  } catch {
    issues.push(
      loaderIssue(
        "CONTENT_DIRECTORY_READ_FAILED",
        relativePath,
        "无法枚举内容目录",
        "确认目录权限和文件系统状态后重新构建。",
      ),
    );
    return [];
  }
}

async function readUtf8Source(
  absolutePath: string,
  relativePath: string,
  issues: ValidationIssue[],
): Promise<string | undefined> {
  let stats;
  try {
    stats = await lstat(absolutePath);
  } catch {
    issues.push(
      loaderIssue(
        "CONTENT_FILE_READ_FAILED",
        relativePath,
        "无法读取内容文件",
        "确认文件存在、可读，并且没有被其他程序替换。",
      ),
    );
    return undefined;
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    issues.push(
      loaderIssue(
        "CONTENT_FILE_UNSAFE",
        relativePath,
        "内容文件必须是仓库内的普通文件，不能是符号链接或 junction",
        "用普通文件替换该路径，并把内容保留在当前 worktree 内。",
      ),
    );
    return undefined;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    issues.push(
      loaderIssue(
        "CONTENT_FILE_READ_FAILED",
        relativePath,
        "无法读取内容文件",
        "确认文件权限和文件系统状态后重新构建。",
      ),
    );
    return undefined;
  }

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    issues.push(
      loaderIssue(
        "CONTENT_UTF8_BOM_FORBIDDEN",
        relativePath,
        "内容文件不能包含 UTF-8 BOM",
        "以 UTF-8 无 BOM 重新保存文件。",
      ),
    );
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    issues.push(
      loaderIssue(
        "CONTENT_UTF8_INVALID",
        relativePath,
        "内容文件不是有效 UTF-8",
        "以 UTF-8 无 BOM 重新保存文件。",
      ),
    );
    return undefined;
  }

  if (source.includes("\r")) {
    issues.push(
      loaderIssue(
        "CONTENT_LINE_ENDING_INVALID",
        relativePath,
        "内容文件必须使用 LF 换行",
        "把 CRLF 或 CR 换行转换为 LF。",
      ),
    );
  }
  if (!source.endsWith("\n")) {
    issues.push(
      loaderIssue(
        "CONTENT_TRAILING_NEWLINE_REQUIRED",
        relativePath,
        "内容文件必须以一个 LF 换行结束",
        "在文件末尾添加一个换行。",
      ),
    );
  }

  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

async function readJsonSource(
  absolutePath: string,
  relativePath: string,
  issues: ValidationIssue[],
): Promise<unknown | undefined> {
  const source = await readUtf8Source(absolutePath, relativePath, issues);
  if (source === undefined) return undefined;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    issues.push(
      loaderIssue(
        "CONTENT_JSON_INVALID",
        relativePath,
        "JSON 语法无效",
        "修正 JSON 语法后重新运行校验；不要把可执行代码写入内容文件。",
      ),
    );
    return undefined;
  }
}

function objectId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("id" in value)) return undefined;
  return typeof value.id === "string" ? value.id : undefined;
}

async function loadCatalog(
  repositoryRoot: string,
  catalogName: "authors" | "media",
  issues: ValidationIssue[],
): Promise<unknown[]> {
  const relativeDirectory = `content/${catalogName}`;
  const absoluteDirectory = repositoryPath(repositoryRoot, "content", catalogName);
  const entries = await readDirectoryIfPresent(
    absoluteDirectory,
    relativeDirectory,
    issues,
  );
  const values: unknown[] = [];

  for (const entry of entries) {
    if (IGNORED_DIRECTORY_ENTRIES.has(entry.name)) continue;
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      issues.push(
        loaderIssue(
          "CONTENT_CATALOG_ENTRY_INVALID",
          relativePath,
          "目录中只允许使用稳定 ID 命名的 JSON 文件",
          "删除非内容条目，或把记录保存为 <stable-id>.json。",
        ),
      );
      continue;
    }

    const expectedId = entry.name.slice(0, -".json".length);
    if (!STABLE_ID_PATTERN.test(expectedId)) {
      issues.push(
        loaderIssue(
          "CONTENT_CATALOG_ID_INVALID",
          relativePath,
          "目录文件名不是有效稳定 ID",
          "使用小写英文、数字和单个连字符命名。",
        ),
      );
      continue;
    }

    const value = await readJsonSource(
      path.join(absoluteDirectory, entry.name),
      relativePath,
      issues,
    );
    if (value === undefined) continue;
    if (objectId(value) !== expectedId) {
      issues.push(
        loaderIssue(
          "CONTENT_CATALOG_PATH_MISMATCH",
          relativePath,
          "目录文件名与记录 id 不一致",
          `把文件名和 id 统一为 ${expectedId}。`,
        ),
      );
    }
    values.push(value);
  }

  return values;
}

export function formatContentRepositoryIssues(
  issues: readonly ValidationIssue[],
  maximum = 20,
): string {
  const visible = issues.slice(0, maximum).map((issue) => {
    const identity = [issue.recordId, issue.locale].filter(Boolean).join("/");
    return `[${issue.code}]${identity ? ` ${identity}` : ""} ${issue.path}: ${issue.message} ${issue.remedy}`;
  });
  if (issues.length > maximum) {
    visible.push(`... 另有 ${issues.length - maximum} 个问题`);
  }
  return visible.join("\n");
}

export class ContentRepositoryLoadError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`结构化内容仓库校验失败\n${formatContentRepositoryIssues(issues)}`);
    this.name = "ContentRepositoryLoadError";
    this.issues = issues;
  }
}

export async function loadContentRepository(
  repositoryRoot: string,
): Promise<LoadedContentRepository> {
  const issues: ValidationIssue[] = [];
  const recordInputs: unknown[] = [];
  const markdown: Record<string, string> = {};
  const recordPaths: Record<string, string> = {};
  const recordsDirectory = repositoryPath(repositoryRoot, "content", "records");
  const typeEntries = await readDirectoryIfPresent(
    recordsDirectory,
    "content/records",
    issues,
  );

  for (const typeEntry of typeEntries) {
    if (IGNORED_DIRECTORY_ENTRIES.has(typeEntry.name)) continue;
    const typePath = `content/records/${typeEntry.name}`;
    if (
      typeEntry.isSymbolicLink() ||
      !typeEntry.isDirectory() ||
      !CONTENT_TYPES.includes(typeEntry.name as (typeof CONTENT_TYPES)[number])
    ) {
      issues.push(
        loaderIssue(
          "CONTENT_TYPE_DIRECTORY_INVALID",
          typePath,
          "records 下只允许已注册内容类型的普通目录",
          "使用共享 contentTypeRegistry 中的类型 ID。",
        ),
      );
      continue;
    }

    const typeDirectory = path.join(recordsDirectory, typeEntry.name);
    const recordEntries = await readDirectoryIfPresent(
      typeDirectory,
      typePath,
      issues,
    );
    for (const recordEntry of recordEntries) {
      if (IGNORED_DIRECTORY_ENTRIES.has(recordEntry.name)) continue;
      const recordDirectoryPath = `${typePath}/${recordEntry.name}`;
      if (
        recordEntry.isSymbolicLink() ||
        !recordEntry.isDirectory() ||
        !STABLE_ID_PATTERN.test(recordEntry.name)
      ) {
        issues.push(
          loaderIssue(
            "CONTENT_RECORD_DIRECTORY_INVALID",
            recordDirectoryPath,
            "记录必须位于使用稳定 ID 命名的普通目录",
            "使用小写英文、数字和单个连字符命名记录目录。",
          ),
        );
        continue;
      }

      const absoluteRecordDirectory = path.join(typeDirectory, recordEntry.name);
      const files = await readDirectoryIfPresent(
        absoluteRecordDirectory,
        recordDirectoryPath,
        issues,
      );
      const names = new Set(files.map((entry) => entry.name));
      if (!names.has("record.json")) {
        issues.push(
          loaderIssue(
            "CONTENT_RECORD_FILE_MISSING",
            `${recordDirectoryPath}/record.json`,
            "记录目录缺少 record.json",
            "添加符合 schema version 1 的 record.json。",
          ),
        );
      }

      for (const file of files) {
        const relativePath = `${recordDirectoryPath}/${file.name}`;
        if (
          file.isSymbolicLink() ||
          !file.isFile() ||
          !RECORD_FILES.has(file.name)
        ) {
          issues.push(
            loaderIssue(
              "CONTENT_RECORD_FILE_INVALID",
              relativePath,
              "记录目录只允许 record.json、zh.md 和可选 en.md",
              "移除未注册文件；附件和图片必须通过受控目录引用。",
            ),
          );
        }
      }

      if (names.has("record.json")) {
        const recordPath = `${recordDirectoryPath}/record.json`;
        const input = await readJsonSource(
          path.join(absoluteRecordDirectory, "record.json"),
          recordPath,
          issues,
        );
        if (input !== undefined) {
          recordInputs.push(input);
          const id = objectId(input);
          if (id) recordPaths[id] = recordPath;
        }
      }

      for (const locale of ["zh", "en"] as const) {
        const fileName = `${locale}.md`;
        if (!names.has(fileName)) continue;
        const relativePath = `${recordDirectoryPath}/${fileName}`;
        const body = await readUtf8Source(
          path.join(absoluteRecordDirectory, fileName),
          relativePath,
          issues,
        );
        if (body !== undefined) {
          markdown[`${typeEntry.name}/${recordEntry.name}/${fileName}`] = body;
        }
      }
    }
  }

  const [authorInputs, mediaInputs] = await Promise.all([
    loadCatalog(repositoryRoot, "authors", issues),
    loadCatalog(repositoryRoot, "media", issues),
  ]);
  const snapshot: RepositorySnapshot = {
    records: recordInputs,
    authors: authorInputs,
    media: mediaInputs,
    markdown,
    recordPaths,
  };
  issues.push(...validateRepository(snapshot));

  if (issues.length > 0) throw new ContentRepositoryLoadError(issues);

  const records = recordInputs.map((input) => {
    const parsed = parseRecord(input);
    if (!parsed.success) throw new ContentRepositoryLoadError(parsed.issues);
    return parsed.data;
  });
  const authors = authorInputs.map((input) => {
    const parsed = parseAuthor(input);
    if (!parsed.success) throw new ContentRepositoryLoadError(parsed.issues);
    return parsed.data;
  });
  const media = mediaInputs.map((input) => {
    const parsed = parseMedia(input);
    if (!parsed.success) throw new ContentRepositoryLoadError(parsed.issues);
    return parsed.data;
  });

  return {
    snapshot,
    records,
    authors,
    media,
    markdown,
    recordPaths,
  };
}
