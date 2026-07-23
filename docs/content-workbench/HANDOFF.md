# Stage 5A2 Handoff

- Stage: Stage-05A2 - Content-specific Forms, Batch One
- Start commit: `f0ac4a59e7ed0370f9b91f388048f603c5584909`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Added registry-backed forms for Research Output, Research Project, Science Article, Collaboration, and Team Member.
- Added a content-form adapter registry so the draft editor selects schemas, values, validation, and serialization without per-type rendering branches.
- Added the required number control for years, display order, and reading time, including integer and range validation.
- Added missing field-registry metadata and enum options consumed by the five forms.
- Serialized all five forms through their existing shared record schemas while preserving unedited arrays, references, and related IDs.
- Retained Team News behavior, draft CRUD, autosave/recovery, future-version refusal, and read-only structure previews.

## Not Completed

- No dedicated forms for Learning Resource, Algae Profile, Live-feed Profile, Coastal Observation, or Research Profile.
- No Markdown body editor, optional-English workflow, media ingestion, author catalog, structured reference-list editor, website preview, export, or Git publishing.
- No website route, website content, Rust command, installer, remote, merge, or deployment change.

## Test Summary

- Offline locked npm install: PASS; 601 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS.
- Desktop scaffold test: PASS; 1 test.
- Desktop component/unit tests: PASS; 8 files, 39 tests.
- Shared schema TypeScript: PASS.
- Shared schema tests: PASS; 58 tests.
- Five form-to-record shared-Schema round trips, enum registry sourcing, field error mapping, component rendering, and draft-save integration: PASS.
- Git whitespace check: PASS.
- Full website build was not run by instruction.

## Known Issues

- ESLint prints the existing non-fatal missing Next.js `pages` notice for the Vite workspace.
- Research Output edits one primary contributor while preserving additional stored contributor IDs.
- Structured source lists and related-ID arrays remain preserved/defaulted until their catalog controls are implemented.

## Next Stage Exact Start

- Start from the clean Stage-05A2 delivery tip or verified Stage-05A2 bundle.
- Execute `21_Stage5A3_内容类型表单批次二.md` in a new Stage-05A3 session/worktree.

## Do Not Repeat

- Do not invoke `npm` through blocked PowerShell `npm.ps1`; use `npm.cmd` without changing system execution policy.
- Do not build adapter tests directly from raw defaults without setting the required Chinese title; use `createSharedRecordDraft` first.
- Do not add per-type branches to `DraftPages`; register adapters and consume shared field metadata and shared record schemas.
- Do not broaden this batch into body, English, media, preview, export, or publishing work.
