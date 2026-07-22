# Stage 2 Handoff

Status: implementation and pre-documentation validation complete; ready for the final documentation commit and verified offline bundle.

Stage: Stage-02 — Website Content Loader
Goal: let the website consume validated repository JSON/Markdown through a locale-aware public repository while preserving every real collection on the legacy source until reviewed migration.
Branch: `local/stage-02-content-loader`
Baseline / Stage-01 final commit: `050a87dbd6330270e6b47b6f74acd071a85c5fcd`
Predecessor bundle: `stage-01-schema-v1.bundle`
Predecessor bundle SHA-256: `74A7668B6C8F22BF8E953B038A7D909A3784013A713C4195D0258E031B8DBFF9`
Implementation tip before documentation: `90bbaaf7d4ade0a12d4aa3bf6cd9c2919676488c`
Final commit SHA: exact branch tip will be recorded in the verified external `MANIFEST.txt` and bundle head after the final documentation commit. A committed file cannot embed the SHA of the commit that contains itself.

## Completed

- Added the fixed `content/records`, `content/authors`, and `content/media` repository layout without adding real or fictional public records.
- Implemented strict UTF-8/LF file discovery for records, locale Markdown, authors, and media, including symlink/junction, unexpected-file, directory-ID, BOM, line-ending, and final-newline checks.
- Built one Stage-01 `RepositorySnapshot`, reused the shared parsers and `validateRepository`, and fail closed with bounded repository-relative diagnostics.
- Adapted eligible repository records and all existing legacy detail sources to one `PublicContentRepository` interface.
- Added an exhaustive 11-type collection source selection. Source choice is per content type and never silently merges records with legacy entries by ID.
- Kept all real production collections explicitly on `legacy`, preserving current page content and route output.
- Added deterministic per-locale list/filter/sort/get/availability behavior and reused Stage-01 `publicationEligibility`; Chinese and English remain independent.
- Integrated existing detail lookup, static params, metadata, canonical/alternate links, language switching, 404 behavior, and sitemap through the same availability helpers.
- Added a safe React renderer for validated structured Markdown without raw HTML or `dangerouslySetInnerHTML`.
- Added fictional Chinese-only and bilingual fixtures under tests only, plus file, source-router, locale, sitemap, and new/legacy rendering tests.
- Documented file authoring, compatibility selection, locale behavior, route ownership, verification, rollback, and later migration boundaries.

## Current source state

Every entry in `collectionSourceSelection` is `legacy`. This is an explicit Stage-02 exit condition, not an implicit fallback. The formal `content/` store contains only directories and documentation; test fixtures live below `tests/fixtures/content-repository/` and are not visible to public routes.

The records source is exercised by injecting a file-backed repository in tests. Stage-03 owns real records, parity evidence, and reviewed per-collection switches. A switched type that is invalid or absent does not fall back to a same-ID legacy record.

## Locale and route behavior

- Chinese published + English missing/draft: Chinese detail/static param/canonical/sitemap only; language switch targets the English section landing.
- Chinese and English published: both detail pages, per-locale canonical, appropriate language alternates, and reciprocal language switches.
- Requested unavailable locale: no repository record, no static param, no sitemap URL, and detail lookup reaches 404.
- Section pages remain bilingual and current legacy details retain their existing renderers.
- Content cannot create route families. The adapter only registers existing research, live-feeds, tutorials, algae, and insights detail families, including the fixed research-profile ID allowlist.

## Key files

- Loader: `lib/content-repository/file-loader.ts`
- Record adapter: `lib/content-repository/record-source.ts`
- Legacy adapter: `lib/content-repository/legacy-source.ts`
- Public router/repository: `lib/content-repository/repository.ts`
- Production selection: `lib/content-repository/default-repository.ts`
- Route/locale/sitemap helpers: `lib/content-repository/routes.ts`
- Structured renderer: `components/StructuredContentPage.tsx`
- App integration: `app/[locale]/[[...slug]]/page.tsx`, `app/sitemap.ts`, `components/SiteShell.tsx`
- Test fixtures and tests: `tests/fixtures/content-repository/`, `tests/content-repository/`
- Authoring guide: `docs/content-workbench/CONTENT-LOADER.md`
- Delivery: `delivery/`

The exact file list is in `delivery/CHANGED-FILES.txt`.

## Local commits

- `1d9827d` — `feat: add structured content file loader`
- `35d3c32` — `feat: add explicit content source router`
- `e06c130` — `feat: integrate localized content routing`
- `90bbaaf` — `test: cover language fallback and sitemap behavior`
- final documentation/delivery commit: exact branch tip in the external manifest.

## Validation

Final code-state validation on 2026-07-22:

