# Stage 5B1 Delivery Handoff

- Stage: Stage-05B1 - Chinese Article Editing and Text Cleanup
- Start commit: `6855f5dc29f4b461bb29a29c4eea2cda5689093c`
- Feature commit: `4c795c418cc91109976deb4394f83c2ba0565fc2`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Constrained Chinese article editor with headings 2-6, paragraphs, emphasis, lists, quotes, safe links, tables, subscript/superscript, scientific-name italics, and validated media placeholders.
- Paste cleanup for indentation, half/full-width and nonbreaking spaces, tabs, BOM/line endings, excess blank lines, Word/web styles, active HTML, event attributes, unsafe URLs, and remote images.
- Deterministic safe-Markdown parsing and serialization using the shared validator.
- Chinese `bodyZh` persistence, conditional `locales.zh.bodyFile = "zh.md"`, draft format v3, transparent v2 migration, and retained v1 compatibility.
- Exact Tiptap 3.28.0 and DOMPurify 3.4.12 dependencies plus editor, security, persistence, and migration tests.

## Not Completed

- No optional English editor, real media ingestion/selection, preview, repository export, Git publishing, installer, remote write, merge, or deployment.
- Full website and desktop production builds were not run by instruction.

## Test Summary

- Offline npm install: PASS; 662 packages, 0 vulnerabilities.
- Desktop TypeScript/ESLint: PASS.
- Desktop Vitest: PASS; 11 files, 92 tests, followed by final editor/security focus of 2 files and 22 tests.
- Related editor/persistence focus: PASS; 5 files, 36 tests.
- Desktop scaffold: PASS; 1 test.
- Rust: PASS; 9 tests, format check, and Clippy with warnings denied.
- Visual width check at 1280 px and Git whitespace check: PASS.
- Full website production build: NOT RUN by instruction.

## Known Issues

- ESLint retains the existing non-fatal missing Next.js `pages` informational message.
- Browser-only Vite mode has no Tauri `invoke`; desktop behavior is covered by tests and requires the desktop host.

## Next Stage Exact Start

- Use the clean Stage-05B1 delivery tip or verified Stage-05B1 bundle.
- Next instruction: `23_Stage5B2_可选英文与Stage5检查点.md`.

## Do Not Repeat

- Use `npm.cmd` under the current PowerShell execution policy.
- Keep the scaffold dependency contract synchronized with the exact editor dependencies.
- Do not test Tauri draft calls in browser-only Vite mode.
- Do not weaken Markdown validation, link/media policy, or draft migration compatibility.
