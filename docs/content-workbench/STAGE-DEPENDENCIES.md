# Stage Dependencies

This document is the interface and dependency contract for later offline stages. A later instruction may narrow a stage, but it must not silently change the ownership, prerequisite, or cross-stage interface defined here. Architecture changes require an explicit design amendment.

## 1. Dependency graph

~~~text
Stage-00  Audit and overall design
   |
Stage-01  Shared schema, fixtures, validation CLI
   |\
   | +----------------------+
   v                        v
Stage-02  Website loader    Stage-04  Desktop foundation
   |                        |\
   v                        | +------------------+
Stage-03  Content migration |                    |
                            v                    v
                         Stage-05A            Stage-05B
                         Record/language      Media/author/workspace
                         editors              safety services
                            |                    |
                 Stage-02 + 05A     Stage-02 + 05B
                            v                    v
                         Stage-06A            Stage-06B
                         Preview/locale       Media/Git publishing
                         integration          integration
                            \                  /
                             +--------+--------+
                                      |
                  Stage-03 + Stage-06A + Stage-06B
                                      v
                                  Stage-07A
                          End-to-end parity/acceptance

                         Stage-06A + Stage-06B
                                      v
                                  Stage-07B
                          Windows packaging/hardening

                         Stage-07A + Stage-07B
                                      v
                                  Stage-08
                         Final offline integration
~~~

When a stage has multiple prerequisites, the integration host must provide one tested, already integrated prerequisite baseline. A worker must not guess merge order between parallel bundles.

## 2. Stage contracts

### Stage-00 — repository audit and overall design

Inputs:

- clean baseline `456ff609e27ce5aa46fa0608289a30298bdd3e7f`;
- no predecessor bundle.

Owned outputs:

- the nine documents under `docs/content-workbench/`;
- delivery handoff, manifest, test summary, and changed-file list;
- `stage-00-design-v1.bundle`.

Prohibited:

- runtime, content, dependency, route, image, database, desktop, deployment, or production changes.

Exit gate:

- design documents are sufficient for independent later sessions;
- existing checks pass;
- bundle and checksum verify.

### Stage-01 — shared schema and validator

Prerequisite: Stage-00 bundle.

Owns:

- environment-neutral content-schema package;
- type registry and discriminated unions;
- runtime validation, issue codes, deterministic serializer;
- author/media/locale workflow policy;
- safe Markdown profile contract;
- schema fixtures and validation CLI;
- schema-version migration harness.

Does not own:

- Next.js route integration, page rendering, desktop UI, Tauri commands, content migration, Git publishing.

Required interface:

~~~ts
parseRecord(input): ParseResult<ContentRecord>
validateRepository(snapshot): ValidationIssue[]
publicationEligibility(record, locale, resolvedRefs): Eligibility
serializeRecord(record): string
migrateRecord(input, fromVersion, toVersion): MigrationResult
~~~

Exit gate: all fixture and contract tests pass in Node and a browser-compatible test target.

### Stage-02 — website loader and locale-aware routing adapter

Prerequisite: Stage-01 bundle.

Owns:

- repository record reader;
- legacy TypeScript adapters;
- explicit collection source router;
- `PublicContentRepository`;
- locale availability index;
- integration into static params, detail lookup, metadata, language switching, and sitemap;
- Chinese-only synthetic route tests;
- fail-closed build diagnostics.

Does not own:

- migrating real collections, desktop, media ingestion, page redesign, new route families.

Exit gate:

- every real collection still selects legacy and current public output remains equivalent;
- a synthetic Chinese-only record has no English detail/alternate and switches to the English section landing;
- native and compatibility checks pass.

### Stage-03 — staged content migration

Prerequisite: tested Stage-02 baseline.

Owns:

- migration ledger and record conversion tools;
- record-by-record classification evidence;
- migrated JSON/Markdown/authors/media metadata;
- per-collection source switches;
- legacy-versus-record parity fixtures and reports.

Does not own:

- desktop features, route redesign, image optimization, deletion of compatibility files.

Exit gate:

- each switched collection meets the migration parity matrix;
- legacy source remains recoverable;
- no invented records;
- full checks pass.

### Stage-04 — Tauri desktop foundation

Prerequisite: Stage-01 bundle. It may proceed in parallel with Stages 02–03.

Owns:

- Windows Tauri + React + TypeScript project shell;
- consumption of the shared schema package;
- navigation within the desktop app, error presentation, settings limited to approved local paths;
- Tauri command boundary and mocked repository service;
- desktop build/check commands and a pinned Rust toolchain.

Does not own:

- record-specific editors, media processing, Git commits, website integration, production.

Exit gate:

