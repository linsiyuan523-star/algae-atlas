# Stage-04 Task 2 Implementation Report

## Status

DONE

- Base commit: `db0b62c8f31195d23d8bc20ab3b4d49d718bae42`
- Head commit: `b3251400454dcc28782bcd7a5226788e2ea2840d`
- Commit: `feat: add versioned local draft storage`
- Tracked worktree status after commit: clean
- Scope: backend-only local draft storage; no Tauri commands, frontend behavior, settings/session behavior, dependency changes, capability changes, CSP changes, or package-lock changes

## Files Changed

- `tools/content-workbench/src-tauri/src/error.rs`
- `tools/content-workbench/src-tauri/src/paths.rs`
- `tools/content-workbench/src-tauri/src/clock.rs`
- `tools/content-workbench/src-tauri/src/storage/mod.rs`
- `tools/content-workbench/src-tauri/src/storage/atomic_replace.rs`
- `tools/content-workbench/src-tauri/src/drafts/mod.rs`
- `tools/content-workbench/src-tauri/src/drafts/model.rs`
- `tools/content-workbench/src-tauri/src/drafts/migration.rs`
- `tools/content-workbench/src-tauri/src/drafts/store.rs`
- `tools/content-workbench/src-tauri/tests/fixtures/draft-v1-golden.json`
- `tools/content-workbench/src-tauri/src/lib.rs`

The commit contains 11 files and 2,011 inserted lines. No compile-required files outside the brief were changed.

## RED Evidence

Every native Rust block initialized the Visual Studio developer environment, showed the Visual Studio linker first, and returned to the worktree before Cargo ran. The process-local execution-policy line was required by the host PowerShell policy.

### Stable errors, paths, and clock

Tests were added first to `error.rs`, `paths.rs`, and `clock.rs`, with no production symbols present.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml error::tests
```

Result: exit 1. `where.exe link` listed `D:\DevTools\VisualStudio2022\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\link.exe` first. Compilation failed because `AppError`, `DesktopIssue`, `AppPaths`, `Clock`, `FixedClock`, and `format_utc_rfc3339` did not exist. This was the expected foundational RED.

### Bounded JSON and atomic replacement

Storage tests were added before the reader, serializer, writer, or replacement trait existed.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml storage::
```

Result: exit 1. Compilation reported missing `deterministic_json`, `read_bounded`, `write_json_atomically`, `AtomicReplacer`, `PlatformAtomicReplacer`, and `ReplaceMode`. The compiler also found a duplicate `pub mod storage` line in the test scaffolding; that scaffolding typo was removed before implementation.

### V1 codec and migration dispatch

Codec tests and the immutable golden fixture were added before the envelope and dispatcher.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml drafts::
```

Result: exit 1. Compilation reported missing `decode_draft`, `encode_draft`, and `DraftEnvelopeV1`.

### Draft-store behavior

Store behavior tests were added before request types or `DraftStore` existed.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml drafts::store::tests
```

Result: exit 1. Compilation reported missing `DraftStore`, `CreateDraftRequest`, `LoadDraftRequest`, `SaveDraftRequest`, and `DeleteDraftRequest`.

### Harness note

The first non-escalated preflight did not count as behavioral RED: the sandbox denied Cargo's target lock, the host execution policy blocked `Launch-VsDevShell.ps1`, and one attempted Cargo invocation incorrectly supplied multiple filters. Subsequent evidence above used process-local policy bypass, one filter per Cargo invocation, and the approved native build-artifact path.

## GREEN Evidence

### Incremental GREEN

- Foundation: `cargo ... test ... error::tests` passed 2 tests; `paths::tests` passed 1; `clock::tests` passed 1. A later error hardening test brought the final error test count to 3.
- Atomic storage: `cargo ... test ... storage::` passed 5 tests.
- Codec before store implementation: `cargo ... test ... drafts::` passed 8 codec tests.
- Store: `cargo ... test ... drafts::store::tests` passed 8 tests.

### Required final native sequence

