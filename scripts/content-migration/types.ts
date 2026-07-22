import type {
  ContentRecord,
  ContentType,
  ValidationIssue,
} from "@algae-atlas/content-schema";

export type MigrationMode = "dry-run" | "write";

export type MigrationOptions = {
  mode: MigrationMode;
  operationAt: string;
  repositoryRoot: string;
  reportPath?: string;
};

export type SourceLocator = {
  sourcePath: string;
  exportName: string;
  sourceId?: string;
};

export type MigrationFinding = {
  code: string;
  message: string;
  source: SourceLocator;
  targetType?: ContentType;
  targetPath?: string;
  field?: string;
};

export type MigrationCandidate = {
  source: SourceLocator;
  record: ContentRecord;
  markdown: { zh: string; en?: string };
  missingFields: MigrationFinding[];
  manualReview: MigrationFinding[];
  missingImageAttribution: MigrationFinding[];
};

export type PlannedFile = {
  relativePath: string;
  content: string;
  recordId?: string;
};

export type MigratedEntry = {
  source: SourceLocator;
  targetType: ContentType;
  targetPath: string;
  status: "planned" | "written";
};

export type MigrationReport = {
  reportVersion: 1;
  mode: MigrationMode;
  contentSchemaVersion: 1;
  repositoryApiVersion: 1;
  migrationLedgerVersion: 1;
  operationAt: string;
  migrated: MigratedEntry[];
  skipped: MigrationFinding[];
  missingFields: MigrationFinding[];
  manualReview: MigrationFinding[];
  conflicts: MigrationFinding[];
  missingImageAttribution: MigrationFinding[];
  validationIssues: ValidationIssue[];
};

export type MigrationPlan = {
  files: PlannedFile[];
  report: MigrationReport;
};

export type MigrationExecutionResult = {
  exitCode: number;
  report: MigrationReport;
};
