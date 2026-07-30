# algae-contentctl

`algae-contentctl` is the fixed, root-owned server-side endpoint for content
publication and the pending synchronization queue. It has no generic shell,
Git, systemd, or filesystem subcommand. The current desktop workbench still
calls only these synchronous JSON commands:

```bash
sudo -n /usr/local/sbin/algae-contentctl status --json
sudo -n /usr/local/sbin/algae-contentctl list --json
sudo -n /usr/local/sbin/algae-contentctl publish-status \
  --transaction <32-lowercase-hex-transaction-id> --json
sudo -n /usr/local/sbin/algae-contentctl publish \
  --transaction <32-lowercase-hex-transaction-id> \
  --bundle /home/ubuntu/algae-content-workbench/incoming/<transaction-id> \
  --bundle-sha256 <sha256> --json
sudo -n /usr/local/sbin/algae-contentctl delete \
  --type science-article --id example-id --json
```

Phases B1 and B2 provide the queued publication contract below. The reviewed
sudoers candidate permits the future B3 desktop to upload, query, and request a
normal manual synchronization, but the current desktop does not call these
commands yet:

```bash
sudo -n /usr/local/sbin/algae-contentctl queue-upload \
  --transaction <32-lowercase-hex-transaction-id> \
  --bundle /home/ubuntu/algae-content-workbench/incoming/<transaction-id> \
  --bundle-sha256 <sha256> --json
sudo -n /usr/local/sbin/algae-contentctl pending-status --json
sudo -n /usr/local/sbin/algae-contentctl sync-status --json
sudo -n /usr/local/sbin/algae-contentctl sync-status \
  <32-lowercase-hex-sync-transaction-id> --json
sudo -n /usr/local/sbin/algae-contentctl sync-pending \
  --trigger manual --json
```

Queue initialization and an override of a blocked commit remain explicit
administrator operations and are not in the desktop sudoers alias:

```bash
sudo /usr/local/sbin/algae-contentctl queue-init \
  --published <canonical-content-commit> --json
sudo /usr/local/sbin/algae-contentctl sync-pending \
  --trigger manual --retry-blocked --json
```

`publish --bundle` accepts a standard workbench delivery directory, not an
arbitrary archive or source checkout. It requires exactly the existing complete
Git bundle, `MANIFEST.txt`, SHA-256 sidecar, changed-file list, and portable
validator artifacts. The controller validates the manifest, hash, unique Git
head, parent, commit subject, and changed-file list itself. It deliberately
does **not** execute JavaScript or shell scripts uploaded in that delivery.

The uploaded bundle may change only these regular files:

```text
content/records/<registered-type>/<stable-id>/{record.json,zh.md,en.md}
content/authors/<safe-file>
content/media/<safe-file>
public/images/uploads/YYYY/MM/<stable-image-id>{.thumbnail.webp,.webp,.jpeg,.jpg,.png,.avif}
```

The bundle must change exactly one record whose stable ID matches either the
direct-publish branch `content/direct-<32-lowercase-hex-job-id>-<stable-id>` or
the legacy export branch `content/YYYYMMDD-<stable-id>`. The fixed-width direct
job ID is removed before comparing the record ID, so IDs are parsed without
ambiguity. This keeps an uploaded delivery from becoming a general website
source update.

## Server layout

```text
/srv/algae-content/repository                 formal independent content Git repo
/srv/algae-content/transactions               root-only candidate workspaces
/srv/algae-content/publish-state              root-only transaction JSON and JSONL timelines
/srv/algae-content/site-source-cache          root-only verified GitHub source snapshots
/home/ubuntu/algae-content-workbench/incoming/<transaction-id>
/srv/algae-atlas/releases/<release-id>         fresh website builds
/srv/algae-atlas/current                       active release symlink
/srv/algae-atlas/previous                      rollback release symlink
```

The content repository also owns the queue namespace. Canonical server content
uses `refs/algae/{published,pending,syncing}`. Verified uploaded source history
uses `refs/algae/source/{published,pending,syncing}` because workbench commits
and canonical server commits are separate histories. Queue metadata and upload
transaction JSON are strict schema-versioned Git blobs addressed by controlled
refs; per-transaction source and canonical refs keep every accepted commit
reachable.

