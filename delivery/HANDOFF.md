# Stage 2 Delivery Handoff

Status: PASS, ready for the final documentation commit and post-commit bundle creation.

Stage: Stage-02 — Website Content Loader
Branch: `local/stage-02-content-loader`
Baseline / Stage-01 final commit: `050a87dbd6330270e6b47b6f74acd071a85c5fcd`
Predecessor bundle: `stage-01-schema-v1.bundle`
Predecessor SHA-256: `74A7668B6C8F22BF8E953B038A7D909A3784013A713C4195D0258E031B8DBFF9`
Implementation tip before delivery docs: `90bbaaf7d4ade0a12d4aa3bf6cd9c2919676488c`
Final commit SHA: exact branch tip will be written to the external USB `MANIFEST.txt` and verified bundle head after this committed handoff is finalized.

## Goal and result

Stage-02 implemented the fail-closed website filesystem reader, legacy and repository adapters, exhaustive per-type source router, public repository/availability API, locale-aware route/metadata/static-param/language-switch/sitemap integration, and a safe structured Markdown renderer.

All 11 real collection selectors remain explicitly `legacy`. No real records were migrated, and the existing public page content remains equivalent. Fictional Chinese-only and bilingual records exist only in test fixtures.

## Important decisions

- Stage-01 `record.json` and schema version 1 remain canonical.
- The loader accepts only regular repository files encoded as UTF-8 without BOM, LF only, with a final newline; it rejects unsafe paths and validates the full snapshot.
- Publication eligibility is imported from `@algae-atlas/content-schema` and evaluated independently by locale.
- Source choice applies to a whole content type and never silently blends records with legacy entries by ID.
- Chinese-only publication creates no English detail, alternate, static param, or sitemap URL; its language switch returns to the English section landing.
- Content cannot create route families, navigation, footer entries, or renderers.

## Validation

- Offline dependency install: PASS (509 packages, 0 vulnerabilities).
- `npm.cmd run check`: PASS, no warnings.
- `npm.cmd run test:content-loader`: PASS (10 tests).
- `npm.cmd test`: PASS (58 schema tests; browser contract; 10 content-loader/source/route/render tests; 25 existing rendered tests; 1 IndexNow test).
- `npm.cmd run build:next`: PASS (97 static pages).
- Existing 24 real detail records: all legacy and bilingual in the default repository.
- Worker remote: empty; no network, remote, production, release, or deployment action.

One initial sandboxed `npm.cmd test` attempt stopped at Vite's temporary-directory write with `EPERM`. The approved rerun of the identical command passed; this is recorded as an environment permission retry, not a test failure.

## Modified files

See `delivery/CHANGED-FILES.txt`. Primary areas are `content/`, `lib/content-repository/`, the localized catch-all page, sitemap, language switch, structured renderer, content fixtures/tests, authoring docs, and delivery files.

## Not completed / known limits

- No real record, author, media, or collection migration.
- No desktop editor, preview, media-byte processing, Git publisher, database change, remote operation, deployment, or production change.
- Stage-03 owns migration evidence and explicit real collection source switches.
- Non-registered content types need separately reviewed, code-owned page integration.

## Integration order

Import after the exact Stage-01 tip and before Stage-03/06 consumers. Verify bundle/hash/head, run offline install, check, full tests, and native Next build. Resolve shared files line by line; never choose wholesale ours/theirs versions.

## Next executor's first step

Read `docs/content-workbench/CONTENT-LOADER.md`. For Stage-03, migrate one reviewed collection with parity evidence, load it through the file-backed repository, and change only that collection's explicit selector.

## Do not repeat

Do not copy schema/publication rules, blend sources by ID, publish fixtures, invent facts, couple locales, create routes from data, delete compatibility structures, add a remote, push, merge main, tag, release, deploy, or connect to production.

## Rollback

Omit the bundle before integration, or revert Stage-02 commits with ordinary revert commits and rerun all gates. Later migrated collections first roll back through their explicit selector; never reset or clean unrelated work.
