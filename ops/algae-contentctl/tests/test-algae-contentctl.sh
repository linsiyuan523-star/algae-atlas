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
readonly QUEUE_TEST="$(dirname -- "$CONTROLLER")/tests/test-content-queue.sh"
readonly SYNC_TEST="$(dirname -- "$CONTROLLER")/tests/test-content-sync.sh"
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

bundle_sha_for_delivery() {
  sed -n 's/^BundleSha256=//p' "$1/MANIFEST.txt"
}

run_publish() {
  local delivery=$1
  shift
  local transaction_id
  transaction_id=$(basename -- "$delivery")
  local bundle_sha256
  bundle_sha256=$(bundle_sha_for_delivery "$delivery")
  env "$@" bash "$CONTROLLER" publish \
    --transaction "$transaction_id" \
    --bundle "$delivery" \
    --bundle-sha256 "$bundle_sha256" \
    --json
}

reset_publish_state() {
  local transaction_id=$1
  rm -f -- \
    "$TEST_ROOT/content-root/publish-state/$transaction_id.json" \
    "$TEST_ROOT/content-root/publish-state/$transaction_id.events.jsonl"
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

direct_job_id='0123456789abcdef0123456789abcdef'
direct_update_job_id='fedcba9876543210fedcba9876543210'
failure_job_id='00112233445566778899aabbccddeeff'
legacy_job_id='1234567890abcdef1234567890abcdef'
bad_image_job_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
bad_mode_job_id='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
bad_media_path_job_id='cccccccccccccccccccccccccccccccc'
bad_media_digest_job_id='ffffffffffffffffffffffffffffffff'
shared_media_job_id='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
oversized_snapshot_job_id='dddddddddddddddddddddddddddddddd'
clone_fallback_job_id='13579bdf13579bdf13579bdf13579bdf'
retryable_job_id='2468ace02468ace02468ace02468ace0'
running_job_id='0f0e0d0c0b0a09080706050403020100'
corrupt_state_job_id='102030405060708090a0b0c0d0e0f000'
mkdir -p -- "$TEST_ROOT/bin" "$TEST_ROOT/incoming/$direct_job_id" \
  "$TEST_ROOT/incoming/$direct_update_job_id" "$TEST_ROOT/site"
readonly FORMAL_REPOSITORY="$TEST_ROOT/content-root/repository"
readonly SITE_SOURCE="$TEST_ROOT/site-source"
readonly INCOMING_JOB="$TEST_ROOT/incoming/$direct_job_id"
readonly UPDATE_JOB="$TEST_ROOT/incoming/$direct_update_job_id"

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
printf '.env.production.local\n' > "$SITE_SOURCE/.gitignore"
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
printf '%s\n' "${CONTENT_REPOSITORY_SOURCE:-<unset>}" >> "${MOCK_NPM_SOURCE_LOG:?}"
if [[ "${MOCK_CONTENT_VALIDATE_FAIL:-0}" == "1" && "$1 ${2:-}" == "run content:validate" ]]; then
  exit 42
fi
if [[ "${MOCK_NPM_FAIL:-0}" == "1" && "$1 ${2:-}" == "run build:next" ]]; then
  exit 42
fi
case "$1 ${2:-}" in
  ci\ --include=dev) exit 0 ;;
  run\ content:validate) exit 0 ;;
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
export MOCK_NPM_SOURCE_LOG="$TEST_ROOT/npm-source.log"
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

