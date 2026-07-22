# Stage 3 Handoff

Status: implementation, real draft migration, documentation, and pre-delivery full validation complete; ready for the final delivery-doc commit and verified offline bundle.

- Stage: Stage-03 — Legacy Content Migration Tool
- Goal: provide a default-dry-run, no-overwrite migration path from explicit legacy exports to Stage-01 repository records, preserve review blockers, and keep every production collection on `legacy`.
- Branch: `local/stage-03-migration`
- Baseline / Stage-02 final commit: `86c2e209fe77cc644d946bff9901d740f9fb3ee1`
- Predecessor bundle: `stage-02-content-loader-v1.bundle`
- Predecessor bundle SHA-256: `C0114AE0EFB01D14E44D8D1A20F297A7DDB3D7513CD9384F8F665665BF9B7D88`
- Design commit: `e43dca1c77bf2774b05b034a4a9cf5d942957051`
- Implementation-plan commit: `77a1e677823d5ca6731b42367bb3379e641b1d2d`
- Implementation tip before final delivery docs: `bb6075240d96e9877f2e334f484c748456127742`
- Final commit / bundle head: recorded as `EXTERNAL_BUNDLE_HEAD` in the verified external delivery copy after the final commit. A committed file cannot embed its own containing commit SHA.

## Completed

- Added an explicit adapter for the three legacy `articles` in `lib/site-data.ts` and mapped them to schema-version-1 bilingual `science-article` drafts.
- Added a read-only planner that loads the formal repository, inspects targets with `lstat`, combines existing and proposed records, runs shared repository validation, and produces a deterministic file plan and six-category report.
- Made no-argument and `--dry-run` execution read-only. `--write` is the only write authorization.
- Added optional report capture restricted to `delivery/migration-reports/<name>.json`; report files participate in the same atomic write plan.
- Implemented create-new temporary files, file sync, `COPYFILE_EXCL`, complete target preflight, no-overwrite behavior, operation-created-path tracking, and non-recursive rollback.
- Added deterministic `content/migration-ledger.json`; an identical ledger is skipped and a divergent ledger is a conflict.
- Changed no-argument `content:validate` to validate the current formal `content/` repository while preserving record-file, snapshot, JSON, and help modes.
- Wrote three real candidates, nine record/Markdown files, one ledger, and one traceable initial report.
- Proved dry-run zero-write behavior, second-run byte preservation, partial-target preservation, candidate-copy rollback, final-report rollback, report preflight, repository-relative diagnostics, key-field preservation, and selector zero-change.
- Added the operator runbook at `docs/content-workbench/MIGRATION-TOOL.md`.

## Candidate and source state

The formal repository now contains exactly these three candidates:

- `what-are-algae`
- `why-water-turns-green`
- `photobioreactor-basics`

Both locales are `draft`. Each candidate preserves the legacy ID, titles, summaries, category label, publication date, reading time, and legacy source trace. Candidate Markdown contains only the existing summary. Authors, reviewers, tags, references, and media remain empty where the legacy source provides no approved identity or rights evidence.

These files are preservation candidates, not published content and not permission to switch source. `collectionSourceSelection` still contains 11 explicit `legacy` values. The ledger records `parityStatus: blocked-review`, `sourceSwitchAllowed: false`, `CandidateScienceArticleCount=3`, and no verified switch commit.

The three `projects` entries remain `MANUAL_CLASSIFICATION_REQUIRED`. Empty `news`, `outputs`, and `teamMembers` remain empty. Algae, tutorials, live feeds, research capabilities, collaboration areas, and component-embedded copy remain deferred.

## Blockers retained explicitly

- No verified public author IDs.
- No verified reviewer IDs or publication approval.
- English translation provenance requires human confirmation.
- Candidate bodies contain only the existing summaries and require completeness review.
- Referenced legacy images have pending usage-scope evidence and were not added as public media records.
- Projects require an authorized target-type decision.
- No Stage-00 public HTML, metadata, route, alternate, sitemap, media, and rollback parity matrix has been approved for a selector switch.

The initial report is `delivery/migration-reports/stage-03-science-articles.json`.

## Key files

- CLI entry: `scripts/migrate-content.ts`
- Argument parser: `scripts/content-migration/cli.ts`
- Legacy adapter: `scripts/content-migration/science-articles.ts`
- Read-only planner and ledger generation: `scripts/content-migration/planner.ts`
- Exclusive writer and rollback: `scripts/content-migration/writer.ts`
- Shared migration types: `scripts/content-migration/types.ts`
- Formal validator: `scripts/validate-content.ts`
- Candidates and ledger: `content/records/science-article/`, `content/migration-ledger.json`
- Initial report: `delivery/migration-reports/stage-03-science-articles.json`
- Operator guide: `docs/content-workbench/MIGRATION-TOOL.md`
- Tests: `tests/content-migration/`, `tests/content-repository/file-loader.test.ts`, `packages/content-schema/tests/cli.test.ts`

The exact baseline diff is listed in `delivery/CHANGED-FILES.txt`.

## Local commits

- `e43dca1` — `docs: design stage 3 migration tool`
- `77a1e67` — `docs: plan stage 3 migration implementation`
- `33a4742` — `feat: add dry-run legacy content migration`
- `35074ae` — `feat: add migration reports and conflict handling`
- `143ffb7` — `feat: validate the formal content repository`
- `d5cd3c4` — `test: cover repeatable and non-destructive migration`
- `bb60752` — `docs: add migration operation guide`
- final delivery documentation commit: exact SHA is the external bundle head.

