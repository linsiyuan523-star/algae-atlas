# Stage 5B1 Handoff

- Stage: Stage-05B1 - Chinese Article Editing and Text Cleanup
- Start commit: `6855f5dc29f4b461bb29a29c4eea2cda5689093c`
- Feature commit: `4c795c418cc91109976deb4394f83c2ba0565fc2`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Added a constrained Chinese article editor for headings 2-6, paragraphs, bold/italic text, lists, quotes, safe links, tables, subscript, superscript, scientific-name italics, and `media:<id>` image placeholders.
- Normalized pasted plain text and Word/web HTML by removing paragraph indentation, tabs, BOM/CRLF noise, excess blank lines, inactive styling, active elements, event attributes, unsafe URLs, and remote images.
- Added deterministic Markdown parsing and serialization under the shared safe Markdown validator, with HTTPS/internal/fragment link policy and validated media IDs.
- Persisted Chinese Markdown as `bodyZh`, set `locales.zh.bodyFile` only for non-empty bodies, and advanced the local draft envelope to format v3.
- Added transparent v2-to-v3 draft migration with an empty body while retaining v1 compatibility.
- Added editor, cleanup, security, serialization, component, autosave, schema-reference, storage-boundary, and migration coverage.

## Not Completed

- Optional English editing and the Stage 5 checkpoint remain for Stage-05B2.
- Media ingestion, real media selection, preview, repository export, Git publishing, installer work, remote write, merge, and deployment were not implemented.
- Full website and desktop production builds were not run by instruction.

## Test Summary

- Offline locked npm install: PASS; 662 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS; existing missing Next.js `pages` notice remains informational.
- Desktop Vitest suite: PASS; 11 files, 92 tests before final focused refinements.
- Final editor/security focus: PASS; 2 files, 22 tests.
- Related editor/persistence focus: PASS; 5 files, 36 tests.
- Desktop scaffold contract: PASS; 1 test.
- Rust tests: PASS; 9 tests. Rust format check and Clippy with warnings denied: PASS.
- Desktop visual check at 1280 px: PASS; no page-level horizontal overflow.
- Git whitespace check: PASS.

## Known Issues

- ESLint prints the existing non-fatal missing Next.js `pages` notice for the Vite workspace.
- Browser-only Vite mode cannot open drafts because Tauri `invoke` is unavailable; editor behavior is covered by component tests and runs in the desktop host.

## Next Stage Exact Start

- Start from the clean Stage-05B1 delivery tip or verified Stage-05B1 bundle.
- Execute `23_Stage5B2_可选英文与Stage5检查点.md` in a new Stage-05B2 session/worktree.

## Do Not Repeat

- Use `npm.cmd`; PowerShell blocks `npm.ps1` under the current execution policy.
- Do not restore the scaffold test's pre-editor dependency whitelist; it must include the exact Tiptap and DOMPurify versions.
- Do not use browser-only Vite mode to diagnose Tauri draft calls.
- Preserve the shared Markdown validator, safe-link policy, validated media IDs, and v2 migration behavior.