- desktop shell builds on the pinned Windows toolchain;
- schema fixtures produce identical outcomes in desktop and Node;
- no unrestricted filesystem or process API is exposed to the UI.

### Stage-05A — record and language editors

Prerequisite: tested Stage-04 baseline containing Stage-01.

Owns:

- content-type selection;
- common and dedicated forms for all registry types;
- Chinese-first and optional-English workflow;
- review state transitions and machine-assisted verification gate;
- Markdown editor under the safe profile;
- in-memory draft, validation, and deterministic source-file proposal;
- editor unit/component tests.

Does not own:

- media binary ingestion, author catalog administration beyond ID selection, Git commit, website preview integration.

Exit gate: every content type and language-state transition has tested form-to-record round trips.

### Stage-05B — media, author, and workspace safety services

Prerequisite: tested Stage-04 baseline containing Stage-01. May run in parallel with Stage-05A.

Owns:

- public author/catalog editor within privacy limits;
- media inspection, normalization, private metadata removal, hash, rights, consent, alt/caption fields;
- approved-worktree discovery and path allowlist;
- atomic multi-file transaction planning;
- read-only Git state inspection and exact command abstraction;
- tests for traversal, symlinks/junctions, MIME mismatch, oversized files, consent, dirty worktrees, remotes, and protected branches.

Does not own:

- record forms, website preview, final Git commit workflow, bundle export.

Exit gate: adversarial fixtures cannot escape approved roots or produce eligible media without rights/consent.

### Stage-06A — record preview and locale integration

Prerequisite: one integration baseline containing Stage-02 and Stage-05A.

Owns:

- desktop-to-website preview contract;
- local draft preview with banner;
- availability-aware link/SEO preview;
- end-to-end record form -> files -> loader -> rendered preview flow;
- clear distinction between preview and published state.

Does not own:

- media ingestion internals, Git commit/publish, Windows installer.

Exit gate: bilingual and Chinese-only records preview correctly; preview never changes committed publication state or public metadata.

### Stage-06B — media and local Git publishing integration

Prerequisite: one integration baseline containing Stage-02 and Stage-05B. This is the required meaning of “Stage 2 and Stage 5B integrated baseline.”

Owns:

- end-to-end author/media references through the website loader;
- exact allowlisted staging and staged-diff verification;
- operator-confirmed local content commit;
- post-commit cleanliness and local delivery summary;
- rollback/correcting-commit workflow;
- tests using disposable local repositories with no remotes.

Does not own:

- network Git, GitHub, PRs, tags, releases, merge to main, deployment, bundle integration.

Exit gate: a valid content/media change creates one local commit with only intended files; all unsafe repository states stop without data loss.

### Stage-07A — migration rehearsal and end-to-end acceptance

Prerequisite: one tested integration baseline containing Stage-03, Stage-06A, and Stage-06B.

Owns:

- representative migrated collection rehearsal;
- create/edit/review/publish/archive and optional-English acceptance;
- public route, SEO, sitemap, language switch, image, and policy parity;
- failure injection and ordinary-commit rollback rehearsal;
- operator acceptance guide.

Does not own: installer/signing, production connection, GitHub.

Exit gate: all functional acceptance scenarios and full website/desktop suites pass from a clean clone/bundle-derived worktree.

### Stage-07B — Windows packaging and security hardening

Prerequisite: one tested integration baseline containing Stage-06A and Stage-06B.

Owns:

- pinned Windows build chain and reproducible package configuration;
- least-privilege Tauri capabilities and content security policy;
- installer/uninstaller behavior, application data boundaries, log redaction;
- dependency/license inventory, local package hash, and clean-machine checklist;
- signing design; actual certificate use only if separately authorized and available outside Git.

Does not own: content migration decisions, GitHub release, production deployment.

Exit gate: packaged application passes security tests and a clean Windows installation rehearsal without storing credentials.

### Stage-08 — final offline integration and release readiness

Prerequisite: verified Stage-07A and Stage-07B bundles imported on the integration host.

Owns:

- topological integration, conflict resolution with source-stage evidence;
- all website and desktop checks;
- final documentation, migration/readiness report, Windows artifact verification;
- proposed GitHub feature branch and Draft PR plan.

Does not own by default:

- adding a remote, pushing, creating a PR, merging main, tagging, releasing, or deploying. Each requires explicit operator approval in the later integration workflow.

Exit gate: clean integration branch, complete provenance, all tests passing, no secrets, and an approved recovery plan.

## 3. Ownership map

