#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077
# The desktop test harness may put Windows' FIND.EXE before the POSIX tools.
export PATH="/usr/bin:$PATH"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_TERMINAL_PROMPT=0

readonly TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/algae-contentctl-test.XXXXXX")"
readonly CONTROLLER="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)/algae-contentctl"
readonly BOOTSTRAP_HELPER="$(dirname -- "$CONTROLLER")/bootstrap.sh"
readonly GIT_BIN="$(command -v git)"
readonly NODE_BIN="$(command -v node || true)"
readonly REAL_TIMEOUT_BIN="$(command -v timeout || true)"
readonly TAR_BIN="$(command -v tar || true)"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

[[ -x "$GIT_BIN" ]] || { printf 'git is required\n' >&2; exit 1; }
[[ -n "$NODE_BIN" ]] || { printf 'node is required\n' >&2; exit 1; }
[[ -x "$REAL_TIMEOUT_BIN" ]] || { printf 'timeout is required\n' >&2; exit 1; }
[[ -x "$TAR_BIN" ]] || { printf 'tar is required\n' >&2; exit 1; }

assert_json_field() {
  local json=$1
  local expected=$2
  "$NODE_BIN" -e '
const [text, key, expected] = process.argv.slice(1);
const actual = JSON.parse(text)[key];
if (String(actual) !== expected) process.exit(1);
' "$json" "$expected" "${3:-}" || {
    printf 'JSON assertion failed: key=%s expected=%s\n%s\n' "$expected" "${3:-}" "$json" >&2
    exit 1
  }
}

make_executable() {
  chmod 0755 -- "$1"
}

assert_bootstrap_sentinels() {
  local root=$1
  local path
  for path in \
    content/authors/bootstrap-author.json \
    content/media/bootstrap-media.json \
    content/records/science-article/existing-id/record.json \
    content/records/science-article/existing-id/zh.md \
    public/images/uploads/2025/12/bootstrap-image.webp; do
    [[ -f "$root/$path" ]] || { printf 'fresh-main sentinel is missing: %s\n' "$path" >&2; exit 1; }
    cmp -s -- "$SITE_SOURCE/$path" "$root/$path" || { printf 'fresh-main sentinel changed: %s\n' "$path" >&2; exit 1; }
  done
}

