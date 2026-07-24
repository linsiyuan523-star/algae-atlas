# Stage 6B2 Handoff

- Stage: Stage-06B2 - Card, Responsive Preview, and Stage 6 Checkpoint
- Start commit: `d73ac176a3a820b30bd90a8259ae637a13052717`
- Feature commit: `1946185d14b69517dbdfe4f0f7997f54d93ae97b`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the verified Stage-06B2 bundle head)

## Completed

- Integrated the verified Stage-06A2 media metadata and Stage-06B1 detail preview tips locally.
- Added detail, section-card, and homepage-featured-card preview modes to the draft editor.
- Added desktop and mobile preview-width controls, including mobile card stacking and constrained detail spacing.
- Added limited diagnostics for title wrapping, missing image or localized alt text, long URLs, empty paragraphs, and long unbroken tokens that could overflow horizontally.
- Added wrap-safe CSS for summaries, body text, links, card source URLs, and narrow preview toolbars.
- Preserved the B1 preview security boundary: only validated `previewSource` values may be used as browser image sources.
- Added focused component coverage and updated the scaffold assertion for A2's intentional Rust image dependency.
- Completed the Stage 6 checkpoint checks and native Tauri launch smoke.

## Not Completed

- No site-wide visual redesign, server rendering change, repository publishing, remote write, PR, merge to `main`, tag, release, or deployment.
- A staged media `filePath` is still not converted into a browser URL; images without an explicit safe preview source retain the deliberate placeholder treatment.

## Test Summary

- `npm.cmd run check`: PASS.
- Focused preview suites: PASS; 3 files, 20 tests.
- `npm.cmd test`: PASS; desktop Vitest 17 files, 137 tests, plus root/schema/render checks.
- `npm.cmd run build:next`: PASS.
- `npm.cmd run desktop:frontend:build`: PASS.
- `git diff --check`: PASS.
- Native `npm.cmd run tauri:dev` smoke: PASS; the workbench root screen loaded successfully.

## Known Issues

- Windows capture/input automation cannot inspect this WebView2 window after launch: `SetIsBorderRequired failed (0x80004002)`. The native smoke itself succeeded; do not retry that automation path.
- The existing non-fatal Next.js missing-pages notice and Vite chunk-size warning remain outside this stage's changes.

## Next Stage Exact Start

- Start from the clean, verified Stage-06B2 delivery tip and bundle.
- Execute `28_Stage7A1_仓库诊断与导出DryRun.md`.

## Do Not Repeat

- Do not derive a browser image URL directly from `Media.filePath` or `StagedImage.targetPath`.
- Do not weaken the Markdown-to-React rendering boundary or use raw HTML injection.
- Use `npm.cmd` under the current PowerShell policy.
- Do not retry WebView2 capture/input automation for the native smoke; use launch confirmation only unless the capture layer is repaired.
