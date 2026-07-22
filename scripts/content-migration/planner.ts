import type { Stats } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  serializeRecord,
  validateRepository,
  type RepositorySnapshot,
} from "@algae-atlas/content-schema";

import { loadContentRepository } from "../../lib/content-repository/file-loader";
import { projects } from "../../lib/site-data";
import { news, outputs, teamMembers } from "../../lib/team-data";
import { buildScienceArticleCandidates } from "./science-articles";
import type {
  MigrationCandidate,
  MigrationFinding,
  MigrationMode,
  MigrationPlan,
  MigrationReport,
  PlannedFile,
  SourceLocator,
} from "./types";

const RECORD_FILE_NAMES = ["record.json", "zh.md", "en.md"] as const;
const LEDGER_PATH = "content/migration-ledger.json";

export type BuildMigrationPlanOptions = {
  mode: MigrationMode;
  operationAt: string;
  repositoryRoot: string;
  reportPath?: string;
};

type TargetState = "absent" | "complete" | "conflict";

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

async function lstatIfPresent(absolutePath: string): Promise<Stats | undefined> {
  try {
    return await lstat(absolutePath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
}

function recordPath(candidate: MigrationCandidate): string {
  return `content/records/${candidate.record.type}/${candidate.record.id}/record.json`;
}

function targetFinding(
  candidate: MigrationCandidate,
  code: string,
  message: string,
): MigrationFinding {
  return {
    code,
    message,
    source: candidate.source,
    targetType: candidate.record.type,
    targetPath: recordPath(candidate),
  };
}

function sourceFinding(
  code: string,
  message: string,
  source: SourceLocator,
): MigrationFinding {
  return { code, message, source };
}

async function classifyCandidateTarget(
  repositoryRoot: string,
  candidate: MigrationCandidate,
  conflicts: MigrationFinding[],
): Promise<TargetState> {
  const directorySegments = [
    "content",
    "records",
    candidate.record.type,
    candidate.record.id,
  ];
  let current = repositoryRoot;

  const rootStats = await lstatIfPresent(repositoryRoot);
  if (!rootStats || rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    conflicts.push(
      targetFinding(
        candidate,
        "REPOSITORY_ROOT_UNSAFE",
        "Repository root must be an existing ordinary directory.",
      ),
    );
    return "conflict";
  }

  for (const segment of directorySegments) {
    current = path.join(current, segment);
    const stats = await lstatIfPresent(current);
    if (!stats) return "absent";
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      conflicts.push(
        targetFinding(
          candidate,
          "TARGET_PATH_UNSAFE",
          `Target path component ${segment} is not an ordinary directory.`,
        ),
      );
      return "conflict";
    }
  }

  const fileStats = await Promise.all(
    RECORD_FILE_NAMES.map((fileName) =>
      lstatIfPresent(path.join(current, fileName)),
    ),
  );
  if (fileStats.every((stats) => stats?.isFile() && !stats.isSymbolicLink())) {
    return "complete";
  }

  conflicts.push(
    targetFinding(
      candidate,
      "PARTIAL_TARGET_CONFLICT",
      "Target record directory exists but is not a complete ordinary bilingual record.",
    ),
  );
  return "conflict";
}

function serializeCandidateFiles(
  candidates: readonly MigrationCandidate[],
): PlannedFile[] {
  return candidates.flatMap((candidate) => {
    const base = `content/records/${candidate.record.type}/${candidate.record.id}`;
    const files: PlannedFile[] = [
      {
        relativePath: `${base}/record.json`,
        content: serializeRecord(candidate.record),
        recordId: candidate.record.id,
      },
      {
        relativePath: `${base}/zh.md`,
        content: candidate.markdown.zh,
        recordId: candidate.record.id,
      },
    ];
    if (candidate.markdown.en !== undefined) {
      files.push({
        relativePath: `${base}/en.md`,
        content: candidate.markdown.en,
        recordId: candidate.record.id,
      });
    }
    return files;
  });
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function migrationLedger(candidates: readonly MigrationCandidate[]): string {
  const blockerCodes = new Set(
    candidates.flatMap((candidate) => [
      ...candidate.missingFields.map(({ code }) => code),
      ...candidate.manualReview.map(({ code }) => code),
      ...candidate.missingImageAttribution.map(({ code }) => code),
    ]),
  );
  blockerCodes.add("MANUAL_CLASSIFICATION_REQUIRED");

  return stableJson({
    schemaVersion: 1,
    contentSchemaVersion: 1,
    repositoryApiVersion: 1,
    migrationLedgerVersion: 1,
    collections: {
      "science-article": {
        source: "legacy",
        legacyFiles: ["lib/site-data.ts"],
        legacyExports: ["articles", "projects"],
        sourceRecordCount: candidates.length + projects.length,
        candidateRecordCount: candidates.length,
        candidateIds: candidates.map(({ record }) => record.id).sort(),
        parityStatus: "blocked-review",
        sourceSwitchAllowed: false,
        blockers: [...blockerCodes].sort(),
        lastVerifiedCommit: null,
      },
    },
  });
}

async function planLedger(
  repositoryRoot: string,
  candidates: readonly MigrationCandidate[],
  report: MigrationReport,
): Promise<PlannedFile | undefined> {
  const content = migrationLedger(candidates);
  const absolutePath = path.join(repositoryRoot, ...LEDGER_PATH.split("/"));
  const stats = await lstatIfPresent(absolutePath);
  const source: SourceLocator = {
    sourcePath: "lib/site-data.ts",
    exportName: "articles",
  };

  if (!stats) return { relativePath: LEDGER_PATH, content };
  if (stats.isSymbolicLink() || !stats.isFile()) {
    report.conflicts.push({
      code: "LEDGER_TARGET_UNSAFE",
      message: "Migration ledger target is not an ordinary file.",
      source,
      targetPath: LEDGER_PATH,
    });
    return undefined;
  }

  const existing = await readFile(absolutePath, "utf8");
  if (existing === content) {
    report.skipped.push({
      code: "LEDGER_EXISTS",
      message: "The deterministic migration ledger already exists.",
      source,
      targetPath: LEDGER_PATH,
    });
    return undefined;
  }

  report.conflicts.push({
    code: "LEDGER_CONFLICT",
    message: "An existing migration ledger differs from the deterministic plan.",
    source,
    targetPath: LEDGER_PATH,
  });
  return undefined;
}

function addInventoryFindings(report: MigrationReport): void {
  for (const project of projects) {
    report.skipped.push(
      sourceFinding(
        "MANUAL_CLASSIFICATION_REQUIRED",
        "Legacy project-like content needs an authorized content-type decision.",
        {
          sourcePath: "lib/site-data.ts",
          exportName: "projects",
          sourceId: project.id,
        },
      ),
    );
  }

  const emptyCollections = [
    ["news", news.length],
    ["outputs", outputs.length],
    ["teamMembers", teamMembers.length],
  ] as const;
  for (const [exportName, count] of emptyCollections) {
    report.skipped.push(
      sourceFinding(
        count === 0 ? "EMPTY_COLLECTION_PRESERVED" : "DEFERRED_ADAPTER",
        count === 0
          ? "The legacy collection is empty and remains unchanged."
          : "The non-empty legacy collection is deferred to a dedicated adapter.",
        { sourcePath: "lib/team-data.ts", exportName },
      ),
    );
  }

  const deferred = [
    ["lib/site-data.ts", "algae"],
    ["lib/team-data.ts", "tutorials"],
    ["lib/live-feeds-data.ts", "liveFeedEntries"],
    ["lib/research-capabilities-data.ts", "researchCapabilities"],
    ["lib/collaboration-data.ts", "collaborationAreas"],
  ] as const;
  for (const [sourcePath, exportName] of deferred) {
    report.skipped.push(
      sourceFinding(
        "DEFERRED_ADAPTER",
        "This legacy collection is deferred to a later approved adapter batch.",
        { sourcePath, exportName },
      ),
    );
  }
}

function combinedSnapshot(
  base: RepositorySnapshot,
  candidates: readonly MigrationCandidate[],
): RepositorySnapshot {
  const markdown = { ...base.markdown };
  const recordPaths = { ...base.recordPaths };

  for (const candidate of candidates) {
    markdown[`${candidate.record.type}/${candidate.record.id}/zh.md`] =
      candidate.markdown.zh;
    if (candidate.markdown.en !== undefined) {
      markdown[`${candidate.record.type}/${candidate.record.id}/en.md`] =
        candidate.markdown.en;
    }
    recordPaths[candidate.record.id] = recordPath(candidate);
  }

  return {
    ...base,
    records: [...base.records, ...candidates.map(({ record }) => record)],
    markdown,
    recordPaths,
  };
}

function createReport(
  options: BuildMigrationPlanOptions,
  candidates: readonly MigrationCandidate[],
): MigrationReport {
  return {
    reportVersion: 1,
    mode: options.mode,
    contentSchemaVersion: 1,
    repositoryApiVersion: 1,
    migrationLedgerVersion: 1,
    operationAt: options.operationAt,
    migrated: [],
    skipped: [],
    missingFields: candidates.flatMap(({ missingFields }) => missingFields),
    manualReview: candidates.flatMap(({ manualReview }) => manualReview),
    conflicts: [],
    missingImageAttribution: candidates.flatMap(
      ({ missingImageAttribution }) => missingImageAttribution,
    ),
    validationIssues: [],
  };
}

export async function buildMigrationPlan(
  options: BuildMigrationPlanOptions,
): Promise<MigrationPlan> {
  const candidates = buildScienceArticleCandidates(options.operationAt);
  const report = createReport(options, candidates);
  addInventoryFindings(report);

  const accepted: MigrationCandidate[] = [];
  for (const candidate of candidates) {
    const state = await classifyCandidateTarget(
      options.repositoryRoot,
      candidate,
      report.conflicts,
    );
    if (state === "absent") {
      accepted.push(candidate);
    } else if (state === "complete") {
      report.skipped.push(
        targetFinding(
          candidate,
          "TARGET_EXISTS",
          "A complete validated record already exists at the stable target path.",
        ),
      );
    }
  }

  if (report.conflicts.length > 0) return { files: [], report };

  const loaded = await loadContentRepository(options.repositoryRoot);
  report.validationIssues = validateRepository(
    combinedSnapshot(loaded.snapshot, accepted),
  );
  if (report.validationIssues.length > 0) return { files: [], report };

  const files = serializeCandidateFiles(accepted);
  const ledger = await planLedger(options.repositoryRoot, candidates, report);
  if (report.conflicts.length > 0) return { files: [], report };
  if (ledger) files.push(ledger);

  report.migrated = accepted.map((candidate) => ({
    source: candidate.source,
    targetType: candidate.record.type,
    targetPath: recordPath(candidate),
    status: "planned",
  }));
  return { files, report };
}
