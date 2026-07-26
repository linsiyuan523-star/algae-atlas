# Stage-04 Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deliver the Windows-first Stage-04 Tauri desktop shell with five navigation destinations, versioned local drafts, safe autosave/reopen/delete/recovery, diagnostics, and tests, while consuming the exact Stage-01 schema package and never touching GitHub, production, or website behavior.

**Architecture:** Add `tools/content-workbench` as a root npm workspace. React owns the unprivileged shell and imports the Stage-01 registry/default helpers; a single typed bridge invokes exactly eleven named Tauri commands. Rust owns versioned JSON envelopes under Tauri-derived application directories, serializes mutations behind service locks, performs bounded/validated atomic replacement, and never accepts a filesystem path from the frontend.

**Tech Stack:** Tauri CLI 2.11.4, Tauri JS API 2.11.1, Tauri Rust 2.11.5, Tauri Single Instance 2.4.3, React 19.2.6, Lucide React 1.25.0, TypeScript 5.9.3, desktop Vite 8.0.16 (root website Vite remains 8.0.13), Vitest 4.1.10, Rust 1.97.1 (`x86_64-pc-windows-msvc`), serde/serde_json, uuid, time, thiserror, windows-sys, Testing Library, and the existing `@algae-atlas/content-schema@1.0.0` workspace package.

---

## Global constraints and starting state

- Work only in `D:\algae-workbench\worktrees\Stage-04` on `local/stage-04-desktop-shell`.
- The exact base is Stage-01 final commit `050a87dbd6330270e6b47b6f74acd071a85c5fcd`.
- The approved design is `docs/superpowers/specs/2026-07-23-stage-04-desktop-foundation-design.md`.
- Do not modify `main`, `integration/main`, another worktree, any website page/route/content/image/runtime behavior, or any production system.
- Do not run `git fetch`, `git pull`, `git push`, remote PR/release/tag/deploy commands, or add a Git remote.
- Do not add GitHub, Git, network, updater, shell, generic process control, URL opener, generic filesystem, dialog, remote database, or final-installer functionality. The only process-lifecycle dependency is the backend-only official single-instance guard; it exposes no frontend command or process API.
- Do not copy Stage-01 content types, schemas, workflow rules, publication eligibility, or validators. Import `CONTENT_TYPES`, `CONTENT_SCHEMA_VERSION`, `contentTypeRegistry`, `createRecordDraftDefaults`, and `stableIdSchema` from `@algae-atlas/content-schema`.
- `recordDraft` is opaque to Rust. Rust validates only the desktop storage envelope, UUIDs, revisions, sizes, timestamps, and service-owned paths.
- Use exact dependencies and commit both `package-lock.json` and `src-tauri/Cargo.lock`. Dependency acquisition is limited to the official npm registry and crates.io already approved by the operator.
- The ordinary host `PATH` resolves `link.exe` to RTools. Every native check/build must first enter `D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1`, then prove `where.exe link` resolves MSVC first.
- Use `npm.cmd`, not `npm`, in Windows instructions.
- Build only a debug executable with `tauri build --debug --no-bundle`; do not generate MSI, NSIS, installer, updater, release, or signing artifacts.
- Preserve unrelated/unknown files. No `git reset --hard`, `git clean`, broad deletion, or automatic trash purge.
- Follow RED -> GREEN -> REFACTOR for every behavior. Before each commit, run the focused tests listed for that task and `git diff --check`.

Before resuming after sleep, VPN/network change, or a new worker session, rerun:

```powershell
git status --short --branch
git branch --show-current
git log --oneline --decorate -10
git remote -v
```

Expected: branch `local/stage-04-desktop-shell`, clean except the current task's understood files, and no remote.

## Fixed interface contracts

Keep these names and payload keys consistent in Rust, TypeScript, permissions, tests, and documentation.

```ts
type RecordDraft = ReturnType<typeof createRecordDraftDefaults>;

type DesktopIssue = {
  code: string;
  message: string;
  remedy: string;
};

type StoredDraftV1 = {
  storageVersion: 1;
  draftId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  localLabel: string;
  localNotes: string;
  recordDraft: RecordDraft;
};

type ListDraftsResult = {
  drafts: StoredDraftV1[];
  issues: DesktopIssue[];
};

type CreateDraftInput = {
  localLabel: string;
  localNotes: string;
  recordDraft: RecordDraft;
};

type SaveDraftInput = CreateDraftInput & {
  draftId: string;
  expectedRevision: number;
};

type DeleteDraftInput = {
  draftId: string;
  expectedRevision: number;
};

type DeletedDraft = {
  draftId: string;
  revision: number;
  deletedAt: string;
  recoverable: true;
};

type SettingsV1 = {
  settingsVersion: 1;
  autosaveDelayMs: number;
  ui: { reducedMotion: boolean };
};

type AppInfo = {
  commandApiVersion: 1;
  draftStorageVersion: 1;
  settingsStorageVersion: 1;
  appVersion: string;
  appDataDir: string;
  appConfigDir: string;
  appLogDir: string;
  draftsDir: string;
  draftTrashDir: string;
};

type RecoveryState = {
  status: "none" | "abnormal-exit" | "marker-unreadable";
  recoverableDraftId: string | null;
  previousSessionId: string | null;
  previousSessionUpdatedAt: string | null;
  issue: DesktopIssue | null;
};

type MockWorkspaceInfo = {
  mode: "mock";
  configured: false;
  repositorySelected: false;
  canRead: false;
  canWrite: false;
  message: string;
};

interface DesktopBridge {
  getAppInfo(): Promise<AppInfo>;
  getSettings(): Promise<SettingsV1>;
  saveSettings(input: SettingsV1): Promise<SettingsV1>;
  createDraft(input: CreateDraftInput): Promise<StoredDraftV1>;
  listDrafts(): Promise<ListDraftsResult>;
  loadDraft(draftId: string): Promise<StoredDraftV1>;
  saveDraft(input: SaveDraftInput): Promise<StoredDraftV1>;
  deleteDraft(input: DeleteDraftInput): Promise<DeletedDraft>;
  getRecoveryState(): Promise<RecoveryState>;
  setActiveDraft(draftId: string | null): Promise<void>;
  inspectMockWorkspace(): Promise<MockWorkspaceInfo>;
}
```

The exact invoke allowlist is:

```text
get_app_info
get_settings
save_settings
create_draft
list_drafts
load_draft
save_draft
delete_draft
get_recovery_state
set_active_draft
inspect_mock_workspace
```

All mutating and identifier-bearing invokes use one `input` object, for example `invoke("save_draft", { input })`. No-argument commands receive no payload object.

The only persistence paths are:

```text
<app-local-data>/drafts/v1/<backend-uuid>.json
<app-local-data>/draft-trash/v1/<backend-uuid>-<deletion-stamp>.json
<app-local-data>/session/active-v1.json
<app-config>/settings-v1.json
```

No command accepts any of these paths from JavaScript.

The implementation plan places deterministic JSON and atomic replacement in a
shared `storage/` module rather than the design sketch's draft-only location,
because drafts, settings, and session markers all need the same bounded writer.
It also names the single capability `main-local.json` rather than `default.json`
so its window and trust boundary are explicit. The Rust toolchain file lives at
the desktop workspace root instead of under `src-tauri`, because rustup chooses
a toolchain from the invoking process's directory ancestors before Cargo reads
`--manifest-path`; npm/Tauri child Cargo processes therefore inherit the pin.

Two narrow lifecycle refinements close data-integrity gaps in the design
sketch: the official backend-only single-instance plugin prevents two process
stores from racing one session marker, and three exact Tauri core permissions
let the frontend delay a normal close until its existing save queue drains.
Neither refinement exposes a generic process/window API or expands draft
paths, commands, network access, Git access, or publication scope.

