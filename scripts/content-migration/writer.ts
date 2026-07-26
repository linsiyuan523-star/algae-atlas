import { constants, type Stats } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  realpath,
  rmdir,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { buildMigrationPlan } from "./planner";
import type {
  MigrationExecutionResult,
  MigrationFinding,
  MigrationOptions,
  MigrationPlan,
  MigrationReport,
  PlannedFile,
} from "./types";

export type FileOps = {
  lstat(absolutePath: string): Promise<Stats>;
  mkdir(absolutePath: string): Promise<string | undefined>;
  open(absolutePath: string, flags: "wx"): Promise<FileHandle>;
  copyFile(source: string, target: string, mode: number): Promise<void>;
  unlink(absolutePath: string): Promise<void>;
  rmdir(absolutePath: string): Promise<void>;
  realpath(absolutePath: string): Promise<string>;
};

export const nodeFileOps: FileOps = {
  lstat,
  mkdir,
  open,
  copyFile,
  unlink,
  rmdir,
  realpath,
};

class MigrationWriteConflict extends Error {
  readonly relativePath: string;

  constructor(relativePath: string, message: string) {
    super(message);
    this.name = "MigrationWriteConflict";
    this.relativePath = relativePath;
  }
}

function isNodeError(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    codes.includes((error as NodeJS.ErrnoException).code ?? "")
  );
}

async function lstatIfPresent(
  absolutePath: string,
  fileOps: FileOps,
): Promise<Stats | undefined> {
  try {
    return await fileOps.lstat(absolutePath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

function pathIsBelow(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function resolvePlanFile(root: string, file: PlannedFile): PlannedFile & {
  absolutePath: string;
} {
  if (
    file.relativePath.length === 0 ||
    file.relativePath.includes("\0") ||
    path.isAbsolute(file.relativePath)
  ) {
    throw new MigrationWriteConflict(
      file.relativePath,
      "Planned file path must be repository-relative.",
    );
  }
  const absolutePath = path.resolve(root, file.relativePath);
  if (!pathIsBelow(root, absolutePath)) {
    throw new MigrationWriteConflict(
      file.relativePath,
      "Planned file path escapes the repository root.",
    );
  }
  return { ...file, absolutePath };
}

async function assertOrdinaryRoot(
  repositoryRoot: string,
  fileOps: FileOps,
): Promise<string> {
  const stats = await fileOps.lstat(repositoryRoot);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new MigrationWriteConflict(
      ".",
      "Repository root must be an ordinary directory.",
    );
  }
  return fileOps.realpath(repositoryRoot);
}

async function preflightTarget(
  root: string,
  file: PlannedFile & { absolutePath: string },
  fileOps: FileOps,
): Promise<void> {
  const relativeParent = path.relative(root, path.dirname(file.absolutePath));
  let current = root;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = await lstatIfPresent(current, fileOps);
    if (!stats) return;
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new MigrationWriteConflict(
        file.relativePath,
        "A planned target parent is not an ordinary directory.",
      );
    }
  }

  const targetStats = await lstatIfPresent(file.absolutePath, fileOps);
  if (targetStats) {
    throw new MigrationWriteConflict(
      file.relativePath,
      "A planned target already exists; migration never overwrites files.",
    );
  }
}

async function ensureParentDirectories(
  root: string,
  target: string,
  fileOps: FileOps,
  createdDirectories: string[],
): Promise<void> {
  const relativeParent = path.relative(root, path.dirname(target));
  let current = root;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stats = await lstatIfPresent(current, fileOps);
    if (!stats) {
      try {
        await fileOps.mkdir(current);
        createdDirectories.push(current);
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
      }
      stats = await lstatIfPresent(current, fileOps);
    }
    if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new MigrationWriteConflict(
        path.relative(root, target).replaceAll("\\", "/"),
        "A planned target parent became unsafe during the write.",
      );
    }
  }
}

