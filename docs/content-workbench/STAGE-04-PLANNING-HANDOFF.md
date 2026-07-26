# Stage-04 Planning Handoff

- Current branch: `local/stage-04-desktop-shell`
- Base commit: `050a87dbd6330270e6b47b6f74acd071a85c5fcd`
- Preserved design commit: `dc2ce30764f0cf53910a40a171f6f5d2a71d9ca9`
- Implementation reference plan: committed as `781f1f432d01225f5c3a100e91609e1e239d5160` (`docs/superpowers/plans/2026-07-23-stage-04-desktop-foundation.md`). The committed document is complete, documentation-only, and unchanged in the current worktree.
- Worktree state at handoff: not clean. The interrupted implementation left uncommitted changes in `tools/content-workbench/src-tauri/src/storage/atomic_replace.rs` and `tools/content-workbench/src-tauri/src/storage/path_safety.rs`; they were not committed as part of this planning handoff.

## Confirmed Environment

- Windows x64 host.
- Node.js `v22.23.1` and npm `10.9.8`.
- Rust and Cargo `1.97.1` are installed through the pinned toolchain.
- Visual Studio 2022 developer shell is available at `D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1`. The ordinary shell currently resolves the RTools linker first, so future native work must enter the Visual Studio developer shell before invoking Cargo.
- The repository has no configured Git remote.

## Confirmed Baseline Tests

The Stage-01 handoff records these completed baseline gates; they were not rerun during this planning closeout:

- `npm.cmd ci --offline --ignore-scripts`: PASS.
- `npm.cmd run check`: PASS without warnings.
- `npm.cmd test`: PASS, including 58 Stage-01 tests, 25 rendered-site tests, and 1 IndexNow test.
- `npm.cmd run build:next`: PASS with 97 static pages generated.

## Remaining Implementation

The complete Stage-04 product workflow is not approved as finished. Settings, session recovery, the final IPC/capability boundary, the five-section desktop workflow, diagnostics, full GUI verification, delivery documentation, and USB handoff remain unimplemented or incomplete.

The next implementation phase must begin from a minimal Tauri empty shell and proceed in small, independently verifiable increments. Do not continue expanding the Stage-04 design or implementation plan. Treat the preserved design and plan as reference documents only.