---

### Task 1: Scaffold the secure desktop workspace

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`
- Modify: `.gitattributes`
- Modify: `eslint.config.mjs`
- Create: `tests/content-workbench-scaffold.test.mjs`
- Create: `tools/content-workbench/package.json`
- Create: `tools/content-workbench/index.html`
- Create: `tools/content-workbench/tsconfig.json`
- Create: `tools/content-workbench/tsconfig.app.json`
- Create: `tools/content-workbench/tsconfig.node.json`
- Create: `tools/content-workbench/vite.config.ts`
- Create: `tools/content-workbench/src/vite-env.d.ts`
- Create: `tools/content-workbench/src/main.tsx`
- Create: `tools/content-workbench/src/App.tsx`
- Create: `tools/content-workbench/src/App.test.tsx`
- Create: `tools/content-workbench/src/styles/app.css`
- Create: `tools/content-workbench/src/test/setup.ts`
- Create: `tools/content-workbench/src-tauri/Cargo.toml`
- Create: `tools/content-workbench/src-tauri/Cargo.lock`
- Create: `tools/content-workbench/src-tauri/build.rs`
- Create: `tools/content-workbench/rust-toolchain.toml`
- Create: `tools/content-workbench/src-tauri/tauri.conf.json`
- Create: `tools/content-workbench/src-tauri/capabilities/main-local.json`
- Create: `tools/content-workbench/src-tauri/src/main.rs`
- Create: `tools/content-workbench/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the root scaffold contract test first**

In `tests/content-workbench-scaffold.test.mjs`, parse the JSON/TOML/text configuration and assert:

- root workspaces contain exactly the existing `packages/*` plus `tools/content-workbench`;
- all npm and direct Cargo dependency versions listed in this plan are exact, not ranges or Git sources;
- `bundle.active` is `false`, `frontendDist` is `../dist`, and the dev port is fixed to `1420`;
- production CSP has no remote HTTP/HTTPS/WS/WSS source, remote frame, or remote script;
- the capability is local, Windows-only, and bound to the `main` window;
- no fs, shell, HTTP, opener, dialog, store, updater, localhost, URL, Git, or generic process plugin/dependency is present; `tauri-plugin-single-instance` is the sole allowed lifecycle plugin and has no frontend permission;
- the Rust toolchain is exactly 1.97.1 with `rustfmt`, `clippy`, and `x86_64-pc-windows-msvc`;
- both `bundle.active: false` and the package script `tauri build --debug --no-bundle` are present.

- [ ] **Step 2: Prove the scaffold test is RED**

Run:

```powershell
node --test tests/content-workbench-scaffold.test.mjs
```

Expected: FAIL because `tools/content-workbench/package.json` and Tauri configuration do not exist yet. Record the meaningful failure, not a syntax error in the test.

- [ ] **Step 3: Create the npm/Vite/Vitest workspace configuration**

Use package name `@algae-atlas/content-workbench`, version `0.1.0`, `private: true`, and exact dependencies:

```json
{
  "dependencies": {
    "@algae-atlas/content-schema": "1.0.0",
    "@tauri-apps/api": "2.11.1",
    "lucide-react": "1.25.0",
    "react": "19.2.6",
    "react-dom": "19.2.6"
  },
  "devDependencies": {
    "@tauri-apps/cli": "2.11.4",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "22.19.19",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "jsdom": "29.1.1",
    "typescript": "5.9.3",
    "vite": "8.0.16",
    "vitest": "4.1.10"
  }
}
```

Operator-approved security override: the desktop workspace uses exact Vite
`8.0.16` instead of the original `8.0.13` because `8.0.16` is the first
registry-published version outside `GHSA-fx2h-pf6j-xcff`'s affected
`>=8.0.0 <=8.0.15` range. The root website retains its existing Vite pin.

Workspace scripts:

```json
{
  "dev": "vite",
  "typecheck": "tsc --noEmit --pretty false -p tsconfig.app.json && tsc --noEmit --pretty false -p tsconfig.node.json",
  "build": "npm run typecheck && vite build",
  "check": "npm run typecheck && eslint src vite.config.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build --debug --no-bundle",
  "rust:fmt": "cargo +1.97.1 fmt --manifest-path src-tauri/Cargo.toml --all -- --check",
  "rust:check": "cargo +1.97.1 check --locked --manifest-path src-tauri/Cargo.toml --all-targets",
  "rust:clippy": "cargo +1.97.1 clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings",
  "rust:test": "cargo +1.97.1 test --locked --manifest-path src-tauri/Cargo.toml --all-targets"
}
```

Root scripts:

```json
{
  "desktop:dev": "npm run tauri:dev --workspace @algae-atlas/content-workbench",
  "desktop:check": "npm run check --workspace @algae-atlas/content-workbench",
  "desktop:test:scaffold": "node --test tests/content-workbench-scaffold.test.mjs",
  "desktop:test": "npm run desktop:test:scaffold && npm run test --workspace @algae-atlas/content-workbench",
  "desktop:frontend:build": "npm run build --workspace @algae-atlas/content-workbench",
  "desktop:rust:fmt": "npm run rust:fmt --workspace @algae-atlas/content-workbench",
  "desktop:rust:check": "npm run rust:check --workspace @algae-atlas/content-workbench",
  "desktop:rust:clippy": "npm run rust:clippy --workspace @algae-atlas/content-workbench",
  "desktop:rust:test": "npm run rust:test --workspace @algae-atlas/content-workbench",
  "desktop:build": "npm run tauri:build --workspace @algae-atlas/content-workbench"
}
```

Insert `desktop:check` into the existing root `check` after `check:schema`. Insert `desktop:test` into the existing root `test` after `test:schema:browser`. Preserve every existing website command and its order otherwise.

Configure Vite with React, port 1420, strict port, Tauri HMR host support, and `watch.ignored: ["**/src-tauri/**"]`. Configure Vitest for jsdom, `src/**/*.test.{ts,tsx}`, `src/test/setup.ts`, CSS support, cleared/restored mocks, and explicit imports rather than globals.

When `command === "serve"`, set Vite `html.cspNonce` to the fixed,
development-only value `content-workbench-dev`. Do not set a production nonce.
This lets Vite/React Refresh apply the nonce to its injected module/style tags
without enabling `unsafe-inline` or `unsafe-eval`.

Keep `tsconfig.app.json` and `tsconfig.node.json` non-composite and
non-incremental; the explicit `typecheck` script checks both projects without
emitting `.tsbuildinfo`. `tsconfig.json` is an empty solution file for editor
discovery only. The scaffold test must fail if any tracked or unignored
`.tsbuildinfo` appears.

Ignore only generated desktop outputs:

```gitignore
/tools/content-workbench/dist/
/tools/content-workbench/coverage/
/tools/content-workbench/src-tauri/target/
/tools/content-workbench/src-tauri/gen/schemas/
```

Add matching ESLint global ignores and scoped LF attributes for the text files under `tools/content-workbench/`; explicitly keep future PNG/ICO files binary.

- [ ] **Step 4: Create the minimal no-IPC Tauri shell**

Use this Tauri identity/configuration:

```json
{
  "productName": "Algae Atlas Content Workbench",
  "version": "0.1.0",
  "identifier": "icu.sycszy.content-workbench",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  }
}
```

Create one `main` window at 1280x800 with 960x640 minimum. Set `bundle.active` to `false`. Keep the initial capability permissions empty because Task 1 exposes no commands. The production CSP must use only packaged resources and IPC:

