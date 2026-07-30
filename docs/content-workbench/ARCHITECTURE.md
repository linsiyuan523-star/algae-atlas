# Content Workbench Architecture

## 1. Architectural outcome

The system is a repository-file publishing pipeline with two clients of one content contract:

~~~text
                 shared TypeScript schema and policy
                    /                         \
Windows Tauri workbench                       Next.js website
  -> repository content store                 -> validated loader
  -> local validation/preview                 -> locale availability index
  -> allowlisted local Git commit             -> routes/SEO/sitemap/renderers
                    \                         /
                     ordinary Git history
                              |
                    integration host and PR
                              |
                   main-only production deploy
~~~

The desktop app has no arbitrary production shell, GitHub, D1, Nginx, or systemd access. Its optional direct-publish path is limited to fixed SSH/SCP operations and a root-owned controller with a narrow JSON command contract. The website does not require the desktop, a database, network access, or secrets to build.

## 2. Components

### 2.1 Shared content contract

A future `packages/content-schema/` module is the only canonical implementation of:

- content type discriminated unions;
- author and media schemas;
- locale workflow and publication eligibility;
- stable validation issue codes;
- Markdown profile and safe-link rules;
- deterministic serialization;
- schema-version migrations and fixtures.

It must be environment-neutral TypeScript. It cannot import React, Next.js, Node filesystem APIs, Tauri APIs, Git, or UI code. Stage 1 selects and pins one runtime-validation dependency; website and desktop wrappers may add platform I/O but cannot redefine policy.

### 2.2 Repository content store

The store is the directory contract in [CONTENT-SCHEMA.md](CONTENT-SCHEMA.md). It contains source records, Markdown bodies, public attribution records, and media metadata. It is authoritative only for collections explicitly switched to the new loader during migration.

The store exposes logical operations, not arbitrary filesystem access:

- enumerate records by type;
- read one record and body;
- validate one or all records;
- resolve authors, media, and relationships;
- calculate published locale availability;
- serialize a proposed change deterministically.

### 2.3 Website content adapter

The website layer has four responsibilities:

1. load and validate repository records at build/request preparation;
2. adapt legacy TypeScript exports during the compatibility period;
3. expose a uniform content repository API to existing page components;
4. produce an availability index for static params, detail lookup, metadata, language switching, and sitemap generation.

The adapter uses explicit collection source selection. If a migrated collection is invalid, the build fails; it does not silently read old data and hide migration defects.

Proposed read API:

~~~ts
type PublicContentRepository = {
  list<T extends ContentType>(type: T, locale: Locale): PublicRecord<T>[];
  get<T extends ContentType>(type: T, id: string, locale: Locale): PublicRecord<T> | null;
  availability(type: ContentType, id: string): {
    zh: boolean;
    en: boolean;
    fallbackSection: { zh: string; en: string };
  };
};
~~~

Existing page components should migrate to this API incrementally. Route-family registration, layout, and navigation remain in code.

### 2.4 Desktop application

The Windows-first application uses Tauri + React + TypeScript. Responsibilities are separated:

- React UI: type selection, forms, locale workflow, review view, media metadata, validation presentation, diff confirmation, and persisted publish progress.
- Shared schema: all content policy and serialization.
- Tauri command layer: approved path access, atomic file operations, media inspection/normalization, explicit Git commands, and the fixed server-publish protocol.
- Workspace service: identifies the repository/worktree, branch, base, remotes, cleanliness, and changed allowlist.
- Preview service: renders a local, non-public preview from draft data without marking it published.
- Delivery service: produces complete bundles and summaries for later handoff or controlled direct publication; it cannot create or enable a Git remote.

The desktop must open an operator-selected existing worktree. It does not clone from GitHub or create arbitrary repositories.

### 2.5 Git safety service

Git operations use an argument-vector process API; they are never assembled into a shell string from content values. The service permits only an explicit sequence:

1. inspect repository root, worktree registration, current branch, HEAD, status, and remotes;
2. require a non-protected local branch and the expected baseline;
3. validate proposed files and show a path-restricted diff;
4. stage exact allowlisted paths;
5. re-read the staged diff and reject unexpected paths;
6. create a local commit with a validated message;
7. report the new SHA and leave the worktree clean.

