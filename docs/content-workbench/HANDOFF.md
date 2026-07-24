# Stage 6B1 Handoff

- Stage: Stage-06B1 - Localized Detail Preview
- Start commit: `2beb9506506387e6579515d214ae40dd195eca01`
- Feature commit: `048c0b8a722eb18037abfa63c5a90e6fe9784806`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified bundle head)

## Completed

- Added a controlled desktop-width detail preview with live edit/preview switching in the draft editor.
- Added independent Chinese and English preview selection; `missing` English renders an explicit no-page state.
- Previewed localized title, summary, author IDs, update/publication time, workflow state, review status, and body.
- Reused the constrained Tiptap Markdown profile, mapped its document model to React nodes, and blocked unsafe or unsupported bodies without HTML injection.
- Rendered body images in document order with localized alt/caption and attribution; only an explicitly supplied, validated preview source is loaded.
- Added stable missing-image treatment for media references without Stage-06A metadata or a resolved preview source.
- Added focused rendering, Markdown safety, image attribution, language switching, and draft-editor integration coverage.
- Verified the desktop layout at the Tauri default `1280x800` viewport with no horizontal overflow, title/toolbar overflow, or browser console errors.

## Not Completed

- Stage-06A image intake/processing was not implemented or merged; the current draft envelope cannot supply media metadata or preview sources.
- Mobile preview, section/home cards, layout diagnostics, repository export, remote write, merge, and deployment were not implemented.

## Test Summary

- Offline locked npm install: PASS; 662 packages, 0 vulnerabilities.
- Desktop TypeScript and ESLint: PASS; existing missing Next.js `pages` notice remains informational.
- Full desktop Vitest: PASS; 14 files and 127 tests.
- Focused preview/DraftPages suite: PASS; 2 files and 17 tests.
- Desktop frontend production build: PASS; existing non-fatal large-chunk warning remains.
- Browser visual/interaction smoke at `1280x800`: PASS; image loaded, missing-English state switched correctly, no overflow or console errors.
- Git whitespace check: PASS.
- Root website, Rust, and native Tauri suites: NOT RUN because this stage changed only desktop React/CSS and its focused preview behavior.

## Known Issues

- Media references show a deliberate placeholder until Stage-06A supplies validated metadata plus a resolved same-origin or raster data preview source.
- Author names are not available in the draft envelope, so the preview displays stable author IDs.
- The existing ESLint missing-pages notice and Vite chunk-size warning remain non-fatal.

## Next Stage Exact Start

- Create an integration commit containing this clean Stage-06B1 delivery tip and the clean Stage-06A2 delivery tip.
- Execute `27_Stage6B2_卡片响应式与Stage6检查点.md` from that integrated commit in a new Stage-06B2 worktree.

## Do Not Repeat

- Do not derive a browser image URL directly from `Media.filePath`; the desktop Vite app does not serve the repository-root `public/images` directory.
- Do not weaken Markdown validation or use `dangerouslySetInnerHTML`; the React document renderer is the preview security boundary.
- Use scoped status assertions in DraftPages tests because save state and missing-language state both use `role="status"`.
- Use `npm.cmd` under the current PowerShell execution policy, and do not rerun root website checks until shared Schema or website files change.