```text
default-src 'self'; connect-src ipc: http://ipc.localhost; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

Use this separate development policy:

```text
default-src 'self'; connect-src ipc: http://ipc.localhost http://localhost:1420 ws://localhost:1420 ws://localhost:1421; font-src 'self'; img-src 'self' data:; script-src 'self' 'nonce-content-workbench-dev'; style-src 'self' 'nonce-content-workbench-dev'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
```

The scaffold test must match the nonce between Vite and `devCsp` and reject
`unsafe-inline`, `unsafe-eval`, wildcard/remote sources, and any production
nonce. During the dev smoke, inspect the WebView console and record failure for
any CSP or React Refresh preamble violation. Do not add a localhost plugin or
remote capability.

Pin Cargo direct dependencies:

```toml
[package]
name = "content-workbench"
version = "0.1.0"
description = "Local content workbench for Algae Atlas"
edition = "2021"
rust-version = "1.97.1"

[lib]
name = "content_workbench_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "=2.6.3", features = [] }

[dependencies]
tauri = { version = "=2.11.5", features = [] }
tauri-plugin-single-instance = "=2.4.3"
serde = { version = "=1.0.229", features = ["derive"] }
serde_json = "=1.0.151"
uuid = { version = "=1.24.0", features = ["v4"] }
time = { version = "=0.3.54", features = ["formatting", "parsing"] }
thiserror = "=2.0.19"

[target.'cfg(windows)'.dependencies]
windows-sys = { version = "=0.61.2", features = ["Win32_Foundation", "Win32_Storage_FileSystem"] }

[dev-dependencies]
tempfile = "=3.27.0"
```

Do not add a package-level `custom-protocol` feature. Tauri CLI 2.11.4's
production `build_options` passes the dependency-qualified
`tauri/custom-protocol` feature itself; direct Cargo checks/tests intentionally
remain on the development configuration while `tauri build` supplies the
packaged-resource protocol.

For now, `build.rs` calls `tauri_build::build()`, `lib.rs` builds/runs Tauri without a command handler, and `main.rs` calls `content_workbench_lib::run()`. Task 3 replaces the empty command policy atomically with the exact command allowlist.

- [ ] **Step 5: Install only from the approved registries and lock dependencies**

Run from the worktree root:

```powershell
npm.cmd install --ignore-scripts --registry=https://registry.npmjs.org/
cargo +1.97.1 generate-lockfile --manifest-path tools/content-workbench/src-tauri/Cargo.toml
cargo +1.97.1 fetch --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml
```

Expected: one updated root `package-lock.json`, one new `src-tauri/Cargo.lock`, no Git dependency, no remote added, and no package version range introduced by the desktop package.

- [ ] **Step 6: Write the first React component test and prove RED**

Test that `App` renders the application heading and an always-visible `Local / Offline-ready` status. Run:

```powershell
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/App.test.tsx
```

Expected: FAIL until `App.tsx` contains the tested accessible heading/status.

- [ ] **Step 7: Implement the minimal static shell and prove GREEN**

Implement `main.tsx`, `App.tsx`, semantic `<header>`, `<nav>`, `<main>`, local-status text, and base CSS without remote fonts/assets or inline styles.

Run:

```powershell
npm.cmd run desktop:test
npm.cmd run desktop:check
npm.cmd run desktop:frontend:build
```

Expected: all pass and `tools/content-workbench/dist/` is ignored.

- [ ] **Step 8: Run the first native compile in the Visual Studio environment**

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
npm.cmd run desktop:rust:fmt
npm.cmd run desktop:rust:check
```

Expected: the first `link.exe` belongs to Visual Studio/MSVC; formatting and Cargo check pass.

- [ ] **Step 9: Commit the scaffold**

```powershell
git diff --check
git status --short
git add package.json package-lock.json .gitignore .gitattributes eslint.config.mjs tests/content-workbench-scaffold.test.mjs tools/content-workbench
git commit -m "feat: scaffold Tauri content workbench"
```

---

### Task 2: Implement versioned local draft storage with atomic replacement

**Files:**

- Create: `tools/content-workbench/src-tauri/src/error.rs`
- Create: `tools/content-workbench/src-tauri/src/paths.rs`
- Create: `tools/content-workbench/src-tauri/src/clock.rs`
- Create: `tools/content-workbench/src-tauri/src/storage/mod.rs`
- Create: `tools/content-workbench/src-tauri/src/storage/atomic_replace.rs`
- Create: `tools/content-workbench/src-tauri/src/drafts/mod.rs`
- Create: `tools/content-workbench/src-tauri/src/drafts/model.rs`
- Create: `tools/content-workbench/src-tauri/src/drafts/migration.rs`
- Create: `tools/content-workbench/src-tauri/src/drafts/store.rs`
- Create: `tools/content-workbench/src-tauri/tests/fixtures/draft-v1-golden.json`
- Modify: `tools/content-workbench/src-tauri/src/lib.rs`

- [ ] **Step 1: Define stable errors, constants, paths, and injectable time through tests**

Write unit tests before implementations for:

- `DesktopIssue` serializes only `code`, `message`, and `remedy`;
- internal I/O sources, absolute paths, temporary filenames, environment values, and draft bodies never appear in serialized issues;
- every derived path stays below one of the three injected Tauri roots;
- timestamp output is UTC RFC3339 and deterministic under a fixed test clock.

Use these limits:

```rust
pub const DESKTOP_COMMAND_API_VERSION: u32 = 1;
pub const DRAFT_STORAGE_VERSION: u32 = 1;
pub const SETTINGS_STORAGE_VERSION: u32 = 1;
pub const MAX_DRAFT_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_LOCAL_LABEL_CHARS: usize = 200;
pub const MAX_LOCAL_NOTES_BYTES: usize = 64 * 1024;
pub const MAX_SAFE_REVISION: u64 = 9_007_199_254_740_991;
pub const MAX_SETTINGS_BYTES: usize = 16 * 1024;
pub const MAX_SESSION_BYTES: usize = 16 * 1024;
pub const MIN_AUTOSAVE_DELAY_MS: u32 = 250;
pub const MAX_AUTOSAVE_DELAY_MS: u32 = 5_000;
```

Keep an internal `AppError` with private sources. Convert it to a public `DesktopIssue` before the IPC boundary:

```rust
pub type AppResult<T> = Result<T, AppError>;
pub type CommandResult<T> = Result<T, DesktopIssue>;
```

Required stable codes include `APP_PATH_UNAVAILABLE`, `STORAGE_READ_FAILED`, `STORAGE_WRITE_FAILED`, `ATOMIC_REPLACE_FAILED`, `DRAFT_ID_INVALID`, `DRAFT_NOT_FOUND`, `DRAFT_PAYLOAD_TOO_LARGE`, `DRAFT_STORAGE_VERSION_UNSUPPORTED`, `DRAFT_ENVELOPE_UNKNOWN_KEY`, `DRAFT_ENVELOPE_INVALID`, `DRAFT_REVISION_INVALID`, and `DRAFT_REVISION_CONFLICT`.

Count local-label limits as Unicode scalar values and note limits as UTF-8
bytes. Revisions must remain between 1 and JavaScript's maximum safe integer;
an increment at the maximum fails closed without replacing the old draft.

Run the focused tests and confirm RED because the modules are not implemented.

- [ ] **Step 2: Implement bounded deterministic JSON and the atomic writer**

The writer must:

