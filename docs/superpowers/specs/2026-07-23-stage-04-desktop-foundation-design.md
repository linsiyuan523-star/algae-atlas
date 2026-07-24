# Stage-04 Desktop Foundation Design

Status: approved for implementation on 2026-07-23

## 1. Goal and baseline

Build the Windows-first Tauri desktop foundation for the content workbench at
`tools/content-workbench/`. The application provides a runnable shell, local
draft persistence and recovery, a minimal five-section navigation surface,
shared-schema contract proof, diagnostics, and offline/error feedback. It does
not edit the website, publish through Git, or implement the record-specific
editors owned by Stage-05A.

The dedicated branch is `local/stage-04-desktop-shell`, created from the exact
Stage-01 final commit `050a87dbd6330270e6b47b6f74acd071a85c5fcd`.
Stage-01 schema version 1 and desktop command API version 1 are the required
interfaces. The desktop imports `@algae-atlas/content-schema` and never copies
or reimplements its record types, type registry, validation, workflow, or
publication eligibility rules.

## 2. Scope boundaries

Stage-04 owns:

- a Tauri 2, React 19, and TypeScript desktop subproject;
- the application shell and the five navigation destinations: New Content,
  Drafts, Submitted, Settings, and Diagnostics;
- shared-schema consumption and browser/desktop fixture parity;
- versioned local draft storage, autosave, reopen, deletion, and abnormal-exit
  recovery;
- named Tauri commands for draft, settings, application-info, recovery, and
  mocked-workspace operations;
- a pinned Windows Rust toolchain and desktop check/test/build commands;
- a top-level React error boundary and explicit local/offline status.

Stage-04 does not own:

- record-type-specific forms, Markdown editing, review transitions, or final
  source-file proposals (Stage-05A);
- repository discovery, arbitrary path selection, media processing, author
  administration, or real Git inspection (Stage-05B);
- website preview, local Git commits, bundle integration, GitHub, remotes,
  pull requests, releases, installers, updates, or production;
- changes to website routes, navigation, components, content, images,
  deployment, D1/Drizzle, Worker, Sites, or compatibility structures.

The New Content page may select a registered type and stable ID, then create an
incomplete editor draft with `createRecordDraftDefaults`. It deliberately does
not render the registry's dedicated fields. This proves the Stage-01 contract
without taking Stage-05A ownership.

## 3. Chosen architecture

Three persistence approaches were considered:

1. A named Rust draft service storing versioned JSON in the Tauri application
   data directory.
2. A Tauri key/value store plugin.
3. Browser-only IndexedDB or localStorage.

The approved choice is option 1. Per-draft JSON is inspectable, independently
recoverable, naturally versioned, and compatible with a future migration to
the full Stage-05A editor. The privileged layer can derive every path and use
atomic replacement without exposing general filesystem access. The plugin
store would concentrate failures in one opaque file, while browser-only
storage would weaken the Tauri command boundary and make data/log locations
less transparent.

The dependency direction is:

```text
@algae-atlas/content-schema
          |
          v
React shell and draft model -> typed bridge -> named Tauri commands
                                              |
                                              v
                               Rust draft/settings/session services
                                              |
                                              v
                         Tauri app-data/config/log directories only
```

The React frontend treats every command result as fallible. The Rust backend
treats every frontend payload as untrusted. Rust validates only the local
storage envelope, identifiers, revisions, and path-safe command inputs; it
does not duplicate content-schema validation.

## 4. Project layout

The desktop project is a root npm workspace member:

```text
tools/content-workbench/
  package.json
  index.html
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    app/
      navigation.ts
    components/
      AppShell.tsx
      ErrorBoundary.tsx
      OfflineBanner.tsx
    domain/
      drafts.ts
      settings.ts
    features/
      new-content/
      drafts/
      submitted/
      settings/
      diagnostics/
    lib/
      bridge.ts
      issues.ts
    styles/
      app.css
    test/
  src-tauri/
    Cargo.toml
    build.rs
    rust-toolchain.toml
    tauri.conf.json
    capabilities/
      default.json
    src/
      main.rs
      lib.rs
      commands.rs
      app_info.rs
      settings.rs
      session.rs
      drafts/
        mod.rs
        model.rs
        store.rs
        migration.rs
        atomic_replace.rs
```

