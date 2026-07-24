# Stage 8A Handoff

- Stage: Stage-08A - First-run Onboarding and Diagnostics
- Start commit: `12ea637bdc2e00ce2bb8dbdf930b681543f9b5f1`
- Implementation commit: `7d8ae19`
- Delivery commit: `BRANCH_TIP_AT_DELIVERY` (resolve from the clean Stage-08A branch tip)

## Completed

- Added a first-run local configuration gate for repository, draft, and image-staging directories.
- Persisted only validated local paths; no credential, token, GitHub login, remote, or network action was added.
- Added tool diagnostics for Git, Node.js, Rust, MSVC, and WebView2, plus path permission, local Git, image capability, and application-data status.
- Applied configured draft and staging storage roots on the next desktop launch and returns to onboarding if saved paths later become invalid.
- Added a settings-page view of the same local configuration and diagnostics, including the configured repository as the default repository-export path.

## Not Completed

- No native folder-picker dialog was added; directory paths use the existing text-input pattern.
- No installer, installer candidate, release, deployment, remote, GitHub integration, or credential storage was created.

## Test Summary

- Desktop TypeScript/ESLint check, frontend build, Rust format, and Rust Clippy: PASS.
- Focused onboarding/App Vitest: PASS; 2 files, 8 tests.
- Focused Rust onboarding tests: PASS; 3 tests covering persistence, invalid storage, and missing storage recovery.
- Local Vite preview returned HTTP 200 with no browser console warning or error; browser fallback cannot invoke native Tauri commands.

## Known Issues

- Existing ESLint missing-pages notice and Vite chunk-size warning remain.
- Changing configured draft or staging directories requires restarting the desktop application before the new storage roots are active.

## Next Stage Exact Start

- Start from the clean Stage-08A branch tip after resolving `BRANCH_TIP_AT_DELIVERY`.
- Execute `33_Stage8B_Windows安装候选.md`.

## Do Not Repeat

- Do not add GitHub authentication, token storage, HTTP, Git remote commands, push, PR creation, merge, tag, release, or deployment on this worker.
- Do not run a production installer build in Stage 8A.
- Use `npm.cmd` on this Windows host; the PowerShell `npm.ps1` shim is blocked by execution policy.