1. serialize UTF-8 without BOM, two-space indentation, LF only, and exactly one trailing LF;
2. reject bytes over the relevant limit both before write and during bounded read (`limit + 1`);
3. create `.<target-name>.<operation-uuid>.tmp` beside the target using `create_new(true)`;
4. write all bytes, `sync_all`, close, reread through the bounded decoder, and validate again;
5. use same-directory no-overwrite rename for first creation;
6. use `ReplaceFileW` for an existing Windows target;
7. remove only the current operation's temporary file on failure;
8. never scan/delete unrelated `.tmp`, corrupt, unknown-version, or user files.

Wrap replacement behind a trait so tests can inject a failure immediately before replacement. Tests must prove the prior target is byte-for-byte unchanged after an injected failure and that a pre-existing unrelated temp file survives.

- [ ] **Step 3: Write the draft codec tests before its implementation**

Define the strict version-1 envelope with `#[serde(rename_all = "camelCase", deny_unknown_fields)]`. `record_draft` remains `serde_json::Value` and must not be inspected recursively.

Test:

- valid round-trip and deterministic bytes;
- unknown outer key rejection while arbitrary nested `recordDraft` keys survive exactly;
- storage versions 0 and 2 reject without rewrite;
- the checked-in `draft-v1-golden.json` from an older-writer boundary decodes under the current version dispatcher and canonical re-encoding remains byte-for-byte equal;
- malformed/noncanonical UUID, revision 0, invalid/out-of-order timestamps, mismatched filename UUID, BOM, invalid UTF-8, corrupt JSON, and size boundary;
- one byte below/at the allowed boundary behaves as defined and one byte above rejects;
- decoding never invokes a content-type validator in Rust.

Implement an explicit version-dispatch function that reads only the outer
`storageVersion`, routes version 1 through the V1 decoder/migration identity,
and returns `DRAFT_STORAGE_VERSION_UNSUPPORTED` for every other version. Each
future storage version must add a new immutable golden fixture and a tested
migration step; encoder/decoder round trips created by the same code are not
sufficient upgrade evidence. Tests that alter the golden file to an
unsupported version must prove the original bytes remain byte-for-byte
unchanged on load/list/save/delete attempts.

- [ ] **Step 4: Write draft-store behavior tests before implementation**

Test create/list/load/save/delete using `tempfile` roots and a fixed clock:

- create generates a canonical lowercase UUID v4, revision 1, and backend timestamps;
- list sorts by `updatedAt` descending, then UUID ascending, and collects redacted issues for corrupt/unsupported entries instead of hiding valid drafts;
- load validates filename/envelope identity;
- save requires `expectedRevision == currentRevision`, uses `checked_add(1)`, preserves backend ID/created time, and updates only on success;
- stale and future revisions both return `DRAFT_REVISION_CONFLICT` and preserve old bytes;
- concurrent store calls are serialized around read/check/replace with `Mutex<()>`;
- delete requires exact revision and same-volume renames exact bytes into trash;
- deletion removes the active entry, returns `recoverable: true`, and never purges trash;
- the trash filename uses a digits-only UTC Unix-nanosecond stamp (Windows-safe), while the response's `deletedAt` remains RFC3339;
- unknown versions/corrupt entries are never rewritten, moved, or deleted.

Use request/response structs with strict camelCase decoding. No request contains a path.

- [ ] **Step 5: Implement the store minimally and prove all Rust storage tests GREEN**

Use `AppPaths` with only:

```rust
pub struct AppPaths {
    pub app_data_dir: PathBuf,
    pub app_config_dir: PathBuf,
    pub app_log_dir: PathBuf,
}
```

Provide derived getters for drafts, trash, session marker, and settings. `DraftStore` receives these roots and a clock. Do not add Tauri commands yet.

Run in the Visual Studio developer environment:

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
npm.cmd run desktop:rust:fmt
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml storage::
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml drafts::
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:check
```

Expected: all pass with zero Clippy warnings.

- [ ] **Step 6: Commit the storage service**

```powershell
git diff --check
git status --short
git add tools/content-workbench/src-tauri/src tools/content-workbench/src-tauri/tests/fixtures/draft-v1-golden.json
git commit -m "feat: add versioned local draft storage"
```

---

### Task 3: Add settings, session recovery, app info, and the exact Tauri command boundary

**Files:**

- Create: `tools/content-workbench/src-tauri/src/settings.rs`
- Create: `tools/content-workbench/src-tauri/src/session.rs`
- Create: `tools/content-workbench/src-tauri/src/app_info.rs`
- Create: `tools/content-workbench/src-tauri/src/workspace.rs`
- Create: `tools/content-workbench/src-tauri/src/commands.rs`
- Create: `tools/content-workbench/src-tauri/permissions/workbench.toml`
- Modify: `tools/content-workbench/src-tauri/build.rs`
- Modify: `tools/content-workbench/src-tauri/capabilities/main-local.json`
- Modify: `tools/content-workbench/src-tauri/src/lib.rs`
- Modify: `tests/content-workbench-scaffold.test.mjs`

- [ ] **Step 1: Write settings tests first**

Settings version 1 is exactly `{ settingsVersion: 1, autosaveDelayMs: 800, ui: { reducedMotion: false } }` by default. Test:

- missing file returns defaults without creating a file;
- save is atomic and separate from drafts/session;
- 250 and 5000 ms pass; 249 and 5001 fail;
- unknown keys, unsupported versions, malformed UI values, and oversize reject without replacing existing bytes;
- no credential, environment, executable, repository path, or arbitrary object field can be persisted.

Prove RED, implement with the shared atomic storage helper, then prove GREEN.

Use stable settings codes `SETTINGS_PAYLOAD_TOO_LARGE`,
`SETTINGS_STORAGE_VERSION_UNSUPPORTED`, `SETTINGS_UNKNOWN_KEY`, and
`SETTINGS_INVALID`.

- [ ] **Step 2: Write abnormal-session recovery tests first**

The strict session marker stores only version, backend UUID session ID, started/updated timestamps, and nullable last active draft ID. Test:

- no previous marker -> `status: "none"`, then a current marker is created atomically;
- a valid leftover marker -> `status: "abnormal-exit"` and offers the referenced draft only if it is still a valid active draft;
- unreadable/unknown marker -> `status: "marker-unreadable"`, redacted issue, no automatic draft;
- `set_active_draft(Some(id))` first verifies that draft exists; `None` clears it;
- clean finish rereads and removes only a marker whose session ID matches this process;
- a foreign/replaced marker is never deleted;
- dropping without clean finish simulates a crash and the next store detects recovery;
- clean exit failure leaves a safe false-positive marker rather than deleting uncertain state.

Only actual `RunEvent::Exit` may call clean finish. Do not remove the marker on `ExitRequested`.

Use stable session codes `SESSION_MARKER_INVALID` and
`SESSION_STORAGE_VERSION_UNSUPPORTED`; keep raw marker bytes and paths out of
the public issue.

- [ ] **Step 3: Write app-info and mock-workspace tests first**

Resolve `app_local_data_dir`, `app_config_dir`, and `app_log_dir` once from `AppHandle`. Create only the app-owned roots. Expose app/config/log/drafts/trash paths and interface versions through `AppInfo`.

`inspect_mock_workspace` must return a constant `MockWorkspaceInfo` with all access flags false. Test that it performs no filesystem, Git, network, shell, process, or repository call.

- [ ] **Step 4: Write command-boundary contract tests first**

Extend the root scaffold test to assert exact equality among:

- `AppManifest::commands` in `build.rs`;
- the generated permission set in `permissions/workbench.toml`;
- the capability's `workbench-commands` set plus exactly three close-lifecycle core permissions;
- `tauri::generate_handler![...]` in `lib.rs`;
- the eleven command wrappers in `commands.rs`.

Also assert the single-instance plugin is registered first, has no frontend permission, and is the only lifecycle plugin. Assert no generic read/write/delete/list/path/shell/process/http/network/git/url/open command or plugin exists. Prove RED before changing the policy.

- [ ] **Step 5: Implement fine-grained application-command permissions**

Replace the initial `tauri_build::build()` with:

```rust
fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_app_info",
                "get_settings",
                "save_settings",
                "create_draft",
                "list_drafts",
                "load_draft",
                "save_draft",
                "delete_draft",
                "get_recovery_state",
                "set_active_draft",
                "inspect_mock_workspace",
            ]),
        ),
    )
    .expect("failed to build content workbench command manifest");
}
```

Define the application permission set exactly as:

```toml
[[set]]
identifier = "workbench-commands"
description = "Allows the local main window to call the eleven Stage-04 commands."
permissions = [
  "allow-get-app-info",
  "allow-get-settings",
  "allow-save-settings",
  "allow-create-draft",
  "allow-list-drafts",
  "allow-load-draft",
  "allow-save-draft",
  "allow-delete-draft",
  "allow-get-recovery-state",
  "allow-set-active-draft",
  "allow-inspect-mock-workspace",
]
```

Grant the local bundled `main` window on `windows` exactly:

```json
[
  "workbench-commands",
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "core:window:allow-destroy"
]
```

The three core permissions support only the tested close-request listener and
post-save window destruction in Task 4. Do not grant
`core:window:allow-close`, `core:default`, any plugin permission, or any other
core permission. Explicitly list `main-local` in `tauri.conf.json` so no
unlisted capability is activated.

- [ ] **Step 6: Implement the eleven thin command wrappers and AppState wiring**

Each command validates/deserializes one strict input type, calls one service method, and maps private `AppError` to `DesktopIssue`. The mock command takes no state and no input. Register exactly the allowlist in `generate_handler!`.

Register `tauri_plugin_single_instance::init` as the first plugin, before
`setup`. On a second launch, ignore (and never log/expose) its argv and current
directory, focus the existing `main` window if present, and let the second
process exit. This backend-only guard must be active before session-marker or
draft initialization so two processes cannot race the in-process locks.

Initialize `AppState` during `setup`, call `SessionStore::begin` after draft directories are ready, and cache the resulting recovery state. Use `Builder::build(...).run(...)` so `RunEvent::Exit` synchronously calls `finish_clean_session`.

Command signatures must use `input`, never `request`, `path`, or variadic data. `list_drafts` returns `{ drafts, issues }` so one bad file cannot hide valid drafts.

- [ ] **Step 7: Run the focused and boundary tests**

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
node --test tests/content-workbench-scaffold.test.mjs
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml settings::
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml session::
cargo +1.97.1 test --locked --manifest-path tools/content-workbench/src-tauri/Cargo.toml commands::
npm.cmd run desktop:rust:fmt
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:test
npm.cmd run desktop:rust:check
```

