# Stage-03 Legacy Content Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a default-dry-run, schema-validated legacy-content migration tool, exercise its exclusive write path with three real bilingual draft science-article candidates, and deliver a verified offline Stage-03 bundle without changing any public source selector.

**Architecture:** Static legacy adapters produce in-memory candidates and findings; a planner combines them with the formal repository snapshot, validates through the Stage-01 contract, and derives an exclusive file plan. Dry-run returns the report without touching the filesystem; write mode uses create-new semantics and operation-scoped rollback. The Stage-02 website remains entirely on `legacy`.

**Tech Stack:** Node.js 22, TypeScript 5.9, `tsx`, Node test runner, Stage-01 `@algae-atlas/content-schema`, Stage-02 filesystem loader, Next.js 16.

## Global Constraints

- Baseline must remain `86c2e209fe77cc644d946bff9901d740f9fb3ee1` plus the approved design commit.
- Work only on `local/stage-03-migration` in `D:\algae-workbench\worktrees\Stage-03`.
- The bare migration command and `--dry-run` write no files or directories.
- Actual content writes require the exact `--write` flag; no force/overwrite/delete option exists.
- Do not invent author, reviewer, DOI, location, member, project, licence, consent, taxonomy, translation, or publication facts.
- Initial real candidates are only the three entries in `articles`; `projects` remains manual-classification-only.
- Candidate locales remain `draft`; all 11 production collection selectors remain `legacy`.
- Do not alter legacy TypeScript exports, existing images, routes, navigation, theme, database/Worker/Drizzle structures, remotes, GitHub, or production.
- Use `npm.cmd` on Windows and preserve UTF-8 without BOM, LF, and one final newline.
- Each task ends with focused tests and one local commit.

---

### Task 1: Add the read-only migration domain, adapter, planner, and dry-run CLI

**Files:**
- Create: `scripts/content-migration/types.ts`
- Create: `scripts/content-migration/science-articles.ts`
- Create: `scripts/content-migration/planner.ts`
- Create: `scripts/content-migration/cli.ts`
- Create: `scripts/migrate-content.ts`
- Create: `tests/content-migration/science-articles.test.ts`
- Create: `tests/content-migration/dry-run.test.ts`
- Create: `tsconfig.content-migration.json`
- Modify: `package.json`
- Modify: `.gitattributes`

**Interfaces:**
- Consumes: `articles`, `projects`, `imageCredits`, empty `news`/`outputs`/`teamMembers`, `loadContentRepository`, `parseRecord`, `serializeRecord`, and `validateRepository`.
- Produces: `buildScienceArticleCandidates(operationAt): MigrationCandidate[]`, `buildMigrationPlan(options): Promise<MigrationPlan>`, `runMigrationCli(args, dependencies?): Promise<number>`, and the command `npm.cmd run content:migrate`.

- [ ] **Step 1: Write the failing adapter test**

Create `tests/content-migration/science-articles.test.ts` with these exact assertions:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { parseRecord } from "@algae-atlas/content-schema";
import { articles, projects } from "../../lib/site-data";
import { buildScienceArticleCandidates } from "../../scripts/content-migration/science-articles";

const operationAt = "2026-07-22T21:00:00+08:00";

test("three public-insight articles become bilingual draft candidates", () => {
  const candidates = buildScienceArticleCandidates(operationAt);
  assert.deepEqual(candidates.map(({ record }) => record.id), [
    "what-are-algae",
    "why-water-turns-green",
    "photobioreactor-basics",
  ]);
  assert.equal(candidates.length, articles.length);
  assert.notEqual(candidates.length, projects.length + articles.length);

  for (const candidate of candidates) {
    assert.equal(candidate.record.type, "science-article");
    assert.equal(candidate.record.locales.zh.state, "draft");
    assert.equal(candidate.record.locales.en.state, "draft");
    assert.deepEqual(candidate.record.authors, []);
    assert.deepEqual(candidate.record.media, []);
    assert.equal("coverMediaId" in candidate.record.shared, false);
    assert.equal(parseRecord(candidate.record).success, true);
    assert.equal(candidate.markdown.zh.endsWith("\n"), true);
    assert.equal(candidate.markdown.en?.endsWith("\n"), true);
    assert.equal(candidate.source.sourcePath, "lib/site-data.ts");
    assert.equal(candidate.source.exportName, "articles");
  }
});