async function removeIfPresent(
  absolutePath: string,
  fileOps: FileOps,
): Promise<void> {
  try {
    await fileOps.unlink(absolutePath);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

async function rollbackOperation(
  temporaryPaths: readonly string[],
  createdFiles: readonly string[],
  createdDirectories: readonly string[],
  fileOps: FileOps,
): Promise<void> {
  const failures: unknown[] = [];
  for (const temporary of [...temporaryPaths].reverse()) {
    try {
      await removeIfPresent(temporary, fileOps);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const createdFile of [...createdFiles].reverse()) {
    try {
      await removeIfPresent(createdFile, fileOps);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await fileOps.rmdir(directory);
    } catch (error) {
      if (!isNodeError(error, "ENOENT", "ENOTEMPTY")) failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Migration rollback was incomplete.");
  }
}

function uniqueResolvedFiles(
  root: string,
  files: readonly PlannedFile[],
): Array<PlannedFile & { absolutePath: string }> {
  const resolved = files.map((file) => resolvePlanFile(root, file));
  const seen = new Set<string>();
  for (const file of resolved) {
    const key = process.platform === "win32"
      ? file.absolutePath.toLowerCase()
      : file.absolutePath;
    if (seen.has(key)) {
      throw new MigrationWriteConflict(
        file.relativePath,
        "The migration plan contains a duplicate target path.",
      );
    }
    seen.add(key);
  }
  return resolved;
}

export async function writeMigrationPlan(
  repositoryRoot: string,
  plan: MigrationPlan,
  fileOps: FileOps = nodeFileOps,
): Promise<void> {
  if (
    plan.report.conflicts.length > 0 ||
    plan.report.validationIssues.length > 0
  ) {
    throw new Error("A blocked migration plan cannot be written.");
  }

  const root = await assertOrdinaryRoot(repositoryRoot, fileOps);
  const files = uniqueResolvedFiles(root, plan.files);
  for (const file of files) await preflightTarget(root, file, fileOps);

  const temporaryPaths = new Set<string>();
  const createdFiles: string[] = [];
  const createdDirectories: string[] = [];
  try {
    for (const file of files) {
      await ensureParentDirectories(
        root,
        file.absolutePath,
        fileOps,
        createdDirectories,
      );
      const temporary = `${file.absolutePath}.migration-${randomUUID()}.tmp`;
      const handle = await fileOps.open(temporary, "wx");
      temporaryPaths.add(temporary);
      try {
        await handle.writeFile(file.content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fileOps.copyFile(
        temporary,
        file.absolutePath,
        constants.COPYFILE_EXCL,
      );
      createdFiles.push(file.absolutePath);
      await fileOps.unlink(temporary);
      temporaryPaths.delete(temporary);
    }
  } catch (error) {
    try {
      await rollbackOperation(
        [...temporaryPaths],
        createdFiles,
        createdDirectories,
        fileOps,
      );
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Migration write failed and rollback was incomplete.",
      );
    }
    throw error;
  }
}

export function normalizeReportPath(reportPath: string): string {
  const prefix = "delivery/migration-reports/";
  if (
    reportPath.includes("\\") ||
    path.posix.isAbsolute(reportPath) ||
    path.posix.normalize(reportPath) !== reportPath ||
    !reportPath.startsWith(prefix)
  ) {
    throw new Error("Report path must stay inside delivery/migration-reports.");
  }
  const fileName = reportPath.slice(prefix.length);
  if (
    fileName.includes("/") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(fileName)
  ) {
    throw new Error("Report path must name one JSON file in the allowlisted directory.");
  }
  return reportPath;
}

function reportFinding(
  code: string,
  message: string,
  targetPath?: string,
): MigrationFinding {
  return {
    code,
    message,
    source: { sourcePath: "migration-plan", exportName: "plannedFiles" },
    ...(targetPath ? { targetPath } : {}),
  };
}

function successfulWriteReport(report: MigrationReport): MigrationReport {
  return {
    ...report,
    migrated: report.migrated.map((entry) => ({
      ...entry,
      status: "written" as const,
    })),
  };
}

function failedWriteReport(
  report: MigrationReport,
  error: unknown,
): MigrationReport {
  const targetPath =
    error instanceof MigrationWriteConflict ? error.relativePath : undefined;
  return {
    ...report,
    migrated: [],
    conflicts: [
      ...report.conflicts,
      reportFinding(
        error instanceof MigrationWriteConflict
          ? "TARGET_WRITE_CONFLICT"
          : "WRITE_FAILED",
        error instanceof AggregateError
          ? "Exclusive migration write failed and rollback needs manual verification."
          : "Exclusive migration write failed; operation-created paths were rolled back.",
        targetPath,
      ),
    ],
  };
}

export async function executeMigration(
  options: MigrationOptions,
  fileOps: FileOps = nodeFileOps,
): Promise<MigrationExecutionResult> {
  const plan = await buildMigrationPlan(options);
  if (plan.report.conflicts.length > 0 || plan.report.validationIssues.length > 0) {
    return { exitCode: 1, report: plan.report };
  }
  if (options.mode === "dry-run") {
    if (options.reportPath) {
      return {
        exitCode: 1,
        report: {
          ...plan.report,
          conflicts: [
            ...plan.report.conflicts,
            reportFinding(
              "REPORT_REQUIRES_WRITE",
              "A report file can only be created with explicit write mode.",
              options.reportPath,
            ),
          ],
        },
      };
    }
    return { exitCode: 0, report: plan.report };
  }

  let reportPath: string | undefined;
  if (options.reportPath) {
    try {
      reportPath = normalizeReportPath(options.reportPath);
    } catch {
      return {
        exitCode: 1,
        report: {
          ...plan.report,
          conflicts: [
            ...plan.report.conflicts,
            reportFinding(
              "REPORT_PATH_INVALID",
              "Report path is outside the allowlisted JSON report directory.",
              options.reportPath,
            ),
          ],
        },
      };
    }
  }

  const finalReport = successfulWriteReport(plan.report);
  const writePlan: MigrationPlan = {
    report: finalReport,
    files: [
      ...plan.files,
      ...(reportPath
        ? [
            {
              relativePath: reportPath,
              content: `${JSON.stringify(finalReport, null, 2)}\n`,
            },
          ]
        : []),
    ],
  };
  try {
    await writeMigrationPlan(options.repositoryRoot, writePlan, fileOps);
    return { exitCode: 0, report: finalReport };
  } catch (error) {
    return { exitCode: 1, report: failedWriteReport(plan.report, error) };
  }
}