Expected: all pass; no generic privileged command and no broader capability is present.

- [ ] **Step 8: Commit persistence recovery and the command boundary**

```powershell
git diff --check
git add tests/content-workbench-scaffold.test.mjs tools/content-workbench/src-tauri
git commit -m "feat: add local draft persistence and recovery"
```

---

### Task 4: Build the typed bridge, five-section shell, and local draft workflows

**Files:**

- Create: `tools/content-workbench/src/lib/issues.ts`
- Create: `tools/content-workbench/src/lib/bridge.ts`
- Create: `tools/content-workbench/src/lib/bridge.test.ts`
- Create: `tools/content-workbench/src/lib/windowLifecycle.ts`
- Create: `tools/content-workbench/src/lib/windowLifecycle.test.ts`
- Create: `tools/content-workbench/src/domain/drafts.ts`
- Create: `tools/content-workbench/src/domain/settings.ts`
- Create: `tools/content-workbench/src/app/BridgeContext.tsx`
- Create: `tools/content-workbench/src/app/navigation.ts`
- Create: `tools/content-workbench/src/app/useSafeWindowClose.ts`
- Create: `tools/content-workbench/src/app/useSafeWindowClose.test.tsx`
- Create: `tools/content-workbench/src/components/AppShell.tsx`
- Create: `tools/content-workbench/src/components/AppShell.test.tsx`
- Create: `tools/content-workbench/src/features/new-content/NewContentPage.tsx`
- Create: `tools/content-workbench/src/features/new-content/NewContentPage.test.tsx`
- Create: `tools/content-workbench/src/features/drafts/DraftsPage.tsx`
- Create: `tools/content-workbench/src/features/drafts/DraftsPage.test.tsx`
- Create: `tools/content-workbench/src/features/drafts/DraftWorkspace.tsx`
- Create: `tools/content-workbench/src/features/drafts/DraftWorkspace.test.tsx`
- Create: `tools/content-workbench/src/features/drafts/ConfirmDeleteDialog.tsx`
- Create: `tools/content-workbench/src/features/drafts/RecoveryPrompt.tsx`
- Create: `tools/content-workbench/src/features/drafts/RecoveryPrompt.test.tsx`
- Create: `tools/content-workbench/src/features/drafts/useDraftAutosave.ts`
- Create: `tools/content-workbench/src/features/submitted/SubmittedPage.tsx`
- Create: `tools/content-workbench/src/features/settings/SettingsPage.tsx`
- Create: `tools/content-workbench/src/features/diagnostics/DiagnosticsPage.tsx`
- Modify: `tools/content-workbench/src/App.tsx`
- Modify: `tools/content-workbench/src/App.test.tsx`
- Modify: `tools/content-workbench/src/styles/app.css`

- [ ] **Step 1: Write bridge tests before the bridge**

Make `bridge.ts` the only frontend file importing `@tauri-apps/api/core`. Inject/mock `invoke` in tests and assert every method uses the exact command and payload shape:

```ts
invoke("create_draft", { input });
invoke("load_draft", { input: { draftId } });
invoke("save_draft", { input });
invoke("delete_draft", { input });
invoke("save_settings", { input: settings });
invoke("set_active_draft", { input: { draftId } });
```

No-argument calls omit a payload. Structured backend issues pass through unchanged. Unknown/raw errors map to a generic `DESKTOP_COMMAND_FAILED` issue without including raw exception text, absolute paths, environment data, or draft content.

Define an injectable `DesktopBridge` interface for component tests. Test all eleven methods and prove RED before implementation.

- [ ] **Step 2: Implement and test five-destination navigation**

Navigation IDs are exactly `new-content`, `drafts`, `submitted`, `settings`, and `diagnostics`. Render a skip link, persistent semantic navigation, and one main region; mark the active destination with `aria-current="page"` and focus the destination heading after a user-initiated section change. Do not add React Router or a URL/history dependency for this local shell.

Test all five labels, keyboard activation, skip-link target, heading focus, main-region change, active state, and the Submitted empty state explaining that real local Git submission belongs to a later stage. Use Lucide icons inside save, delete, reload, retry, diagnostics, and settings command buttons where a matching icon exists; keep an accessible name, add tooltips for unfamiliar icon-only controls, and do not draw replacement SVGs by hand.

Keep the visual system quiet and operational: stable sidebar/main tracks, compact
headings, system fonts, neutral surfaces, green local status, amber recovery or
offline warnings, and red destructive/error states. Use cards only for repeated
draft rows or a genuinely framed tool; do not nest cards, add gradients/orbs,
use oversized hero typography, or scale font size with viewport width. Verify
long IDs, paths, labels, and issue remedies wrap without overlap at both the
1280x800 default and 960x640 minimum window sizes.

- [ ] **Step 3: Implement New Content from the shared registry under TDD**

Tests must assert:

