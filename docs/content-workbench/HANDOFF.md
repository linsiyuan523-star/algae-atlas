# Stage 5A1 Handoff

- Stage: Stage-05A1 - Schema-driven Form Engine Pilot
- Start commit: `106a33ddbf8a8451b3fd9cc90948210a9ccf7875`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Added a reusable schema-form renderer for text, multiline text, date, enum, boolean, HTTPS URL, and author stable-ID reference controls.
- Added generic required, length, date, enum, URL, and author-reference field validation.
- Added a registry-backed Team News pilot without enabling dedicated forms for other content types.
- Added Chinese summary, location, participant description, event dates, category, featured state, accountable author placeholder, primary source, and disclosure fields.
- Serialized the pilot into the existing shared `recordDraft` and used `teamNewsRecordSchema` as the final save authority.
- Mapped shared-schema failures to individual controls and blocked invalid manual or automatic saves.
- Added a read-only canonical-path structure preview.
- Preserved draft CRUD, normalized autosave, close warning, recovery, and future-version refusal.

## Not Completed

- No dedicated form for the other ten content types.
- No Markdown body editor, optional-English workflow, media ingestion, author catalog administration, website preview, repository export, or Git publishing.
- No route, navigation, website content, Rust command, installer, remote, merge, or deployment change.

## Test Summary

- Offline locked npm install: PASS; 601 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS.
- Desktop component/unit tests: PASS; 7 files, 21 tests.
- Shared schema TypeScript and tests: PASS; 58 tests.
- Team News controls, field errors, date range, source compatibility, save blocking, and form-to-record round trips: PASS.
- Browser layout: PASS at 1280x800, 600x800, and 390x800; no horizontal overflow, clipped labels, control overflow, or console errors.
- Git whitespace check: PASS.
- Full website build was not run by instruction.

## Known Issues

- ESLint prints the existing non-fatal missing Next.js `pages` notice for the Vite workspace.
- Standalone Vite has no Tauri IPC; the visual check used the same UI with an in-memory `DraftApi`.
- The pilot edits one accountable author and one primary source while preserving additional stored entries for later catalog work.

## Next Stage Exact Start

- Start from the clean Stage-05A1 delivery tip or verified Stage-05A1 bundle.
- Execute `20_Stage5A2_内容类型表单批次一.md` in a new Stage-05A2 session/worktree.

## Do Not Repeat

- Do not add per-type rendering branches to the generic `SchemaForm`; extend form schemas and record adapters.
- Do not duplicate enum values or final validation rules in desktop code; consume the shared registry and shared schemas.
- Do not require a URL when an existing structured source is valid through an identifier.
- Do not broaden this pilot to body, English, media, author-catalog, preview, or publishing work.