It prohibits `fetch`, `pull`, `push`, remote add/set-url, merge of protected branches, reset, clean, checkout-overwrite, tag, release, deployment, credential configuration, and arbitrary Git options supplied by a content file.

### 2.6 Integration and delivery

Stage workers export complete branch bundles and SHA-256 sidecars. The integration host verifies them, imports them under namespaced local refs, and merges only in the topological order in [STAGE-DEPENDENCIES.md](STAGE-DEPENDENCIES.md). Remote enablement happens only after all stages pass and the operator explicitly authorizes the separate GitHub workflow.

### 2.7 Direct server publication

Formal server publication is a recoverable transaction rather than an opaque
SSH call. The desktop creates one random 32-character lowercase hexadecimal ID
before the local publication commit and reuses it for the branch name, Bundle,
SHA-256, upload, controller call, status queries, and retries. It uploads only to
the fixed incoming root, writes a transaction-scoped `.partial-<id>` directory,
checks the remote Bundle hash, and atomically renames the completed delivery.

The root-owned controller persists a mode `0600` JSON state document and JSONL
event timeline below `/srv/algae-content/publish-state`, whose directory mode is
`0700`. State replacement is atomic and entries are retained for 30 days. The
fixed `publish-status --transaction <id> --json` command lets the desktop poll
or recover after restart and after an ambiguous SSH result. A repeated publish
returns retained success or running state; a deterministic failure stays
terminal; a retryable pre-switch failure can resume under the same ID, with at
most three controller attempts. A completed production switch is never retried.

The controller checks the exact verified source cache first. On a miss it uses
the exact GitHub API archive before at most one 30-second shallow-clone fallback,
with a 90-second hard ceiling across metadata, archive, and clone network work,
and verifies commit/tree identity for both paths. Bundle integrity, content
shape, clean source, build, release, rollback, and production URL gates remain
unchanged. The React layer combines Tauri progress events with bounded status
polling, stores the latest transaction per draft locally, prevents a second
in-flight publication, and exposes stage, retry, duration, and recovery state.
Before creating the local publication commit, the desktop requires
`status.publishProtocolVersion >= 1`; an older controller is reported as an
explicit non-retryable compatibility error. A failed recovery query also moves
the persisted client transaction out of `running`, and a transaction that has
not uploaded or started server work can be ended locally.

### 2.8 Pending synchronization queue

Phases B1 and B2 add a server-side queue and synchronization runner without
changing the current desktop publish workflow. Installing the controller and
inactive unit candidates does not create queue refs or change legacy behavior.
Production queue initialization and timer activation remain blocked until B3
adds the desktop upload/status/manual-sync workflow and passes installer
acceptance.

The independent server content repository has three canonical snapshots:

- `refs/algae/published` is the content commit used by the last verified
  production release;
- `refs/algae/pending` is the newest accepted canonical content commit waiting
  for synchronization;
- `refs/algae/syncing` is the immutable snapshot selected when a sync
  transaction starts and may legitimately lag behind pending.

Uploaded workbench commits and canonical server commits are different Git
histories. Corresponding `refs/algae/source/{published,pending,syncing}` refs
retain and validate the uploaded lineage, while per-upload source/content refs
keep accepted commits reachable. Queue metadata and upload transaction JSON use
strict schema-versioned Git blobs referenced from the same controlled
namespace. One `git update-ref --stdin` transaction advances queue metadata,
source pending, canonical pending, and all accepted transaction refs together.
Queue schema 1 records the exact website `siteCommit`. New initialization and
legacy-state migration derive it only from the validated identity markers of
the current release; absence is a deterministic safe failure, never a request
for current GitHub `main`.

The first upload must have a base whose managed `content/` and
`public/images/uploads/` trees exactly match canonical published content. Later
uploads must equal source pending or directly fast-forward it. Older or
divergent history is rejected with `PENDING_BASE_MISMATCH`; the controller never
merges, force-updates, or discards existing pending data. A newer accepted
upload moves earlier included upload transactions to `COALESCED`, preserving
their identity and final inclusion path rather than marking them failed. Equal
pending content is idempotent and does not move refs backward.

An upload transaction represents receipt, fast validation, and queue inclusion.
A schema-version-1 sync transaction is a distinct transaction kind stored at
`refs/algae/sync-transactions/<sync-id>`, with controlled active, last, blocked,
and immutable upload-member refs. It records trigger, stage, exact site/content
and source commits, published/pending baselines, release and rollback paths,
attempt ceiling, failure classification, recovery, switch, and health state.
All JSON blobs and ref names are strictly validated before use.