Synchronization state uses strict schema-version-1 blobs at
`refs/algae/sync-transactions/<sync-id>`. The controlled index refs are
`refs/algae/sync-active`, `refs/algae/sync-last`, and
`refs/algae/sync-blocked`. Frozen upload membership is retained under
`refs/algae/sync-members/<sync-id>/<upload-id>`; neither CLI input nor content
data can choose any of these ref names.

The formal repository owns both the `content/` tree and the narrowly scoped
`public/images/uploads/` blob tree referenced by media metadata. Image paths
must have a four-digit year, a real two-digit month, a stable lowercase ID, and
an approved image suffix. Bundle entries must remain ordinary Git blobs; links,
traversal, and every other `public/` path are rejected.

The controller never reads `/srv/algae-atlas/source` or uses the active
`current` release as source. Each legacy publish or deletion first queries the official
GitHub commit API for the branch's exact commit and tree SHA, then checks a
root-only cache keyed by both values. A cache hit is accepted only after its
metadata, clean Git state, branch, tree SHA, and managed content trees are
revalidated; the copied transaction source is validated again before use. A
cache miss first downloads the exact GitHub API archive. A transient archive
failure permits only one shallow-clone fallback, bounded to 30 seconds; API
metadata, archive, and clone hard limits are 20, 40, and 30 seconds respectively,
so the complete uncached network path is capped at 90 seconds. A
deterministic archive validation failure does not fall through to clone.
Commit and tree identity remain mandatory for either method. Verified sources
are installed into the cache through a
same-directory atomic rename, while invalid entries are quarantined inside the
current root-only transaction. HTTP requests retain bounded retries and
timeouts. The controller rejects unsafe archive entries and initializes a
local Git snapshot only after its written tree, including executable modes,
matches the API tree SHA. The release SHA remains the real GitHub commit SHA;
a local archive snapshot commit is merely a clean build workspace whose tree
is rechecked before use.

A queued synchronization is stricter: queue state records one exact
`siteCommit`, initialized only from the validated `.release-sha`,
`.content-sha`, and `.release-id` markers of the current release. The runner
requests that exact commit and records it in the sync transaction and new
release. A missing value fails with `SITE_COMMIT_UNAVAILABLE`; it never falls
back to the latest GitHub `main`, so content synchronization cannot silently
deploy unrelated website code.

The controller reuses that exact prepared tree for both the candidate bootstrap
and website build. It overlays a candidate `content/` directory, runs
`npm ci --include=dev --prefer-offline --no-audit --no-fund`,
`npm run content:validate -- --json`, and `npm run build:next` with
`CONTENT_REPOSITORY_SOURCE=overlay`, synchronizes
candidate uploads into the fresh build, and then creates a release. Full source
type and lint checks remain pull-request gates; the production transaction
validates the changing content repository and performs the production Next.js
build. The locked install verifies package integrity, uses the root-owned npm
cache before the configured registry, and still downloads missing packages.
Online audit and funding metadata are excluded from the time-critical publish
transaction; dependency auditing remains a separate maintenance or CI gate.
Overlay mode keeps legacy entries until a same-ID record has at least one
publishable locale; a publishable record then owns that ID without silently
mixing locale renderers. Only after the site restart, loopback health check,
and exact published URL check succeed does it replace the formal content
repository. Any failure
rolls `current` and `previous` back and leaves the formal repository unchanged.
If restoring the formal repository or release links itself fails, the root-only
transaction workspace and new release are retained for manual recovery instead
of being deleted.

All registered content types have records-backed website detail routes. The
controller still treats the exact URL check as a transaction gate: any routing
regression fails with `PUBLISH_VERIFICATION_FAILED` and is never reported as a
successful publication.

`delete` accepts only a registered content type and a stable ID. It removes
only `content/records/<type>/<id>/` in a candidate repository and leaves media
metadata and uploaded image files untouched. It also requires the deleted Chinese URL to return `404` or
`410` before the formal content repository is updated.

## Pending synchronization queue (phase B1)

`queue-init` is the only migration entry point. It accepts one exact commit
SHA, requires that commit to be the clean canonical repository `HEAD`, and
atomically creates `published`, `pending`, and the schema-versioned queue-state
ref. It never guesses a published baseline. Repeating initialization with the
same published commit is idempotent.