readonly FAILURE_JOB="$TEST_ROOT/incoming/$failure_job_id"
readonly LEGACY_JOB="$TEST_ROOT/incoming/$legacy_job_id"
readonly BAD_IMAGE_JOB="$TEST_ROOT/incoming/$bad_image_job_id"
readonly BAD_MODE_JOB="$TEST_ROOT/incoming/$bad_mode_job_id"
readonly BAD_MEDIA_PATH_JOB="$TEST_ROOT/incoming/$bad_media_path_job_id"
readonly BAD_MEDIA_DIGEST_JOB="$TEST_ROOT/incoming/$bad_media_digest_job_id"
readonly SHARED_MEDIA_JOB="$TEST_ROOT/incoming/$shared_media_job_id"
readonly OVERSIZED_SNAPSHOT_JOB="$TEST_ROOT/incoming/$oversized_snapshot_job_id"
readonly CLONE_FALLBACK_JOB="$TEST_ROOT/incoming/$clone_fallback_job_id"
readonly RETRYABLE_JOB="$TEST_ROOT/incoming/$retryable_job_id"
readonly RUNNING_JOB="$TEST_ROOT/incoming/$running_job_id"
readonly CORRUPT_STATE_JOB="$TEST_ROOT/incoming/$corrupt_state_job_id"
mkdir -p -- \
  "$FAILURE_JOB" "$LEGACY_JOB" "$BAD_IMAGE_JOB" "$BAD_MODE_JOB" \
  "$BAD_MEDIA_PATH_JOB" "$BAD_MEDIA_DIGEST_JOB" "$SHARED_MEDIA_JOB" \
  "$OVERSIZED_SNAPSHOT_JOB" "$CLONE_FALLBACK_JOB" "$RETRYABLE_JOB" \
  "$RUNNING_JOB" "$CORRUPT_STATE_JOB"

make_transaction_test_delivery() {
  local destination=$1
  local transaction_id=$2
  local delivery_branch="content/direct-$transaction_id-example-id"
  "$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch "$delivery_branch" "$head_sha"
  make_additional_delivery "$destination" "$delivery_branch" "$retry_base_sha" "$head_sha" \
    'content/records/science-article/example-id/record.json'
}

make_transaction_test_delivery "$CLONE_FALLBACK_JOB" "$clone_fallback_job_id"
make_transaction_test_delivery "$RETRYABLE_JOB" "$retryable_job_id"
make_transaction_test_delivery "$RUNNING_JOB" "$running_job_id"
make_transaction_test_delivery "$CORRUPT_STATE_JOB" "$corrupt_state_job_id"

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
bad_image_branch="content/direct-$bad_image_job_id-example-id"
mkdir -p -- "$TEST_ROOT/workbench-source/public/images/uploads/2026/13"
printf 'invalid-month-image\n' > "$TEST_ROOT/workbench-source/$bad_image_path"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
bad_image_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$legacy_branch" "$bad_image_branch"
make_additional_delivery "$BAD_IMAGE_JOB" "$bad_image_branch" "$legacy_head_sha" "$bad_image_head_sha" "$bad_image_path"

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

if missing_status_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction 99999999999999999999999999999999 --json); then
  printf 'missing publish transaction unexpectedly returned success\n' >&2
  exit 1
fi
assert_json_field "$missing_status_json" action publish-status
assert_json_field "$missing_status_json" code TRANSACTION_NOT_FOUND
assert_json_field "$missing_status_json" retryable false