The first full sequence found rustfmt check-only differences. I ran `cargo +1.97.1 fmt --manifest-path tools/content-workbench/src-tauri/Cargo.toml --all`, then reran the entire required sequence. The final exact block was:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 fmt --manifest-path tools/content-workbench/src-tauri/Cargo.toml --all
npm.cmd run desktop:rust:fmt
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml storage::
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml drafts::
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:check
```

Result: exit 0.

- Visual Studio linker was first in `where.exe link`.
- `desktop:rust:fmt`: pass.
- `storage::`: 5 passed, 0 failed.
- `drafts::`: 16 passed, 0 failed.
- `desktop:rust:clippy`: pass under `cargo ... clippy --all-targets -- -D warnings`; no Clippy diagnostics.
- `desktop:rust:check`: pass.

The same complete sequence was rerun after the final temp-ownership cleanup fix and passed again with the same counts.

### Full Rust suite

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
Set-Location 'D:\algae-workbench\worktrees\Stage-04'
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml
```

Result: exit 0; 26 passed, 0 failed, including all error, path, clock, storage, migration, and store tests. Cargo printed Rust's `linker_messages` warning around MSVC's normal localized import-library status line; Clippy itself was clean and passed with `-D warnings`.

### Diff and repository checks

- `git diff --check`: pass before staging.
- `git diff --cached --check`: pass after staging.
- `git diff db0b62c8f31195d23d8bc20ab3b4d49d718bae42..HEAD --check`: pass after commit.
- Staged file list matched the 11 Task 2 files exactly.
- `Cargo.toml`, `Cargo.lock`, `package-lock.json`, Tauri capabilities, and `tauri.conf.json` had no diff.
- Tracked worktree was clean immediately after commit.

## Key Design Choices

- `DesktopIssue` has exactly `code`, `message`, and `remedy`. `AppError` retains private boxed sources and path context, and conversion consumes only the stable issue fields.
- All mandated limits and storage/API version constants live in `lib.rs` with their exact values.
- `AppPaths` contains only the three injected Tauri roots. Drafts, trash, session marker, and settings are fixed descendants; requests never accept paths.
- `Clock` is injectable. `SystemClock` uses UTC and `FixedClock` makes timestamps deterministic. Response/storage timestamps use RFC3339 UTC.
- JSON uses `serde_json::to_vec_pretty`, UTF-8 without BOM, two-space indentation, LF, and exactly one appended trailing LF. Reads use `limit + 1` and reject oversized bytes before decoding.
- Atomic writes create `.<target>.<uuid-v4>.tmp` beside the target with `create_new(true)`, write/sync/close, bounded-reread, validate again, and then install.
- Windows first creation and trash moves use `MoveFileExW` with flags 0, providing an OS-level no-overwrite move. Existing-target saves use `ReplaceFileW`. The replacement boundary is injectable for deterministic failure tests.
- Cleanup tracks whether the current operation actually created its temp file, so a pre-existing collision is never removed. No directory-wide temp cleanup exists.
- The V1 dispatcher probes only outer `storageVersion`, rejects every non-V1 dispatch value, then uses the strict `deny_unknown_fields` V1 envelope and identity migration.
- `recordDraft` is only `serde_json::Value`; Rust imports no content schema and performs no content-type traversal or validation.
- UUIDs must be canonical lowercase V4. Revisions are 1 through JavaScript's maximum safe integer. Save uses `checked_add` and validates the result before clock/write work.
- `DraftStore` holds `Mutex<()>` across read/check/replace or read/check/trash move, so same-store concurrent saves produce one winner and one revision conflict.
- Listing returns valid summaries sorted by parsed `updatedAt` descending and UUID ascending, while retaining redacted issues for invalid entries.
- Delete validates version, envelope, filename identity, and exact revision before creating trash or moving bytes. Trash stays under `app_data_dir`, is never purged, uses `<uuid>.<digits-only-unix-nanos>.json`, and preserves active bytes exactly.
- Direct reads reject symlink/non-regular-file entries before bounded open.

## Self-Review Findings and Fixes