## Validation

Final pre-delivery validation on 2026-07-22:

- Stage-02 predecessor bundle SHA-256 and exact head: PASS.
- `npm.cmd ci --offline --ignore-scripts`: PASS (509 packages installed, 0 vulnerabilities; two known deprecated transitive `@esbuild-kit` warnings only).
- `npm.cmd run content:validate`: PASS against the three formal drafts.
- First real dry-run: 3 planned, 11 skipped, 0 conflicts, 0 validation issues; Git status unchanged.
- First explicit write: 3 written, 11 skipped, 0 conflicts, 0 validation issues.
- Second explicit write: 0 written, 15 skipped, including 3 `TARGET_EXISTS` and 1 `LEDGER_EXISTS`; no duplicate or file change.
- `npm.cmd run check`: PASS, no TypeScript or ESLint warnings.
- `npm.cmd test`: PASS.
  - Schema: 58 passed, 0 failed.
  - Browser contract: 94 modules transformed and generated module executed.
  - Content loader/source/route/render: 10 passed, 0 failed.
  - Migration: 15 passed, 0 failed.
  - vinext compatibility build: PASS; only its existing informational dynamic-route classification notice.
  - Rendered site: 25 passed, 0 failed.
  - IndexNow: 1 passed, 0 failed.
- `npm.cmd run build:next`: PASS; 97/97 static pages generated.
- Legacy data files, images, routes, selectors, and public output regressions: unchanged/PASS.
- Worker Git remote list: empty; no fetch, pull, push, PR, merge, tag, release, deployment, production connection, or secret use.

One early parallel approval request for focused read-only checks lost its control stream. The same read-only commands ran in the restricted sandbox and passed. No code assertion or final gate required a retry.

## Design decisions

1. The tool imports only approved code-owned exports; it does not evaluate arbitrary TypeScript paths or scan for executable content.
2. Planning and writing are separate. Dry-run builds the same validated plan but never calls the writer.
3. A complete existing record is idempotently skipped; a partial/unsafe target, divergent ledger, or existing report is a conflict, never an overwrite.
4. Report capture is write-only and confined to one allowlisted directory.
5. The writer preflights all targets before creating directories, uses exclusive final copies, and removes only operation-created paths on failure.
6. Candidate records remain drafts with empty unapproved relationships rather than fabricated authors, reviewers, references, or media.
7. No production selector changed because review and parity evidence are incomplete.
8. The ledger is deterministic audit state without a volatile timestamp; it does not control runtime precedence.

## Known limits

- Only the three legacy `articles` have an adapter and formal candidates.
- Candidate body completeness, author/reviewer identities, translation provenance, image rights, and publication approval remain unresolved.
- No candidate is eligible for public rendering through the records source.
- No collection source switch or full page-level parity approval is included.
- The tool does not migrate authors, media bytes/metadata, projects, other collections, or component-embedded copy.
- No desktop editor, preview system, Git publisher, database change, remote operation, deployment, or production change is included.

## Interface versions

| Interface | Version tested |
| --- | --- |
| Content schema | 1 |
| Repository API | 1 |
| Desktop command API | 1 |
| Media metadata | 1 |
| Git publish plan | 1 |
| Migration ledger | 1 |

## Integration order and conflict risks

1. Verify the Stage-03 bundle SHA-256, complete history, branch head, and exact Stage-02 baseline.
2. Import after Stage-02 and before later content/editor/publishing consumers.
3. Run offline install, `content:validate`, `check`, full tests, and native Next build.
4. Keep all selectors on `legacy`; importing candidates does not authorize public activation.
5. Resolve shared conflicts line by line. Likely surfaces are `package.json`, `.gitattributes`, `scripts/validate-content.ts`, `tests/content-repository/file-loader.test.ts`, content-workbench handoff files, and `delivery/`.

Do not resolve shared files by choosing wholesale ours/theirs versions.

## Next executor's first step

Verify/import the bundle on the exact Stage-02 tip, run the full gates, then read `MIGRATION-TOOL.md`, the ledger, and the initial migration report. If continuing migration, first obtain authorized author/reviewer, translation, body, and image-rights evidence for one candidate set and build the complete public parity matrix. Do not begin by changing a selector.

## Do not repeat or redesign silently

- Do not rerun the initial `--report delivery/migration-reports/stage-03-science-articles.json`; the existing report is intentionally protected.
- Do not overwrite or delete legacy sources, images, candidate files, the ledger, or unrelated work.
- Do not recreate Stage-01 schema/publication rules or Stage-02 repository routing.
- Do not infer authors, reviewers, team facts, references, translation provenance, licenses, or approval.
- Do not mark candidates published or switch any selector without reviewed parity evidence.
- Do not add a remote, push, merge `main`, tag, release, deploy, connect to production, or expose secrets from a stage host.
- Do not use `reset --hard`, recursive cleanup, `clean`, `restore`, or `stash` to integrate or roll back this stage.

## Rollback

Before integration, omit the bundle. After local integration, create ordinary revert commits for the Stage-03 commits in reverse order and rerun all gates. Because all production selectors remain `legacy`, candidate rollback does not require a public source switch. Preserve legacy sources and unrelated files; never rewrite history or recursively clean the worktree.