placeholder_head=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD)
placeholder_tree=$("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD^{tree})
if first_build_json=$(run_publish "$INCOMING_JOB" MOCK_CONTENT_VALIDATE_FAIL=1 "${common_env[@]}"); then
  printf 'failing content validation unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$first_build_json" ok false
assert_json_field "$first_build_json" action publish
assert_json_field "$first_build_json" code BUILD_FAILED
assert_json_field "$first_build_json" retryable false
assert_json_field "$first_build_json" failedStage validating_site
[[ $(sed -n '1p' "$MOCK_NPM_LOG") == 'ci --include=dev --prefer-offline --no-audit --no-fund' ]] || { printf 'failed build did not install dependencies first\n' >&2; exit 1; }
[[ $(sed -n '2p' "$MOCK_NPM_LOG") == 'run content:validate -- --json' ]] || { printf 'failed build did not reach targeted content validation\n' >&2; exit 1; }
[[ $(wc -l < "$MOCK_NPM_LOG") -eq 2 ]] || { printf 'production build ran after content validation failed\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$placeholder_head" ]] || { printf 'failed first build changed placeholder HEAD\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD^{tree}) == "$placeholder_tree" ]] || { printf 'failed first build changed placeholder tree\n' >&2; exit 1; }
[[ -z "$("$GIT_BIN" -C "$FORMAL_REPOSITORY" status --porcelain --untracked-files=all)" ]] || { printf 'failed first build dirtied the placeholder repository\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/content/authors/bootstrap-author.json" ]] || { printf 'failed first build installed fresh-main content\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/content/records/science-article/example-id" ]] || { printf 'failed first build installed bundle content\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'failed first build installed bundle image\n' >&2; exit 1; }
[[ ! -e "$TEST_ROOT/site/current" && ! -e "$TEST_ROOT/site/previous" ]] || { printf 'failed first build changed release markers\n' >&2; exit 1; }
first_failure_status=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$direct_job_id" --json)
assert_json_field "$first_failure_status" ok true
assert_json_field "$first_failure_status" action publish-status
assert_json_field "$first_failure_status" status failed
assert_json_field "$first_failure_status" attempt 1
npm_lines_before=$(wc -l < "$MOCK_NPM_LOG")
if repeated_failure_json=$(run_publish "$INCOMING_JOB" "${common_env[@]}"); then
  printf 'nonretryable failed transaction unexpectedly retried\n' >&2
  exit 1
fi
assert_json_field "$repeated_failure_json" code BUILD_FAILED
assert_json_field "$repeated_failure_json" attempt 1
[[ $(wc -l < "$MOCK_NPM_LOG") -eq $npm_lines_before ]] || {
  printf 'nonretryable failed transaction repeated the build\n' >&2
  exit 1
}
if find "$TEST_ROOT/content-root/publish-state" -maxdepth 1 -name '.*.tmp' -print -quit | grep -q .; then
  printf 'atomic publish state write left a temporary file\n' >&2
  exit 1
fi
"$NODE_BIN" -e '
const fs = require("fs");
const [statePath, eventPath, transactionId] = process.argv.slice(1);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (state.transactionId !== transactionId || state.status !== "failed") process.exit(1);
const events = fs.readFileSync(eventPath, "utf8").trim().split("\n").map(JSON.parse);
if (!events.length || events.some((event) =>
  event.transactionId !== transactionId || typeof event.timestamp !== "string" ||
  typeof event.stage !== "string" || !Number.isInteger(event.attempt) ||
  !Number.isInteger(event.durationMs) || typeof event.status !== "string" ||
  typeof event.errorCode !== "string")) process.exit(2);
' "$TEST_ROOT/content-root/publish-state/$direct_job_id.json" \
  "$TEST_ROOT/content-root/publish-state/$direct_job_id.events.jsonl" "$direct_job_id"
site_source_cache="$TEST_ROOT/content-root/site-source-cache/$fallback_site_source_sha-$site_source_tree_sha"
[[ -d "$site_source_cache/repository/.git" ]] || { printf 'verified website source cache was not populated\n' >&2; exit 1; }
[[ $(<"$site_source_cache/site-sha") == "$fallback_site_source_sha" ]] || { printf 'website source cache commit metadata is wrong\n' >&2; exit 1; }
[[ $(<"$site_source_cache/tree-sha") == "$site_source_tree_sha" ]] || { printf 'website source cache tree metadata is wrong\n' >&2; exit 1; }
[[ -z "$("$GIT_BIN" -C "$site_source_cache/repository" status --porcelain --untracked-files=all)" ]] || { printf 'website source cache is dirty\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$site_source_cache/repository" rev-parse 'HEAD^{tree}') == "$site_source_tree_sha" ]] || { printf 'website source cache tree is wrong\n' >&2; exit 1; }
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 0 ]] || { printf 'archive-first source fetch unexpectedly cloned the site\n' >&2; exit 1; }
grep -q -- '--connect-timeout 10 --max-time 20 --retry 2 --retry-delay 2 --retry-max-time 40' "$MOCK_CURL_LOG" || { printf 'GitHub archive request did not use bounded retries and timeouts\n' >&2; exit 1; }
grep -Fq -- "--signal=TERM --kill-after=10s 40s $TEST_ROOT/bin/curl" "$MOCK_TIMEOUT_LOG" || { printf 'GitHub archive request did not have a hard total timeout\n' >&2; exit 1; }
grep -q -- "/tarball/$fallback_site_source_sha" "$MOCK_CURL_LOG" || { printf 'GitHub archive request did not use the exact API commit\n' >&2; exit 1; }

