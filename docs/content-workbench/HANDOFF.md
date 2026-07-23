# Stage 4C Handoff

- Stage: Stage-04C - Local Draft CRUD
- Branch: `local/stage-04c-draft-crud`
- Start commit: `2744cdc8d5ec7e121440e97b9bf9b94533846aeb`
- Feature commit: `d998722b4e0c0edc691d46b8aab69b32f9f09f04`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve with `git rev-parse HEAD` after the delivery commit)

## Completed

- Added version 1 JSON drafts under the Tauri application data directory at `drafts/v1`.
- Added named Tauri commands to create, list, open, manually save, and delete drafts.
- Limited stored fields to format version, internal draft ID, content type placeholder, stable ID, Chinese title placeholder, and create/update timestamps.
- Required canonical UUID v4 draft IDs and derived every draft path inside the fixed draft directory.
- Added same-directory temporary writes, file synchronization, and platform atomic create/replace behavior.
- Added React pages for explicit draft creation, listing, opening, editing, saving, and confirmed deletion.
- Added Rust storage/path/format/failure tests and frontend CRUD component coverage.

## Not Completed

- No autosave, crash recovery, draft version history, search index, Stage 1 Schema integration, or content-type-specific form.
- No repository export, media, preview, Git command, network, installer, remote write, merge, or deployment behavior.
- Complete website tests and native Tauri smoke were not run by the Stage-04C boundary.

## Test Summary

- Locked offline npm install: PASS (601 packages, 0 vulnerabilities).
- Rust draft storage tests: PASS (4 tests), including traversal/invalid IDs and injected replacement failure.
- Focused frontend tests: PASS (2 files, 4 tests).
- Desktop TypeScript and ESLint check: PASS.
- `cargo check --locked --all-targets`: PASS.
- `cargo clippy --locked --all-targets -- -D warnings`: PASS.
- Desktop Vite production build: PASS.
- Responsive local render: PASS at 1280 x 800, 600 x 800, and 320 x 700 with no overflow or clipped navigation labels.

## Known Issues

- No Stage-04B bundle was present under the supplied USB root. This stage used the exact clean local Stage-04B delivery tip `2744cdc8d5ec7e121440e97b9bf9b94533846aeb`; use the verified Stage-04C delivery bundle for transfer.

## Next Stage Exact Start

- Start only from the clean final tip of `local/stage-04c-draft-crud` or its verified delivery bundle.
- Execute `17_Stage4D_自动保存与异常恢复.md` in a new Stage-04D session/worktree.

## Do Not Repeat

- Do not call a state-setting refresh wrapper synchronously from the initial React effect; that failed `react-hooks/set-state-in-effect`. Keep initial list state updates in promise callbacks.
- Do not weaken canonical UUID v4 checks or construct paths from unvalidated frontend values.
- Do not replace the same-directory atomic writer with direct file truncation.
- Do not add Stage-04D autosave or recovery behavior to this stage.