- Replaced an initial `exists` plus `std::fs::rename` first-create approach with `MoveFileExW(..., 0)` so no-overwrite is enforced by Windows at the move itself, closing the race.
- Reused that same no-overwrite primitive for trash moves.
- Added explicit operation-owned temp tracking so cleanup cannot remove a file that this operation failed to create.
- Strengthened revision tests from zero/future coverage to cover revision 0 separately plus valid stale and future conflicts against revision 2.
- Added `APP_PATH_UNAVAILABLE` coverage after noticing all other required stable codes were exercised but that path code was not.
- Added `symlink_metadata` regular-file enforcement during the path-confinement audit.
- Applied rustfmt after the check-only script reported mechanical diffs, then reran the full required sequence.
- Confirmed path confinement, stable error redaction, bounded I/O, deterministic bytes, Windows atomic semantics, version dispatch, opaque `recordDraft`, revision overflow/races, trash preservation, fixture immutability, and absence of generated tracked artifacts.

## Remaining Concerns

None. The only diagnostic noise was Rust's `linker_messages` wrapper for MSVC's normal localized import-library status output during `cargo test`; required Clippy output was clean.

## Task 2 Review Fix

This section supersedes any earlier statement that the V1 fixture was captured from an older writer, and corrects the earlier trash-name punctuation description. The fixture is hand-authored and immutable; the persisted trash name is `<uuid>-<unix-nanoseconds>.json` with a dash.

### Review RED Evidence

- The exact-path test failed before the fix because `drafts`, `draft-trash`, and the session marker omitted their required `/v1` and `active-v1.json` components.
- The trash lifecycle test failed before the fix because the implementation used a dot between the UUID and timestamp instead of a dash.
- Four model-contract tests failed before the fix: stored drafts and inputs used `id` rather than `draftId`, list entries omitted `localNotes` and `recordDraft`, and deletion omitted the prior `revision`.
- The path-safety test target failed to compile before the fix because `SafeDirectory` and `PathSafetyHook` were not present.

### Review GREEN Evidence

After restoring directory guard sharing to `FILE_SHARE_READ | FILE_SHARE_WRITE` while continuing to omit `FILE_SHARE_DELETE`, the focused suites passed under the required MSVC environment:

- `storage::path_safety::tests`: 3 passed.
- `drafts::store::tests`: 9 passed.
- `storage::`: 8 passed, including the three path-safety tests.
- `drafts::`: 21 passed.
- Full Rust suite: 34 passed.
- `desktop:rust:fmt`, `desktop:rust:clippy`, and `desktop:rust:check`: passed; Clippy used `-D warnings`.

The security tests cover parent junction confinement, final-entry junction and directory masquerading rejection, deterministic precheck/open swaps, and deterministic pre-use save/delete failures that preserve active bytes, unrelated temp files, and outside targets. Production reads are bounded and consume the same validated handle used for path validation. Directory guard handles are held through the operation without delete sharing, so descendant directory rename/delete is blocked while normal child creation and replacement continue to work.

### Review-Fix Files

- `tools/content-workbench/src-tauri/src/drafts/migration.rs`
- `tools/content-workbench/src-tauri/src/drafts/model.rs`
- `tools/content-workbench/src-tauri/src/drafts/store.rs`
- `tools/content-workbench/src-tauri/src/paths.rs`
- `tools/content-workbench/src-tauri/src/storage/atomic_replace.rs`
- `tools/content-workbench/src-tauri/src/storage/mod.rs`
- `tools/content-workbench/src-tauri/src/storage/path_safety.rs` (new)
- `tools/content-workbench/src-tauri/tests/fixtures/draft-v1-golden.json`

No dependency, frontend, IPC/command, capability, CSP, settings/session behavior, or package-lock files changed.

### Security Limitation

Existing-target saves still require Windows `ReplaceFileW`. The validated final leaf is closed before that path-based replacement, so a same-directory same-user actor could theoretically swap only the final leaf identity in the remaining interval immediately before `ReplaceFileW`. The held, no-delete-sharing directory guards prevent parent-directory replacement and root escape; final reads and static final reparse/non-regular entries are validated by handle. The implementation and tests therefore claim directory confinement and fail-closed parent swaps, not elimination of every same-directory leaf-identity race.
