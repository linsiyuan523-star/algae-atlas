# Stage 5A2 Delivery Handoff

- Stage: Stage-05A2 - Content-specific Forms, Batch One
- Start commit: `f0ac4a59e7ed0370f9b91f388048f603c5584909`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Registry-backed forms for Research Output, Research Project, Science Article, Collaboration, and Team Member.
- Unified content-form adapter registry used by the existing draft editor.
- Number input with integer/range validation for year, order, and reading-time fields.
- Shared registry metadata and enum options for all batch-one fields.
- Shared-Schema serialization, field error mapping, autosave/manual-save integration, and round-trip inspection for all five types.
- Existing Team News form, CRUD, recovery, and future-version safety retained.

## Not Completed

- No dedicated form for the five Stage-05A3 content types.
- No body/English/media editing, catalog UI, structured reference-list editing, website preview, export, Git publishing, installer, remote write, merge, or deployment.
- Website, Rust, and native Tauri build surfaces were unchanged.

## Test Summary

- Offline npm install: PASS; 601 packages, 0 vulnerabilities.
- Desktop TypeScript/ESLint: PASS.
- Desktop scaffold: PASS; 1 test.
- Desktop tests: PASS; 8 files, 39 tests.
- Shared schema TypeScript/tests: PASS; 58 tests.
- Batch-one round trips, errors, registry enums, component rendering, and save integration: PASS.
- Git whitespace check: PASS.
- Full website build: NOT RUN by instruction.

## Known Issues

- ESLint retains the existing non-fatal missing Next.js `pages` informational message.
- The Research Output form exposes one primary contributor and preserves additional stored contributor IDs.
- Structured source and related-ID collection controls remain outside this batch.

## Next Stage Exact Start

- Use the clean Stage-05A2 delivery tip or verified bundle.
- Next instruction: `21_Stage5A3_内容类型表单批次二.md`.

## Do Not Repeat

- Use `npm.cmd`; PowerShell blocks `npm.ps1` under the current execution policy.
- Use `createSharedRecordDraft` before type-specific adapters in tests so the required Chinese title exists.
- Extend the adapter registry; do not add per-type rendering branches or duplicate shared enum/schema rules.
- Do not expand Stage-05A2 into later editor, media, preview, export, or publishing stages.