Scheduled and manual calls enter the same `sync-pending` state machine and hold
one process-scoped root `flock` for the complete operation. Contenders return
the existing transaction and stage rather than starting another build. The
ordinary content mutation lock is held only for snapshot and final commit, so
queue uploads can progress during dependency preparation and build.

The snapshot ref transaction verifies published, pending, source pending,
queue and blocked state, freezes canonical/source syncing, creates the sync and
active refs, captures current/previous rollback pointers, attaches the latest
upload as `SYNCING`, and retains every included upload through immutable member
refs. The build reads only syncing and the queued site commit. New pending is
therefore left for the next run. Legacy and queued publication share exact
source preparation, locked dependency install, validation, Next.js build,
release construction, atomic link switch, service restart, live health gate,
and rollback functions.

After health succeeds, one final ref transaction advances canonical and source
published, removes syncing and active, records last/PUBLISHED, and associates
only frozen upload members with the sync ID, release ID, and publish time. The
latest member becomes `PUBLISHED`; earlier members remain or become
`COALESCED`. A pending commit accepted during the build is never rolled back.

Transient source/dependency failures become `FAILED_RETRYABLE` until the third
automatic attempt and are retried by a later fixed cycle, not a loop inside one
service run. Deterministic validation, build, switch, health, permission, and
integrity errors become `FAILED_BLOCKED`. The same blocked content does not
build again unless pending advances or an administrator explicitly requests
manual `--retry-blocked`.

Recovery always examines an active transaction before selecting pending. It
rebuilds the same snapshot after a pre-switch crash, reuses a completed
unswitched release, atomically finalizes a switched release with a valid health
marker, or performs a fresh service/live-health check when no marker exists.
State/ref/release disagreement fails closed and retains evidence. Health failure
restores both release links and restarts the restored service before leaving
published unchanged; incomplete rollback retains the active transaction for
manual inspection.

All repository mutations share one controller lock. Explicit `queue-init`
activates queue mode; after that, legacy synchronous `publish` and `delete`
mutations fail with `QUEUE_MODE_ACTIVE` because their whole-repository swap
cannot preserve pending refs. Before initialization, the existing synchronous
desktop path remains unchanged. The B2 timer candidate uses the explicit UTC
calendar `*-*-* *:00,30:00 UTC`, `Persistent=true`, one-second accuracy, and no
random delay. `pending-status` always computes the next UTC boundary but reports
timer activity only when systemd says the unit is both enabled and active. The
installer copies and reloads these units without enabling or starting them.
B3A adds the desktop asynchronous upload status UI, explicit immediate sync,
transaction recovery, and controlled queued deletion before any production
activation. The operator workflow and activation boundary are documented in
`QUEUED-DESKTOP-WORKFLOW.md`.

## 3. Trust boundaries

| Boundary | Trusted | Untrusted until validated |
| --- | --- | --- |
| Repository selection | Operator-approved canonical worktree path | Filesystem paths from records or UI history |
| Content | Schema code and committed allowlists | JSON, Markdown, links, relationship IDs |
| Media | Verified normalized copy and metadata hash | Extension, filename, MIME declaration, EXIF, uploaded bytes |
| Identity | Public author IDs with approved scope | Free-form names, private contact details, inferred membership |
| Review | Recorded reviewer ID and state transition | A display label or machine-generated text |
| Git | Read state and exact allowlisted commands | User/content-supplied arguments, remotes, hooks, aliases |
| Build | Validated committed records | Drafts, invalid records, generated preview state |
| Production | Integration-approved `main` release workflow | Any stage branch or desktop action |

Git hooks and aliases are not relied on for safety. The application invokes Git with controlled configuration and still verifies the resulting index.

## 4. Read path

1. The build locates the repository content root.
2. JSON is parsed without executing code.
3. Directory identity, schema version, type union, and references are validated.
4. Markdown is parsed under the safe profile.
5. Author and media catalogs are resolved.
6. Publication eligibility is evaluated per locale.
7. The availability index is computed in memory.
8. Existing renderers receive public records through adapters.
9. Static params, metadata, language links, and sitemap consume the same availability result.

No layer is allowed to implement a separate “almost equivalent” publication test.

