# Stage-03 Legacy Content Migration Design

Status: approved by the operator on 2026-07-22

Stage: Stage-03 — Legacy Content Migration Tool

Baseline: `86c2e209fe77cc644d946bff9901d740f9fb3ee1`

Branch: `local/stage-03-migration`

## 1. Outcome

Stage-03 will add a repeatable, preview-first migration tool that reads explicitly
registered legacy TypeScript exports, produces Stage-01 JSON/Markdown candidates,
validates them through the canonical schema, reports every decision and blocker,
and writes only when the operator passes `--write`.

The initial real-data adapter covers the three entries in `articles` from
`lib/site-data.ts`. They become bilingual draft candidates. No real collection
source selector changes from `legacy` to `records` in this stage because the
current repository contains no public author/reviewer evidence, all existing
content review states are `draft`, and several legacy image rights remain pending.

## 2. Fixed constraints

- The bare migration command is a dry run. Actual writes require `--write`.
- Legacy TypeScript exports and existing images remain unchanged.
- Existing target record files are never overwritten.
- A second run does not create another record or duplicate an ID.
- No author, reviewer, DOI, location, project, member, licence, consent, taxonomy
  source, translation history, or publication approval is invented.
- Candidate locales remain `draft`; migration does not convert current visibility
  into Stage-01 publication approval.
- Missing English remains supported by the tool, but the three initial article
  candidates retain the already-present English strings as draft content.
- All candidate JSON is serialized by `@algae-atlas/content-schema`; schema and
  repository policy are not reimplemented.
- Every real collection remains explicitly selected as `legacy`.
- No remote, network Git operation, PR, release, deployment, database, route,
  navigation, theme, image optimization, or production change is in scope.

## 3. Why no source switch is allowed

The Stage-02 baseline exposes legacy content publicly even when its display review
label is `draft`. Stage-01 intentionally has a stronger publication contract:
`published` requires reviewed locale evidence, resolvable public authors/reviewers,
and approved referenced media. Algae records additionally require verified
taxonomy sources.

Changing any real selector now would therefore either remove currently visible
routes or require fabricated approval data. The migration tool may preserve known
text as drafts and enumerate blockers, but it must not claim parity or activate
the records source until the missing evidence is supplied and reviewed in a later
batch.

## 4. Chosen architecture

The tool uses an adapter registry followed by a platform-neutral plan:

~~~text
explicit legacy exports
  -> inventory adapters
  -> normalized legacy descriptors
  -> type-specific candidate adapters
  -> candidate JSON + Markdown file plan
  -> Stage-01 parse/serialize/repository validation
  -> conflict and target-existence scan
  -> migration report
  -> stdout only (dry-run) OR exclusive write (--write)
~~~

The boundaries are:

1. **Inventory** reads only code-owned, statically imported exports. It does not
   evaluate paths supplied by content or scan arbitrary TypeScript files.
2. **Adapters** convert one approved legacy shape into one content type. An adapter
   returns candidates and explicit review issues; it does not write files.
3. **Planner** derives repository-relative target paths, detects duplicate IDs,
   partial target directories, existing records, and URL/ID claims.
4. **Validator** calls the shared Stage-01 APIs and the Stage-02 repository rules.
5. **Reporter** produces one deterministic structured result for humans, tests,
   and optional handoff capture.
6. **Writer** accepts only a validated plan, creates new targets exclusively,
   tracks what this operation created, and removes only those operation-created
   files if a later write fails.

This structure keeps additional collection adapters small and independently
testable without turning the initial stage into a bulk migration.

## 5. Command contract

The supported commands are:

~~~powershell
npm.cmd run content:migrate
npm.cmd run content:migrate -- --dry-run
npm.cmd run content:migrate -- --write
npm.cmd run content:validate
~~~

Command behavior:

- `content:migrate` and `content:migrate -- --dry-run` are equivalent and write
  no files or directories.
- `--write` is mutually exclusive with `--dry-run` and is the only content-write
  authorization.
- No `--force`, overwrite, delete, publish, selector-switch, remote, or arbitrary
  output-root option exists.
- The repository root is the current registered worktree root; managed paths are
  derived below `content/` and never taken from record text.