rm -rf -- "$TEST_ROOT/content-root/site-source-cache"
: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
: > "$MOCK_TIMEOUT_LOG"
if clone_fallback_json=$(run_publish "$CLONE_FALLBACK_JOB" \
  "${common_env[@]}" \
  MOCK_SITE_SOURCE_SHA="$site_source_sha" \
  MOCK_SITE_TREE_SHA="$site_source_tree_sha" \
  MOCK_SITE_TARBALL_FAIL=1 \
  MOCK_CONTENT_VALIDATE_FAIL=1); then
  printf 'clone fallback validation fixture unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$clone_fallback_json" code BUILD_FAILED
clone_fallback_status=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$clone_fallback_job_id" --json)
assert_json_field "$clone_fallback_status" sourceMethod clone
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 1 ]] || {
  printf 'archive failure did not use exactly one shallow clone fallback\n' >&2
  exit 1
}
[[ $(grep -c -- '/tarball/' "$MOCK_CURL_LOG") -eq 1 ]] || {
  printf 'clone fallback did not follow exactly one archive attempt\n' >&2
  exit 1
}
grep -Fq -- "--signal=TERM --kill-after=10s 30s $TEST_ROOT/bin/git" "$MOCK_TIMEOUT_LOG" || {
  printf 'clone fallback did not use the 30 second hard boundary\n' >&2
  exit 1
}
[[ ! -e "$TEST_ROOT/site/current" && ! -e "$TEST_ROOT/site/previous" ]] || {
  printf 'clone fallback validation fixture changed release markers\n' >&2
  exit 1
}

rm -rf -- "$TEST_ROOT/content-root/site-source-cache"
: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
: > "$MOCK_TIMEOUT_LOG"
for expected_attempt in 1 2 3; do
  if retryable_json=$(run_publish "$RETRYABLE_JOB" \
    "${common_env[@]}" MOCK_SITE_TARBALL_FAIL=1 MOCK_SITE_CLONE_FAIL=1); then
    printf 'retryable source failure unexpectedly published on attempt %s\n' "$expected_attempt" >&2
    exit 1
  fi
  assert_json_field "$retryable_json" code SITE_SOURCE_NETWORK_FAILED
  assert_json_field "$retryable_json" attempt "$expected_attempt"
  if [[ $expected_attempt -lt 3 ]]; then
    assert_json_field "$retryable_json" retryable true
  else
    assert_json_field "$retryable_json" retryable false
  fi
done
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 3 ]] || {
  printf 'retryable source failures did not perform one bounded clone per attempt\n' >&2
  exit 1
}
[[ $(grep -c -- '/tarball/' "$MOCK_CURL_LOG") -eq 3 ]] || {
  printf 'retryable source failures did not perform one archive request per attempt\n' >&2
  exit 1
}
clone_attempts_before=$(grep -c -- '--depth 1' "$MOCK_GIT_LOG")
archive_attempts_before=$(grep -c -- '/tarball/' "$MOCK_CURL_LOG")
if exhausted_retry_json=$(run_publish "$RETRYABLE_JOB" \
  "${common_env[@]}" MOCK_SITE_TARBALL_FAIL=1 MOCK_SITE_CLONE_FAIL=1); then
  printf 'exhausted retryable transaction unexpectedly succeeded\n' >&2
  exit 1