test("classification, text, route identity, and blockers are explicit", () => {
  const candidates = buildScienceArticleCandidates(operationAt);
  assert.deepEqual(
    candidates.map(({ record }) => record.shared.articleKind),
    ["foundation", "observation-guide", "method-explainer"],
  );
  candidates.forEach((candidate, index) => {
    const source = articles[index];
    assert.equal(candidate.record.id, source.id);
    assert.equal(candidate.record.locales.zh.title, source.title.zh);
    assert.equal(candidate.record.locales.en.title, source.title.en);
    assert.equal(candidate.record.locales.zh.summary, source.summary.zh);
    assert.equal(candidate.record.locales.en.summary, source.summary.en);
    assert.equal(candidate.record.shared.publicationDate, source.date);
    assert.ok(candidate.manualReview.some(({ code }) => code === "AUTHOR_CONFIRMATION_REQUIRED"));
    assert.ok(candidate.manualReview.some(({ code }) => code === "TRANSLATION_PROVENANCE_UNVERIFIED"));
    assert.ok(candidate.missingImageAttribution.some(({ code }) => code === "IMAGE_USAGE_SCOPE_PENDING"));
  });
});
```

- [ ] **Step 2: Run the adapter test and verify it fails**

Run:

```powershell
npm.cmd exec -- tsx --test tests/content-migration/science-articles.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/content-migration/science-articles`.

- [ ] **Step 3: Define the migration types and science-article adapter**

Create `scripts/content-migration/types.ts` with these public shapes:

```ts
import type {
  ContentRecord,
  ContentType,
  ValidationIssue,
} from "@algae-atlas/content-schema";

export type MigrationMode = "dry-run" | "write";

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
```

Create `scripts/content-migration/science-articles.ts`. Use a fixed ID mapping, parse both localized reading-time labels with `/\d+/`, set the technical timestamps from `operationAt`, serialize no media or authors, and parse each raw record before returning it:

```ts
import { parseRecord, type ContentRecord } from "@algae-atlas/content-schema";
import { articles, imageCredits } from "../../lib/site-data";
import type {
  MigrationCandidate,
  MigrationFinding,
  SourceLocator,
} from "./types";

const ARTICLE_KINDS = {
  "what-are-algae": "foundation",
  "why-water-turns-green": "observation-guide",
  "photobioreactor-basics": "method-explainer",
} as const;

function finding(
  code: string,
  message: string,
  source: SourceLocator,
  field?: string,
): MigrationFinding {
  return {
    code,
    message,
    source,
    targetType: "science-article",
    targetPath: `content/records/science-article/${source.sourceId}/record.json`,
    ...(field ? { field } : {}),
  };
}

function readMinutes(value: { zh: string; en: string }): number {
  const zh = Number(value.zh.match(/\d+/)?.[0]);
  const en = Number(value.en.match(/\d+/)?.[0]);
  if (!Number.isInteger(zh) || zh <= 0 || zh !== en) {
    throw new Error(`阅读时长不一致：${value.zh} / ${value.en}`);
  }
  return zh;
}