- One migration timestamp is captured as operation metadata. Tests inject a fixed
  clock. It describes creation of the new repository candidate, not the historical
  creation or approval date of the legacy article.
- The existing Stage-01 `content:validate -- <record-or-snapshot>` behavior remains
  available. With no path argument, `content:validate` validates the formal
  `content/` repository tree through the Stage-02 loader.
- The CLI returns nonzero for invalid arguments, an invalid candidate/snapshot,
  conflicting IDs/URLs, unsafe targets, or a failed write. Review warnings for a
  valid draft are reported but do not masquerade as publication approval.

The CLI prints a concise summary and a machine-readable report to standard output.
An optional later handoff capture may create a new JSON file only under
`delivery/migration-reports/`; it is never required for normal dry runs and never
overwrites an existing report.

## 6. Initial real-data mapping

Only `articles` is converted in the first adapter. The neighboring `projects`
array is not included because those entries are sample observation frameworks and
require record-by-record classification. The initial mapping is:

| Legacy ID | Target type | `articleKind` | Evidence |
| --- | --- | --- | --- |
| `what-are-algae` | `science-article` | `foundation` | Legacy category is “基础概念 / Foundations”. |
| `why-water-turns-green` | `science-article` | `observation-guide` | Legacy category is “水环境观察 / Water observation”. |
| `photobioreactor-basics` | `science-article` | `method-explainer` | Legacy category is “培养系统 / Cultivation systems”. |

Known fields are copied mechanically:

- stable ID, localized title, localized summary, localized category/note;
- publication date and the numeric value parsed from the bilingual read-time text;
- `targetAudience = general`, derived from the existing public-insights route and
  reported as a classification decision;
- safe Markdown bodies containing the exact localized legacy summary;
- provenance with `sourcePath = lib/site-data.ts`, `exportName = articles`, and
  the source ID.

Candidate-only fields are deliberately conservative:

- both locales use `state = draft`, `review.status = draft`, version `0.1`, and
  no reviewer IDs;
- `authors`, `tags`, `media`, references, relations, and takeaways are empty;
- `coverMediaId` is omitted even though the legacy page has an image, because the
  corresponding usage scope is not confirmed;
- `translationOrigin = source-authored` records only that the adapter copied the
  existing locale-specific TypeScript literal without translating or transforming
  it. The report still emits `TRANSLATION_PROVENANCE_UNVERIFIED`; this value is not
  evidence of historical human authorship and cannot justify publication;
- record `createdAt`, `updatedAt`, and `legacy.migratedAt` use the operation time
  and do not pretend to be original content-history timestamps.

The adapter must emit manual-review findings for author attribution, reviewer
evidence, translation provenance, image rights/attribution, body completeness,
and eventual publication-state review.

## 7. Inventory decisions for other collections

The report inventories but does not manufacture records for:

- `news`, `outputs`, and `teamMembers`: empty, preserved as empty;
- `projects`: skipped with `MANUAL_CLASSIFICATION_REQUIRED`;
- algae, tutorials, live feeds, research profiles, collaboration areas, and other
  maintainable exports: listed as deferred adapters;
- component-embedded copy: deferred to the approved component-extraction phase;
- D1, Drizzle, Worker, Sites, vinext, and deployment structures: out of scope.

No fictional Stage-01/02 fixture is copied into the formal `content/` tree.

## 8. File plan and ledger

Each article candidate plans exactly:

~~~text
content/records/science-article/<id>/record.json
content/records/science-article/<id>/zh.md
content/records/science-article/<id>/en.md
~~~

Stage-03 also introduces `content/migration-ledger.json`. The ledger is audit
state, not runtime precedence. It records schema/version information, the legacy
file/export, source and candidate counts, candidate IDs, parity status, blockers,
and the fact that `science-article` remains on `legacy`.

The ledger contains no secret, draft body, environment value, absolute host path,
or claim of approval. It is generated deterministically from inventory state and
contains no volatile run timestamp. An identical existing ledger is skipped; an
unexpected or divergent existing ledger is a conflict rather than an overwrite.

## 9. Conflict and write safety

Before any write, the planner checks:

