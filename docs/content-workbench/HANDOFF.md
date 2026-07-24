# Stage 6A1 Handoff

- Stage: Stage-06A1 - Image Intake and Attribution Metadata
- Start commit: `2beb9506506387e6579515d214ae40dd195eca01`
- Feature commit: `fc437a7552ef439708ac29d726dfc6c8b7d4801e`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the delivery bundle head)

## Completed

- Added a local-only Tauri media staging service for JPEG, PNG, WebP, and AVIF.
- Validates safe source names, extension/signature agreement, bounded dimensions and bytes, UUID v4 names, SHA-256, and fixed `public/images/uploads/YYYY/MM/` path previews.
- Stores a per-draft staged binary and metadata manifest atomically below application data; no generic path-write command is exposed.
- Added select and HTML drag/drop intake for cover, body, gallery, and portrait uses.
- Added attribution, source, license, usage, rights, identification, consent, Chinese/English alt, and caption fields.
- Blocks approved/published locale candidates while staged media has incomplete license/rights/consent/alt data or unsaved metadata.
- Reattaches safely staged media to an interrupted draft on reopen and persists the record reference on the next save.
- Added focused Rust, React, metadata, path-safety, and recovery coverage.

## Not Completed

- No format conversion, EXIF/private metadata removal, duplicate-image hashing, repository export, Git publication, remote write, merge, release, or deployment.
- Stage-06A2 and later stages were not started.

## Test Summary

- `npm.cmd ci --offline --ignore-scripts`: PASS; 659 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS; existing Next.js missing-pages notice remains informational.
- Focused Vitest: PASS; 4 files, 24 tests.
- Rust media intake tests: PASS; 5 tests.
- Rust format check and Clippy with warnings denied: PASS.
- Desktop frontend production build: PASS; existing Vite chunk-size warning remains informational.
- Desktop visual check: PASS at desktop and 375px widths; no horizontal overflow.
- Git whitespace check: PASS.

## Known Issues

- Existing ESLint missing-pages notice and Vite large-chunk warning remain.
- Browser-only Vite cannot invoke Tauri draft commands; visual review used a temporary local harness that was removed before commit.

## Next Stage Exact Start

- Use this clean Stage-06A1 delivery bundle.
- Next instruction: `25_Stage6A2_图片处理与隐私.md`.

## Do Not Repeat

- Use `npm.cmd` under the current PowerShell execution policy.
- Do not run root website check/test/build: shared Schema and website files were not changed.
- Preserve staged-image path safety, UUID names, source/extension signature checks, locale independence, and publication gates.
- Do not add image conversion, EXIF cleanup, or duplicate-image hashing in this completed sub-stage.