## 5. Write path

1. The operator opens one record or starts a type-specific draft.
2. The UI keeps an in-memory draft and runs shared validation continuously.
3. Save writes only draft source files through a same-directory temporary file and atomic replace.
4. Media ingestion reads bytes, validates signature and limits, normalizes a public copy, removes private metadata, hashes the result, and writes matching metadata.
5. Publish preparation validates the complete record graph and repository state.
6. The UI shows exact files and diff; the operator confirms.
7. The Git service stages exact paths and commits locally.
8. The worktree is rechecked for cleanliness and the commit SHA is reported.

A save is not a publication. A local publication commit is not a GitHub push or production deployment.

## 6. Preview

Draft preview must be explicit and local:

- it may render unpublished locale content in the desktop or a loopback-only preview process;
- it displays a non-removable draft banner and review state;
- it does not update sitemap, IndexNow, canonical public URLs, or committed publication state;
- it does not bind to a non-loopback interface by default;
- it does not require production secrets.

The normal website build remains fail-closed and public-state only.

## 7. Error handling and recovery

- Parse and validation failures carry stable issue codes, record ID, locale, field path, message, and remedy.
- Multi-file changes are prepared in a transaction plan before any replacement.
- A write failure keeps previous files and removes only temporary files created by that operation.
- A Git staging mismatch aborts before commit and unstages only the exact paths staged by the operation, without touching unrelated work.
- Existing dirty or untracked files outside the planned set cause a stop, not automatic cleanup.
- Recovery uses ordinary commits or revert commits. No component requires history rewriting.

## 8. Compatibility architecture

The migration period intentionally has two source implementations behind one read interface:

~~~text
LegacyTypeScriptSource ----\
                            -> CollectionRouter -> PublicContentRepository
RepositoryRecordSource ----/
~~~

`CollectionRouter` selects one source per collection through reviewed code/configuration. It never merges both sources by ID at runtime, because silent precedence would make audit and rollback ambiguous.

Legacy files, D1/Drizzle, Worker, Sites, Vite, and native Next.js remain until their own removal criteria are approved. The new file store does not imply a future database is forbidden; it means a database migration is a separate architecture decision with export, offline, versioning, and rollback requirements.

## 9. Route and structure control

The website owns a registry mapping content type to:

- route family and section landing;
- renderer component;
- metadata builder;
- listing policy;
- whether IDs are open creation or fixed allowlist.

The desktop can create records only where the registry says IDs are open. It cannot edit that registry. This prevents a content record from creating navigation, a new route family, a footer link, or an unexpected renderer.

## 10. Data and dependency direction

Allowed dependencies:

~~~text
content-schema <- website adapter <- Next.js routes/components
content-schema <- desktop UI/services <- Tauri command layer
content-schema <- validation CLI/tests
~~~

Forbidden dependencies:

- schema importing UI/platform code;
- website importing desktop or Tauri code;
- desktop importing Next.js route/components;
- content records importing executable TypeScript;
- Rust and TypeScript implementing divergent policy;
- production build calling the desktop or network.

## 11. Observability without secrets

Local reports may include:

- schema version, record IDs/types/locales, validation issue codes;
- worktree path, branch, base/final SHA, allowed changed files;
- test command and pass/fail summary;
- media ID, public path, dimensions, bytes, and SHA-256.

Reports exclude content drafts when not needed, environment values, credentials, private contact details, EXIF, consent documents, and full command logs.

## 12. Architecture decisions

| Decision | Rationale |
| --- | --- |
| Repository JSON + Markdown is the initial source | Offline Git workflow, human diffability, static build, no production database dependency. |
| One record directory with independent locale payloads | Stable shared identity without forcing English publication. |
| Pure shared TypeScript schema | Next.js and React desktop share policy and inferred types. |
| Tauri backend owns privileged file/Git/media actions | UI cannot obtain arbitrary filesystem or process access. |
| Explicit per-collection migration switch | Deterministic source, clear parity, simple rollback. |
| Availability index is derived, not committed | Prevents stale generated route state. |
| No raw HTML/MDX in first Markdown profile | Reduces injection and executable-content risk. |
| Existing compatibility structures remain | Current tests/builds depend on them and no deletion is justified. |
| Remote and deployment are outside the desktop | Preserves review, integration, and main-only production boundary. |