Files are split by responsibility. UI features call only the typed bridge;
the bridge is the sole frontend module importing Tauri's `invoke`. Storage
code receives explicit application directories from Tauri and remains unit
testable with temporary directories.

The root `package.json` and lockfile include the workspace and exact desktop
commands. Tauri npm and Cargo dependencies are pinned through the npm and
Cargo lockfiles. `src-tauri/rust-toolchain.toml` pins Rust `1.97.1` for the
`x86_64-pc-windows-msvc` target with `rustfmt` and `clippy`.

## 5. Draft storage contract

An active draft is one UTF-8 JSON file under:

```text
<app-data>/drafts/v1/<draft-id>.json
```

Deletion moves the exact active file to a recoverable local trash directory:

```text
<app-data>/draft-trash/v1/<draft-id>-<deleted-at>.json
```

The application never automatically purges trash. Deletion therefore removes
the draft from the active UI without making a mistaken click the only copy.

The version 1 envelope is:

```ts
type StoredDraftV1 = {
  storageVersion: 1;
  draftId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  localLabel: string;
  localNotes: string;
  recordDraft: ReturnType<typeof createRecordDraftDefaults>;
};
```

`draftId` is a backend-generated UUID and is the only value used to derive a
filename. The record's stable ID remains inside `recordDraft`. Local label and
notes are workstation-only scaffolding and are not publication fields.

The backend rejects malformed UUIDs, revision rollback, unknown keys in the
envelope, unsupported storage versions, oversized payloads, and paths supplied
by callers. Unknown future versions are reported without overwriting, moving,
or deleting their bytes. A future migration must be explicit and tested;
application startup never silently rewrites drafts.

Every save serializes with two-space indentation, LF endings, UTF-8 without
BOM, and one trailing newline. It writes and flushes a unique sibling temporary
file, validates the bytes, atomically replaces the target with a Windows-safe
replacement helper, and removes only operation-owned temporary files. A failed
save leaves the last completed draft file readable.

## 6. Configuration, session recovery, and directories

Configuration is separate from drafts:

```text
<app-config>/settings-v1.json
```

Version 1 settings contain only a bounded autosave delay and UI preferences.
They contain no token, password, Git credential, SSH key, production value, or
arbitrary executable. Workspace selection remains a mocked, read-only status
until Stage-05B implements approved worktree discovery.

Abnormal-exit detection uses:

```text
<app-data>/session/active-v1.json
```

At startup the backend reads any previous active marker before creating the
new session marker. The marker records only a session ID, timestamps, and the
last active draft ID. Opening a draft updates that ID. A clean Tauri exit
removes the marker synchronously; a crash or forced termination leaves it.
On the next launch, the UI offers to reopen the referenced draft but never
auto-commits, publishes, or assumes an interrupted save completed.

Application information exposes the installed application version plus the
resolved app-data and app-log directories. The application creates these
directories but does not read unrelated user files. Diagnostic output may show
operation IDs, issue codes, draft IDs, versions, and pass/fail state; it does
not include full draft bodies, environment dumps, credentials, or private
filesystem listings.

## 7. Named command boundary

The initial invoke allowlist is:

- `get_app_info`
- `get_settings`
- `save_settings`
- `create_draft`
- `list_drafts`
- `load_draft`
- `save_draft`
- `delete_draft`
- `get_recovery_state`
- `set_active_draft`
- `inspect_mock_workspace`

There is no generic read, write, delete, directory-list, shell, process, URL,
network, or Git command. Capability files expose only the minimum core window
and event permissions required by the bundled local UI. The Tauri content
security policy accepts only packaged application resources and forbids remote
scripts and remote frames. Core editing does not require network access.

Command failures return a stable desktop issue shape with a code, message, and
remedy. Absolute paths outside the approved app directories and draft content
are redacted from error reports.

## 8. UI and interaction flow

The shell uses a persistent left navigation and one main content region:

- **New Content:** choose one of the 11 types from
  `contentTypeRegistry`, enter a schema-valid stable ID, optionally add a local
  label/notes, and create a draft from `createRecordDraftDefaults`.