- stable-ID syntax and duplicates across planned and existing records;
- legacy ID/type mapping and route-family URL claims;
- exact target paths and case-colliding names on Windows;
- whether a record directory is absent, complete, partial, or already present;
- whether any existing file would be replaced;
- whether the complete proposed repository snapshot passes Stage-01 validation.

Outcomes are:

- **planned/written**: every target is absent and the candidate is valid;
- **skipped**: the exact stable record already exists, so no duplicate is made;
- **conflict**: only part of a target exists, another type owns the ID/URL, the
  ledger differs, or safe identity cannot be proven;
- **blocked/manual review**: known content can be preserved as a valid draft, but
  it lacks evidence required for future publication or source switching.

Write mode prepares all bytes first. It uses create-new/exclusive semantics, never
recursive cleanup, and tracks operation-created files. If the operation fails,
it removes only files and now-empty directories created by that operation. It
does not touch pre-existing files, legacy sources, images, Git state, or unrelated
untracked work.

## 10. Report contract

Each report includes mode, schema/interface versions, source inventory, planned
targets, and these required categories:

- `migrated`: planned in dry-run or actually written in write mode;
- `skipped`: empty/deferred/already-existing entries with stable reason codes;
- `missingFields`: required facts unavailable from the legacy source;
- `manualReview`: decisions that an authorized person must confirm;
- `conflicts`: duplicate ID, URL, partial target, or divergent ledger problems;
- `missingImageAttribution`: legacy image path, matched credit when present, and
  the reason it was not converted to public media metadata.

Every record-level entry includes `sourcePath`, `exportName`, `sourceId`, target
type, and target record path. Diagnostics use repository-relative paths only.

The report does not include environment dumps, absolute private paths, secrets,
or full draft bodies.

## 11. Validation and parity evidence

The initial candidates are not public parity records and therefore cannot justify
a collection source switch. The stage proves two narrower properties:

1. **Data preservation evidence** compares source and candidate IDs, Chinese and
   English titles/summaries/category labels, dates, reading-time values, and
   derived route suffixes.
2. **Safety evidence** proves candidates validate as drafts, remain ineligible for
   publication, omit unapproved media, and leave website selection and rendered
   public output unchanged.

Any future selector-switch batch must separately prove the full Stage-00 parity
matrix for visible HTML, metadata, routes, sitemap, language alternatives, media,
review evidence, and rollback.

## 12. Test design

Focused tests will cover:

- exact three-article inventory and field mapping;
- explicit exclusion and reporting of `projects`;
- schema-valid bilingual draft serialization with LF and final newline;
- dry-run filesystem snapshots showing zero writes;
- `--write` creation of only planned record/Markdown/ledger files;
- pre-existing manual target files remaining byte-identical;
- partial targets and duplicate IDs becoming conflicts;
- a second run creating no duplicate content;
- report source/target traceability and all required categories;
- missing image attribution and review blockers;
- full formal repository validation after write in a disposable fixture root;
- key text, route suffix, and metadata-field comparison;
- all production collection selectors remaining `legacy`;
- no legacy source deletion or modification.

Stage completion then runs:

~~~powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:next
~~~

Tests use temporary repositories and fixed clocks. They never mutate the real
worktree as a destructive fixture and never access a remote or production system.

## 13. Documentation and delivery

Implementation documentation will describe command examples, dry-run/write
semantics, issue codes, report interpretation, candidate review, rollback, and the
explicit prohibition on selector switching without new evidence.

The final handoff records the Stage-02 baseline, final commit, interface versions,
tests, candidates, deferred collections, blockers, changed files, integration
order, rollback, and work that must not be repeated. The branch is delivered as a
verified complete bundle and SHA-256 sidecar to `E:\stage-03-migration` with the
required HANDOFF, MANIFEST, TEST-SUMMARY, and CHANGED-FILES files.

## 14. Rejected alternatives

- A one-off science-article script was rejected because every later type would
  duplicate planning, validation, reporting, and safety logic.
- A report-only tool was rejected because it would not exercise the explicit
  write path, idempotence, and no-overwrite acceptance criteria.
- Immediate source switching was rejected because no current real collection has
  the review/rights evidence required by Stage-01 publication policy.
- Bulk conversion was rejected because it would hide classification and factual
  gaps and violate the approved collection-by-collection migration process.