- Stage-01 predecessor bundle hash and exact head: PASS.
- `npm.cmd ci --offline --ignore-scripts`: PASS (509 packages installed; 0 vulnerabilities; only the two known deprecated transitive `@esbuild-kit` warnings).
- `npm.cmd run check`: PASS with no warnings.
- `npm.cmd run test:content-loader`: PASS (10 tests, 0 failed).
- `npm.cmd test`: PASS.
  - Stage-01 schema tests: 58 passed, 0 failed.
  - Browser-compatible contract: 94 modules transformed and generated ES module executed.
  - Stage-02 content-loader/source/route/render tests: 10 passed, 0 failed.
  - Existing rendered-site tests: 25 passed, 0 failed.
  - Existing IndexNow tests: 1 passed, 0 failed.
- `npm.cmd run build:next`: PASS; 97 static pages generated.
- Existing 24 real detail records remain legacy and bilingual in the default repository.
- Worker Git remote: empty; no fetch, pull, push, PR, tag, release, deployment, production connection, or secret use.

The initial sandboxed `npm.cmd test` attempt could not write Vite's `node_modules/.vite-temp` and stopped with `EPERM`. The exact same command was rerun with approved worktree write access and passed completely; this was an execution-permission limitation, not a code/test failure.

Final post-documentation status, diff checks, UTF-8/LF checks, secret scan, exact final SHA, bundle verification, hashes, and USB-copy verification are recorded in the external delivery files after bundle creation.

## Design decisions and deviations

1. The Stage-01 canonical filename is `record.json`, so the Stage-02 loader follows it instead of the stage note's illustrative `metadata.json` name.
2. Repository validation and publication eligibility are imported from `@algae-atlas/content-schema`; the website does not implement a second policy.
3. Source selection is whole-type and exhaustive. Silent per-ID blending was rejected to keep migration and rollback auditable.
4. All real types stay on legacy because Stage-03, not Stage-02, owns factual migration and parity evidence.
5. Only existing route families are registered; records cannot create routes or navigation.
6. Structured Markdown is rendered as safe React nodes. The implementation intentionally does not add a general Markdown/MDX runtime or raw-HTML path.
7. Legacy sitemap dates remain the existing fixed date; future file-backed entries use validated `updatedAt` values.

## Known issues and limits

- No real content, author, media, or collection has been migrated.
- Source switching in the production repository remains a Stage-03 code/config change with parity evidence and full gates.
- List-page migration for non-registered types requires later code-owned integration; content data cannot create it.
- Stage-02 does not implement desktop editing, preview, media byte/signature/dimension/EXIF processing, atomic writes, Git publishing, database changes, or deployment.
- The first safe renderer deliberately supports only the Stage-01 Markdown profile subset documented in `CONTENT-LOADER.md`.
- Existing factual gaps and review boundaries remain unchanged; no team fact was inferred or invented.

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

1. Verify this bundle, SHA-256, exact `local/stage-02-content-loader` head, and the Stage-01 predecessor identity.
2. Import after Stage-01 and before Stage-03/06 consumers.
3. Run the offline install, check, full test, and native Next build gates.
4. Stage-03 must add reviewed repository files and parity evidence before changing a collection selector from `legacy` to `records`.
5. Review shared conflicts line by line. Likely surfaces are `package.json`, `.gitattributes`, the catch-all localized route, `app/sitemap.ts`, `components/SiteShell.tsx`, `docs/content-workbench/HANDOFF.md`, and `delivery/`.

Do not resolve shared files by choosing wholesale ours/theirs versions.

## Next executor's first step

Verify/import the Stage-02 bundle on top of the exact Stage-01 tip, run all gates, then read `CONTENT-LOADER.md`. For Stage-03, choose one real collection, prepare migration/parity evidence, load it through `createFileBackedContentRepository`, and change only that collection's explicit selector after review.

## Do not repeat or redesign silently

- Do not copy or reimplement the schema, workflow, publication eligibility, or Markdown policy.
- Do not silently fall back from a selected records collection to legacy by ID.
- Do not publish test fixtures or invent missing real data.
- Do not couple English publication to Chinese or generate an English detail for missing/draft English.
- Do not let content files create routes, navigation, footer entries, or renderers.
- Do not delete legacy files, D1/Drizzle, Worker, Sites, vinext, or deployment compatibility structures.
- Do not add a remote, push, merge `main`, tag, release, deploy, or connect to production from a stage host.

## Rollback

Before integration, omit the bundle. After local integration, use ordinary revert commits for the Stage-02 commits in reverse order and rerun all gates. During a later collection migration, first switch that reviewed collection explicitly back to `legacy`; do not reset, rewrite history, or remove unrelated files.