| Path/interface area | Primary owner | Other stages |
| --- | --- | --- |
| `docs/content-workbench/` contract | Stage-00 | Later stages append implementation status, not redesign silently. |
| content-schema package | Stage-01 | Consumers import it; changes return through schema review. |
| website content repository/availability | Stage-02 | Stage-03 adds records, Stage-06 integrates clients. |
| initial record corpus/migration ledger | Stage-03 | Stage-07 rehearses. |
| desktop shell/Tauri capability base | Stage-04 | 05/06 extend within the boundary. |
| record/language forms | Stage-05A | Stage-06A integrates preview. |
| author/media/workspace services | Stage-05B | Stage-06B integrates publication. |
| preview bridge | Stage-06A | Stage-07A accepts. |
| local Git publisher | Stage-06B | Stage-07A tests; no other stage bypasses it. |
| migration acceptance | Stage-07A | Stage-08 consumes evidence. |
| packaging/hardening | Stage-07B | Stage-08 verifies artifact. |
| final integration | Stage-08 | Only integration host resolves cross-stage conflicts. |

Parallel stages should avoid editing the other owner's files. Shared package manifest or lockfile changes are isolated and documented; the integration host resolves them in prerequisite order and reruns installs/checks.

## 4. Cross-stage interface versions

Each handoff records these versions:

- `contentSchemaVersion`;
- `repositoryApiVersion`;
- `desktopCommandApiVersion`;
- `mediaMetadataVersion`;
- `gitPublishPlanVersion`;
- `migrationLedgerVersion`.

A consumer bundle must declare the exact predecessor commit and interface versions it tested. Mismatch is a stop condition, not permission to adapt ad hoc.

## 5. Bundle and branch protocol

Recommended names:

| Stage | Local branch | Delivery directory | Bundle |
| --- | --- | --- | --- |
| 00 | `local/stage-00` (existing prepared branch) | `stage-00-design` | `stage-00-design-v1.bundle` |
| 01 | `local/stage-01-schema` | `stage-01-schema` | `stage-01-schema-v1.bundle` |
| 02 | `local/stage-02-web-loader` | `stage-02-web-loader` | `stage-02-web-loader-v1.bundle` |
| 03 | `local/stage-03-migration` | `stage-03-migration` | `stage-03-migration-v1.bundle` |
| 04 | `local/stage-04-desktop` | `stage-04-desktop` | `stage-04-desktop-v1.bundle` |
| 05A | `local/stage-05a-editors` | `stage-05a-editors` | `stage-05a-editors-v1.bundle` |
| 05B | `local/stage-05b-media` | `stage-05b-media` | `stage-05b-media-v1.bundle` |
| 06A | `local/stage-06a-preview` | `stage-06a-preview` | `stage-06a-preview-v1.bundle` |
| 06B | `local/stage-06b-publish` | `stage-06b-publish` | `stage-06b-publish-v1.bundle` |
| 07A | `local/stage-07a-acceptance` | `stage-07a-acceptance` | `stage-07a-acceptance-v1.bundle` |
| 07B | `local/stage-07b-windows` | `stage-07b-windows` | `stage-07b-windows-v1.bundle` |
| 08 | `integration/content-workbench` | `stage-08-integration` | `stage-08-integration-v1.bundle` |

For every bundle:

1. verify the expected prerequisite SHA/interface versions;
2. keep one dedicated stage worktree;
3. commit small stable subtasks;
4. finish with a clean worktree and no remote on workers;
5. create a complete branch bundle;
6. verify bundle prerequisites/heads and SHA-256;
7. include HANDOFF, MANIFEST, TEST-SUMMARY, and CHANGED-FILES;
8. copy to the assigned USB directory and verify again.

Workers never import an ambiguous collection of parallel bundles. The integration host produces and tests a combined prerequisite baseline for Stages 06A, 06B, 07A, 07B, and 08.

## 6. Integration order

The integration host:

1. imports and reviews Stage-00;
2. imports Stage-01;
3. branches two tested lines for website (02 -> 03) and desktop (04 -> 05A/05B);
4. builds explicit combined baselines for 06A and 06B;
5. integrates 06A and 06B, then combines with 03 for 07A;
6. prepares the 07B baseline from the integrated desktop line;
7. imports 07A and 07B into Stage-08;
8. resolves conflicts by consulting owner HANDOFFs, never by choosing “ours/theirs” wholesale;
9. runs dependency install and every relevant suite after each integration boundary;
10. keeps the remote absent until the separate operator-approved GitHub step.

## 7. Required handoff fields

Every stage HANDOFF includes:

- stage number/name/goal;
- branch, baseline SHA, predecessor bundle names and hashes;
- final SHA and interface versions;
- completed/not completed;
- design decisions and deviations;
- modified files and ownership;
- commands/tests and exact pass/fail/skip;
- known issues and manual actions;
- integration order and conflict risks;
- first step for the next executor;
- work that must not be repeated;
- rollback instructions.

A missing or contradictory handoff, manifest, checksum, prerequisite, or interface version blocks import.
