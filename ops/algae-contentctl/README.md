# algae-contentctl

`algae-contentctl` is the fixed, root-owned server-side endpoint for direct
content publication. It has no generic shell, Git, systemd, or filesystem
subcommand. The workbench calls only these JSON commands:

```bash
sudo -n /usr/local/sbin/algae-contentctl status --json
sudo -n /usr/local/sbin/algae-contentctl list --json
sudo -n /usr/local/sbin/algae-contentctl publish \
  --bundle /home/ubuntu/algae-content-workbench/incoming/<job-id> --json
sudo -n /usr/local/sbin/algae-contentctl delete \
  --type science-article --id example-id --json
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
/srv/algae-content/site-source-cache          root-only verified GitHub source snapshots
/home/ubuntu/algae-content-workbench/incoming/<job-id>
/srv/algae-atlas/releases/<release-id>         fresh website builds
/srv/algae-atlas/current                       active release symlink
/srv/algae-atlas/previous                      rollback release symlink
```

The formal repository owns both the `content/` tree and the narrowly scoped
`public/images/uploads/` blob tree referenced by media metadata. Image paths
must have a four-digit year, a real two-digit month, a stable lowercase ID, and
an approved image suffix. Bundle entries must remain ordinary Git blobs; links,
traversal, and every other `public/` path are rejected.

The controller never reads `/srv/algae-atlas/source` or uses the active
`current` release as source. Each publish or deletion first queries the official
GitHub commit API for the branch's exact commit and tree SHA, then checks a
root-only cache keyed by both values. A cache hit is accepted only after its
metadata, clean Git state, branch, tree SHA, and managed content trees are
revalidated; the copied transaction source is validated again before use. A
cache miss retains the bounded shallow-clone attempts and exact GitHub archive
fallback. Verified sources are installed into the cache through a
same-directory atomic rename, while invalid entries are quarantined inside the
current root-only transaction. HTTP requests retain bounded retries and
timeouts. The controller rejects unsafe archive entries and initializes a
local Git snapshot only after its written tree, including executable modes,
matches the API tree SHA. The release SHA remains the real GitHub commit SHA;
a local archive snapshot commit is merely a clean build workspace whose tree
is rechecked before use.

The controller reuses that exact prepared tree for both the candidate bootstrap
and website build. It overlays a candidate `content/` directory, runs
`npm ci --include=dev`, `npm run content:validate -- --json`, and
`npm run build:next` with `CONTENT_REPOSITORY_SOURCE=records`, synchronizes
candidate uploads into the fresh build, and then creates a release. Full source
type and lint checks remain pull-request gates; the production transaction
validates the changing content repository and performs the production Next.js
build. Only after the site restart, loopback health check, and exact published
URL check succeed does it replace the formal content repository. Any failure
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
`/usr/local/sbin/algae-contentctl`. It does not deploy content or change the
active release.

The supplied sudoers entry gives only `ubuntu` the four fixed invocations above
and uses `NOSETENV`. The argument wildcards are necessary for job IDs and
stable IDs; the script rejects extra arguments, unsafe paths, unsupported
types, shell metacharacters, symlinks, writable uploads, and paths outside the
incoming job directory.

## JSON contract

Successful publish responses include stable keys such as:

```json
{"ok":true,"action":"publish","contentType":"science-article","stableId":"example-id","url":"https://sycszy.icu/zh/insights/example-id","releaseSha":"...","contentSha":"...","message":"Published successfully"}
```

Failures always have `ok: false`, a stable `code`, a concise `message`, and a
bounded `logTail` for build-related errors. The controller writes no progress
logs to stdout, so callers can parse one JSON object per invocation.

## Tests

The test script creates an isolated temporary content repository, bundle,
mock website source and GitHub API archive, mock `npm`, mock service manager,
and mock health client. It covers clone-failure fallback plus API, tree, and
tarball failures, including executable modes, symlink entries, and path
traversal attempts, without touching `/srv/algae-atlas` or
`/srv/algae-content`.

```bash
bash ops/algae-contentctl/tests/test-algae-contentctl.sh
```