assert_release_readable() {
  local release=$1
  local mode
  if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]]; then
    grep -Eq -- '-R a\+rX -- .*/site/releases/\.candidate-' "$MOCK_CHMOD_LOG" || {
      printf 'controller did not normalize permissions on the complete release tree\n' >&2
      exit 1
    }
    [[ -r "$release/package.json" && -r "$release/.env.production.local" && -x "$release" && -r "$release/.next/mock-build" ]] || {
      printf 'release files are not readable through the test runtime\n' >&2
      exit 1
    }
    return 0
  fi
  mode=$(stat -c '%a' -- "$release")
  (( (8#$mode & 0005) == 0005 )) || { printf 'release root is not readable and traversable by the service user\n' >&2; exit 1; }
  mode=$(stat -c '%a' -- "$release/package.json")
  (( (8#$mode & 0004) == 0004 )) || { printf 'release source file is not readable by the service user\n' >&2; exit 1; }
  mode=$(stat -c '%a' -- "$release/.env.production.local")
  (( (8#$mode & 0004) == 0004 )) || { printf 'release runtime environment is not readable by the service user\n' >&2; exit 1; }
  mode=$(stat -c '%a' -- "$release/.next")
  (( (8#$mode & 0005) == 0005 )) || { printf 'release build directory is not readable and traversable by the service user\n' >&2; exit 1; }
  mode=$(stat -c '%a' -- "$release/.next/mock-build")
  (( (8#$mode & 0004) == 0004 )) || { printf 'release build output is not readable by the service user\n' >&2; exit 1; }
}

git_setup() {
  local repository=$1
  mkdir -p -- "$repository"
  "$GIT_BIN" init -q --initial-branch=main "$repository"
  "$GIT_BIN" -C "$repository" config user.name "Test User"
  "$GIT_BIN" -C "$repository" config user.email "test@example.invalid"
  "$GIT_BIN" -C "$repository" config core.autocrlf false
}

write_media_metadata() {
  local repository=$1
  local media_id=$2
  local file_path=$3
  local actual_path=${4:-"$repository/$file_path"}
  local sha256 bytes
  sha256=$(sha256sum -- "$actual_path" | awk '{print $1}')
  bytes=$(stat -c '%s' -- "$actual_path")
  mkdir -p -- "$repository/content/media"
  printf '{"id":"%s","filePath":"%s","sha256":"%s","bytes":%s}\n' \
    "$media_id" "$file_path" "$sha256" "$bytes" > "$repository/content/media/$media_id.json"
}

mkdir -p -- "$TEST_ROOT/bin" "$TEST_ROOT/incoming/job-001" "$TEST_ROOT/incoming/job-002" "$TEST_ROOT/site"
readonly FORMAL_REPOSITORY="$TEST_ROOT/content-root/repository"
readonly SITE_SOURCE="$TEST_ROOT/site-source"
readonly INCOMING_JOB="$TEST_ROOT/incoming/job-001"
readonly UPDATE_JOB="$TEST_ROOT/incoming/job-002"

git_setup "$FORMAL_REPOSITORY"
mkdir -p -- "$FORMAL_REPOSITORY/content/authors" "$FORMAL_REPOSITORY/content/media" "$FORMAL_REPOSITORY/content/records"
touch "$FORMAL_REPOSITORY/content/authors/.gitkeep" "$FORMAL_REPOSITORY/content/media/.gitkeep" "$FORMAL_REPOSITORY/content/records/.gitkeep"
"$GIT_BIN" -C "$FORMAL_REPOSITORY" add content
"$GIT_BIN" -C "$FORMAL_REPOSITORY" commit -q -m "content: initialize repository"

git_setup "$SITE_SOURCE"
mkdir -p -- "$SITE_SOURCE/content"
printf '{"name":"mock-site","version":"1.0.0","private":true}\n' > "$SITE_SOURCE/package.json"
printf '{"name":"mock-site","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"mock-site","version":"1.0.0"}}}\n' > "$SITE_SOURCE/package-lock.json"
printf 'main source\n' > "$SITE_SOURCE/README.md"
"$GIT_BIN" -C "$SITE_SOURCE" add .
"$GIT_BIN" -C "$SITE_SOURCE" commit -q -m "site: initial source"
mkdir -p -- \
  "$SITE_SOURCE/content/authors" \
  "$SITE_SOURCE/content/media" \
  "$SITE_SOURCE/content/records/science-article/existing-id" \
  "$SITE_SOURCE/public/images/uploads/2025/12" \
  "$SITE_SOURCE/scripts"
printf '%s\n' '{"id":"bootstrap-author","name":"Fresh Main Author"}' > "$SITE_SOURCE/content/authors/bootstrap-author.json"
printf '%s\n' '{"id":"bootstrap-media","filePath":"public/images/uploads/2025/12/bootstrap-image.webp"}' > "$SITE_SOURCE/content/media/bootstrap-media.json"
printf '%s\n' '{"schemaVersion":1,"id":"existing-id","type":"science-article","updatedAt":"2025-12-01T00:00:00Z","media":[],"shared":{"coverMediaId":"shared-image"},"locales":{"zh":{"title":"Existing fresh-main article","bodyFile":"zh.md"},"en":{"missing":true}}}' > "$SITE_SOURCE/content/records/science-article/existing-id/record.json"
printf 'Existing fresh-main body\n' > "$SITE_SOURCE/content/records/science-article/existing-id/zh.md"
printf 'fresh-main-image\n' > "$SITE_SOURCE/public/images/uploads/2025/12/bootstrap-image.webp"
printf 'shared-existing-image\n' > "$SITE_SOURCE/public/images/uploads/2025/12/shared-image.webp"
write_media_metadata "$SITE_SOURCE" shared-image \
  public/images/uploads/2025/12/shared-image.webp
printf '#!/usr/bin/env bash\nprintf "fallback executable probe\\n"\n' > "$SITE_SOURCE/scripts/fallback-executable.sh"
chmod 0755 -- "$SITE_SOURCE/scripts/fallback-executable.sh"
"$GIT_BIN" -C "$SITE_SOURCE" add .
"$GIT_BIN" -C "$SITE_SOURCE" update-index --chmod=+x -- scripts/fallback-executable.sh
"$GIT_BIN" -C "$SITE_SOURCE" commit -q -m "content: add existing main content"
[[ $("$GIT_BIN" -C "$SITE_SOURCE" ls-files -s scripts/fallback-executable.sh) == 100755\ * ]] || { printf 'mock site executable mode was not recorded\n' >&2; exit 1; }
site_source_sha=$("$GIT_BIN" -C "$SITE_SOURCE" rev-parse HEAD)
site_source_tree_sha=$("$GIT_BIN" -C "$SITE_SOURCE" rev-parse 'HEAD^{tree}')
fallback_site_source_sha='1111111111111111111111111111111111111111'
site_source_archive="$TEST_ROOT/site-source.tar.gz"
"$GIT_BIN" -C "$SITE_SOURCE" archive --format=tar.gz \
  --prefix="linsiyuan523-star-algae-atlas-${fallback_site_source_sha:0:7}/" \
  --output="$site_source_archive" HEAD

unsafe_symlink_source="$TEST_ROOT/unsafe-symlink-source"
unsafe_symlink_archive="$TEST_ROOT/unsafe-symlink-source.tar.gz"
git_setup "$unsafe_symlink_source"
unsafe_symlink_blob=$(printf '../../../../archive-symlink-target' | "$GIT_BIN" -C "$unsafe_symlink_source" hash-object -w --stdin)
"$GIT_BIN" -C "$unsafe_symlink_source" update-index --add --cacheinfo \
  "120000,$unsafe_symlink_blob,unsafe-link"
"$GIT_BIN" -C "$unsafe_symlink_source" commit -q -m "test: unsafe symlink archive"
"$GIT_BIN" -C "$unsafe_symlink_source" archive --format=tar.gz \
  --prefix="linsiyuan523-star-algae-atlas-${fallback_site_source_sha:0:7}/" \
  --output="$unsafe_symlink_archive" HEAD

unsafe_traversal_input="$TEST_ROOT/unsafe-traversal-input"
unsafe_traversal_archive="$TEST_ROOT/unsafe-traversal-source.tar.gz"
mkdir -p -- "$unsafe_traversal_input"
printf 'must remain inside the archive\n' > "$unsafe_traversal_input/payload"
"$TAR_BIN" --create --gzip --file "$unsafe_traversal_archive" \
  --transform="s|^payload$|linsiyuan523-star-algae-atlas-${fallback_site_source_sha:0:7}/../../../../archive-path-traversal-created|" \
  --directory "$unsafe_traversal_input" payload
if site_source_native=$(cd "$SITE_SOURCE" && pwd -W 2>/dev/null); then
  site_source_url="file:///$site_source_native"
else
  site_source_url="file://$SITE_SOURCE"
fi

# shellcheck source=../bootstrap.sh
source "$BOOTSTRAP_HELPER"
mkdir -p -- "$TEST_ROOT/bootstrap-root"
bootstrap_repository="$TEST_ROOT/bootstrap-root/repository"
bootstrap_sha=$(algae_bootstrap_content_repository \
  "$GIT_BIN" "$site_source_url" main "$bootstrap_repository" "$TEST_ROOT/bootstrap-root")
[[ "$bootstrap_sha" == "$site_source_sha" ]] || { printf 'bootstrap did not import the latest site source commit\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$bootstrap_repository" rev-list --count HEAD) == "1" ]] || { printf 'bootstrap repository must have one independent commit\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$bootstrap_repository" log -1 --format=%s) == "content: bootstrap from site main $site_source_sha" ]] || { printf 'bootstrap provenance commit is missing\n' >&2; exit 1; }
[[ -z "$("$GIT_BIN" -C "$bootstrap_repository" remote)" ]] || { printf 'bootstrap repository unexpectedly has a Git remote\n' >&2; exit 1; }
assert_bootstrap_sentinels "$bootstrap_repository"

cat > "$TEST_ROOT/bin/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_NPM_LOG:?}"
if [[ "${MOCK_NPM_FAIL:-0}" == "1" ]]; then
  exit 42
fi
case "$1 ${2:-}" in
  ci\ --include=dev) exit 0 ;;
  run\ check) exit 0 ;;
  run\ build:next) mkdir -p .next; printf 'mock build\n' > .next/mock-build; exit 0 ;;
  *) exit 2 ;;
esac
MOCK_NPM
make_executable "$TEST_ROOT/bin/npm"

cat > "$TEST_ROOT/bin/git" <<'MOCK_GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_GIT_LOG:?}"
if [[ "${MOCK_SITE_CLONE_FAIL:-0}" == "1" && " $* " == *" clone "* && " $* " == *" --depth 1 "* ]]; then
  printf 'mock shallow clone failure\n' >&2
  exit 128
fi
exec "${MOCK_REAL_GIT_BIN:?}" "$@"
MOCK_GIT
make_executable "$TEST_ROOT/bin/git"

cat > "$TEST_ROOT/bin/timeout" <<'MOCK_TIMEOUT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_TIMEOUT_LOG:?}"
exec "${MOCK_REAL_TIMEOUT_BIN:?}" "$@"
MOCK_TIMEOUT
make_executable "$TEST_ROOT/bin/timeout"

cat > "$TEST_ROOT/bin/chmod" <<'MOCK_CHMOD'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_CHMOD_LOG:?}"
exec /usr/bin/chmod "$@"
MOCK_CHMOD
make_executable "$TEST_ROOT/bin/chmod"

cat > "$TEST_ROOT/bin/systemctl" <<'MOCK_SYSTEMCTL'
#!/usr/bin/env bash
set -Eeuo pipefail
case "$1 ${2:-}" in
  restart\ *)
    if [[ -n "${MOCK_RESTART_COUNT_FILE:-}" ]]; then
      restart_count=0
      [[ ! -f "$MOCK_RESTART_COUNT_FILE" ]] || IFS= read -r restart_count < "$MOCK_RESTART_COUNT_FILE"
      printf '%s\n' "$((restart_count + 1))" > "$MOCK_RESTART_COUNT_FILE"
      if [[ "${MOCK_ROLLBACK_RESTART_FAIL:-0}" == "1" && "$restart_count" -ge 1 ]]; then
        exit 55
      fi
    fi
    : > "${MOCK_SERVICE_STATE:?}"
    exit 0
    ;;
  is-active\ --quiet) [[ -f "${MOCK_SERVICE_STATE:?}" ]]; exit ;;
  *) exit 2 ;;
esac
MOCK_SYSTEMCTL
make_executable "$TEST_ROOT/bin/systemctl"

cat > "$TEST_ROOT/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_CURL_LOG:?}"
url="${@: -1}"
output=""
previous=""
for argument in "$@"; do
  if [[ "$previous" == "--output" ]]; then
    output=$argument
  fi
  previous=$argument
done
if [[ "$url" == */commits/main ]]; then
  [[ "${MOCK_SITE_API_FAIL:-0}" != "1" ]] || exit 22
  [[ -n "$output" && "$output" != "/dev/null" ]]
  tree_sha="${MOCK_SITE_TREE_SHA:?}"
  if [[ "${MOCK_SITE_TREE_MISMATCH:-0}" == "1" ]]; then
    tree_sha='2222222222222222222222222222222222222222'
  fi
  printf '{"sha":"%s","commit":{"tree":{"sha":"%s"}}}\n' \
    "${MOCK_SITE_SOURCE_SHA:?}" "$tree_sha" > "$output"
  exit 0
fi
if [[ "$url" == */tarball/* ]]; then
  [[ "${MOCK_SITE_TARBALL_FAIL:-0}" != "1" ]] || exit 22
  [[ "$url" == */tarball/"${MOCK_SITE_SOURCE_SHA:?}" ]]
  [[ -n "$output" && "$output" != "/dev/null" ]]
  cp -- "${MOCK_SITE_ARCHIVE:?}" "$output"
  exit 0
fi
if [[ "$*" == *"--write-out"* ]]; then
  if [[ "${MOCK_DELETE_URL_200:-0}" == "1" && "$url" == */zh/insights/example-id ]]; then
    printf '200'
  elif [[ "$url" == */zh/insights/example-id ]]; then
    printf '404'
  else
    printf '200'
  fi
else
  [[ "${MOCK_HEALTH_FAIL:-0}" != "1" ]] || exit 22
  if [[ "${MOCK_PUBLISH_URL_404:-0}" == "1" && "$url" == */zh/insights/example-id ]]; then
    exit 22
  fi
  printf 'healthy\n'
fi
exit 0
MOCK_CURL
make_executable "$TEST_ROOT/bin/curl"

export MOCK_NPM_LOG="$TEST_ROOT/npm.log"
export MOCK_CHMOD_LOG="$TEST_ROOT/chmod.log"
export MOCK_GIT_LOG="$TEST_ROOT/git.log"
export MOCK_CURL_LOG="$TEST_ROOT/curl.log"
export MOCK_TIMEOUT_LOG="$TEST_ROOT/timeout.log"
export MOCK_SERVICE_STATE="$TEST_ROOT/service-active"

git_setup "$TEST_ROOT/workbench-source"
mkdir -p -- "$TEST_ROOT/workbench-source/content/authors" "$TEST_ROOT/workbench-source/content/media" "$TEST_ROOT/workbench-source/content/records"
touch "$TEST_ROOT/workbench-source/content/authors/.gitkeep" "$TEST_ROOT/workbench-source/content/media/.gitkeep" "$TEST_ROOT/workbench-source/content/records/.gitkeep"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add content
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "site: base content"
mkdir -p -- "$TEST_ROOT/workbench-source/content/records/science-article/example-id" "$TEST_ROOT/workbench-source/public/images/uploads/2026/07"
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T00:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article v1","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v1\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'English body\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/en.md"
printf '%s\n' '{"id":"retry-ancestor-only","name":"Must not be materialized"}' > "$TEST_ROOT/workbench-source/content/authors/retry-ancestor-only.json"
printf 'image-v1\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  public/images/uploads/2026/07/example-image.webp
printf 'thumbnail-v1\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.thumbnail.webp"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
retry_base_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T00:30:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article v1","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
direct_job_id='0123456789abcdef0123456789abcdef'
branch="content/direct-$direct_job_id-example-id"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m main "$branch"

bundle_name="content-direct-$direct_job_id-example-id-v1.bundle"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" bundle create "$INCOMING_JOB/$bundle_name" "refs/heads/$branch" >/dev/null
bundle_sha=$(sha256sum "$INCOMING_JOB/$bundle_name" | awk '{print toupper($1)}')
bundle_size=$(stat -c '%s' "$INCOMING_JOB/$bundle_name")
cat > "$INCOMING_JOB/MANIFEST.txt" <<MANIFEST
FormatVersion=1
Branch=$branch
HeadCommit=$head_sha
BaseCommit=$retry_base_sha
BundleFile=$bundle_name
BundleSizeBytes=$bundle_size
BundleSha256=$bundle_sha
History=complete
ImportBranch=import/content-direct-$direct_job_id-example-id
ChangedFileCount=1
Artifacts=$bundle_name,$bundle_name.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
printf '%s  %s\n' "$bundle_sha" "$bundle_name" > "$INCOMING_JOB/$bundle_name.sha256.txt"
printf '%s\n' 'content/records/science-article/example-id/record.json' > "$INCOMING_JOB/CHANGED-FILES.txt"
printf '%s\n' 'handoff' > "$INCOMING_JOB/HANDOFF.md"
printf '%s\n' 'summary' > "$INCOMING_JOB/TEST-SUMMARY.txt"
printf '%s\n' 'import' > "$INCOMING_JOB/Import-Bundle.ps1"
printf '%s\n' 'wrapper' > "$INCOMING_JOB/Validate-Bundle.sh"
printf '%s\n' 'validator' > "$INCOMING_JOB/validate-bundle.mjs"

update_base_sha=$head_sha
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T01:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article v2","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v2\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-v2\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  public/images/uploads/2026/07/example-image.webp
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
update_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
direct_update_job_id='fedcba9876543210fedcba9876543210'
update_branch="content/direct-$direct_update_job_id-example-id"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$branch" "$update_branch"
update_bundle_name="content-direct-$direct_update_job_id-example-id-v1.bundle"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" bundle create "$UPDATE_JOB/$update_bundle_name" "refs/heads/$update_branch" >/dev/null
update_bundle_sha=$(sha256sum "$UPDATE_JOB/$update_bundle_name" | awk '{print toupper($1)}')
update_bundle_size=$(stat -c '%s' "$UPDATE_JOB/$update_bundle_name")
cat > "$UPDATE_JOB/MANIFEST.txt" <<MANIFEST
FormatVersion=1
Branch=$update_branch
HeadCommit=$update_head_sha
BaseCommit=$update_base_sha
BundleFile=$update_bundle_name
BundleSizeBytes=$update_bundle_size
BundleSha256=$update_bundle_sha
History=complete
ImportBranch=import/content-direct-$direct_update_job_id-example-id
ChangedFileCount=4
Artifacts=$update_bundle_name,$update_bundle_name.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
printf '%s  %s\n' "$update_bundle_sha" "$update_bundle_name" > "$UPDATE_JOB/$update_bundle_name.sha256.txt"
printf '%s\n' 'content/media/example-image.json' 'content/records/science-article/example-id/record.json' 'content/records/science-article/example-id/zh.md' 'public/images/uploads/2026/07/example-image.webp' > "$UPDATE_JOB/CHANGED-FILES.txt"
printf '%s\n' 'handoff' > "$UPDATE_JOB/HANDOFF.md"
printf '%s\n' 'summary' > "$UPDATE_JOB/TEST-SUMMARY.txt"
printf '%s\n' 'import' > "$UPDATE_JOB/Import-Bundle.ps1"
printf '%s\n' 'wrapper' > "$UPDATE_JOB/Validate-Bundle.sh"
printf '%s\n' 'validator' > "$UPDATE_JOB/validate-bundle.mjs"

make_additional_delivery() {
  local destination=$1
  local delivery_branch=$2
  local base_commit=$3
  local head_commit=$4
  shift 4
  local delivery_bundle="${delivery_branch//\//-}-v1.bundle"
  "$GIT_BIN" -C "$TEST_ROOT/workbench-source" bundle create "$destination/$delivery_bundle" "refs/heads/$delivery_branch" >/dev/null
  local delivery_sha delivery_size
  delivery_sha=$(sha256sum "$destination/$delivery_bundle" | awk '{print toupper($1)}')
  delivery_size=$(stat -c '%s' "$destination/$delivery_bundle")
  cat > "$destination/MANIFEST.txt" <<MANIFEST
FormatVersion=1
Branch=$delivery_branch
HeadCommit=$head_commit
BaseCommit=$base_commit
BundleFile=$delivery_bundle
BundleSizeBytes=$delivery_size
BundleSha256=$delivery_sha
History=complete
ImportBranch=import/${delivery_branch//\//-}
ChangedFileCount=$#
Artifacts=$delivery_bundle,$delivery_bundle.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
  printf '%s  %s\n' "$delivery_sha" "$delivery_bundle" > "$destination/$delivery_bundle.sha256.txt"
  printf '%s\n' "$@" | LC_ALL=C sort > "$destination/CHANGED-FILES.txt"
  printf '%s\n' 'handoff' > "$destination/HANDOFF.md"
  printf '%s\n' 'summary' > "$destination/TEST-SUMMARY.txt"
  printf '%s\n' 'import' > "$destination/Import-Bundle.ps1"
  printf '%s\n' 'wrapper' > "$destination/Validate-Bundle.sh"
  printf '%s\n' 'validator' > "$destination/validate-bundle.mjs"
}

readonly FAILURE_JOB="$TEST_ROOT/incoming/job-003"
readonly LEGACY_JOB="$TEST_ROOT/incoming/job-004"
readonly BAD_IMAGE_JOB="$TEST_ROOT/incoming/job-005"
readonly BAD_MODE_JOB="$TEST_ROOT/incoming/job-006"
readonly BAD_MEDIA_PATH_JOB="$TEST_ROOT/incoming/job-007"
readonly BAD_MEDIA_DIGEST_JOB="$TEST_ROOT/incoming/job-008"
readonly SHARED_MEDIA_JOB="$TEST_ROOT/incoming/job-009"
readonly OVERSIZED_SNAPSHOT_JOB="$TEST_ROOT/incoming/job-010"
mkdir -p -- \
  "$FAILURE_JOB" "$LEGACY_JOB" "$BAD_IMAGE_JOB" "$BAD_MODE_JOB" \
  "$BAD_MEDIA_PATH_JOB" "$BAD_MEDIA_DIGEST_JOB" "$SHARED_MEDIA_JOB" \
  "$OVERSIZED_SNAPSHOT_JOB"

failure_job_id='00112233445566778899aabbccddeeff'
failure_branch="content/direct-$failure_job_id-example-id"
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T02:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article v3","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v3\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-v3\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  public/images/uploads/2026/07/example-image.webp
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
failure_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$update_branch" "$failure_branch"
make_additional_delivery "$FAILURE_JOB" "$failure_branch" "$update_head_sha" "$failure_head_sha" \
  'content/media/example-image.json' \
  'content/records/science-article/example-id/record.json' \
  'content/records/science-article/example-id/zh.md' \
  'public/images/uploads/2026/07/example-image.webp'

legacy_branch='content/20260726-example-id'
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T03:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article legacy","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body legacy\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-legacy\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  public/images/uploads/2026/07/example-image.webp
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
legacy_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$failure_branch" "$legacy_branch"
make_additional_delivery "$LEGACY_JOB" "$legacy_branch" "$failure_head_sha" "$legacy_head_sha" \
  'content/media/example-image.json' \
  'content/records/science-article/example-id/record.json' \
  'content/records/science-article/example-id/zh.md' \
  'public/images/uploads/2026/07/example-image.webp'

bad_image_path='public/images/uploads/2026/13/example-image.webp'
bad_image_job_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
bad_image_branch="content/direct-$bad_image_job_id-example-id"
mkdir -p -- "$TEST_ROOT/workbench-source/public/images/uploads/2026/13"
printf 'invalid-month-image\n' > "$TEST_ROOT/workbench-source/$bad_image_path"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
bad_image_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$legacy_branch" "$bad_image_branch"
make_additional_delivery "$BAD_IMAGE_JOB" "$bad_image_branch" "$legacy_head_sha" "$bad_image_head_sha" "$bad_image_path"

bad_mode_job_id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
bad_mode_branch="content/direct-$bad_mode_job_id-example-id"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" update-index --chmod=+x -- \
  content/records/science-article/example-id/zh.md
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "test: executable Chinese snapshot body"
bad_mode_parent_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
[[ $("$GIT_BIN" -C "$TEST_ROOT/workbench-source" ls-tree "$bad_mode_parent_sha" -- content/records/science-article/example-id/zh.md) == 100755\ blob\ * ]] || {
  printf 'bad-mode fixture did not record executable Chinese content\n' >&2
  exit 1
}
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T04:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article bad mode","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
bad_mode_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$bad_image_branch" "$bad_mode_branch"
make_additional_delivery "$BAD_MODE_JOB" "$bad_mode_branch" "$bad_mode_parent_sha" "$bad_mode_head_sha" \
  'content/records/science-article/example-id/record.json'

bad_media_path_job_id='cccccccccccccccccccccccccccccccc'
bad_media_path_branch="content/direct-$bad_media_path_job_id-example-id"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" update-index --chmod=-x -- \
  content/records/science-article/example-id/zh.md
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  ../outside/example-image.webp \
  "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/media/example-image.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "test: invalid media snapshot path"
bad_media_path_parent_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
[[ $("$GIT_BIN" -C "$TEST_ROOT/workbench-source" ls-tree "$bad_media_path_parent_sha" -- content/records/science-article/example-id/zh.md) == 100644\ blob\ * ]] || {
  printf 'bad-media-path fixture did not restore regular Chinese content\n' >&2
  exit 1
}
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T05:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article bad media path","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
bad_media_path_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$bad_mode_branch" "$bad_media_path_branch"
make_additional_delivery "$BAD_MEDIA_PATH_JOB" "$bad_media_path_branch" "$bad_media_path_parent_sha" "$bad_media_path_head_sha" \
  'content/records/science-article/example-id/record.json'

bad_media_digest_job_id='ffffffffffffffffffffffffffffffff'
bad_media_digest_branch="content/direct-$bad_media_digest_job_id-example-id"
example_image_bytes=$(stat -c '%s' -- "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp")
printf '{"id":"example-image","filePath":"public/images/uploads/2026/07/example-image.webp","sha256":"%064d","bytes":%s}\n' \
  0 "$((example_image_bytes + 1))" > "$TEST_ROOT/workbench-source/content/media/example-image.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/media/example-image.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "test: mismatched media snapshot digest"
bad_media_digest_parent_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T05:10:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article bad media digest","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
bad_media_digest_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$bad_media_path_branch" "$bad_media_digest_branch"
make_additional_delivery "$BAD_MEDIA_DIGEST_JOB" "$bad_media_digest_branch" \
  "$bad_media_digest_parent_sha" "$bad_media_digest_head_sha" \
  'content/records/science-article/example-id/record.json'

shared_media_job_id='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
shared_media_branch="content/direct-$shared_media_job_id-example-id"
mkdir -p -- "$TEST_ROOT/workbench-source/public/images/uploads/2025/12"
printf 'shared-overwrite-image\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2025/12/shared-image.webp"
write_media_metadata "$TEST_ROOT/workbench-source" shared-image \
  public/images/uploads/2025/12/shared-image.webp
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T05:30:00Z","media":["shared-image"],"locales":{"zh":{"title":"Example algae article shared media","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- \
  content/media/shared-image.json content/records/science-article/example-id/record.json \
  public/images/uploads/2025/12/shared-image.webp
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "test: conflicting shared media snapshot"
shared_media_parent_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T05:31:00Z","media":["shared-image"],"locales":{"zh":{"title":"Example algae article shared media retry","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
shared_media_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$bad_media_digest_branch" "$shared_media_branch"
make_additional_delivery "$SHARED_MEDIA_JOB" "$shared_media_branch" "$shared_media_parent_sha" "$shared_media_head_sha" \
  'content/records/science-article/example-id/record.json'

oversized_snapshot_job_id='dddddddddddddddddddddddddddddddd'
oversized_snapshot_branch="content/direct-$oversized_snapshot_job_id-example-id"
write_media_metadata "$TEST_ROOT/workbench-source" example-image \
  public/images/uploads/2026/07/example-image.webp
"$NODE_BIN" -e 'require("fs").writeFileSync(process.argv[1], Buffer.alloc(4097, 120))' \
  "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T06:00:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article oversized parent","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- \
  content/media/example-image.json content/records/science-article/example-id/record.json \
  content/records/science-article/example-id/zh.md
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "test: oversized Chinese snapshot body"
oversized_snapshot_parent_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T06:01:00Z","media":["example-image"],"locales":{"zh":{"title":"Example algae article oversized retry","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add -- content/records/science-article/example-id/record.json
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
oversized_snapshot_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$shared_media_branch" "$oversized_snapshot_branch"
make_additional_delivery "$OVERSIZED_SNAPSHOT_JOB" "$oversized_snapshot_branch" \
  "$oversized_snapshot_parent_sha" "$oversized_snapshot_head_sha" \
  'content/records/science-article/example-id/record.json'

common_env=(
  ALGAE_CONTENTCTL_TESTING=1
  ALGAE_MAX_CONTENT_FILE_BYTES=4096
  ALGAE_CONTENT_ROOT="$TEST_ROOT/content-root"
  ALGAE_INCOMING_ROOT="$TEST_ROOT/incoming"
  ALGAE_SITE_ROOT="$TEST_ROOT/site"
  ALGAE_SITE_REPOSITORY_URL="$site_source_url"
  ALGAE_SITE_REPOSITORY_API_URL="https://api.github.invalid/repos/linsiyuan523-star/algae-atlas"
  ALGAE_GIT_BIN="$TEST_ROOT/bin/git"
  ALGAE_TIMEOUT_BIN="$TEST_ROOT/bin/timeout"
  ALGAE_NPM_BIN="$TEST_ROOT/bin/npm"
  ALGAE_CHMOD_BIN="$TEST_ROOT/bin/chmod"
  ALGAE_SYSTEMCTL_BIN="$TEST_ROOT/bin/systemctl"
  ALGAE_CURL_BIN="$TEST_ROOT/bin/curl"
  ALGAE_PUBLIC_BASE_URL="https://example.invalid"
  ALGAE_LOCAL_BASE_URL="http://127.0.0.1:3000"
  ALGAE_HEALTH_ATTEMPTS=1
  ALGAE_TEST_LINK_FILES=1
  MOCK_REAL_GIT_BIN="$GIT_BIN"
  MOCK_REAL_TIMEOUT_BIN="$REAL_TIMEOUT_BIN"
  MOCK_SITE_SOURCE_SHA="$fallback_site_source_sha"
  MOCK_SITE_TREE_SHA="$site_source_tree_sha"
  MOCK_SITE_ARCHIVE="$site_source_archive"
)

placeholder_head=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
placeholder_tree=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD^{tree})
if first_build_json=$(env MOCK_NPM_FAIL=1 "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$INCOMING_JOB" --json); then
  printf 'failing first build unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$first_build_json" ok false
assert_json_field "$first_build_json" action publish
assert_json_field "$first_build_json" code BUILD_FAILED
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$placeholder_head" ]] || { printf 'failed first build changed placeholder HEAD\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD^{tree}) == "$placeholder_tree" ]] || { printf 'failed first build changed placeholder tree\n' >&2; exit 1; }
[[ -z "$("$GIT_BIN" -C "$FORMAL_REPOSITORY" status --porcelain --untracked-files=all)" ]] || { printf 'failed first build dirtied the placeholder repository\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/content/authors/bootstrap-author.json" ]] || { printf 'failed first build installed fresh-main content\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/content/records/science-article/example-id" ]] || { printf 'failed first build installed bundle content\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'failed first build installed bundle image\n' >&2; exit 1; }
[[ ! -e "$TEST_ROOT/site/current" && ! -e "$TEST_ROOT/site/previous" ]] || { printf 'failed first build changed release markers\n' >&2; exit 1; }

: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
: > "$MOCK_TIMEOUT_LOG"
publish_json=$(env MOCK_SITE_CLONE_FAIL=1 "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$INCOMING_JOB" --json)
assert_json_field "$publish_json" ok true
assert_json_field "$publish_json" action publish
assert_json_field "$publish_json" stableId example-id
[[ -f "$TEST_ROOT/site/current" ]] || { printf 'current release marker missing\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" ]] || { printf 'formal content was not updated\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/content/records/science-article/example-id/zh.md" ]] || { printf 'formal Chinese body was not materialized from the retry snapshot\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/content/media/example-image.json" ]] || { printf 'formal media metadata was not materialized from the retry snapshot\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'formal image was not updated\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.thumbnail.webp" ]] || { printf 'formal thumbnail was not materialized from the retry snapshot\n' >&2; exit 1; }
grep -q 'Example body v1' "$FORMAL_REPOSITORY/content/records/science-article/example-id/zh.md"
grep -q 'image-v1' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp"
grep -q 'thumbnail-v1' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.thumbnail.webp"
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"
[[ ! -e "$FORMAL_REPOSITORY/content/authors/retry-ancestor-only.json" ]] || {
  printf 'successful retry materialized an unrelated ancestor path\n' >&2
  exit 1
}
[[ -z "$("$GIT_BIN" -C "$FORMAL_REPOSITORY" remote)" ]] || { printf 'formal content repository unexpectedly has a Git remote\n' >&2; exit 1; }
first_release=$(<"$TEST_ROOT/site/current")
[[ -f "$first_release/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'release image was not overlaid\n' >&2; exit 1; }
[[ $(<"$first_release/.env.production.local") == 'CONTENT_REPOSITORY_SOURCE=records' ]] || {
  printf 'release runtime did not select the records content source\n' >&2
  exit 1
}
assert_bootstrap_sentinels "$first_release"
[[ ! -e "$first_release/content/authors/retry-ancestor-only.json" ]] || {
  printf 'successful retry released an unrelated ancestor path\n' >&2
  exit 1
}
[[ $(<"$first_release/.release-sha") == "$fallback_site_source_sha" ]] || { printf 'fallback release did not preserve the GitHub API commit SHA\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$first_release" rev-parse 'HEAD^{tree}') == "$site_source_tree_sha" ]] || { printf 'fallback release did not preserve the API source tree\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$first_release" rev-parse HEAD) != "$fallback_site_source_sha" ]] || { printf 'fallback test did not exercise a synthetic local snapshot commit\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$first_release" ls-files -s scripts/fallback-executable.sh) == 100755\ * ]] || { printf 'fallback release did not preserve the executable tree mode\n' >&2; exit 1; }
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 2 ]] || { printf 'shallow clone fallback did not use two attempts\n' >&2; exit 1; }
grep -Fq -- "--signal=TERM --kill-after=10s 60s $TEST_ROOT/bin/git" "$MOCK_TIMEOUT_LOG" || { printf 'shallow clone attempts did not use the 60-second hard timeout\n' >&2; exit 1; }
grep -q -- '--connect-timeout 10 --max-time 90 --retry 2 --retry-delay 2 --retry-max-time 180' "$MOCK_CURL_LOG" || { printf 'GitHub fallback metadata request did not use bounded curl retries and timeouts\n' >&2; exit 1; }
grep -q -- '--connect-timeout 10 --max-time 900 --retry 2 --retry-delay 2 --retry-max-time 900' "$MOCK_CURL_LOG" || { printf 'GitHub fallback archive request did not allow a bounded slow download\n' >&2; exit 1; }
grep -Fq -- "--signal=TERM --kill-after=10s 180s $TEST_ROOT/bin/curl" "$MOCK_TIMEOUT_LOG" || { printf 'GitHub fallback metadata request did not have a hard total timeout\n' >&2; exit 1; }
grep -Fq -- "--signal=TERM --kill-after=10s 900s $TEST_ROOT/bin/curl" "$MOCK_TIMEOUT_LOG" || { printf 'GitHub fallback archive request did not have a hard total timeout\n' >&2; exit 1; }
grep -q -- "/tarball/$fallback_site_source_sha" "$MOCK_CURL_LOG" || { printf 'GitHub fallback did not request the exact API commit archive\n' >&2; exit 1; }
assert_release_readable "$first_release"

list_json=$(env "${common_env[@]}" bash "$CONTROLLER" list --json)
assert_json_field "$list_json" action list
assert_json_field "$list_json" count 2

status_json=$(env "${common_env[@]}" bash "$CONTROLLER" status --json)
assert_json_field "$status_json" action status
assert_json_field "$status_json" ready true

update_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$UPDATE_JOB" --json)
assert_json_field "$update_json" ok true
assert_json_field "$update_json" action publish
assert_json_field "$update_json" stableId example-id
grep -q 'v2' "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json"
grep -q 'image-v2' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp"
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

assert_site_source_failure() {
  local failure_flag=$1
  local expected_message=$2
  local formal_head_before
  local current_release_before
  local failure_json
  formal_head_before=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
  current_release_before=$(<"$TEST_ROOT/site/current")
  if failure_json=$(env MOCK_SITE_CLONE_FAIL=1 "$failure_flag=1" "${common_env[@]}" \
    bash "$CONTROLLER" delete --type science-article --id example-id --json); then
    printf '%s unexpectedly allowed a delete transaction\n' "$failure_flag" >&2
    exit 1
  fi
  assert_json_field "$failure_json" ok false
  assert_json_field "$failure_json" action delete
  assert_json_field "$failure_json" code SITE_SOURCE_FAILED
  assert_json_field "$failure_json" message "$expected_message"
  [[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$formal_head_before" ]] || { printf '%s changed formal content\n' "$failure_flag" >&2; exit 1; }
  [[ $(<"$TEST_ROOT/site/current") == "$current_release_before" ]] || { printf '%s changed the current release\n' "$failure_flag" >&2; exit 1; }
}

assert_site_source_failure MOCK_SITE_API_FAIL "Cannot query the GitHub main source metadata"
assert_site_source_failure MOCK_SITE_TREE_MISMATCH "GitHub main source archive tree does not match the API tree"
assert_site_source_failure MOCK_SITE_TARBALL_FAIL "Cannot download the exact GitHub main source archive"

assert_unsafe_site_archive_failure() {
  local label=$1
  local archive=$2
  local outside_path=$3
  local formal_head_before
  local current_release_before
  local failure_json
  [[ ! -e "$outside_path" && ! -L "$outside_path" ]] || { printf '%s outside path already exists\n' "$label" >&2; exit 1; }
  formal_head_before=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
  current_release_before=$(<"$TEST_ROOT/site/current")
  if failure_json=$(env MOCK_SITE_CLONE_FAIL=1 "${common_env[@]}" MOCK_SITE_ARCHIVE="$archive" \
    bash "$CONTROLLER" delete --type science-article --id example-id --json); then
    printf '%s archive unexpectedly allowed a delete transaction\n' "$label" >&2
    exit 1
  fi
  assert_json_field "$failure_json" ok false
  assert_json_field "$failure_json" action delete
  assert_json_field "$failure_json" code SITE_SOURCE_FAILED
  assert_json_field "$failure_json" message "GitHub main source archive is unsafe or invalid"
  [[ ! -e "$outside_path" && ! -L "$outside_path" ]] || { printf '%s archive created an outside path\n' "$label" >&2; exit 1; }
  [[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$formal_head_before" ]] || { printf '%s archive changed formal content\n' "$label" >&2; exit 1; }
  [[ $(<"$TEST_ROOT/site/current") == "$current_release_before" ]] || { printf '%s archive changed the current release\n' "$label" >&2; exit 1; }
}

assert_unsafe_site_archive_failure symlink "$unsafe_symlink_archive" "$TEST_ROOT/archive-symlink-target"
assert_unsafe_site_archive_failure path-traversal "$unsafe_traversal_archive" "$TEST_ROOT/archive-path-traversal-created"

current_before=$(<"$TEST_ROOT/site/current")
previous_before=$(<"$TEST_ROOT/site/previous")
record_before=$(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}')
image_before=$(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}')
if rollback_json=$(env MOCK_NPM_FAIL=1 "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$FAILURE_JOB" --json); then
  printf 'failing build unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$rollback_json" ok false
assert_json_field "$rollback_json" action publish
assert_json_field "$rollback_json" code BUILD_FAILED
current_after=$(<"$TEST_ROOT/site/current")
previous_after=$(<"$TEST_ROOT/site/previous")
record_after=$(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}')
image_after=$(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}')
[[ "$current_before" == "$current_after" ]] || { printf 'failed build changed current release\n' >&2; exit 1; }
[[ "$previous_before" == "$previous_after" ]] || { printf 'failed build changed previous release\n' >&2; exit 1; }
[[ "$record_before" == "$record_after" ]] || { printf 'failed build changed formal content\n' >&2; exit 1; }
[[ "$image_before" == "$image_after" ]] || { printf 'failed build changed formal image\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"
shopt -s nullglob
release_candidates=("$TEST_ROOT/site/releases"/.candidate-*)
shopt -u nullglob
[[ ${#release_candidates[@]} -eq 0 ]] || { printf 'failed build left release staging behind\n' >&2; exit 1; }

if health_json=$(env MOCK_HEALTH_FAIL=1 "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$FAILURE_JOB" --json); then
  printf 'failing health check unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$health_json" ok false
assert_json_field "$health_json" action publish
assert_json_field "$health_json" code HEALTH_CHECK_FAILED
current_after=$(<"$TEST_ROOT/site/current")
previous_after=$(<"$TEST_ROOT/site/previous")
record_after=$(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}')
image_after=$(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}')
[[ "$current_before" == "$current_after" ]] || { printf 'failed health check changed current release\n' >&2; exit 1; }
[[ "$previous_before" == "$previous_after" ]] || { printf 'failed health check changed previous release\n' >&2; exit 1; }
[[ "$record_before" == "$record_after" ]] || { printf 'failed health check changed formal content\n' >&2; exit 1; }
[[ "$image_before" == "$image_after" ]] || { printf 'failed health check changed formal image\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

if publish_url_json=$(env MOCK_PUBLISH_URL_404=1 "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$FAILURE_JOB" --json); then
  printf 'missing published URL unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$publish_url_json" ok false
assert_json_field "$publish_url_json" action publish
assert_json_field "$publish_url_json" code PUBLISH_VERIFICATION_FAILED
current_after=$(<"$TEST_ROOT/site/current")
previous_after=$(<"$TEST_ROOT/site/previous")
record_after=$(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}')
image_after=$(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}')
[[ "$current_before" == "$current_after" ]] || { printf 'failed publish URL check changed current release\n' >&2; exit 1; }
[[ "$previous_before" == "$previous_after" ]] || { printf 'failed publish URL check changed previous release\n' >&2; exit 1; }
[[ "$record_before" == "$record_after" ]] || { printf 'failed publish URL check changed formal content\n' >&2; exit 1; }
[[ "$image_before" == "$image_after" ]] || { printf 'failed publish URL check changed formal image\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

legacy_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$LEGACY_JOB" --json)
assert_json_field "$legacy_json" ok true
assert_json_field "$legacy_json" action publish
grep -q 'legacy' "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json"
grep -q 'image-legacy' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp"
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

if bad_image_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$BAD_IMAGE_JOB" --json); then
  printf 'invalid image path unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$bad_image_json" ok false
assert_json_field "$bad_image_json" action publish
assert_json_field "$bad_image_json" code FORBIDDEN_PATH

assert_snapshot_rejection() {
  local label=$1
  local delivery=$2
  local expected_code=$3
  local formal_head_before formal_tree_before current_release_before failure_json
  formal_head_before=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
  formal_tree_before=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse 'HEAD^{tree}')
  current_release_before=$(<"$TEST_ROOT/site/current")
  if failure_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$delivery" --json); then
    printf '%s snapshot unexpectedly published content\n' "$label" >&2
    exit 1
  fi
  assert_json_field "$failure_json" ok false
  assert_json_field "$failure_json" action publish
  assert_json_field "$failure_json" code "$expected_code"
  [[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$formal_head_before" ]] || {
    printf '%s snapshot rejection changed formal HEAD\n' "$label" >&2
    exit 1
  }
  [[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse 'HEAD^{tree}') == "$formal_tree_before" ]] || {
    printf '%s snapshot rejection changed formal tree\n' "$label" >&2
    exit 1
  }
  [[ -z "$("$GIT_BIN" -C "$FORMAL_REPOSITORY" status --porcelain --untracked-files=all)" ]] || {
    printf '%s snapshot rejection dirtied the formal repository\n' "$label" >&2
    exit 1
  }
  [[ $(<"$TEST_ROOT/site/current") == "$current_release_before" ]] || {
    printf '%s snapshot rejection changed the current release\n' "$label" >&2
    exit 1
  }
}

assert_snapshot_rejection executable-body "$BAD_MODE_JOB" INVALID_BUNDLE
assert_snapshot_rejection invalid-media-path "$BAD_MEDIA_PATH_JOB" INVALID_BUNDLE
assert_snapshot_rejection mismatched-media-digest "$BAD_MEDIA_DIGEST_JOB" INVALID_BUNDLE
assert_snapshot_rejection shared-media-conflict "$SHARED_MEDIA_JOB" INVALID_BUNDLE
assert_snapshot_rejection oversized-body "$OVERSIZED_SNAPSHOT_JOB" BUNDLE_TOO_LARGE

delete_head_before=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
current_before=$(<"$TEST_ROOT/site/current")
previous_before=$(<"$TEST_ROOT/site/previous")
record_before=$(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}')
image_before=$(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}')
if delete_url_json=$(env MOCK_DELETE_URL_200=1 "${common_env[@]}" bash "$CONTROLLER" delete --type science-article --id example-id --json); then
  printf 'available deleted URL unexpectedly deleted content\n' >&2
  exit 1
fi
assert_json_field "$delete_url_json" ok false
assert_json_field "$delete_url_json" action delete
assert_json_field "$delete_url_json" code DELETE_VERIFICATION_FAILED
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$delete_head_before" ]] || { printf 'failed delete URL check changed formal HEAD\n' >&2; exit 1; }
[[ $(<"$TEST_ROOT/site/current") == "$current_before" ]] || { printf 'failed delete URL check changed current release\n' >&2; exit 1; }
[[ $(<"$TEST_ROOT/site/previous") == "$previous_before" ]] || { printf 'failed delete URL check changed previous release\n' >&2; exit 1; }
[[ $(sha256sum "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" | awk '{print $1}') == "$record_before" ]] || { printf 'failed delete URL check changed formal content\n' >&2; exit 1; }
[[ $(sha256sum "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" | awk '{print $1}') == "$image_before" ]] || { printf 'failed delete URL check changed formal image\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

delete_json=$(env "${common_env[@]}" bash "$CONTROLLER" delete --type science-article --id example-id --json)
assert_json_field "$delete_json" ok true
assert_json_field "$delete_json" action delete
[[ ! -d "$FORMAL_REPOSITORY/content/records/science-article/example-id" ]] || { printf 'formal content was not deleted\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'delete removed a referenced image\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

if invalid_json=$(env "${common_env[@]}" bash "$CONTROLLER" delete --type 'science-article/evil' --id example-id --json); then
  printf 'invalid content type unexpectedly succeeded\n' >&2
  exit 1
fi
assert_json_field "$invalid_json" ok false
assert_json_field "$invalid_json" action delete
assert_json_field "$invalid_json" code INVALID_CONTENT_TYPE

if outside_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$TEST_ROOT" --json); then
  printf 'outside bundle path unexpectedly succeeded\n' >&2
  exit 1
fi
assert_json_field "$outside_json" ok false
assert_json_field "$outside_json" action publish
assert_json_field "$outside_json" code INVALID_BUNDLE_PATH

printf 'algae-contentctl mock tests: PASS\n'
