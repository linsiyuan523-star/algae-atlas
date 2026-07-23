# Stage 5A3 Handoff

- Stage: Stage-05A3 - Content-specific Forms, Batch Two and Checkpoint
- Start commit: `c5fdfdfcbd36b7dfa4984489c3db3ce637cdd538`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Added registry-backed forms for Learning Resource, Algae Profile, Live-feed Profile, Coastal Observation, and Research Profile.
- Completed adapter registration for all 11 content types and verified that each can create a Schema-valid draft.
- Added editable localized text lists, zoned ISO timestamp validation, and primary environment selection while preserving additional stored values.
- Added type-switch confirmation before type-specific fields are cleared.
- Added explicit rejection for form values not declared by the active form Schema.
- Expanded shared registry metadata and enum options used by the five forms.

## Not Completed

- No Markdown body editor, optional-English workflow, media ingestion, author/content catalogs, structured source editor, website preview, export, or Git publishing.
- Website, Rust, native Tauri, installer, remote, merge, and deployment surfaces were unchanged.

## Test Summary

- Offline locked npm install: PASS; 601 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS.
- Desktop scaffold: PASS; 1 test.
- Desktop component/unit tests: PASS; 9 files, 70 tests.
- Shared Schema TypeScript: PASS.
- Shared Schema tests: PASS; 58 tests.
- All 11 registered type adapters, type switching, unsupported fields, enum sourcing, rendering, validation, and round trips: PASS.
- Git whitespace check: PASS.
- Full website production build was not run by instruction.

## Known Issues

- ESLint prints the existing non-fatal missing Next.js `pages` notice for the Vite workspace.
- Environment selectors edit one primary value and preserve additional stored values.
- Structured references, relationship IDs, approver roles, and media collections remain preserved/defaulted until their catalog controls are implemented.

## Next Stage Exact Start

- Start from the clean Stage-05A3 delivery tip or verified Stage-05A3 bundle.
- Execute `22_Stage5B1_正文编辑与文本清理.md` in a new Stage-05B1 session/worktree.

## Do Not Repeat

- Use `npm.cmd`; PowerShell blocks `npm.ps1` under the current execution policy.
- Use role-based selectors when form labels share prefixes such as audience fields.
- Extend the adapter registry; do not add per-type rendering branches in `DraftPages`.
- Do not broaden Stage-05A3 into body, English, media, preview, export, or publishing work.