`queue-upload` reuses the existing delivery allowlist and Bundle validation,
but stops after fast content validation and canonical candidate creation. It
does not install dependencies, run a website build, create a release, switch
`current`, restart a service, or perform a production health check. The Bundle
head must equal the current source pending commit or directly fast-forward it;
an older or divergent upload fails with `PENDING_BASE_MISMATCH`. The first
upload is accepted only when its source base has the same managed content and
upload trees as canonical published content.

Accepted state is committed with one `git update-ref --stdin` transaction:
queue metadata, source pending, canonical pending, the upload transaction, and
the transaction's source/content retention refs either all advance or none do.
Earlier queued uploads become `COALESCED` when a newer source commit includes
them. Uploading the current pending source is idempotent and does not
unnecessarily coalesce another queued transaction. Deterministic validation
failures are retained as `FAILED` without advancing pending; a repeated
transaction with the same Bundle returns that retained state, while a different
Bundle hash returns `TRANSACTION_BUNDLE_MISMATCH`.

All content mutations share the controller lock. Once `queue-init` has created
the queue namespace, legacy synchronous `publish` and `delete` mutations fail
with `QUEUE_MODE_ACTIVE`; their repository-swap implementation cannot preserve
pending queue history. Before explicit initialization, the existing desktop
synchronous path is unchanged. Merely installing B2 code or inactive units does
not initialize the queue and therefore does not change that compatibility path.

`pending-status` reports the canonical published, pending, and optional syncing
commit; whether pending differs; the number and latest ID of accepted uploads;
server time; the active, last, and blocked sync identities; and the next fixed
UTC half-hour boundary. `sync_timer_active` is true only when systemd reports
the timer both enabled and active, so an isolated or not-yet-activated host does
not pretend scheduling is live. Upload transaction schema 1
retains `transactionId`, both source and canonical commits, status, queue time,
coalescing target, sync transaction and release IDs, `publishedAt`,
retryability, error code, message, content type, and stable ID. Legacy B1 blobs
without `siteCommit` or `publishedAt` remain readable and can be migrated by an
idempotent `queue-init` after the current release markers are verified.

## Queued synchronization runner (phase B2)

Both the systemd service and a manual request call the same command and state
machine:

```bash
/usr/local/sbin/algae-contentctl sync-pending --trigger scheduled --json
/usr/local/sbin/algae-contentctl sync-pending --trigger manual --json
```

A dedicated root-controlled `flock` spans the complete synchronization. A
second scheduled or manual caller never starts another build: once the first
caller has persisted `sync-active`, the second receives the existing sync ID,
stage, and stable JSON. A separate short-held content mutation lock protects
only snapshot and final ref transactions, so a validated upload may advance
pending while the build runs.

At start, one `git update-ref --stdin` transaction verifies published, pending,
source pending, queue metadata, blocked state, and the absence of an active
sync. It creates the sync transaction and active index, freezes pending into
canonical and source syncing refs, records the rollback release links, marks
the latest included upload `SYNCING`, and creates immutable member refs for all
included uploads. The build reads only those syncing commits. If pending moves
from B to C during the build, a successful transaction publishes B and leaves C
pending for the next fixed cycle.

The runner reuses the legacy source preparation, dependency installation,
content validation, Next.js build, release creation, atomic `current` switch,
service restart, health check, and rollback functions. It also verifies that
`current` and `previous` still match the pointers captured with the snapshot
before switching. A successful health check writes a transaction-specific
marker into the release. Only then does one final ref transaction advance
canonical and source published to syncing, remove both syncing refs, mark the
sync `PUBLISHED`, move `sync-last`, clear `sync-active`, associate all frozen
uploads with the sync/release/time, and preserve any newer pending commit. The
latest frozen upload becomes `PUBLISHED`; earlier included uploads remain or
become `COALESCED`, never failed.

