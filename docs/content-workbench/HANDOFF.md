# Stage 4A Handoff

- Stage: Stage-04A - Minimal Tauri Shell
- Status: COMPLETE
- Branch: `local/stage-04a-minimal-shell`
- Start commit: `7c592faca28ee713c5abdf06f04ef05106b32f7a`
- Implementation commit: `c52edf139e4325bf693820169c4165eac8edc4fa`
- End commit: `BRANCH_TIP_AT_DELIVERY` (resolve with `git rev-parse HEAD` after the delivery commit)

## Completed

- Created the dedicated Stage-04A worktree from the Stage-04R handoff commit.
- Reduced the inherited interrupted Stage-04 implementation to a minimal Tauri 2, React, and TypeScript shell.
- Added the required Chinese title, one-line description, application version, and disabled `新建内容` button.
- Kept the Tauri capability permission list empty.
- Exposed no filesystem, Shell, network, Git, or application command API.
- Removed draft/storage implementation modules and the desktop package's direct Stage-01 Schema dependency.
- Added the minimal Windows desktop development command to the repository README.

## Not Completed

- No navigation framework, content-type selection, forms, Schema consumption, drafts, persistence, preview, media handling, or Git workflow.
- No installer, updater, signing, release, remote write, pull request, merge, or deployment.

## Validation

- Desktop TypeScript check: PASS.
- `cargo check --locked` with the pinned Rust toolchain and Visual Studio MSVC linker: PASS.
- Minimal `tauri dev` launch: PASS; the native executable and uniquely titled window were observed.
- Local WebView render at 1280 x 720: PASS; required content visible, button disabled, no overflow, no console warning/error.
- Root `npm test` and `build:next`: NOT RUN, as required by the Stage-04A test boundary.

## Known Issues

- Native-window screenshot/accessibility capture was blocked by the host automation interface error `SetIsBorderRequired ... 0x80004002`. Process/window observation plus the same local WebView render verified the launch and UI; this does not block Stage-04A.

## Next Stage

- Exact starting point: the clean `BRANCH_TIP_AT_DELIVERY` of `local/stage-04a-minimal-shell`.
- Next instruction: `15_Stage4B_静态导航框架.md`.

## Do Not Repeat

- Do not continue in the old `Stage-04` worktree or modify its uncommitted Rust files.
- Do not restore the removed draft/storage implementation during Stage-04A.
- On this host, enter the Visual Studio developer shell with process-scoped execution-policy bypass and use absolute Cargo paths because the shell changes the current directory.
- Do not retry native-window capture until the `SetIsBorderRequired` compatibility issue changes.
