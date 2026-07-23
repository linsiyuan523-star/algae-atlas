# Stage 4D Handoff

- Stage: Stage-04D - Autosave and Interrupted-session Recovery
- Branch: `local/stage-04d-autosave-recovery`
- Start commit: `f50819f0533e166ccc8b72b7153972a8ba981cdd`
- Feature commit: `83f1cb9539a5d9d5f2c043265575ac4e1744bdac`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve with `git rev-parse HEAD` after the delivery commit)

## Completed

- Added 700 ms debounced autosave while retaining explicit save and retry controls.
- Added waiting, saving, saved, and failed status feedback.
- Added native Tauri close confirmation for dirty drafts with a browser `beforeunload` fallback.
- Added an application-data session marker at startup and normal-exit marker removal.
- Added a one-time interrupted-session recovery offer for the latest valid draft.
- Kept recovery stable under React StrictMode's repeated development effects.
- Added centralized draft-format migration dispatch for future format migrations.
- Moved malformed, invalid, or unsupported draft JSON into `drafts/v1/quarantine` without changing valid drafts.
- Added focused React and Rust coverage for autosave, close warnings, recovery, session markers, migration dispatch, and corrupt-file isolation.

## Not Completed

- No multi-window synchronization, transaction journal, full version history, cloud sync, encryption, or search.
- No shared Schema integration, content-type form, media, preview, repository export, Git command, network operation, packaging, remote write, merge, or deployment behavior.
- Complete website tests, root production build, and native Tauri smoke were not run by this stage boundary.

## Test Summary

- Locked offline npm install: PASS; 601 packages, 0 vulnerabilities.
- Desktop frontend suite: PASS; 3 files, 7 tests.
- Focused autosave/recovery frontend suite: PASS; 2 files, 6 tests.
- Rust unit tests: PASS; 7 tests.
- Desktop TypeScript and ESLint check: PASS.
- `cargo check --locked --all-targets`: PASS.
- Rust format check and Clippy with warnings denied: PASS.
- `git diff --check`: PASS.

## Known Issues

- ESLint prints an informational missing Next.js `pages` directory message for this Vite workspace but exits successfully.
- The Tauri close-request path was typechecked; native window smoke was outside this stage's test boundary.

## Next Stage Exact Start

- Start only from the clean final tip of `local/stage-04d-autosave-recovery` or its verified delivery bundle.
- Execute `18_Stage4E_共享Schema接入与检查点.md` in a new Stage-04E session/worktree.

## Do Not Repeat

- Do not combine Vitest fake timers with this `user-event` autosave flow; the initial attempt timed out. Use the real 700 ms debounce window.
- Keep recovery requests cached per `DraftApi` instance and reset the mounted ref in effect setup; otherwise React StrictMode can consume or suppress recovery state.
- Do not replace the existing same-directory atomic writer or save over a draft that failed validation; quarantine it first.