The schema exposes `scheduled`, `manual`, and `recovery` triggers and the stages
`CREATED`, `SNAPSHOTTING`, `PREPARING_SOURCE`, `PREPARING_DEPENDENCIES`, `CHECKING`,
`BUILDING`, `SWITCHING`, `VERIFYING`, `RECOVERING`, `PUBLISHED`,
`FAILED_RETRYABLE`, `FAILED_BLOCKED`, and `SKIPPED_NO_PENDING`. Transient source
or dependency failures are retryable for at most three automatic attempts,
with the next attempt starting at a later fixed cycle rather than sleeping in
one service invocation. Deterministic validation, build, switch, health,
permission, and integrity failures become blocked. The same blocked content
commit is returned without another scheduled build until pending advances or
an administrator explicitly uses `--retry-blocked` with a manual trigger.

An active transaction is recovered before selecting new pending. A pre-switch
crash cleans only transaction-owned incomplete candidates and rebuilds the same
fixed snapshot. A complete unswitched release is reused without rebuilding. A
switched release with a valid health marker is finalized idempotently; without
the marker it must pass a fresh service and live health check. Controlled blob,
ref, release-marker, or release-link disagreement fails closed and retains
active recovery evidence for an operator. A failed health check restores
`current` and `previous`, restarts the restored service, leaves published
unchanged, and records the blocked commit. Rollback failure retains the active
transaction, release, and root-only workspace for manual inspection.

`ops/systemd/algae-content-sync.timer` fixes the schedule to
`*-*-* *:00,30:00 UTC`, with `Persistent=true`, `AccuracySec=1s`, and
`RandomizedDelaySec=0`. UTC is explicit, and JSON timestamps use ISO 8601 `Z`.
The paired root oneshot service has a ten-minute upper bound and calls only the
scheduled form of the shared runner. The installer copies both units and runs
`daemon-reload`, but deliberately does not enable or start the timer.

## Installation

Review `sudoers.example` and the fixed paths before installation. On the server,
as root:

```bash
cd /path/to/algae-atlas/ops/algae-contentctl
./install.sh --dry-run
sudo ./install.sh
sudo ./install.sh --install-sudoers
```

On a new installation, `install.sh` shallow-clones the fresh GitHub `main`,
copies only `content/` and `public/images/uploads/` (ordinary regular files),
and commits them into an independent root-owned repository with no Git remote.
If the site has no uploads, the controlled uploads directory receives a
`.gitkeep`. An existing repository is never overwritten by the installer. The
controller can transactionally replace the old three- or four-file placeholder
repository from the same fresh-main snapshot on its first publish or delete;
the Bundle base tree is never used as the source for that bootstrap. The
installer also creates `content/authors`, `content/media`, and `content/records`,
makes the incoming directory owned by `ubuntu`, and installs the controller as
`/usr/local/sbin/algae-contentctl`. It also installs the service and timer files
with mode `0644` and reloads systemd. It does not enable or start the timer,
initialize queue refs, deploy content, or change the active release.

The supplied sudoers entry gives only `ubuntu` the listed fixed legacy and queue
invocations and uses `NOSETENV`. It deliberately excludes `queue-init`, the
scheduled trigger, and `--retry-blocked`. The argument wildcards are necessary
for transaction IDs and stable IDs; the script rejects extra arguments, unsafe
paths, unsupported types, shell metacharacters, symlinks, writable uploads, and
paths outside the incoming job directory.

### Production activation and rollback draft

Phase B2 has not been activated in production. Activation must wait until B3
has shipped the queue-upload workflow, pending status UI, manual sync action,
and installer acceptance. At that point an operator should take a content-repo
ref backup and record `current`/`previous`, install and verify the controller
and units, verify the exact current release markers, run `queue-init` once with
the current canonical content commit, exercise one reviewed manual sync, and
only then enable the timer. `systemctl list-timers` and `pending-status` must
both confirm the expected UTC schedule and active flag.

Operational rollback starts by disabling and stopping the timer. An active
sync must be inspected with `sync-status`; controlled refs or retained release
evidence must not be deleted to force progress. Restore the previously reviewed
controller and unit files, run `daemon-reload`, and restore release links only
through the documented release recovery procedure. Queue initialization is a
protocol migration: after it exists, legacy `publish/delete` intentionally
remain disabled. Returning the desktop to the legacy path therefore requires a
separate coordinated migration from backed-up refs and is not accomplished by
disabling the timer alone.

## JSON contract