- the 11 choices and bilingual labels come from `CONTENT_TYPES` and `contentTypeRegistry`, not a copied array;
- stable ID validation calls the exported `stableIdSchema`;
- invalid ID never invokes `create_draft`;
- successful creation passes a `recordDraft` deeply equal to `createRecordDraftDefaults(type, id, now)`;
- only type, stable ID, optional local label, and optional local notes are present;
- no type-specific editor field, publication control, Git action, credential, repository path, or network control appears;
- success opens the new draft and calls `set_active_draft` with its backend UUID.

The Stage-01 draft defaults are intentionally incomplete publication records; do not call `parseRecord` merely to reject their blank draft fields.

- [ ] **Step 4: Implement list, reopen, manual save, and recoverable delete under TDD**

The frontend may derive display type/ID only after a safe shallow identity read that uses `CONTENT_SCHEMA_VERSION`, `CONTENT_TYPES`, and `stableIdSchema`; it must not duplicate full content validation. Invalid identity becomes a redacted desktop UI issue, not a crash.

Test:

- valid drafts remain visible even when `ListDraftsResult.issues` contains a bad-file issue;
- sort order from the backend is preserved;
- reopen calls `load_draft` then `set_active_draft`;
- the workspace shows fixed registered type/stable ID and editable local label/notes only;
- Save now uses the last loaded revision and updates to the returned revision;
- delete opens an accessible `role="alertdialog"`, initially focuses Cancel, supports Escape, restores trigger focus, and invokes delete only after confirmation;
- delete conflict preserves the draft in memory/list and offers reload;
- successful delete removes only the active list entry and reports that the backend copy is recoverable.
- successful deletion of the open draft then calls `set_active_draft` with `null` so the session marker cannot continue naming a deleted active draft.

- [ ] **Step 5: Implement the 800 ms autosave state machine under fake-timer tests**

Use states `idle | dirty | saving | saved | error | conflict`. Tests must prove:

- no save at 799 ms; one save at 800 ms;
- at most one save is in flight;
- a save captures one immutable snapshot and expected revision;
- returned revision is accepted even if the user typed while it was in flight;
- if current text differs from the saved snapshot, the hook stays dirty and schedules the next save with the new revision;
- a revision conflict preserves current input, stops automatic retries, and offers explicit Reload newer copy or Keep my text choices;
- Keep my text never overwrites the newer disk revision; it only leaves editable in-memory text and requires a later explicit reload/reconciliation;
- a non-conflict error preserves input and supports explicit retry;
- manual Save now uses the same single-flight queue;
- navigation away from a dirty workspace first uses that same save queue and proceeds only after success; on conflict/error it stays in the workspace and preserves the text rather than silently unmounting the pending timer;
- saved/dirty/error state is announced through an `aria-live` region and never color alone.

Read the delay from settings, with 800 ms as the version-1 default.

Keep that default in a shared `DEFAULT_SETTINGS_V1` frontend constant. If the
startup `getSettings` call rejects (including corrupt or future-version
settings), continue with this default only in memory, retain the redacted issue
for Settings and Diagnostics, and do not call `saveSettings` automatically.
Tests must prove autosave still fires at 800 ms and that no write invoke occurs;
only a later explicit user save may replace the backend settings file.

- [ ] **Step 6: Prevent normal close from dropping a pending autosave**

`windowLifecycle.ts` is the only frontend file importing
`@tauri-apps/api/window`. It exposes a narrow injectable adapter for
`getCurrentWindow().onCloseRequested` and `destroy`; it exposes no sizing,
navigation, shell, path, or arbitrary window command.

Register the close listener through `useSafeWindowClose`. The listener must
call `event.preventDefault()` synchronously, then drain the same single-flight
save queue used by autosave/manual save/navigation. Destroy the window only
when the workspace is already clean or every pending snapshot has persisted.
If a revision conflict or other save error occurs, keep the window open,
preserve all text, announce the issue, and allow retry/reload; do not remove the
backend session marker. Ignore duplicate close requests while one drain is in
progress, and call the returned unlisten function on React cleanup.

Under an injected fake lifecycle, test clean close, dirty-debounce close,
in-flight-save close followed by newer queued text, conflict, generic error,
duplicate close, successful destroy exactly once, no destroy on failure, and
listener cleanup. A forced process kill/power loss cannot run this path and
must continue to leave the recovery marker by design.

- [ ] **Step 7: Implement recovery prompting without automatic mutation**

On application startup, get recovery state once. For `abnormal-exit` with a valid draft ID, show an explicit Reopen draft / Dismiss prompt. Reopen loads then calls `bridge.setActiveDraft(draftId)`. Dismiss calls `bridge.setActiveDraft(null)`; the bridge wraps this as `{ input: { draftId: null } }`. Never auto-open, auto-save, auto-delete, commit, or publish. Test this in `RecoveryPrompt.test.tsx`, including load failure preserving the prompt and focus.

For `marker-unreadable`, show the stable issue/remedy and continue to the draft list. Test all three statuses.

- [ ] **Step 8: Run focused UI tests and commit**

```powershell
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/lib/bridge.test.ts
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/lib/windowLifecycle.test.ts
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/app/useSafeWindowClose.test.tsx
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/components/AppShell.test.tsx
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/features/new-content/NewContentPage.test.tsx
npm.cmd run test --workspace @algae-atlas/content-workbench -- src/features/drafts
npm.cmd run desktop:test
npm.cmd run desktop:check
npm.cmd run desktop:frontend:build
```

Expected: all pass with no unhandled React act/timer warnings.

```powershell
git diff --check
git add tools/content-workbench/src
git commit -m "feat: add desktop draft workflows"
```

---

### Task 5: Add offline/error/settings/diagnostics behavior and contract coverage

**Files:**

- Create: `tools/content-workbench/src/components/ErrorBoundary.tsx`
- Create: `tools/content-workbench/src/components/ErrorBoundary.test.tsx`
- Create: `tools/content-workbench/src/components/OfflineBanner.tsx`
- Create: `tools/content-workbench/src/components/OfflineBanner.test.tsx`
- Create: `tools/content-workbench/src/features/settings/SettingsPage.test.tsx`
- Create: `tools/content-workbench/src/features/diagnostics/DiagnosticsPage.test.tsx`
- Create: `tools/content-workbench/src/schema-contract.test.ts`
- Modify: `tools/content-workbench/src/App.tsx`
- Modify: `tools/content-workbench/src/App.test.tsx`
- Modify: `tools/content-workbench/src/features/settings/SettingsPage.tsx`
- Modify: `tools/content-workbench/src/features/diagnostics/DiagnosticsPage.tsx`
- Modify: `tools/content-workbench/src/styles/app.css`

- [ ] **Step 1: Test and implement offline/local status**

The local/offline-ready badge is always visible. Listen to browser `online`/`offline` events only to show/hide an additional non-blocking notice. Offline state must not disable create, edit, save, reopen, settings, or diagnostics because those operations are local IPC.

Tests cover initial online/offline state, both events, cleanup, and continued enabled local controls. Do not probe a network endpoint.

- [ ] **Step 2: Test and implement the top-level error boundary**

Wrap the main content region, not the persistent whole window chrome. A render failure shows a stable local UI error code, plain-language recovery guidance, and a safe reload action injected for tests. It must not print stack traces, draft bodies, paths, or environment data. Change the boundary `resetKey` when the destination changes.

Test thrown render, reset, reload action, and unaffected persistent navigation/status.

- [ ] **Step 3: Test and implement Settings**

Load the strict settings object, allow only bounded autosave delay and reduced-motion preference, and save through the bridge. Show the mocked workspace boundary and all false access flags. Do not expose repository selection, arbitrary path input, GitHub token, SSH, production, or executable configuration.

