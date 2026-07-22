# Stage 0 Handoff

Status: pre-delivery; design is complete, full stage-close validation and bundle creation remain.
Stage: Stage 0 — Repository Audit and Overall Design
Branch: `local/stage-00`
Baseline commit: `456ff609e27ce5aa46fa0608289a30298bdd3e7f`
Final commit SHA: the branch tip recorded in the verified USB `MANIFEST.txt` and bundle heads after finalization. A committed file cannot embed the SHA of the commit that contains itself.

## Goal

Provide an evidence-based, implementation-ready contract for a Windows-first Tauri content publishing workbench without changing public pages, content data, dependencies, images, routes, database, deployment, or production.

## Completed

- Audited the actual Next.js/React/TypeScript repository, route dispatch, locale behavior, content sources, images, review model, tests, and build commands.
- Confirmed D1 schema/migrations are empty, D1/R2 bindings are null, and D1/Drizzle/Worker files are compatibility scaffolding rather than the current public content source.
- Defined the workbench/code ownership boundary.
- Defined 11 content types and their dedicated fields/publication gates.
- Selected versioned JSON metadata plus per-locale Markdown bodies.
- Defined stable English IDs, independent Chinese/English state, review/translation gates, authors, media, references, and deterministic serialization.
- Defined Chinese-only routing, metadata, sitemap, and language-switch fallback behavior.
- Designed the shared schema, website adapter, Tauri desktop, local Git safety service, preview, delivery, and trust boundaries.
- Defined collection-by-collection migration, explicit legacy/record source selection, parity gates, compatibility rollback, and failure stops.
- Defined Stage-01 through Stage-08 interfaces, owners, prerequisites, integration order, branch names, and bundle protocol.
- Defined security and test strategies.

## Not completed by design

Stage 0 does not implement:

- schema/runtime validation code or dependencies;
- content directories/records or any migration;
- Next.js loader, routes, metadata, sitemap, language switch, or page changes;
- Tauri/React desktop code, Rust toolchain, media processing, preview, or Git publisher;
- image moves/optimization/CDN/object storage;
- D1/Drizzle/Worker removal or database activation;
- GitHub remote, push, PR, tag, release, deployment, or production connection.

These belong to later stages in `STAGE-DEPENDENCIES.md` (inside the bundle).

## Principal decisions

| Topic | Decision |
| --- | --- |
| Initial source | Repository files; no runtime database requirement. |
| Record layout | `content/records/<type>/<id>/record.json` plus `zh.md` and optional `en.md`. |
| Identity | Globally stable English kebab-case ID; type/ID immutable after first publication. |
| Locale | Chinese required; English independent and optional. |
| Missing English | No English detail, alternate, or sitemap URL; language switch goes to English section landing. |
| Publication | Only an eligible per-locale `published` state is public. |
| Translation | Machine-assisted text cannot publish without recorded human verification. |
| Media | New uploads under `public/images/uploads/YYYY/MM/` with catalog, hash, rights, consent, and localized accessibility text. |
| Existing media | Paths/bytes protected; no automatic move/delete. |
| Authors | Public attribution IDs only; private personnel/consent records stay outside Git. |
| Markdown | Safe non-executable profile; no raw HTML/MDX in the first version. |
| Migration | One collection/source at a time, explicit switch, no silent fallback. |
| Desktop authority | Approved worktree, allowlisted files, exact local commit only; no remote/network/deploy. |
| Production | Existing main-only integration, PR, and deployment flow remains authoritative. |

## Repository findings important to later stages

- Current `LocalizedText` requires both `zh` and `en`; current static params/metadata/sitemap/language switch assume paired locales.
- Draft review metadata is currently informational and does not gate rendering.
- Maintainable content is split among `lib/*.ts` and component-embedded copy.
- Existing arrays: six algae profiles, three live-feed profiles, four research capabilities, six collaboration areas, six tutorial shells; real members, outputs, and news are empty.
- Current `projects` are sample observation frameworks and must not be migrated as verified team projects.
- Seven current image binaries are protected by exact-hash tests; three unreferenced binaries remain protected inventory.
- Existing rendered tests encode important scientific, privacy, attribution, empty-state, route, and SEO boundaries.