`status --json` includes `publishProtocolVersion: 1` and
`queueProtocolVersion: 1`; queued status responses also identify sync protocol
version 1. The current desktop checks the publish field before
creating a local publication commit. The queue field advertises the installed
B1/B2 server contract; the desktop does not call it yet. Missing or older required
protocol versions are incompatible and are not treated as transient network
failures.

Every direct publish uses one 32-character lowercase hexadecimal transaction
ID from local commit creation through upload, controller invocation, status
queries, retries, and the final result. The incoming delivery is first uploaded
as `.partial-<transaction-id>` and atomically renamed only after its remote
SHA-256 matches. Repeated publish calls with the same ID return the retained
running or successful state. A retryable pre-switch failure can advance the
same transaction up to three total controller attempts; deterministic failures
and any transaction that completed the release switch are not retried.

`sync-status [<sync-id>] --json` returns stable snake-case fields for the
active, last, or named synchronization: stage, trigger, exact content/source and
site commits, release identity, ISO timestamps, elapsed milliseconds, attempt
and maximum attempts, retryable/blocked flags, error code, recovery flag,
switch state, and health verification. `SKIPPED_NO_PENDING` is persisted as a
real terminal transaction and never starts dependency or build commands.

The controller writes each transaction to a mode `0600` JSON file using a
same-directory temporary file and atomic rename. A mode `0600` JSONL event file
records timestamp, transaction, stage, attempt, duration, status, and error
code. Both live under the root-owned mode `0700` publish-state directory and are
retained for 30 days. `publish-status` returns the retained JSON without
starting work, including the current stage, elapsed time, retryability, switch
state, release identity, source method, and per-stage durations. It first checks
the queue transaction namespace and then falls back to legacy publish-state
JSON, so one fixed query command supports both schemas without invalidating
saved synchronous transactions.

Successful publish responses include stable keys such as:

```json
{"ok":true,"action":"publish","transactionId":"...","status":"succeeded","stage":"succeeded","attempt":1,"retryable":false,"switchCompleted":true,"releaseId":"...","releaseSha":"...","contentSha":"...","siteCommit":"...","contentType":"science-article","stableId":"example-id","url":"https://sycszy.icu/zh/insights/example-id","message":"Published successfully"}
```

Failures always have `ok: false`, a stable `code`, a concise `message`, and a
bounded `logTail` for build-related errors. Publish failures additionally retain
`errorCode`, `retryable`, `failedStage`, `transactionId`, `userMessage`, and a
short `technicalSummary`. The controller writes no progress logs to stdout, so
callers can parse one JSON object per invocation.

## Tests

The test script creates an isolated temporary content repository, bundle,
mock website source and GitHub API archive, mock `npm`, mock service manager,
and mock health client. It covers archive-first acquisition with one bounded
clone fallback; transaction state queries; atomic state writes; corrupt state;
retry ceilings; running, failed, and successful idempotency; and API, tree, and
tarball failures including executable modes, symlink entries, and path
traversal attempts. It does not touch `/srv/algae-atlas` or
`/srv/algae-content`.

The focused queue suite creates an independent temporary source history,
canonical repository, Git Bundles, and injected Git wrapper. It covers queue
initialization, fast-forward and divergent histories, equal-pending idempotency,
`COALESCED` transactions, duplicate transaction identities, retained failures,
corrupt state, missing refs, an injected atomic ref-transaction failure, shared
lock ownership, and the absence of build, release, service, network, and
`current` side effects. The main controller suite invokes it automatically.

The synchronization suite builds an isolated release chain with mock npm,
systemd, and health commands. Its 35 required scenarios cover the fixed
pending/source snapshot, build-period uploads, upload/release association,
scheduled/manual concurrency, transient retries, blocked commits, new-pending
unblock, explicit retry, health rollback, missing trusted site commit, four
crash boundaries, live-health recovery, corrupt active state, and proof that no
production path or latest-main source is used. The systemd suite checks all
fixed directives on every platform and, when `systemd-analyze` is available,
verifies four exact half-hour calendar events and both units.

```bash
bash ops/algae-contentctl/tests/test-algae-contentctl.sh
bash ops/algae-contentctl/tests/test-content-queue.sh
bash ops/algae-contentctl/tests/test-content-sync.sh
bash ops/algae-contentctl/tests/test-content-sync-systemd.sh
```