fi
assert_json_field "$exhausted_retry_json" attempt 3
assert_json_field "$exhausted_retry_json" retryable false
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq $clone_attempts_before && \
   $(grep -c -- '/tarball/' "$MOCK_CURL_LOG") -eq $archive_attempts_before ]] || {
  printf 'exhausted transaction performed another network attempt\n' >&2
  exit 1
}
retry_status_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$retryable_job_id" --json)
assert_json_field "$retry_status_json" status failed
assert_json_field "$retry_status_json" attempt 3
assert_json_field "$retry_status_json" retryable false

printf '{"transactionId":' > "$TEST_ROOT/content-root/publish-state/$corrupt_state_job_id.json"
chmod 0600 -- "$TEST_ROOT/content-root/publish-state/$corrupt_state_job_id.json"
if corrupt_status_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$corrupt_state_job_id" --json); then
  printf 'corrupt publish state unexpectedly returned status\n' >&2
  exit 1
fi
assert_json_field "$corrupt_status_json" action publish-status
assert_json_field "$corrupt_status_json" code STATE_CORRUPT
if corrupt_publish_json=$(run_publish "$CORRUPT_STATE_JOB" "${common_env[@]}"); then
  printf 'corrupt publish state unexpectedly restarted publication\n' >&2
  exit 1
fi
assert_json_field "$corrupt_publish_json" action publish
assert_json_field "$corrupt_publish_json" code STATE_CORRUPT

: > "$MOCK_NPM_LOG"
reset_publish_state "$direct_job_id"
if failed_next_build_json=$(run_publish "$INCOMING_JOB" MOCK_NPM_FAIL=1 "${common_env[@]}"); then
  printf 'failing Next build unexpectedly published content\n' >&2
  exit 1
fi
assert_json_field "$failed_next_build_json" ok false
assert_json_field "$failed_next_build_json" action publish
assert_json_field "$failed_next_build_json" code BUILD_FAILED
[[ $(sed -n '1p' "$MOCK_NPM_LOG") == 'ci --include=dev --prefer-offline --no-audit --no-fund' && \
   $(sed -n '2p' "$MOCK_NPM_LOG") == 'run content:validate -- --json' && \
   $(sed -n '3p' "$MOCK_NPM_LOG") == 'run build:next' ]] || { printf 'failed Next build did not run the expected build commands\n' >&2; exit 1; }