## Design documents

- `REQUIREMENTS.md`
- `CONTENT-TYPES.md`
- `CONTENT-SCHEMA.md`
- `ARCHITECTURE.md`
- `MIGRATION-PLAN.md`
- `SECURITY-MODEL.md`
- `TEST-STRATEGY.md`
- `STAGE-DEPENDENCIES.md`
- `HANDOFF.md`

## Delivery files

- `delivery/HANDOFF.md`
- `delivery/MANIFEST.txt`
- `delivery/TEST-SUMMARY.txt`
- `delivery/CHANGED-FILES.txt`

## Local commits

- `95b521f` — `docs: audit current content architecture`
- `d4fc219` — `docs: design content workbench and staged migration`
- security/test/handoff plan commit: recorded in the final branch history;
- stage-close test/delivery commit: final branch tip.

## Validation

Completed before this pre-delivery handoff:

- strict UTF-8 decode and LF checks for generated documents;
- balanced Markdown fence checks;
- local Markdown link existence checks;
- `git diff --cached --check` for each stable documentation commit.

Stage-close commands and exact results are recorded in `delivery/TEST-SUMMARY.txt` after they run:

- `npm.cmd run check`
- `npm.cmd test`
- `npm.cmd run build:next`
- final Git status/remote and bundle verification.

## Known issues and pending factual data

- Existing user-provided image usage scope remains pending where the site already says so.
- No public team members, outputs, news, detailed contacts, or operational tutorial procedures have been supplied; later stages must not invent them.
- Existing component copy will require a later record-by-record extraction decision.
- The exact schema validation dependency/version is selected and pinned in Stage-01 after dependency review; all consumers must use the same canonical module.
- Windows Git currently warns that global autocrlf may convert LF on a future checkout. Generated files and committed blobs are LF; Stage-01 should add a scoped line-ending policy if implementation files require it.

## Interface versions

| Interface | Design version |
| --- | --- |
| Content schema | 1 |
| Repository API | 1 |
| Desktop command API | 1 |
| Media metadata | 1 |
| Git publish plan | 1 |
| Migration ledger | 1 |

## Integration order

1. Verify this bundle and checksum.
2. Import its branch under a namespaced local ref.
3. Confirm the baseline is an ancestor and review all documentation commits.
4. Use this branch tip as Stage-01's design prerequisite.
5. Follow the graph in `STAGE-DEPENDENCIES.md`; parallel workers do not merge ambiguous prerequisites themselves.
6. Keep worker/integration remotes absent until a later explicit authorization.

## Next executor's first step

For Stage-01:

1. verify the Stage-00 USB checksum and `git bundle verify`;
2. read `CONTENT-SCHEMA.md`, `CONTENT-TYPES.md`, `SECURITY-MODEL.md`, `TEST-STRATEGY.md`, and the Stage-01 contract;
3. confirm the imported final SHA and interface version 1;
4. create a dedicated Stage-01 worktree/branch from that exact integrated tip;
5. implement only the shared schema/fixtures/CLI contract, with no website or desktop feature work.

## Do not repeat or redesign silently

- Do not redo the Stage-00 repository audit from assumptions.
- Do not promote D1 into the source of truth.
- Do not couple English publication to Chinese.
- Do not change stable type IDs, record layout, locale route contract, or stage graph without an explicit design amendment.
- Do not migrate current sample observations as team projects.
- Do not move/delete current images or compatibility files.
- Do not add GitHub remote, push, merge main, tag, release, or deploy.

## Rollback

Stage 0 changes documentation only. Before integration, omit the Stage-00 branch. After local integration, revert the Stage-00 documentation commits with ordinary revert commits if the design is rejected. Do not reset, rewrite history, delete unrelated work, or alter the baseline.
