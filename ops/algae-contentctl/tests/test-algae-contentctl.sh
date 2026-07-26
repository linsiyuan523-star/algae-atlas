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

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

[[ -x "$GIT_BIN" ]] || { printf 'git is required\n' >&2; exit 1; }
[[ -n "$NODE_BIN" ]] || { printf 'node is required\n' >&2; exit 1; }

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
    [[ -r "$release/package.json" && -x "$release" && -r "$release/.next/mock-build" ]] || {
      printf 'release files are not readable through the test runtime\n' >&2
      exit 1
    }
    return 0
  fi
  mode=$(stat -c '%a' -- "$release")
  (( (8#$mode & 0005) == 0005 )) || { printf 'release root is not readable and traversable by the service user\n' >&2; exit 1; }
  mode=$(stat -c '%a' -- "$release/package.json")
  (( (8#$mode & 0004) == 0004 )) || { printf 'release source file is not readable by the service user\n' >&2; exit 1; }
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
  "$SITE_SOURCE/public/images/uploads/2025/12"
printf '%s\n' '{"id":"bootstrap-author","name":"Fresh Main Author"}' > "$SITE_SOURCE/content/authors/bootstrap-author.json"
printf '%s\n' '{"id":"bootstrap-media","filePath":"public/images/uploads/2025/12/bootstrap-image.webp"}' > "$SITE_SOURCE/content/media/bootstrap-media.json"
printf '%s\n' '{"schemaVersion":1,"id":"existing-id","type":"science-article","updatedAt":"2025-12-01T00:00:00Z","locales":{"zh":{"title":"Existing fresh-main article","bodyFile":"zh.md"},"en":{"missing":true}}}' > "$SITE_SOURCE/content/records/science-article/existing-id/record.json"
printf 'Existing fresh-main body\n' > "$SITE_SOURCE/content/records/science-article/existing-id/zh.md"
printf 'fresh-main-image\n' > "$SITE_SOURCE/public/images/uploads/2025/12/bootstrap-image.webp"
"$GIT_BIN" -C "$SITE_SOURCE" add .
"$GIT_BIN" -C "$SITE_SOURCE" commit -q -m "content: add existing main content"
site_source_sha=$("$GIT_BIN" -C "$SITE_SOURCE" rev-parse HEAD)
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
url="${@: -1}"
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
export MOCK_SERVICE_STATE="$TEST_ROOT/service-active"

git_setup "$TEST_ROOT/workbench-source"
mkdir -p -- "$TEST_ROOT/workbench-source/content/authors" "$TEST_ROOT/workbench-source/content/media" "$TEST_ROOT/workbench-source/content/records"
touch "$TEST_ROOT/workbench-source/content/authors/.gitkeep" "$TEST_ROOT/workbench-source/content/media/.gitkeep" "$TEST_ROOT/workbench-source/content/records/.gitkeep"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add content
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "site: base content"
base_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
mkdir -p -- "$TEST_ROOT/workbench-source/content/records/science-article/example-id" "$TEST_ROOT/workbench-source/public/images/uploads/2026/07"
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T00:00:00Z","locales":{"zh":{"title":"Example algae article v1","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v1\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'English body\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/en.md"
printf '%s\n' '{"id":"example-image","filePath":"public/images/uploads/2026/07/example-image.webp"}' > "$TEST_ROOT/workbench-source/content/media/example-image.json"
printf 'image-v1\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
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
BaseCommit=$base_sha
BundleFile=$bundle_name
BundleSizeBytes=$bundle_size
BundleSha256=$bundle_sha
History=complete
ImportBranch=import/content-direct-$direct_job_id-example-id
ChangedFileCount=5
Artifacts=$bundle_name,$bundle_name.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
printf '%s  %s\n' "$bundle_sha" "$bundle_name" > "$INCOMING_JOB/$bundle_name.sha256.txt"
printf '%s\n' 'content/media/example-image.json' 'content/records/science-article/example-id/en.md' 'content/records/science-article/example-id/record.json' 'content/records/science-article/example-id/zh.md' 'public/images/uploads/2026/07/example-image.webp' > "$INCOMING_JOB/CHANGED-FILES.txt"
printf '%s\n' 'handoff' > "$INCOMING_JOB/HANDOFF.md"
printf '%s\n' 'summary' > "$INCOMING_JOB/TEST-SUMMARY.txt"
printf '%s\n' 'import' > "$INCOMING_JOB/Import-Bundle.ps1"
printf '%s\n' 'wrapper' > "$INCOMING_JOB/Validate-Bundle.sh"
printf '%s\n' 'validator' > "$INCOMING_JOB/validate-bundle.mjs"

update_base_sha=$head_sha
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T01:00:00Z","locales":{"zh":{"title":"Example algae article v2","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v2\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-v2\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
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
ChangedFileCount=3
Artifacts=$update_bundle_name,$update_bundle_name.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
printf '%s  %s\n' "$update_bundle_sha" "$update_bundle_name" > "$UPDATE_JOB/$update_bundle_name.sha256.txt"
printf '%s\n' 'content/records/science-article/example-id/record.json' 'content/records/science-article/example-id/zh.md' 'public/images/uploads/2026/07/example-image.webp' > "$UPDATE_JOB/CHANGED-FILES.txt"
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
mkdir -p -- "$FAILURE_JOB" "$LEGACY_JOB" "$BAD_IMAGE_JOB"

failure_job_id='00112233445566778899aabbccddeeff'
failure_branch="content/direct-$failure_job_id-example-id"
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T02:00:00Z","locales":{"zh":{"title":"Example algae article v3","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body v3\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-v3\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
failure_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$update_branch" "$failure_branch"
make_additional_delivery "$FAILURE_JOB" "$failure_branch" "$update_head_sha" "$failure_head_sha" \
  'content/records/science-article/example-id/record.json' \
  'content/records/science-article/example-id/zh.md' \
  'public/images/uploads/2026/07/example-image.webp'

legacy_branch='content/20260726-example-id'
printf '%s\n' '{"schemaVersion":1,"id":"example-id","type":"science-article","updatedAt":"2026-07-26T03:00:00Z","locales":{"zh":{"title":"Example algae article legacy","bodyFile":"zh.md"},"en":{"title":"Example algae article","bodyFile":"en.md"}}}' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/record.json"
printf 'Example body legacy\n' > "$TEST_ROOT/workbench-source/content/records/science-article/example-id/zh.md"
printf 'image-legacy\n' > "$TEST_ROOT/workbench-source/public/images/uploads/2026/07/example-image.webp"
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" add .
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" commit -q -m "content: publish example-id"
legacy_head_sha=$("$GIT_BIN" -C "$TEST_ROOT/workbench-source" rev-parse HEAD)
"$GIT_BIN" -C "$TEST_ROOT/workbench-source" branch -m "$failure_branch" "$legacy_branch"
make_additional_delivery "$LEGACY_JOB" "$legacy_branch" "$failure_head_sha" "$legacy_head_sha" \
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

common_env=(
  ALGAE_CONTENTCTL_TESTING=1
  ALGAE_CONTENT_ROOT="$TEST_ROOT/content-root"
  ALGAE_INCOMING_ROOT="$TEST_ROOT/incoming"
  ALGAE_SITE_ROOT="$TEST_ROOT/site"
  ALGAE_SITE_REPOSITORY_URL="$site_source_url"
  ALGAE_NPM_BIN="$TEST_ROOT/bin/npm"
  ALGAE_CHMOD_BIN="$TEST_ROOT/bin/chmod"
  ALGAE_SYSTEMCTL_BIN="$TEST_ROOT/bin/systemctl"
  ALGAE_CURL_BIN="$TEST_ROOT/bin/curl"
  ALGAE_PUBLIC_BASE_URL="https://example.invalid"
  ALGAE_LOCAL_BASE_URL="http://127.0.0.1:3000"
  ALGAE_HEALTH_ATTEMPTS=1
  ALGAE_TEST_LINK_FILES=1
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

publish_json=$(env "${common_env[@]}" bash "$CONTROLLER" publish --bundle "$INCOMING_JOB" --json)
assert_json_field "$publish_json" ok true
assert_json_field "$publish_json" action publish
assert_json_field "$publish_json" stableId example-id
[[ -f "$TEST_ROOT/site/current" ]] || { printf 'current release marker missing\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/content/records/science-article/example-id/record.json" ]] || { printf 'formal content was not updated\n' >&2; exit 1; }
[[ -f "$FORMAL_REPOSITORY/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'formal image was not updated\n' >&2; exit 1; }
assert_bootstrap_sentinels "$FORMAL_REPOSITORY"
[[ -z "$("$GIT_BIN" -C "$FORMAL_REPOSITORY" remote)" ]] || { printf 'formal content repository unexpectedly has a Git remote\n' >&2; exit 1; }
first_release=$(<"$TEST_ROOT/site/current")
[[ -f "$first_release/public/images/uploads/2026/07/example-image.webp" ]] || { printf 'release image was not overlaid\n' >&2; exit 1; }
assert_bootstrap_sentinels "$first_release"
[[ $(<"$first_release/.release-sha") == "$site_source_sha" ]] || { printf 'release did not reuse the prepared fresh-main SHA\n' >&2; exit 1; }
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