[[ $(wc -l < "$MOCK_NPM_LOG") -eq 3 ]] || { printf 'failed Next build ran unexpected extra commands\n' >&2; exit 1; }
[[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$placeholder_head" ]] || { printf 'failed Next build changed placeholder HEAD\n' >&2; exit 1; }
[[ ! -e "$TEST_ROOT/site/current" && ! -e "$TEST_ROOT/site/previous" ]] || { printf 'failed Next build changed release markers\n' >&2; exit 1; }
[[ ! -e "$FORMAL_REPOSITORY/content/records/science-article/example-id" ]] || { printf 'failed Next build installed bundle content\n' >&2; exit 1; }

: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
: > "$MOCK_TIMEOUT_LOG"
: > "$MOCK_NPM_LOG"
: > "$MOCK_NPM_SOURCE_LOG"
reset_publish_state "$direct_job_id"
publish_json=$(run_publish "$INCOMING_JOB" MOCK_SITE_CLONE_FAIL=1 "${common_env[@]}")
assert_json_field "$publish_json" ok true
assert_json_field "$publish_json" action publish
assert_json_field "$publish_json" stableId example-id
grep -Fxq -- 'ci --include=dev --prefer-offline --no-audit --no-fund' "$MOCK_NPM_LOG" || { printf 'release did not install exact dependencies\n' >&2; exit 1; }
grep -Fxq -- 'run content:validate -- --json' "$MOCK_NPM_LOG" || { printf 'release did not run targeted content validation\n' >&2; exit 1; }
grep -Fxq -- 'run build:next' "$MOCK_NPM_LOG" || { printf 'release did not run the production build\n' >&2; exit 1; }
[[ $(sed -n '1p' "$MOCK_NPM_LOG") == 'ci --include=dev --prefer-offline --no-audit --no-fund' && \
   $(sed -n '2p' "$MOCK_NPM_LOG") == 'run content:validate -- --json' && \
   $(sed -n '3p' "$MOCK_NPM_LOG") == 'run build:next' && \
   $(wc -l < "$MOCK_NPM_LOG") -eq 3 ]] || { printf 'release build commands ran in the wrong order\n' >&2; exit 1; }
[[ $(wc -l < "$MOCK_NPM_SOURCE_LOG") -eq 3 && \
   $(grep -Fxc -- 'overlay' "$MOCK_NPM_SOURCE_LOG") -eq 3 ]] || {
  printf 'release build commands did not all select the overlay content source\n' >&2
  exit 1
}
if grep -Fxq -- 'run check' "$MOCK_NPM_LOG"; then
  printf 'release repeated the full source check\n' >&2
  exit 1
fi
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
[[ $(<"$first_release/.env.production.local") == 'CONTENT_REPOSITORY_SOURCE=overlay' ]] || {
  printf 'release runtime did not select the overlay content source\n' >&2
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
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 0 ]] || { printf 'website source cache hit unexpectedly cloned the site\n' >&2; exit 1; }
grep -q -- '/commits/main' "$MOCK_CURL_LOG" || { printf 'website source cache hit did not refresh GitHub main metadata\n' >&2; exit 1; }
if grep -q -- '/tarball/' "$MOCK_CURL_LOG"; then
  printf 'website source cache hit unexpectedly downloaded an archive\n' >&2
  exit 1
fi
grep -q -- '--connect-timeout 10 --max-time 10 --retry 2 --retry-delay 2 --retry-max-time 20' "$MOCK_CURL_LOG" || { printf 'GitHub metadata request did not use bounded curl retries and timeouts\n' >&2; exit 1; }
grep -Fq -- "--signal=TERM --kill-after=10s 20s $TEST_ROOT/bin/curl" "$MOCK_TIMEOUT_LOG" || { printf 'GitHub metadata request did not have a hard total timeout\n' >&2; exit 1; }
assert_release_readable "$first_release"

success_status_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$direct_job_id" --json)
assert_json_field "$success_status_json" ok true
assert_json_field "$success_status_json" action publish-status
assert_json_field "$success_status_json" status succeeded
assert_json_field "$success_status_json" stage succeeded
assert_json_field "$success_status_json" switchCompleted true
assert_json_field "$success_status_json" attempt 1
success_release_id=$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(process.argv[1]).releaseId)' "$success_status_json")
[[ -n "$success_release_id" ]] || { printf 'successful publish status omitted the release id\n' >&2; exit 1; }
release_count_before=$(find "$TEST_ROOT/site/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)
event_count_before=$(wc -l < "$TEST_ROOT/content-root/publish-state/$direct_job_id.events.jsonl")
current_before_duplicate=$(<"$TEST_ROOT/site/current")
: > "$MOCK_NPM_LOG"
: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
duplicate_success_json=$(run_publish "$INCOMING_JOB" "${common_env[@]}")
assert_json_field "$duplicate_success_json" ok true
assert_json_field "$duplicate_success_json" action publish
assert_json_field "$duplicate_success_json" status succeeded
assert_json_field "$duplicate_success_json" releaseId "$success_release_id"
[[ ! -s "$MOCK_NPM_LOG" && ! -s "$MOCK_GIT_LOG" && ! -s "$MOCK_CURL_LOG" ]] || {
  printf 'successful transaction duplicate reran preparation or build commands\n' >&2
  exit 1
}
[[ $(find "$TEST_ROOT/site/releases" -mindepth 1 -maxdepth 1 -type d | wc -l) -eq $release_count_before ]] || {
  printf 'successful transaction duplicate created another release\n' >&2
  exit 1
}
[[ $(<"$TEST_ROOT/site/current") == "$current_before_duplicate" ]] || {
  printf 'successful transaction duplicate switched current again\n' >&2
  exit 1
}
[[ $(wc -l < "$TEST_ROOT/content-root/publish-state/$direct_job_id.events.jsonl") -eq $event_count_before ]] || {
  printf 'successful transaction duplicate appended another execution timeline\n' >&2
  exit 1
}

running_bundle_sha=$(bundle_sha_for_delivery "$RUNNING_JOB")
"$NODE_BIN" -e '
const fs = require("fs");
const [sourcePath, targetPath, transactionId, bundleSha256] = process.argv.slice(1);
const state = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
Object.assign(state, {
  transactionId,
  bundleSha256,
  status: "running",
  stage: "building_site",
  failedStage: "",
  stageStartedAt: "2026-07-29T12:00:01.000Z",
  updatedAt: "2026-07-29T12:00:02.000Z",
  elapsedMs: 2000,
  attempt: 1,
  retryable: false,
  errorCode: "",
  message: "Building the website",
  userMessage: "Building the website",
  technicalSummary: "",
  releaseId: "",
  switchCompleted: false,
  sourceMethod: "cache",
  stageDurationsMs: { verifying_bundle: 250 }
});
fs.writeFileSync(targetPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
' "$TEST_ROOT/content-root/publish-state/$direct_job_id.json" \
  "$TEST_ROOT/content-root/publish-state/$running_job_id.json" \
  "$running_job_id" "$running_bundle_sha"
: > "$MOCK_NPM_LOG"
: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
running_duplicate_json=$(run_publish "$RUNNING_JOB" "${common_env[@]}")
assert_json_field "$running_duplicate_json" ok true
assert_json_field "$running_duplicate_json" status running
assert_json_field "$running_duplicate_json" stage building_site
[[ ! -s "$MOCK_NPM_LOG" && ! -s "$MOCK_GIT_LOG" && ! -s "$MOCK_CURL_LOG" ]] || {
  printf 'running transaction duplicate started another execution\n' >&2
  exit 1
}
running_status_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish-status \
  --transaction "$running_job_id" --json)
assert_json_field "$running_status_json" status running
assert_json_field "$running_status_json" stage building_site

list_json=$(env "${common_env[@]}" bash "$CONTROLLER" list --json)
assert_json_field "$list_json" action list
assert_json_field "$list_json" count 2

status_json=$(env "${common_env[@]}" bash "$CONTROLLER" status --json)
assert_json_field "$status_json" action status
assert_json_field "$status_json" ready true
assert_json_field "$status_json" publishProtocolVersion 1
assert_json_field "$status_json" queueProtocolVersion 1

printf 'CONTENT_REPOSITORY_SOURCE=legacy\n' > "$site_source_cache/repository/.env.production.local"
: > "$MOCK_GIT_LOG"
: > "$MOCK_CURL_LOG"
: > "$MOCK_TIMEOUT_LOG"
update_json=$(run_publish "$UPDATE_JOB" MOCK_SITE_CLONE_FAIL=1 "${common_env[@]}")
assert_json_field "$update_json" ok true
assert_json_field "$update_json" action publish
assert_json_field "$update_json" stableId example-id
[[ $(grep -c -- '--depth 1' "$MOCK_GIT_LOG") -eq 0 ]] || { printf 'invalid cache recovery did not use the archive before clone\n' >&2; exit 1; }
if grep -Fq -- "--signal=TERM --kill-after=10s 30s $TEST_ROOT/bin/git" "$MOCK_TIMEOUT_LOG"; then
  printf 'successful archive recovery unexpectedly used the clone fallback\n' >&2
  exit 1
fi
grep -q -- "/tarball/$fallback_site_source_sha" "$MOCK_CURL_LOG" || { printf 'invalid website source cache was not replaced from the exact archive\n' >&2; exit 1; }
[[ -z "$("$GIT_BIN" -C "$site_source_cache/repository" status --porcelain --untracked-files=all)" ]] || { printf 'replacement website source cache is dirty\n' >&2; exit 1; }
[[ ! -e "$site_source_cache/repository/.env.production.local" ]] || { printf 'replacement website source cache retained ignored pollution\n' >&2; exit 1; }
grep -q 'main source' "$site_source_cache/repository/README.md" || { printf 'replacement website source cache has the wrong content\n' >&2; exit 1; }
grep -q 'v2' "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json"
grep -q 'image-v2' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp"
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

assert_site_source_failure() {
  local failure_flag=$1
  local expected_message=$2
  local expected_code=$3
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
  assert_json_field "$failure_json" code "$expected_code"
  assert_json_field "$failure_json" message "$expected_message"
  [[ $("$GIT_BIN" -C "$FORMAL_REPOSITORY" rev-parse HEAD) == "$formal_head_before" ]] || { printf '%s changed formal content\n' "$failure_flag" >&2; exit 1; }
  [[ $(<"$TEST_ROOT/site/current") == "$current_release_before" ]] || { printf '%s changed the current release\n' "$failure_flag" >&2; exit 1; }
}

assert_site_source_failure MOCK_SITE_API_FAIL \
  "GitHub metadata and bounded shallow clone are temporarily unavailable" \
  SITE_SOURCE_API_UNAVAILABLE
assert_site_source_failure MOCK_SITE_TREE_MISMATCH \
  "GitHub main source archive tree does not match the API tree" \
  SITE_SOURCE_FAILED
rm -rf -- "$site_source_cache"
assert_site_source_failure MOCK_SITE_TARBALL_FAIL \
  "GitHub archive and bounded shallow clone are temporarily unavailable" \
  SITE_SOURCE_NETWORK_FAILED

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
if rollback_json=$(run_publish "$FAILURE_JOB" MOCK_NPM_FAIL=1 "${common_env[@]}"); then
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

reset_publish_state "$failure_job_id"
if health_json=$(run_publish "$FAILURE_JOB" MOCK_HEALTH_FAIL=1 "${common_env[@]}"); then
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

reset_publish_state "$failure_job_id"
if publish_url_json=$(run_publish "$FAILURE_JOB" MOCK_PUBLISH_URL_404=1 "${common_env[@]}"); then
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

legacy_json=$(run_publish "$LEGACY_JOB" "${common_env[@]}")
assert_json_field "$legacy_json" ok true
assert_json_field "$legacy_json" action publish
grep -q 'legacy' "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json"
grep -q 'image-legacy' "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp"
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"

if bad_image_json=$(run_publish "$BAD_IMAGE_JOB" "${common_env[@]}"); then
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
  if failure_json=$(run_publish "$delivery" "${common_env[@]}"); then
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

outside_delivery="$TEST_ROOT/99999999999999999999999999999999"
mkdir -p -- "$outside_delivery"
if outside_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish \
  --transaction 99999999999999999999999999999999 \
  --bundle "$outside_delivery" \
  --bundle-sha256 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA \
  --json); then
  printf 'outside bundle path unexpectedly succeeded\n' >&2
  exit 1
fi
assert_json_field "$outside_json" ok false
assert_json_field "$outside_json" action publish
assert_json_field "$outside_json" code INVALID_BUNDLE_PATH

bash "$QUEUE_TEST"
bash "$SYNC_TEST"
printf 'algae-contentctl mock tests: PASS\n'