Test 249/5001 client rejection, 250/5000 acceptance, backend issue preservation,
and focus/error association. Also test startup `getSettings` failure: the UI
continues with the in-memory 800 ms/default-motion values, displays the issue,
and never invokes `saveSettings` until the user explicitly submits the form.

- [ ] **Step 4: Test and implement Diagnostics**

Show backend app/interface versions; the shared package's directly imported `CONTENT_SCHEMA_VERSION`; app-data, app-config, app-log, drafts, and recoverable-trash directories; recovery status; local/offline state; and read-only health for the already-loaded info/settings/recovery/mock commands. Do not invoke mutating commands as a health check, duplicate the schema version in Rust, or list directory contents.

Use `<dl>`/table semantics, selectable path text, and copy-neutral display (no clipboard plugin). Test exact field labels and that no credential/environment dump or full draft appears.

- [ ] **Step 5: Prove Stage-01 schema reuse and browser/desktop parity**

In `schema-contract.test.ts`, import the exact Stage-01 package and fixture subpath. Assert:

- all 11 `CONTENT_TYPES` map to registry definitions;
- all valid fictional fixtures pass the shared `parseRecord` contract;
- all invalid fictional fixtures fail with the shared issue contract;
- each New Content default is produced by the shared helper and retains schema version/type/ID;
- no desktop source declares another `CONTENT_TYPES`, stable-ID regular expression, content-record schema, workflow list, or publication eligibility function.

The last condition should also be enforced by the root scaffold/architecture test using a narrowly scoped source scan that excludes test assertion text.

- [ ] **Step 6: Run the complete desktop test matrix**

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
npm.cmd run desktop:test
npm.cmd run desktop:check
npm.cmd run desktop:frontend:build
npm.cmd run desktop:rust:fmt
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:test
npm.cmd run desktop:rust:check
```

Expected: all pass; no accessibility/timer warning; no Clippy warning.

- [ ] **Step 7: Commit robustness and contract tests**

```powershell
git diff --check
git add tests/content-workbench-scaffold.test.mjs tools/content-workbench/src
git commit -m "test: cover desktop shell and draft storage"
```

---

### Task 6: Document Windows development and verify the real debug application

**Files:**

- Create: `tools/content-workbench/README.md`
- Create: `docs/content-workbench/WINDOWS-DEVELOPMENT.md`
- Modify: `docs/content-workbench/ARCHITECTURE.md`
- Modify: `docs/content-workbench/SECURITY-MODEL.md`
- Modify: `docs/content-workbench/TEST-STRATEGY.md`

- [ ] **Step 1: Write Windows-first development instructions**

Document:

- audited prerequisites and how to verify Node/npm/Rust/MSVC/SDK/WebView2;
- the exact VS developer-shell command and why ordinary RTools `link.exe` is wrong;
- install, frontend test/check/build, Rust fmt/check/clippy/test, Tauri dev, and debug no-bundle commands;
- app-data/config/log/drafts/trash locations as Tauri-resolved concepts rather than hard-coded user paths;
- normal close/reopen and abnormal-exit recovery smoke steps;
- how to inspect a JSON draft safely without editing/moving it while the app runs;
- no GitHub credential is needed, no network feature is used, and no draft goes to `content/`;
- scope boundaries for Stage-05A, Stage-05B, and later Git publishing;
- troubleshooting for WebView2, MSVC linker ordering, locked files, CSP, corrupt/unknown draft versions, and revision conflicts;
- that this stage intentionally produces no installer, updater, signing, release, or production deployment.

- [ ] **Step 2: Build the real Windows debug executable without bundling**

Enter the VS environment and run:

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
npm.cmd run desktop:rust:fmt
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:test
npm.cmd run desktop:rust:check
npm.cmd run desktop:frontend:build
npm.cmd run desktop:build
```

Expected:

- MSVC `link.exe` is first;
- `tools/content-workbench/src-tauri/target/debug/content-workbench.exe` exists;
- no `.msi`, NSIS `*-setup.exe`, release bundle, updater, or signing artifact exists;
- CSP/permission generation succeeds with exactly `workbench-commands`, `core:event:allow-listen`, `core:event:allow-unlisten`, and `core:window:allow-destroy`.

- [ ] **Step 3: Perform the local-only application smoke test**

First launch the built
`tools/content-workbench/src-tauri/target/debug/content-workbench.exe`
directly. Confirm its packaged `frontendDist` renders a nonblank shell under the
production CSP, Diagnostics completes the read-only `get_app_info` call, and a
fictional `stage-04-packaged-smoke` draft can be created/saved/opened.
While it remains open, launch the same executable a second time: the existing
window must receive focus, the second process must exit, no second session
marker/recovery prompt may appear, and the open draft must remain unchanged.
Close the first executable cleanly before starting dev mode.

Start dev mode in its own VS-initialized terminal process:

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
npm.cmd run desktop:dev
```

Then record results for:

1. all five sections render and keyboard focus is visible;
2. create a fictional draft with valid stable ID `stage-04-smoke-draft`; `example.invalid` may appear only in its local notes;
3. Save now and autosave both reach Saved;
4. type another change and immediately request normal window close before 800 ms; the close is delayed until that text saves, then relaunch/reopen proves it persisted;
5. open the draft, force-terminate only this debug app, relaunch, and verify an explicit recovery prompt;
6. dismiss/reopen behavior works without publishing or repository access;
7. delete confirmation removes the active draft and diagnostics still shows recoverable trash location;
8. simulate the browser offline signal in WebView developer tooling without changing VPN/system networking; the notice appears while local editing remains enabled;
9. version/data/config/log/drafts/trash paths are visible;
10. the WebView console has no CSP, blocked-resource, React Refresh preamble, or unhandled-command error;
11. no GitHub credential, network login, repository selection, or production access is requested.

Conflict/error close blocking is verified by the injected lifecycle tests; do
not create a second writer, hand-edit live draft bytes, or add a production
fault-injection command merely to reproduce it in the GUI smoke.

Capture and inspect the actual Tauri window at 1280x800 and 960x640. Confirm
the window is nonblank, paths/IDs wrap, buttons retain stable dimensions,
dialogs fit, keyboard focus remains visible, and no controls or text overlap.

If GUI execution is impossible in the environment, do not claim PASS: record `NOT RUN` and the exact reason in `delivery/TEST-SUMMARY.txt`; keep the unit/integration evidence separate.

- [ ] **Step 4: Run existing repository regression gates**

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:next
```

Expected: desktop checks are included in the first two gates, the existing Stage-01/browser/render/IndexNow tests still pass, and the Next production build still generates the expected site without desktop files entering routes.

- [ ] **Step 5: Verify protected surfaces and commit documentation**

Diff from the exact base and confirm there are no changes under website/runtime/production surfaces such as `app/`, `components/`, existing `content/`, `public/`, `worker/`, `db/`, deployment files, or server configuration. Confirm `git remote -v` remains empty.

```powershell
git diff --check
git status --short
git add tools/content-workbench/README.md docs/content-workbench/WINDOWS-DEVELOPMENT.md docs/content-workbench/ARCHITECTURE.md docs/content-workbench/SECURITY-MODEL.md docs/content-workbench/TEST-STRATEGY.md
git commit -m "docs: add Windows content workbench instructions"
```

---

### Task 7: Final validation, handoff, verified bundle, and USB delivery

**Files:**

