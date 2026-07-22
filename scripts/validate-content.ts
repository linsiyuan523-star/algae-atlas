import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  parseRecord,
  validateRepository,
  type RepositorySnapshot,
  type ValidationIssue,
} from "@algae-atlas/content-schema";

import {
  ContentRepositoryLoadError,
  loadContentRepository,
} from "../lib/content-repository/file-loader";

type CliIO = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type ParsedArguments =
  | { mode: "help"; json: boolean }
  | { mode: "repository"; json: boolean }
  | { mode: "records"; json: boolean; files: string[] }
  | { mode: "snapshot"; json: boolean; file: string };

const defaultIO: CliIO = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

function usage(): string {
  return [
    "用法:",
    "  npm.cmd run content:validate",
    "  npm.cmd run content:validate -- <record.json> [更多 record.json]",
    "  npm.cmd run content:validate -- --snapshot <snapshot.json>",
    "选项:",
    "  --json       输出机器可读 JSON",
    "  --help       显示帮助",
  ].join("\n");
}

function parseArguments(args: string[]): ParsedArguments {
  const json = args.includes("--json");
  const filtered = args.filter((arg) => arg !== "--json");
  if (filtered.includes("--help")) {
    return { mode: "help", json };
  }
  if (filtered.length === 0) return { mode: "repository", json };

  const snapshotIndex = filtered.indexOf("--snapshot");
  if (snapshotIndex >= 0) {
    const file = filtered[snapshotIndex + 1];
    if (!file || filtered.length !== 2) {
      throw new Error("--snapshot 必须且只能指定一个 JSON 文件");
    }
    return { mode: "snapshot", json, file };
  }

  return { mode: "records", json, files: filtered };
}

async function readJson(file: string): Promise<unknown> {
  const text = await readFile(file, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
}

function fileIssue(file: string, error: unknown): ValidationIssue {
  const message = error instanceof Error ? error.message : "未知读取错误";
  return {
    code: "CLI_INPUT_READ_FAILED",
    severity: "error",
    path: file,
    message: `无法读取或解析输入文件：${message}`,
    remedy: "确认文件存在、使用 UTF-8 JSON，且不包含注释或尾随逗号。",
  };
}

function repositoryIssue(): ValidationIssue {
  return {
    code: "CLI_REPOSITORY_READ_FAILED",
    severity: "error",
    path: "content",
    message: "Unable to read the formal content repository.",
    remedy:
      "Confirm that content paths are readable ordinary files inside the current worktree.",
  };
}

function printIssues(
  issues: ValidationIssue[],
  json: boolean,
  io: CliIO,
): void {
  if (json) {
    io.stdout(JSON.stringify({ valid: issues.length === 0, issues }, null, 2));
    return;
  }

  if (issues.length === 0) {
    io.stdout("PASS: 内容校验通过");
    return;
  }

  for (const issue of issues) {
    const context = [issue.recordId, issue.locale].filter(Boolean).join("/");
    io.stderr(
      `${issue.code} ${context ? `[${context}] ` : ""}${issue.path}: ${issue.message}`,
    );
    io.stderr(`  修复建议: ${issue.remedy}`);
  }
}

export async function runContentValidationCli(
  args: string[],
  io: CliIO = defaultIO,
  repositoryRoot = process.cwd(),
): Promise<number> {
  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : "参数无效");
    io.stderr(usage());
    return 2;
  }

  if (parsed.mode === "help") {
    io.stdout(usage());
    return 0;
  }

  const issues: ValidationIssue[] = [];
  if (parsed.mode === "repository") {
    try {
      await loadContentRepository(repositoryRoot);
    } catch (error) {
      if (error instanceof ContentRepositoryLoadError) {
        issues.push(...error.issues);
      } else {
        issues.push(repositoryIssue());
      }
    }
  } else if (parsed.mode === "snapshot") {
    try {
      const snapshot = (await readJson(parsed.file)) as RepositorySnapshot;
      issues.push(...validateRepository(snapshot));
    } catch (error) {
      issues.push(fileIssue(parsed.file, error));
    }
  } else {
    for (const file of parsed.files) {
      try {
        const input = await readJson(file);
        const result = parseRecord(input);
        if (!result.success) {
          issues.push(
            ...result.issues.map((issue) => ({
              ...issue,
              path: `${file}:${issue.path}`,
            })),
          );
        }
      } catch (error) {
        issues.push(fileIssue(file, error));
      }
    }
  }

  printIssues(issues, parsed.json, io);
  return issues.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (invokedPath === import.meta.url) {
  process.exitCode = await runContentValidationCli(process.argv.slice(2));
}