export function buildScienceArticleCandidates(
  operationAt: string,
): MigrationCandidate[] {
  const reviewDate = operationAt.slice(0, 10);
  return articles.map((article) => {
    const source: SourceLocator = {
      sourcePath: "lib/site-data.ts",
      exportName: "articles",
      sourceId: article.id,
    };
    const localized = (locale: "zh" | "en") => ({
      state: "draft" as const,
      title: article.title[locale],
      summary: article.summary[locale],
      bodyFile: locale === "zh" ? ("zh.md" as const) : ("en.md" as const),
      fields: {
        topic: article.note[locale],
        targetAudienceLabel: locale === "zh" ? "公众读者" : "General readers",
        categoryLabel: article.note[locale],
        takeaways: [],
      },
      translationOrigin: "source-authored" as const,
      review: {
        status: "draft" as const,
        updatedAt: reviewDate,
        version: "0.1",
        reviewerIds: [],
        references: [],
      },
    });
    const raw = {
      schemaVersion: 1 as const,
      id: article.id,
      type: "science-article" as const,
      createdAt: operationAt,
      updatedAt: operationAt,
      authors: [],
      tags: [],
      media: [],
      shared: {
        articleKind: ARTICLE_KINDS[article.id as keyof typeof ARTICLE_KINDS],
        publicationDate: article.date,
        targetAudience: "general" as const,
        readingTimeMinutes: readMinutes(article.readTime),
        references: [],
        relatedContentIds: [],
      },
      locales: { zh: localized("zh"), en: localized("en") },
      legacy: {
        sourcePath: source.sourcePath,
        exportName: source.exportName,
        sourceId: article.id,
        migratedAt: operationAt,
      },
    };
    const parsed = parseRecord(raw);
    if (!parsed.success) {
      throw new Error(parsed.issues.map(({ code, path }) => `${code}:${path}`).join(", "));
    }
    const creditId = article.image.split("/").at(-1)?.split(".")[0];
    const credit = imageCredits.find(({ id }) => id === creditId);
    return {
      source,
      record: parsed.data satisfies ContentRecord,
      markdown: {
        zh: `${article.summary.zh}\n`,
        en: `${article.summary.en}\n`,
      },
      missingFields: [
        finding("AUTHOR_MISSING", "旧数据没有可核验作者 ID。", source, "authors"),
        finding("REVIEWER_MISSING", "旧数据没有可核验审核人 ID。", source, "locales.*.review.reviewerIds"),
      ],
      manualReview: [
        finding("AUTHOR_CONFIRMATION_REQUIRED", "发布前必须确认公开作者。", source),
        finding("TRANSLATION_PROVENANCE_UNVERIFIED", "英文来源历史需要人工确认。", source),
        finding("TARGET_AUDIENCE_DERIVED", "general 来源于现有公众科普栏目。", source),
        finding("BODY_COMPLETENESS_REVIEW_REQUIRED", "候选正文只保留现有摘要。", source),
        finding("PUBLICATION_REVIEW_REQUIRED", "候选保持 draft，不能切换来源。", source),
      ],
      missingImageAttribution: [
        finding(
          "IMAGE_USAGE_SCOPE_PENDING",
          credit
            ? `${article.image}: ${credit.credit}; ${credit.license}`
            : `${article.image}: 未找到图片署名记录`,
          source,
          "shared.coverMediaId",
        ),
      ],
    };
  });
}
```

- [ ] **Step 4: Add the failing dry-run filesystem test**

Create `tests/content-migration/dry-run.test.ts`. Build a temporary root containing empty `content/records`, `content/authors`, and `content/media`, snapshot every relative file before and after, and assert the report has three planned records, three project skips, empty-collection skips, and no changed path:

```ts
test("default dry-run reports candidates and writes nothing", async () => {
  await withEmptyRepository(async (root) => {
    const before = await snapshotTree(root);
    const plan = await buildMigrationPlan({
      mode: "dry-run",
      operationAt: "2026-07-22T21:00:00+08:00",
      repositoryRoot: root,
    });
    const after = await snapshotTree(root);
    assert.deepEqual(after, before);
    assert.equal(plan.files.length, 10);
    assert.equal(plan.report.migrated.length, 3);
    assert.ok(plan.report.skipped.some(({ code }) => code === "MANUAL_CLASSIFICATION_REQUIRED"));
    assert.equal(plan.report.conflicts.length, 0);
    assert.equal(plan.report.validationIssues.length, 0);
  });
});
```

- [ ] **Step 5: Run the dry-run test and verify it fails**

Run:

```powershell
npm.cmd exec -- tsx --test tests/content-migration/dry-run.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/content-migration/planner`.

- [ ] **Step 6: Implement the read-only planner and dry-run CLI**

`buildMigrationPlan` must:

```ts
export async function buildMigrationPlan(options: {
  mode: MigrationMode;
  operationAt: string;
  repositoryRoot: string;
  reportPath?: string;
}): Promise<MigrationPlan> {
  const loaded = await loadContentRepository(options.repositoryRoot);
  const candidates = buildScienceArticleCandidates(options.operationAt);
  const report = createReport(options.mode, options.operationAt, candidates);
  const accepted = await classifyTargets(options.repositoryRoot, loaded, candidates, report);
  validateCombinedSnapshot(loaded.snapshot, accepted, report);
  const files = serializeCandidateFiles(accepted);
  files.push(await planLedger(options.repositoryRoot, candidates, report));
  return { files: files.filter((file): file is PlannedFile => Boolean(file)), report };
}
```

The helper implementations must use `lstat`, never follow a symlink/reparse target, classify a complete existing record as `TARGET_EXISTS`, classify a partial directory as `PARTIAL_TARGET_CONFLICT`, add `projects` as `MANUAL_CLASSIFICATION_REQUIRED`, and add empty `news`, `outputs`, and `teamMembers` as `EMPTY_COLLECTION_PRESERVED`. The combined snapshot contains existing records plus accepted candidates and Markdown and is passed once to `validateRepository`.

The first CLI version accepts no arguments, `--dry-run`, and `--help`; it rejects `--write`, `--report`, and unknown arguments with exit code 2. It calls the planner with `mode: "dry-run"`, prints a concise count line, then prints `JSON.stringify(report, null, 2)`. `scripts/migrate-content.ts` sets `process.exitCode` from `runMigrationCli(process.argv.slice(2))`.

- [ ] **Step 7: Wire TypeScript, tests, scripts, and LF rules**

Create `tsconfig.content-migration.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "allowJs": false,
    "incremental": false,
    "noEmit": true
  },
  "include": [
    "scripts/content-migration/**/*.ts",
    "scripts/migrate-content.ts",
    "scripts/validate-content.ts",
    "tests/content-migration/**/*.ts"
  ],
  "exclude": ["node_modules", ".next", "build", "dist"]
}
```

Add these scripts to `package.json` and include them in the existing `check`/`test` chains:

```json
"check:content-migration": "tsc --noEmit -p tsconfig.content-migration.json",
"content:migrate": "tsx scripts/migrate-content.ts",
"test:content-migration": "tsx --test tests/content-migration/*.test.ts"
```

Append exact LF rules to `.gitattributes` for `/docs/superpowers/**`, `/scripts/content-migration/**`, `/scripts/migrate-content.ts`, `/tests/content-migration/**`, and `/tsconfig.content-migration.json`.

- [ ] **Step 8: Run focused checks**

Run:

```powershell
npm.cmd run check:content-migration
npm.cmd run test:content-migration
npm.cmd run content:migrate -- --dry-run
git diff --check
```

Expected: type check PASS; adapter and dry-run tests PASS; CLI reports 3 planned candidates and no conflicts; `git diff --check` prints nothing.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- .gitattributes package.json tsconfig.content-migration.json scripts/content-migration scripts/migrate-content.ts tests/content-migration
git commit -m "feat: add dry-run legacy content migration"
```

---

### Task 2: Add exclusive writes, complete reports, conflicts, and rollback

**Files:**
- Create: `scripts/content-migration/writer.ts`
- Create: `tests/content-migration/write-safety.test.ts`
- Modify: `scripts/content-migration/planner.ts`
- Modify: `scripts/content-migration/cli.ts`
- Modify: `scripts/content-migration/types.ts`

**Interfaces:**
- Consumes: the validated `MigrationPlan` from Task 1.
- Produces: `writeMigrationPlan(repositoryRoot, plan, fileOps?): Promise<void>`, `executeMigration(options, fileOps?): Promise<{ exitCode: number; report: MigrationReport }>`, write-mode CLI support, and optional report capture restricted to `delivery/migration-reports/*.json`.

- [ ] **Step 1: Write failing no-overwrite and repeatability tests**

Create `tests/content-migration/write-safety.test.ts` with these cases:

```ts
test("write creates only the planned candidates and deterministic ledger", async () => {
  await withEmptyRepository(async (root) => {
    const result = await executeMigration({
      mode: "write",
      operationAt: FIXED_TIME,
      repositoryRoot: root,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.migrated.length, 3);
    assert.equal(result.report.migrated.every(({ status }) => status === "written"), true);
    assert.deepEqual(await recordIds(root), [
      "photobioreactor-basics",
      "what-are-algae",
      "why-water-turns-green",
    ]);
    assert.equal(await exists(path.join(root, "content/migration-ledger.json")), true);
  });
});

test("second write creates no duplicate and preserves every byte", async () => {
  await withEmptyRepository(async (root) => {
    await executeMigration({ mode: "write", operationAt: FIXED_TIME, repositoryRoot: root });
    const before = await snapshotTree(root);
    const second = await executeMigration({ mode: "write", operationAt: LATER_TIME, repositoryRoot: root });
    assert.equal(second.exitCode, 0);
    assert.equal(second.report.migrated.length, 0);
    assert.equal(second.report.skipped.filter(({ code }) => code === "TARGET_EXISTS").length, 3);
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("partial manual target aborts all writes and remains byte-identical", async () => {
  await withEmptyRepository(async (root) => {
    const manualPath = path.join(root, "content/records/science-article/what-are-algae/record.json");
    await mkdir(path.dirname(manualPath), { recursive: true });
    await writeFile(manualPath, "manual-content\n", "utf8");
    const before = await snapshotTree(root);
    const result = await executeMigration({ mode: "write", operationAt: FIXED_TIME, repositoryRoot: root });
    assert.equal(result.exitCode, 1);
    assert.ok(result.report.conflicts.some(({ code }) => code === "PARTIAL_TARGET_CONFLICT"));
    assert.deepEqual(await snapshotTree(root), before);
  });
});

test("injected copy failure removes only operation-created paths", async () => {
  await withEmptyRepository(async (root) => {
    const before = await snapshotTree(root);
    const result = await executeMigration(
      { mode: "write", operationAt: FIXED_TIME, repositoryRoot: root },
      failingFileOpsOnFourthCopy(),
    );
    assert.equal(result.exitCode, 1);
    assert.deepEqual(await snapshotTree(root), before);
  });
});
```

- [ ] **Step 2: Run the write tests and verify they fail**

Run:

```powershell
npm.cmd exec -- tsx --test tests/content-migration/write-safety.test.ts
```

Expected: FAIL because `executeMigration`/`writer.ts` does not exist.

- [ ] **Step 3: Implement the exclusive writer**

Create `writer.ts` around an injectable `FileOps` interface containing `lstat`, `mkdir`, `open`, `copyFile`, `unlink`, and `rmdir`. The production implementation must use this sequence for every file:

```ts
const temporary = `${target}.migration-${randomUUID()}.tmp`;
const handle = await open(temporary, "wx");
try {
  await handle.writeFile(file.content, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
await copyFile(temporary, target, constants.COPYFILE_EXCL);
await unlink(temporary);
createdFiles.push(target);
```

Canonicalize the repository root once, require every resolved target to remain below it, create path components one at a time, reject symbolic links/non-directories, and track created directories. On failure, delete temporary paths and created files in reverse order, then remove only operation-created empty directories. Never call recursive `rm`, `reset`, `clean`, `restore`, or `stash`.

- [ ] **Step 4: Implement write/report CLI behavior**

Extend the CLI parser to accept exactly:

```text
--dry-run
--write
--report delivery/migration-reports/<name>.json
--help
```

Reject `--dry-run --write`, missing report values, absolute paths, traversal, non-JSON names, and report paths outside the allowlisted directory. `--report` is legal only with `--write`. Add the final report file to the same validated file plan so a report failure rolls back candidate files too. If the plan has conflicts or validation issues, return 1 before calling the writer.

- [ ] **Step 5: Run focused safety tests**

Run:

```powershell
npm.cmd run check:content-migration
npm.cmd run test:content-migration
git diff --check
```

Expected: all migration tests PASS, including zero-write dry-run, exclusive creation, second-run idempotence, partial-target preservation, and injected rollback.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- scripts/content-migration tests/content-migration
git commit -m "feat: add migration reports and conflict handling"
```

---

### Task 3: Make `content:validate` validate the formal repository by default

**Files:**
- Modify: `scripts/validate-content.ts`
- Modify: `packages/content-schema/tests/cli.test.ts`
- Create: `tests/content-migration/repository-validation.test.ts`

**Interfaces:**
- Consumes: Stage-02 `loadContentRepository(repositoryRoot)` and `ContentRepositoryLoadError`.
- Produces: no-argument repository validation while preserving record-file, snapshot, `--json`, and `--help` behavior.

- [ ] **Step 1: Change the existing CLI test to require repository mode**

Replace the old `runContentValidationCli([], io) === 2` assertion with a temporary empty formal repository and:

```ts
assert.equal(await runContentValidationCli([], io, repositoryRoot), 0);
assert.ok(stdout.some((line) => line.includes("PASS")));
```

Add a migration-layer test that writes an invalid formal `record.json`, calls no-argument validation, expects exit code 1, and asserts diagnostics contain repository-relative paths but not the temporary absolute root.

- [ ] **Step 2: Run focused tests and verify the new expectation fails**

Run:

```powershell
npm.cmd exec -- tsx --test packages/content-schema/tests/cli.test.ts tests/content-migration/repository-validation.test.ts
```

Expected: FAIL because empty args still return help/2 and the third repository-root argument is unsupported.

- [ ] **Step 3: Extend the validator without breaking Stage-01 inputs**

Update the argument union:

```ts
type ParsedArguments =
  | { mode: "help"; json: boolean }
  | { mode: "repository"; json: boolean }
  | { mode: "records"; json: boolean; files: string[] }
  | { mode: "snapshot"; json: boolean; file: string };
```

Empty filtered arguments return `{ mode: "repository", json }`; only explicit `--help` returns help. Extend the public function:

```ts
export async function runContentValidationCli(
  args: string[],
  io: CliIO = defaultIO,
  repositoryRoot = process.cwd(),
): Promise<number>
```

For repository mode, call `loadContentRepository(repositoryRoot)`. Convert `ContentRepositoryLoadError.issues` directly to the existing issue printer; convert other exceptions to a single `CLI_REPOSITORY_READ_FAILED` issue without exposing the absolute root. Preserve existing record and snapshot code paths byte-for-byte except for shared control flow.

- [ ] **Step 4: Run validation tests and commands**

Run:

```powershell
npm.cmd exec -- tsx --test packages/content-schema/tests/cli.test.ts tests/content-migration/repository-validation.test.ts
npm.cmd run content:validate
npm.cmd run check:content-migration
```

Expected: tests PASS; current empty formal repository prints `PASS`; TypeScript passes.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- scripts/validate-content.ts packages/content-schema/tests/cli.test.ts tests/content-migration/repository-validation.test.ts
git commit -m "feat: validate the formal content repository"
```

---

### Task 4: Exercise the real write path and add non-public parity evidence

**Files:**
- Create via migration command: `content/migration-ledger.json`
- Create via migration command: `content/records/science-article/what-are-algae/record.json`
- Create via migration command: `content/records/science-article/what-are-algae/zh.md`
- Create via migration command: `content/records/science-article/what-are-algae/en.md`
- Create via migration command: `content/records/science-article/why-water-turns-green/record.json`
- Create via migration command: `content/records/science-article/why-water-turns-green/zh.md`
- Create via migration command: `content/records/science-article/why-water-turns-green/en.md`
- Create via migration command: `content/records/science-article/photobioreactor-basics/record.json`
- Create via migration command: `content/records/science-article/photobioreactor-basics/zh.md`
- Create via migration command: `content/records/science-article/photobioreactor-basics/en.md`
- Create via migration command: `delivery/migration-reports/stage-03-science-articles.json`
- Create: `tests/content-migration/real-candidates.test.ts`
- Modify: `tests/content-repository/file-loader.test.ts`

**Interfaces:**
- Consumes: the write-mode CLI from Task 2 and no-argument validator from Task 3.
- Produces: three formal draft records, one deterministic ledger, one traceable initial report, and regression proof that public routing still uses legacy data.

- [ ] **Step 1: Write the failing real-candidate regression test**

Create `tests/content-migration/real-candidates.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { articles } from "../../lib/site-data";
import { collectionSourceSelection } from "../../lib/content-repository/default-repository";
import { loadContentRepository } from "../../lib/content-repository/file-loader";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

test("formal candidates preserve key legacy fields but remain non-public", async () => {
  const loaded = await loadContentRepository(repositoryRoot);
  assert.equal(loaded.records.length, 3);
  assert.deepEqual(
    loaded.records.map(({ id }) => id).sort(),
    articles.map(({ id }) => id).sort(),
  );
  for (const source of articles) {
    const record = loaded.records.find(({ id }) => id === source.id);
    assert.ok(record && record.type === "science-article");
    assert.equal(record.locales.zh.title, source.title.zh);
    assert.equal(record.locales.en.state === "missing" ? undefined : record.locales.en.title, source.title.en);
    assert.equal(record.locales.zh.summary, source.summary.zh);
    assert.equal(record.shared.publicationDate, source.date);
    assert.equal(record.locales.zh.state, "draft");
    assert.equal(record.locales.en.state, "draft");
    assert.deepEqual(record.media, []);
  }
  assert.ok(Object.values(collectionSourceSelection).every((source) => source === "legacy"));
});
```

Modify the Stage-02 formal-content test to expect three draft records, zero authors, zero media, and no eligible public locale instead of expecting zero records.

- [ ] **Step 2: Run the real-candidate test and verify it fails before writing**

Run:

```powershell
npm.cmd exec -- tsx --test tests/content-migration/real-candidates.test.ts
```

Expected: FAIL because the formal repository still has zero records.

- [ ] **Step 3: Prove dry-run changes no Git-visible file**

Run and record both status outputs:

```powershell
git status --short
npm.cmd run content:migrate -- --dry-run
git status --short
```

Expected: the two status sets are identical; report shows 3 planned records, no conflicts, and review/image blockers.

- [ ] **Step 4: Run the explicit real write once**

Run:

```powershell
npm.cmd run content:migrate -- --write --report delivery/migration-reports/stage-03-science-articles.json
```

Expected: 3 records written; 9 record/Markdown files, the ledger, and the report created; no legacy file, selector, image, route, or config file changed.

- [ ] **Step 5: Validate and prove the second run is idempotent**

Run:

```powershell
npm.cmd run content:validate
npm.cmd run content:migrate -- --write
npm.cmd run test:content-migration
npm.cmd run test:content-loader
git diff --check
```

Expected: validation PASS; second write reports 3 `TARGET_EXISTS` skips and creates no file; migration and loader tests PASS; diff check prints nothing.

- [ ] **Step 6: Inspect the exact changed-file allowlist**

Run:

```powershell
git status --short
git diff --name-only
git diff -- lib/site-data.ts lib/team-data.ts lib/content-repository/default-repository.ts
```

Expected: only the planned candidate, ledger, report, and test files are changed; the final command prints nothing.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- content/migration-ledger.json content/records/science-article delivery/migration-reports/stage-03-science-articles.json tests/content-migration/real-candidates.test.ts tests/content-repository/file-loader.test.ts
git commit -m "test: cover repeatable and non-destructive migration"
```

---

### Task 5: Document operation, finalize handoff, run all gates, and create the offline bundle

**Files:**
- Create: `docs/content-workbench/MIGRATION-TOOL.md`
- Modify: `docs/content-workbench/HANDOFF.md`
- Modify: `delivery/HANDOFF.md`
- Modify: `delivery/MANIFEST.txt`
- Modify: `delivery/TEST-SUMMARY.txt`
- Modify: `delivery/CHANGED-FILES.txt`

**Interfaces:**
- Consumes: final Task 1–4 code, candidate/report evidence, and exact Git/test state.
- Produces: operator guide, complete Stage-03 handoff, final clean commit, verified bundle, SHA-256 sidecar, and USB delivery under `E:\stage-03-migration`.

- [ ] **Step 1: Write the operation guide**

`docs/content-workbench/MIGRATION-TOOL.md` must state:

```text
Scope and non-goals
Default dry-run and exact --write authorization
Optional allowlisted --report path
Three initial article candidates and excluded projects
Every report category and stable reason code
Draft/review/media/translation blockers
No-overwrite, partial-target conflict, second-run behavior, and rollback
content:validate behavior
Proof that all selectors remain legacy
Commands for focused and full verification
```

Include exact command examples from the approved design and explicitly state that a candidate file is not a publication or permission to switch source.

- [ ] **Step 2: Run focused documentation-adjacent checks**

Run:

```powershell
npm.cmd run check:content-migration
npm.cmd run test:content-migration
npm.cmd run content:validate
git diff --check
```

Expected: all PASS.

- [ ] **Step 3: Commit the operation guide before delivery summaries**

```powershell
git add -- docs/content-workbench/MIGRATION-TOOL.md
git commit -m "docs: add migration operation guide"
```

- [ ] **Step 4: Run the full stage gates from the clean committed code state**

Run:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:next
```

Expected:

```text
check: PASS with no TypeScript/ESLint errors
test: all schema, migration, loader, compatibility-build, rendered, and IndexNow tests PASS
build:next: PASS and 97 static pages remain generated
```

Record exact counts, command status, warnings, and any environment retry honestly in `delivery/TEST-SUMMARY.txt`.

- [ ] **Step 5: Generate repository handoff files**

Update both HANDOFF files with Stage-03 goal, branch, baseline `86c2e209...`, design commit `e43dca1`, implementation commits, candidates, blockers, design decisions, modified files, exact tests, known limits, integration order, rollback, next executor first step, and prohibited repeated work.

Set interface versions in `delivery/MANIFEST.txt`:

```text
ContentSchemaVersion=1
RepositoryApiVersion=1
DesktopCommandApiVersion=1
MediaMetadataVersion=1
GitPublishPlanVersion=1
MigrationLedgerVersion=1
RealCollectionSource=legacy
CandidateScienceArticleCount=3
SourceSwitchCount=0
RemoteCount=0
```

Generate `delivery/CHANGED-FILES.txt` from the exact Git diff against `86c2e209...`, sort with ordinal path order, and inspect every entry. Do not include `node_modules`, `.next`, `dist`, caches, secrets, or bundle binaries.

- [ ] **Step 6: Run final repository hygiene checks and commit delivery docs**

Run:

```powershell
git diff --check
git status --short
git remote -v
git diff --name-only 86c2e209fe77cc644d946bff9901d740f9fb3ee1..HEAD
```

Run exact text-integrity and filename-only secret checks:

```powershell
$stageRoot = "D:\algae-workbench\worktrees\Stage-03"
$changed = @(git -C $stageRoot diff --name-only 86c2e209fe77cc644d946bff9901d740f9fb3ee1)
$textPaths = @($changed | Where-Object {
  $_ -match '\.(ts|tsx|mjs|json|md|txt)$' -or
  $_ -in @('.gitattributes', '.gitignore')
})
foreach ($relative in $textPaths) {
  $absolute = Join-Path $stageRoot $relative
  $bytes = [System.IO.File]::ReadAllBytes($absolute)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw "UTF-8 BOM forbidden: $relative"
  }
  if ($bytes -contains 13) { throw "CR/CRLF forbidden: $relative" }
  if ($bytes.Length -gt 0 -and $bytes[-1] -ne 10) { throw "Final LF missing: $relative" }
}
$secretFiles = @(rg -l --hidden -i -g '!node_modules/**' -g '!.git/**' -g '!.next/**' -g '!dist/**' '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,})' -- $textPaths)
if ($LASTEXITCODE -gt 1) { throw "Secret scan failed to execute" }
if ($secretFiles.Count -gt 0) {
  $secretFiles
  throw "High-confidence secret pattern found; inspect without printing values"
}
```

Then:

```powershell
git add -- docs/content-workbench/HANDOFF.md delivery/HANDOFF.md delivery/MANIFEST.txt delivery/TEST-SUMMARY.txt delivery/CHANGED-FILES.txt
git commit -m "docs: finalize stage 3 delivery"
```

- [ ] **Step 7: Re-run final status and relevant gates after the delivery commit**

Run:

```powershell
git status
git log --oneline --decorate -10
npm.cmd run check
npm.cmd test
npm.cmd run build:next
```

Expected: clean worktree, no remote, all gates PASS. If any result differs from Step 4, update the external delivery copy honestly; do not amend or rewrite history.

- [ ] **Step 8: Create and verify the complete branch bundle**

From `D:\algae-workbench\bundles`, create:

```powershell
git -c safe.directory=D:/algae-workbench/worktrees/Stage-03 -c safe.directory=D:/algae-workbench/repo-hub -C "D:\algae-workbench\worktrees\Stage-03" bundle create "D:\algae-workbench\bundles\stage-03-migration-v1.bundle" "local/stage-03-migration"
git -c safe.directory=D:/algae-workbench/worktrees/Stage-03 -c safe.directory=D:/algae-workbench/repo-hub -C "D:\algae-workbench\worktrees\Stage-03" bundle verify "D:\algae-workbench\bundles\stage-03-migration-v1.bundle"
Get-FileHash -LiteralPath "D:\algae-workbench\bundles\stage-03-migration-v1.bundle" -Algorithm SHA256 | Out-File -LiteralPath "D:\algae-workbench\bundles\stage-03-migration-v1.bundle.sha256.txt" -Encoding ascii
```

Expected: bundle contains `refs/heads/local/stage-03-migration`, records complete history, and its head equals final `git rev-parse HEAD`.

- [ ] **Step 9: Copy exact external delivery files to USB and verify again**

Create `E:\stage-03-migration` if absent. Copy the bundle, sidecar, and exact external copies of HANDOFF, MANIFEST, TEST-SUMMARY, and CHANGED-FILES. External HANDOFF/MANIFEST copies must contain the final bundle-head SHA because a committed file cannot embed its own commit SHA. Obtain the SHA with `git rev-parse HEAD`, copy the four delivery files to `D:\algae-workbench\bundles\stage-03-delivery`, and use `apply_patch` to replace their explicit `EXTERNAL_BUNDLE_HEAD` markers with that SHA before the USB copy.

```powershell
New-Item -ItemType Directory -Path "E:\stage-03-migration" -Force
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-migration-v1.bundle" -Destination "E:\stage-03-migration\stage-03-migration-v1.bundle"
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-migration-v1.bundle.sha256.txt" -Destination "E:\stage-03-migration\stage-03-migration-v1.bundle.sha256.txt"
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-delivery\HANDOFF.md" -Destination "E:\stage-03-migration\HANDOFF.md"
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-delivery\MANIFEST.txt" -Destination "E:\stage-03-migration\MANIFEST.txt"
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-delivery\TEST-SUMMARY.txt" -Destination "E:\stage-03-migration\TEST-SUMMARY.txt"
Copy-Item -LiteralPath "D:\algae-workbench\bundles\stage-03-delivery\CHANGED-FILES.txt" -Destination "E:\stage-03-migration\CHANGED-FILES.txt"
```

Run:

```powershell
Get-FileHash -LiteralPath "D:\algae-workbench\bundles\stage-03-migration-v1.bundle" -Algorithm SHA256
Get-FileHash -LiteralPath "E:\stage-03-migration\stage-03-migration-v1.bundle" -Algorithm SHA256
git -c safe.directory=D:/algae-workbench/worktrees/Stage-03 -c safe.directory=D:/algae-workbench/repo-hub -C "D:\algae-workbench\worktrees\Stage-03" bundle verify "E:\stage-03-migration\stage-03-migration-v1.bundle"
git -c safe.directory=D:/algae-workbench/worktrees/Stage-03 -c safe.directory=D:/algae-workbench/repo-hub -C "D:\algae-workbench\worktrees\Stage-03" bundle list-heads "E:\stage-03-migration\stage-03-migration-v1.bundle"
```

Expected: local and USB SHA-256 values match, verification passes, and bundle head equals the final commit.

---

## Final acceptance checklist

- [ ] Bare and explicit dry-runs create no filesystem change.
- [ ] Write mode is available only through `--write`.
- [ ] Existing and partial targets are never overwritten.
- [ ] A second run creates no duplicate record.
- [ ] Reports locate every source ID and target path and include all six required categories.
- [ ] Three article candidates pass Stage-01 schema/repository validation as drafts.
- [ ] Missing author/reviewer/translation/image/publication evidence remains explicit.
- [ ] `projects` remains manual classification; empty collections remain empty.
- [ ] All production source selectors remain `legacy`; rendered routes are unchanged.
- [ ] Legacy files and images are unchanged and recoverable.
- [ ] `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run build:next` pass.
- [ ] Final worktree is clean, worker remote list is empty, and USB bundle/hash/head verify.