- Modify: `docs/content-workbench/HANDOFF.md`
- Modify: `delivery/HANDOFF.md`
- Modify: `delivery/MANIFEST.txt`
- Modify: `delivery/TEST-SUMMARY.txt`
- Modify: `delivery/CHANGED-FILES.txt`
- External create: `D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle`
- External create: `D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle.sha256.txt`
- External copy target: `E:\stage-04-desktop-shell\`

- [ ] **Step 1: Rerun the complete fresh final matrix**

Do not reuse earlier output. In the VS developer environment run, in order:

```powershell
& 'D:\DevTools\VisualStudio2022\Common7\Tools\Launch-VsDevShell.ps1' -Arch amd64 -HostArch amd64
where.exe link
git status --short --branch
git remote -v
npm.cmd run desktop:test
npm.cmd run desktop:check
npm.cmd run desktop:frontend:build
npm.cmd run desktop:rust:fmt
npm.cmd run desktop:rust:clippy
npm.cmd run desktop:rust:test
npm.cmd run desktop:rust:check
npm.cmd run desktop:build
npm.cmd run check
npm.cmd test
npm.cmd run build:next
git diff --check
```

Record exact command, status, test counts/build evidence, and warnings. Never convert `NOT RUN` to PASS.

- [ ] **Step 2: Verify security, dependency, generated-output, and scope invariants**

Check:

- all direct npm/Cargo versions and lockfiles are present and exact;
- no Git dependency, remote, credential, secret, real `.env`, production host, or private key is added;
- the exact eleven-command equality test passes;
- the capability contains only the approved four permission identifiers and the backend contains no plugin beyond `tauri-plugin-single-instance`;
- `node_modules`, `.next`, `.vinext`, `dist`, `coverage`, Cargo `target`, generated schema cache, real app-data drafts, logs, and secrets are ignored/untracked;
- no `.msi`, NSIS installer, release/update/signing artifact is delivered;
- all changed files are in Stage-04-owned configuration, desktop, test, documentation, and delivery areas;
- `recordDraft` has no duplicate Rust content model and desktop source has no copied Stage-01 registry/validator.

- [ ] **Step 3: Write tracked handoff and delivery records**

Both HANDOFF files and the tracked/external MANIFEST records must identify:

```text
Stage-01 base commit: 050a87dbd6330270e6b47b6f74acd071a85c5fcd
Predecessor bundle: stage-01-schema-v1.bundle
Predecessor bundle SHA-256: 74A7668B6C8F22BF8E953B038A7D909A3784013A713C4195D0258E031B8DBFF9
Content schema version: 1
Desktop command API version: 1
Draft storage version: 1
Settings storage version: 1
```

Both HANDOFF files must also contain stage/goal, branch, implementation commits, completed/not completed, decisions, modified areas, tests, known limits, integration order, conflict surfaces, rollback, next executor's first step, and work that must not be repeated.

`delivery/TEST-SUMMARY.txt` must distinguish automated tests, real debug build, GUI smoke, and any skips. `delivery/CHANGED-FILES.txt` is the sorted diff from the exact Stage-01 base and includes the delivery files themselves.

Follow the established Stage-01 self-reference rule:

- tracked MANIFEST says `FinalCommit=BRANCH_TIP_AT_DELIVERY` and explains that the exact SHA is written to the external USB manifest after the commit;
- tracked bundle hash says `TO_BE_GENERATED_AFTER_FINAL_COMMIT`;
- do not amend/rewrite the final commit merely to embed its own SHA.

- [ ] **Step 4: Commit the final tracked delivery state**

```powershell
git diff --check
git add docs/content-workbench/HANDOFF.md delivery/HANDOFF.md delivery/MANIFEST.txt delivery/TEST-SUMMARY.txt delivery/CHANGED-FILES.txt
git commit -m "docs: finalize Stage 4 handoff"
git status --short --branch
```

Expected: clean worktree. Record `git rev-parse HEAD` as the final SHA without amending.

- [ ] **Step 5: Create and verify the complete local branch bundle**

Create it in the established untracked bundle directory under `WORK_ROOT`, then run:

```powershell
git bundle create "D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle" "local/stage-04-desktop-shell"
git bundle verify "D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle"
$stage04Bundle = Get-Item "D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle"
$stage04Hash = Get-FileHash $stage04Bundle.FullName -Algorithm SHA256
("{0}  {1}" -f $stage04Hash.Hash, $stage04Bundle.Name) |
  Out-File "D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle.sha256.txt" -Encoding ascii
```

Expected: complete branch history through the exact final SHA. Do not include `node_modules`, build caches, `target`, `dist`, app-data drafts, logs, installer output, environment files, or secrets.

- [ ] **Step 6: Produce exact external metadata and copy to USB**

Create `E:\stage-04-desktop-shell` only after resolving the absolute target. Use these exact source-to-destination mappings:

```text
D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle -> stage-04-desktop-shell-v1.bundle
D:\algae-workbench\bundles\stage-04-desktop-shell-v1.bundle.sha256.txt -> stage-04-desktop-shell-v1.bundle.sha256.txt
delivery/HANDOFF.md -> HANDOFF.md
delivery/MANIFEST.txt -> MANIFEST.txt
delivery/TEST-SUMMARY.txt -> TEST-SUMMARY.txt
delivery/CHANGED-FILES.txt -> CHANGED-FILES.txt
```

`docs/content-workbench/HANDOFF.md` remains available inside the bundle; do not ambiguously copy it over the delivery handoff. The external `MANIFEST.txt` replaces the tracked self-reference placeholders with the exact final SHA, bundle byte size, SHA-256, predecessor identity, and interface versions. Do not modify the committed worktree after bundle creation.

- [ ] **Step 7: Independently verify the USB copy and final cleanliness**

Run bundle verification against the USB path, recompute the USB SHA-256, compare bundle length/hash with the source, verify that the sidecar's hash and filename match that recomputation, confirm the six expected artifacts, and confirm no cache/build/secret artifact was copied. Then rerun:

```powershell
git status --short --branch
git rev-parse HEAD
git remote -v
```

Expected: clean `local/stage-04-desktop-shell`, exact same SHA as bundle head/external manifest, and no remote.

Report only the final SHA, USB paths, bundle byte size, SHA-256, verification result, concise test summary, and any honest remaining `NOT RUN`/known limit. Do not push, merge, tag, release, install, sign, or deploy.

---

## Implementation references

- Tauri Vite/manual frontend setup: <https://v2.tauri.app/start/frontend/vite/>
- Tauri application capabilities and `AppManifest::commands`: <https://v2.tauri.app/security/capabilities/>
- Tauri exact core permission identifiers: <https://v2.tauri.app/reference/acl/core-permissions/>
- Tauri no-bundle build behavior: <https://v2.tauri.app/distribute/>
- Official Tauri single-instance plugin: <https://v2.tauri.app/plugin/single-instance/>
- Vite `html.cspNonce`: <https://vite.dev/config/shared-options.html#html-cspnonce>

These are references, not authorization to run `tauri add`, fetch Git sources,
or let a generator rewrite the pinned manifests. Implement the exact versions
and permissions in this plan, then prove them with the locked real build.

---

## Completion definition

This plan is complete only when all checked tasks have evidence and:

1. the real Windows debug executable builds without an installer;
2. local create/save/autosave/reopen/delete/recovery behavior is tested, with a GUI smoke result or an explicit honest non-run;
3. all five sections, app/data/config/log paths, offline notice, and error boundary work;
4. Stage-01 fixture outcomes and registry/default consumption are proven without duplicated schema logic;
5. the command/capability boundary exposes exactly eleven named application commands and no generic privileged API;
6. existing repository checks/tests/Next production build pass;
7. protected website/production surfaces remain unchanged and the Git remote remains empty;
8. tracked handoff files, clean final commit, verified complete bundle, SHA-256, and independently verified USB copy all exist.