- **Drafts:** list active drafts, show type/ID/update time, reopen a draft, and
  delete it after explicit confirmation.
- **Submitted:** display a clear empty state explaining that local Git commits
  arrive in Stage-06B; no fake submissions are shown.
- **Settings:** show autosave status and the mocked workspace boundary. It
  cannot accept credentials or activate an arbitrary repository.
- **Diagnostics:** show application/schema/storage versions, application data
  and log directories, offline/local mode, recovery status, and command health.

After draft creation, the shell opens a minimal draft workspace with the local
label, local notes, registered content type, and stable ID. Type and stable ID
are fixed for this Stage-04 draft. Changes to local label/notes are debounced
for 800 milliseconds, then saved with the last loaded revision. A revision
conflict keeps the user's in-memory text, reports the conflict, and requires a
reload decision instead of overwriting a newer file.

An offline/local-mode badge is always visible. When the browser reports
`navigator.onLine === false`, an additional non-blocking offline notice appears;
draft creation and editing remain available. No feature waits for GitHub or a
remote API.

The top-level error boundary replaces a failed content region with an error
code, recovery guidance, and a safe reload action. It does not discard the
last persisted draft.

## 9. Testing strategy

Frontend unit and component tests cover:

- the five navigation destinations and submitted empty state;
- registry-driven type labels without copied type definitions;
- stable-ID validation and draft-default creation;
- autosave debounce, revision conflict, reopen, deletion confirmation, and
  preserved input after a command error;
- offline notice, diagnostics, recovery prompt, and error boundary;
- the same Stage-01 fictional fixtures and validation outcomes used by the
  browser-compatible schema contract.

Rust tests use temporary directories and cover:

- version 1 round trips and deterministic formatting;
- create/list/load/save and monotonic revisions;
- sibling-temp atomic replacement and injected write failure;
- malformed UUID, traversal-like input, oversized payload, unknown version,
  corrupt JSON, and operation-owned cleanup;
- recoverable delete behavior;
- clean versus abnormal session markers;
- settings separation and bounded values;
- redacted structured errors.

No test uses the real application-data directory, real repository, GitHub, or
production. Fixtures use obvious fictional values and `example.invalid`.

Stage-close commands include focused desktop checks, Rust formatting/lint/test,
a Tauri debug build without installer bundling, and the existing repository
gates:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:next
```

The exact new desktop command names and dependency versions are recorded in the
implementation plan and committed package/lock files. A skipped or unavailable
command is recorded as not run with its exact reason; it is never reported as
passing.

## 10. Toolchain and dependency acquisition

The audited host provides Node.js 22.23.1, npm 10.9.8, Rust 1.97.1 for
`x86_64-pc-windows-msvc`, Visual Studio 2022 with MSVC 14.44, Windows SDK
10.0.26100.0, and WebView2 Runtime 150.0.4078.83. The ordinary PATH currently
resolves `link.exe` to RTools, so native build commands must enter the Visual
Studio developer environment or otherwise prove that Cargo selected the MSVC
linker.

Tauri dependencies are not present in the offline cache. The operator approved
downloading exact compatible packages only from the official npm registry and
crates.io, then retaining normal lock/cache evidence for subsequent offline
verification. This approval does not permit GitHub access, a Git remote,
network Git, telemetry, automatic updates, production access, or third-party
mirrors.

## 11. Completion criteria

Stage-04 is complete only when:

1. the Windows Tauri shell starts and the debug application build succeeds;
2. a created draft survives application close and reopen;
3. autosave, manual save, reopen, recoverable delete, and abnormal-exit recovery
   have passing focused tests;
4. data, configuration, and log directory locations are visible and distinct;
5. Stage-01 schema fixtures have identical Node and desktop outcomes;
6. no unrestricted filesystem, process, network, Git, or URL command is exposed;
7. no GitHub credential is required and local drafts work offline;
8. website files and public output remain unchanged;
9. desktop checks plus `npm.cmd run check`, `npm.cmd test`, and
   `npm.cmd run build:next` pass or any environmental non-run is reported
   honestly;
10. the branch is clean and the required HANDOFF, delivery files, verified Git
    bundle, SHA-256 sidecar, and USB copy are complete.
