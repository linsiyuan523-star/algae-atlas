#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077
export PATH="/usr/bin:$PATH"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_TERMINAL_PROMPT=0

readonly TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/algae-content-sync-test.XXXXXX")"
readonly CONTROLLER="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)/algae-contentctl"
readonly GIT_BIN="$(command -v git)"
readonly NODE_BIN="$(command -v node || true)"
readonly CHMOD_BIN="$(command -v chmod)"
readonly TAR_BIN="$(command -v tar)"
readonly TIMEOUT_BIN="$(command -v timeout)"
readonly SOURCE_REPOSITORY="$TEST_ROOT/content-source"
readonly CONTENT_ROOT="$TEST_ROOT/content-root"
readonly CONTENT_REPOSITORY="$CONTENT_ROOT/repository"
readonly SITE_SOURCE="$TEST_ROOT/site-source"
readonly SITE_ROOT="$TEST_ROOT/site"
readonly RELEASES_ROOT="$SITE_ROOT/releases"
readonly CURRENT_LINK="$SITE_ROOT/current"
readonly PREVIOUS_LINK="$SITE_ROOT/previous"
readonly MOCK_LOG="$TEST_ROOT/mock.log"
readonly NPM_LOG="$TEST_ROOT/npm.log"
readonly BUILD_HOOK_MARKER="$TEST_ROOT/build-hook-ran"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT
trap 'printf "sync test command failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

[[ -x "$GIT_BIN" ]] || { printf 'git is required\n' >&2; exit 1; }
[[ -n "$NODE_BIN" ]] || { printf 'node is required\n' >&2; exit 1; }

fail_test() {
  printf 'sync test failed: %s\n' "$1" >&2
  exit 1
}

assert_json_field() {
  local json=$1
  local key=$2
  local expected=$3
  "$NODE_BIN" -e '
const [text, key, expected] = process.argv.slice(1);
const actual = JSON.parse(text)[key];
if (String(actual) !== expected) process.exit(1);
' "$json" "$key" "$expected" || fail_test "JSON field $key did not equal $expected: $json"
}

assert_ref_equals() {
  local ref=$1
  local expected=$2
  local actual
  actual=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse --verify "$ref") || \
    fail_test "expected ref is missing: $ref"
  [[ "$actual" == "$expected" ]] || \
    fail_test "ref $ref did not equal $expected: $actual"
}

assert_ref_missing() {
  local ref=$1
  ! "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet "$ref" || \
    fail_test "unexpected ref remains: $ref"
}

npm_build_count() {
  awk '$0 == "run build:next" { count += 1 } END { print count + 0 }' "$NPM_LOG"
}

curl_call_count() {
  awk '$1 == "curl" { count += 1 } END { print count + 0 }' "$MOCK_LOG"
}

wait_for_marker() {
  local marker=$1
  local process_id=$2
  local output=$3
  local attempt
  for ((attempt = 1; attempt <= 600; attempt += 1)); do
    [[ -e "$marker" ]] && return 0
    if ! kill -0 "$process_id" 2>/dev/null; then
      wait "$process_id" 2>/dev/null || true
      fail_test "background synchronization exited before its build gate: $(<"$output")"
    fi
    sleep 0.1
  done
  fail_test "background synchronization did not reach its build gate"
}

remove_queue_site_commit() {
  local old_blob output="$TEST_ROOT/legacy-queue-state.json" new_blob
  old_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse --verify refs/algae/queue-state)
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file blob "$old_blob" | \
    "$NODE_BIN" -e '
const fs = require("fs");
const output = process.argv[1];
const state = JSON.parse(fs.readFileSync(0, "utf8"));
delete state.siteCommit;
fs.writeFileSync(output, `${JSON.stringify(state)}\n`);
' "$output"
  new_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$output")
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref refs/algae/queue-state "$new_blob" "$old_blob"
}

json_field() {
  "$NODE_BIN" -e 'process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]] ?? ""))' "$1" "$2"
}

assert_sync_status_schema() {
  "$NODE_BIN" -e '
const value = JSON.parse(process.argv[1]);
const expected = ["action", "active_sync_transaction_id", "attempt", "blocked", "completed_at", "content_commit",
  "elapsed_ms", "error_code", "health_verified", "last_sync_transaction_id", "max_attempts", "message", "ok",
  "recovered", "release_id", "release_path", "retryable", "schema_version", "site_commit", "source_content_commit",
  "stage", "started_at", "status", "switch_completed", "sync_transaction_id", "trigger", "updated_at"].sort();
if (Object.keys(value).sort().join("\n") !== expected.join("\n")) process.exit(1);
for (const key of ["started_at", "updated_at"]) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value[key])) process.exit(2);
}
' "$1" || fail_test "sync-status schema changed: $1"
}

git_setup() {
  local repository=$1
  mkdir -p -- "$repository"
  "$GIT_BIN" init -q --initial-branch=main "$repository"
  "$GIT_BIN" -C "$repository" config user.name "Sync Test"
  "$GIT_BIN" -C "$repository" config user.email "sync-test@example.invalid"
  "$GIT_BIN" -C "$repository" config core.autocrlf false
}

write_content_record() {
  local title=$1
  printf '%s\n' "{\"schemaVersion\":1,\"id\":\"example-id\",\"type\":\"science-article\",\"updatedAt\":\"2026-07-30T00:00:00Z\",\"media\":[],\"locales\":{\"zh\":{\"title\":\"$title\",\"bodyFile\":\"zh.md\"},\"en\":{\"missing\":true}}}" \
    > "$SOURCE_REPOSITORY/content/records/science-article/example-id/record.json"
}

make_content_commit() {
  local base=$1
  local title=$2
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" checkout -q --detach "$base"
  write_content_record "$title"
  printf '%s\n' "$title body" > "$SOURCE_REPOSITORY/content/records/science-article/example-id/zh.md"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" add -- content/records/science-article/example-id
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" commit -q -m "content: $title"
  local commit
  commit=$("$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse HEAD)
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" fetch -q --no-tags "$SOURCE_REPOSITORY" "$commit"
  printf '%s' "$commit"
}

make_upload_blob() {
  local transaction_id=$1
  local commit=$2
  local status=${3:-QUEUED}
  local coalesced=${4:-}
  local included=${5:-}
  local release_id=${6:-}
  local published_at=${7:-}
  local file="$TEST_ROOT/upload-$transaction_id.json"
  printf '%s\n' "{\"schemaVersion\":1,\"transactionId\":\"$transaction_id\",\"bundleSha256\":\"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\",\"sourceCommit\":\"$commit\",\"contentCommit\":\"$commit\",\"status\":\"$status\",\"queuedAt\":\"2026-07-30T00:00:00.000Z\",\"coalescedIntoCommit\":\"$coalesced\",\"includedInSyncTransactionId\":\"$included\",\"publishedReleaseId\":\"$release_id\",\"publishedAt\":\"$published_at\",\"retryable\":false,\"errorCode\":\"\",\"message\":\"Queued by sync test\",\"contentType\":\"science-article\",\"stableId\":\"example-id\"}" > "$file"
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$file"
}

prepare_queue_state_blob() {
  local latest=$1
  local output="$TEST_ROOT/queue-state-$latest.json"
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file blob refs/algae/queue-state | \
    "$NODE_BIN" -e '
const fs = require("fs");
const [latest, output] = process.argv.slice(1);
const state = JSON.parse(fs.readFileSync(0, "utf8"));
state.latestUploadTransactionId = latest;
state.updatedAt = new Date().toISOString();
fs.writeFileSync(output, `${JSON.stringify(state)}\n`);
' "$latest" "$output"
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$output"
}

set_pending_with_upload() {
  local transaction_id=$1
  local commit=$2
  local pending_old source_pending_old queue_old queue_new upload_blob
  pending_old=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/pending)
  if "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet refs/algae/source/pending; then
    source_pending_old=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/source/pending)
  else
    source_pending_old=""
  fi
  queue_old=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/queue-state)
  queue_new=$(prepare_queue_state_blob "$transaction_id")
  upload_blob=$(make_upload_blob "$transaction_id" "$commit")
  {
    printf 'start\n'
    printf 'update refs/algae/pending %s %s\n' "$commit" "$pending_old"
    if [[ -n "$source_pending_old" ]]; then
      printf 'update refs/algae/source/pending %s %s\n' "$commit" "$source_pending_old"
    else
      printf 'create refs/algae/source/published %s\n' "$pending_old"
      printf 'create refs/algae/source/pending %s\n' "$commit"
    fi
    printf 'update refs/algae/queue-state %s %s\n' "$queue_new" "$queue_old"
    printf 'create refs/algae/upload-sources/%s %s\n' "$transaction_id" "$commit"
    printf 'create refs/algae/upload-content/%s %s\n' "$transaction_id" "$commit"
    printf 'create refs/algae/upload-transactions/%s %s\n' "$transaction_id" "$upload_blob"
    printf 'prepare\ncommit\n'
  } | "$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref --stdin
}

coalesce_upload() {
  local transaction_id=$1
  local target_commit=$2
  local ref="refs/algae/upload-transactions/$transaction_id"
  local old_blob new_file="$TEST_ROOT/coalesced-$transaction_id.json" new_blob
  old_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$ref")
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file blob "$old_blob" | \
    "$NODE_BIN" -e '
const fs = require("fs");
const [target, output] = process.argv.slice(1);
const state = JSON.parse(fs.readFileSync(0, "utf8"));
state.status = "COALESCED";
state.coalescedIntoCommit = target;
state.message = "Included in newer test pending commit";
fs.writeFileSync(output, `${JSON.stringify(state)}\n`);
' "$target_commit" "$new_file"
  new_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$new_file")
  "$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref "$ref" "$new_blob" "$old_blob"
}

prepare_pending_build_hook() {
  local transaction_id=$1
  local commit=$2
  local upload_blob
  upload_blob=$(make_upload_blob "$transaction_id" "$commit")
  cat > "$TEST_ROOT/advance-pending-during-build.sh" <<HOOK
#!/usr/bin/env bash
set -Eeuo pipefail
old_queue=\$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/queue-state)
"$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file blob "\$old_queue" | "$NODE_BIN" -e '
const fs = require("fs");
const state = JSON.parse(fs.readFileSync(0, "utf8"));
state.latestUploadTransactionId = "$transaction_id";
state.updatedAt = new Date().toISOString();
fs.writeFileSync(process.argv[1], JSON.stringify(state) + "\\n");
' "$TEST_ROOT/hook-queue-state.json"
new_queue=\$("$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$TEST_ROOT/hook-queue-state.json")
{
  printf 'start\\n'
  printf 'update refs/algae/pending %s %s\\n' '$commit' '$PENDING_BEFORE_HOOK'
  printf 'update refs/algae/source/pending %s %s\\n' '$commit' '$SOURCE_PENDING_BEFORE_HOOK'
  printf 'update refs/algae/queue-state %s %s\\n' "\$new_queue" "\$old_queue"
  printf 'create refs/algae/upload-sources/%s %s\\n' '$transaction_id' '$commit'
  printf 'create refs/algae/upload-content/%s %s\\n' '$transaction_id' '$commit'
  printf 'create refs/algae/upload-transactions/%s %s\\n' '$transaction_id' '$upload_blob'
  printf 'prepare\\ncommit\\n'
} | "$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref --stdin
HOOK
  chmod 0755 -- "$TEST_ROOT/advance-pending-during-build.sh"
  printf '%s' "$TEST_ROOT/advance-pending-during-build.sh"
}

cat > "$TEST_ROOT/mock-npm" <<'MOCK_NPM'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${MOCK_NPM_LOG:?}"
if [[ "$*" == "ci "* && -n "${MOCK_NPM_READY_FILE:-}" ]]; then
  : > "$MOCK_NPM_READY_FILE"
  sleep "${MOCK_NPM_SLEEP_SECONDS:-0}"
fi
if [[ "$*" == "ci "* && "${MOCK_NPM_TRANSIENT:-0}" == "1" ]]; then
  printf 'npm ERR! EAI_AGAIN temporary failure\n' >&2
  exit 1
fi
if [[ "$*" == "run content:validate -- --json" && "${MOCK_NPM_DETERMINISTIC:-0}" == "1" ]]; then
  printf 'deterministic content validation failure\n' >&2
  exit 2
fi
if [[ "$*" == "run build:next" && -n "${MOCK_BUILD_HOOK:-}" && ! -e "${MOCK_BUILD_HOOK_MARKER:?}" ]]; then
  bash "$MOCK_BUILD_HOOK"
  : > "$MOCK_BUILD_HOOK_MARKER"
fi
exit 0
MOCK_NPM
chmod 0755 -- "$TEST_ROOT/mock-npm"

cat > "$TEST_ROOT/mock-curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'curl %s\n' "$*" >> "${MOCK_LOG:?}"
output=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--output" && $# -ge 2 ]]; then
    output=$2
    shift
  fi
  shift
done
if [[ -n "$output" ]]; then
  printf '%s\n' "{\"sha\":\"${MOCK_SITE_SHA:?}\",\"commit\":{\"tree\":{\"sha\":\"${MOCK_SITE_TREE:?}\"}}}" > "$output"
  exit 0
fi
[[ "${MOCK_HEALTH_FAIL:-0}" != "1" ]]
MOCK_CURL
chmod 0755 -- "$TEST_ROOT/mock-curl"

cat > "$TEST_ROOT/mock-systemctl" <<'MOCK_SYSTEMCTL'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'systemctl %s\n' "$*" >> "${MOCK_LOG:?}"
if [[ "$*" == *"algae-content-sync.timer"* ]]; then
  exit 1
fi
if [[ "$1" == "is-active" && "${MOCK_SERVICE_INACTIVE:-0}" == "1" ]]; then
  exit 3
fi
exit 0
MOCK_SYSTEMCTL
chmod 0755 -- "$TEST_ROOT/mock-systemctl"

: > "$MOCK_LOG"
: > "$NPM_LOG"

git_setup "$SOURCE_REPOSITORY"
mkdir -p -- \
  "$SOURCE_REPOSITORY/content/authors" \
  "$SOURCE_REPOSITORY/content/media" \
  "$SOURCE_REPOSITORY/content/records/science-article/example-id" \
  "$SOURCE_REPOSITORY/public/images/uploads"
touch \
  "$SOURCE_REPOSITORY/content/authors/.gitkeep" \
  "$SOURCE_REPOSITORY/content/media/.gitkeep" \
  "$SOURCE_REPOSITORY/public/images/uploads/.gitkeep"
write_content_record "Published A"
printf 'Published A body\n' > "$SOURCE_REPOSITORY/content/records/science-article/example-id/zh.md"
"$GIT_BIN" -C "$SOURCE_REPOSITORY" add .
"$GIT_BIN" -C "$SOURCE_REPOSITORY" commit -q -m "content: published A"
commit_a=$("$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse HEAD)

mkdir -p -- "$CONTENT_ROOT" "$RELEASES_ROOT"
"$GIT_BIN" clone -q --no-hardlinks "$SOURCE_REPOSITORY" "$CONTENT_REPOSITORY"
"$GIT_BIN" -C "$CONTENT_REPOSITORY" remote remove origin

git_setup "$SITE_SOURCE"
mkdir -p -- "$SITE_SOURCE/content" "$SITE_SOURCE/public/images/uploads"
printf '{}\n' > "$SITE_SOURCE/package.json"
touch "$SITE_SOURCE/content/.gitkeep" "$SITE_SOURCE/public/images/uploads/.gitkeep"
"$GIT_BIN" -C "$SITE_SOURCE" add .
"$GIT_BIN" -C "$SITE_SOURCE" commit -q -m "site: fixed source"
site_commit=$("$GIT_BIN" -C "$SITE_SOURCE" rev-parse HEAD)
site_tree=$("$GIT_BIN" -C "$SITE_SOURCE" rev-parse 'HEAD^{tree}')

initial_release_id=release-a
initial_release="$RELEASES_ROOT/$initial_release_id"
mkdir -p -- "$initial_release"
printf '%s\n' "$site_commit" > "$initial_release/.release-sha"
printf '%s\n' "$commit_a" > "$initial_release/.content-sha"
printf '%s\n' "$initial_release_id" > "$initial_release/.release-id"
printf '%s\n' "$initial_release" > "$CURRENT_LINK"

cache_entry="$CONTENT_ROOT/site-source-cache/$site_commit-$site_tree"
mkdir -p -- "$cache_entry"
cp -a -- "$SITE_SOURCE" "$cache_entry/repository"
printf '%s\n' "$site_commit" > "$cache_entry/site-sha"
printf '%s\n' "$site_tree" > "$cache_entry/tree-sha"

COMMON_ENV=(
  ALGAE_CONTENTCTL_TESTING=1
  ALGAE_TEST_LINK_FILES=1
  ALGAE_CONTENT_ROOT="$CONTENT_ROOT"
  ALGAE_INCOMING_ROOT="$TEST_ROOT/incoming"
  ALGAE_SITE_ROOT="$SITE_ROOT"
  ALGAE_SITE_REPOSITORY_URL="https://example.invalid/algae-atlas.git"
  ALGAE_SITE_REPOSITORY_API_URL="https://example.invalid/api"
  ALGAE_GIT_BIN="$GIT_BIN"
  ALGAE_NODE_BIN="$NODE_BIN"
  ALGAE_CHMOD_BIN="$CHMOD_BIN"
  ALGAE_NPM_BIN="$TEST_ROOT/mock-npm"
  ALGAE_SYSTEMCTL_BIN="$TEST_ROOT/mock-systemctl"
  ALGAE_CURL_BIN="$TEST_ROOT/mock-curl"
  ALGAE_TAR_BIN="$TAR_BIN"
  ALGAE_TIMEOUT_BIN="$TIMEOUT_BIN"
  ALGAE_HEALTH_ATTEMPTS=1
  MOCK_SITE_SHA="$site_commit"
  MOCK_SITE_TREE="$site_tree"
  MOCK_LOG="$MOCK_LOG"
  MOCK_NPM_LOG="$NPM_LOG"
  MOCK_BUILD_HOOK_MARKER="$BUILD_HOOK_MARKER"
)

run_ctl() {
  env "${COMMON_ENV[@]}" bash "$CONTROLLER" "$@"
}

run_sync_env() {
  local trigger=$1
  shift
  env "${COMMON_ENV[@]}" "$@" bash "$CONTROLLER" sync-pending --trigger "$trigger" --json
}

init_json=$(run_ctl queue-init --published "$commit_a" --json)
assert_json_field "$init_json" ok true
assert_json_field "$init_json" site_commit "$site_commit"

skipped_json=$(run_ctl sync-pending --trigger manual --json)
assert_json_field "$skipped_json" status SKIPPED_NO_PENDING
[[ ! -s "$NPM_LOG" ]] || fail_test "no-pending synchronization ran a build"
skipped_id=$(json_field "$skipped_json" sync_transaction_id)
if ! status_json=$(run_ctl sync-status "$skipped_id" --json); then
  fail_test "sync-status rejected skipped transaction: $status_json"
fi
assert_sync_status_schema "$status_json"
assert_json_field "$status_json" status SKIPPED_NO_PENDING

tx_b1=000000000000000000000000000000b1
tx_b2=000000000000000000000000000000b2
tx_c=000000000000000000000000000000c0
commit_b1=$(make_content_commit "$commit_a" "Pending B1")
commit_b2=$(make_content_commit "$commit_b1" "Pending B2")
commit_c=$(make_content_commit "$commit_b2" "Pending C")
set_pending_with_upload "$tx_b1" "$commit_b1"
coalesce_upload "$tx_b1" "$commit_b2"
set_pending_with_upload "$tx_b2" "$commit_b2"
PENDING_BEFORE_HOOK=$commit_b2
SOURCE_PENDING_BEFORE_HOOK=$commit_b2
export PENDING_BEFORE_HOOK SOURCE_PENDING_BEFORE_HOOK
build_hook=$(prepare_pending_build_hook "$tx_c" "$commit_c")

if ! sync_b=$(run_sync_env manual MOCK_BUILD_HOOK="$build_hook"); then
  fail_test "fixed B synchronization failed: $sync_b"
fi
assert_json_field "$sync_b" status PUBLISHED
assert_json_field "$sync_b" max_attempts 3
sync_b_id=$(json_field "$sync_b" sync_transaction_id)
release_b=$(json_field "$sync_b" release_id)
assert_ref_equals refs/algae/published "$commit_b2"
assert_ref_equals refs/algae/pending "$commit_c"
assert_ref_equals refs/algae/source/published "$commit_b2"
assert_ref_equals refs/algae/source/pending "$commit_c"
assert_ref_missing refs/algae/syncing
assert_ref_missing refs/algae/source/syncing
assert_ref_missing refs/algae/sync-active
[[ $(<"$CURRENT_LINK") == "$RELEASES_ROOT/$release_b" ]] || fail_test "isolated current did not switch to release B"
[[ $(<"$RELEASES_ROOT/$release_b/.content-sha") == "$commit_b2" ]] || \
  fail_test "release was not built from the fixed B content snapshot"
[[ $(<"$RELEASES_ROOT/$release_b/.release-sha") == "$site_commit" ]] || \
  fail_test "release did not retain the fixed website source commit"
upload_b2=$(run_ctl publish-status --transaction "$tx_b2" --json)
assert_json_field "$upload_b2" status PUBLISHED
assert_json_field "$upload_b2" includedInSyncTransactionId "$sync_b_id"
assert_json_field "$upload_b2" publishedReleaseId "$release_b"
upload_b1=$(run_ctl publish-status --transaction "$tx_b1" --json)
assert_json_field "$upload_b1" status COALESCED
assert_json_field "$upload_b1" includedInSyncTransactionId "$sync_b_id"
upload_c=$(run_ctl publish-status --transaction "$tx_c" --json)
assert_json_field "$upload_c" status QUEUED
assert_json_field "$upload_c" includedInSyncTransactionId ""

if transient_json=$(run_sync_env scheduled MOCK_NPM_TRANSIENT=1); then
  fail_test "transient dependency failure returned success"
fi
assert_json_field "$transient_json" status FAILED_RETRYABLE
assert_json_field "$transient_json" retryable true
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/published) == "$commit_b2" ]] || \
  fail_test "transient failure advanced published"
assert_json_field "$(run_ctl publish-status --transaction "$tx_c" --json)" status QUEUED

sync_c=$(run_ctl sync-pending --trigger scheduled --json)
assert_json_field "$sync_c" status PUBLISHED
assert_json_field "$sync_c" attempt 2
assert_ref_equals refs/algae/published "$commit_c"

printf 'algae-contentctl sync smoke chain: PASS\n'

# A scheduled caller that reaches the build gate owns the global sync lock.
tx_scheduled=000000000000000000000000000000d0
commit_scheduled=$(make_content_commit "$commit_c" "Concurrent scheduled")
set_pending_with_upload "$tx_scheduled" "$commit_scheduled"
scheduled_ready="$TEST_ROOT/scheduled-ready"
scheduled_output="$TEST_ROOT/scheduled-primary.json"
builds_before=$(npm_build_count)
env "${COMMON_ENV[@]}" \
  MOCK_NPM_READY_FILE="$scheduled_ready" \
  MOCK_NPM_SLEEP_SECONDS=15 \
  bash "$CONTROLLER" sync-pending --trigger scheduled --json > "$scheduled_output" &
scheduled_pid=$!
wait_for_marker "$scheduled_ready" "$scheduled_pid" "$scheduled_output"
scheduled_contender=$(run_ctl sync-pending --trigger scheduled --json)
assert_sync_status_schema "$scheduled_contender"
assert_json_field "$scheduled_contender" status PREPARING_DEPENDENCIES
if ! wait "$scheduled_pid"; then
  fail_test "primary scheduled synchronization failed: $(<"$scheduled_output")"
fi
scheduled_primary=$(<"$scheduled_output")
assert_json_field "$scheduled_primary" status PUBLISHED
assert_json_field "$scheduled_contender" sync_transaction_id \
  "$(json_field "$scheduled_primary" sync_transaction_id)"
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "two scheduled callers ran more than one build"
assert_ref_equals refs/algae/published "$commit_scheduled"

# One manual owner also joins both a duplicate manual request and a timer request.
tx_manual=000000000000000000000000000000e0
commit_manual=$(make_content_commit "$commit_scheduled" "Concurrent manual")
set_pending_with_upload "$tx_manual" "$commit_manual"
manual_ready="$TEST_ROOT/manual-ready"
manual_primary_output="$TEST_ROOT/manual-primary.json"
manual_contender_output="$TEST_ROOT/manual-contender.json"
timer_contender_output="$TEST_ROOT/timer-contender.json"
builds_before=$(npm_build_count)
env "${COMMON_ENV[@]}" \
  MOCK_NPM_READY_FILE="$manual_ready" \
  MOCK_NPM_SLEEP_SECONDS=15 \
  bash "$CONTROLLER" sync-pending --trigger manual --json > "$manual_primary_output" &
manual_primary_pid=$!
wait_for_marker "$manual_ready" "$manual_primary_pid" "$manual_primary_output"
run_ctl sync-pending --trigger manual --json > "$manual_contender_output" &
manual_contender_pid=$!
run_ctl sync-pending --trigger scheduled --json > "$timer_contender_output" &
timer_contender_pid=$!
if ! wait "$manual_contender_pid"; then
  fail_test "duplicate manual synchronization did not join the active transaction"
fi
if ! wait "$timer_contender_pid"; then
  fail_test "scheduled synchronization did not join the active manual transaction"
fi
if ! wait "$manual_primary_pid"; then
  fail_test "primary manual synchronization failed: $(<"$manual_primary_output")"
fi
manual_primary=$(<"$manual_primary_output")
manual_contender=$(<"$manual_contender_output")
timer_contender=$(<"$timer_contender_output")
manual_sync_id=$(json_field "$manual_primary" sync_transaction_id)
assert_json_field "$manual_primary" status PUBLISHED
assert_json_field "$manual_contender" sync_transaction_id "$manual_sync_id"
assert_json_field "$timer_contender" sync_transaction_id "$manual_sync_id"
assert_json_field "$manual_contender" status PREPARING_DEPENDENCIES
assert_json_field "$timer_contender" status PREPARING_DEPENDENCIES
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "manual and scheduled contenders ran duplicate builds"
assert_ref_equals refs/algae/published "$commit_manual"

# Deterministic validation failures block the same commit without rebuilding it.
tx_blocked=000000000000000000000000000000f0
commit_blocked=$(make_content_commit "$commit_manual" "Deterministic blocked")
set_pending_with_upload "$tx_blocked" "$commit_blocked"
if blocked_json=$(run_sync_env scheduled MOCK_NPM_DETERMINISTIC=1); then
  fail_test "deterministic validation failure returned success"
fi
assert_json_field "$blocked_json" status FAILED_BLOCKED
assert_json_field "$blocked_json" blocked true
assert_json_field "$blocked_json" retryable false
blocked_sync_id=$(json_field "$blocked_json" sync_transaction_id)
blocked_status=$(run_ctl sync-status "$blocked_sync_id" --json)
assert_sync_status_schema "$blocked_status"
assert_json_field "$blocked_status" error_code BUILD_FAILED
assert_ref_equals refs/algae/published "$commit_manual"
assert_ref_equals refs/algae/pending "$commit_blocked"
assert_ref_missing refs/algae/sync-active
builds_before=$(npm_build_count)
if blocked_repeat=$(run_sync_env scheduled); then
  fail_test "blocked commit automatically retried"
fi
assert_json_field "$blocked_repeat" sync_transaction_id "$blocked_sync_id"
assert_json_field "$blocked_repeat" status FAILED_BLOCKED
[[ $(npm_build_count) -eq "$builds_before" ]] || \
  fail_test "blocked commit ran another build"
pending_blocked=$(run_ctl pending-status --json)
assert_json_field "$pending_blocked" blocked_content_commit "$commit_blocked"

# A newer pending commit clears the old block and publishes the complete snapshot.
tx_after_block=000000000000000000000000000000a2
commit_after_block=$(make_content_commit "$commit_blocked" "Pending after block")
set_pending_with_upload "$tx_after_block" "$commit_after_block"
after_block_json=$(run_ctl sync-pending --trigger scheduled --json)
assert_json_field "$after_block_json" status PUBLISHED
after_block_sync_id=$(json_field "$after_block_json" sync_transaction_id)
assert_ref_equals refs/algae/published "$commit_after_block"
assert_ref_missing refs/algae/sync-blocked
blocked_upload=$(run_ctl publish-status --transaction "$tx_blocked" --json)
assert_json_field "$blocked_upload" status COALESCED
assert_json_field "$blocked_upload" includedInSyncTransactionId "$after_block_sync_id"

# A failed live health check rolls release links back and requires explicit retry.
tx_health=000000000000000000000000000000a3
commit_health=$(make_content_commit "$commit_after_block" "Health rollback")
set_pending_with_upload "$tx_health" "$commit_health"
current_before_health=$(<"$CURRENT_LINK")
previous_before_health=$(<"$PREVIOUS_LINK")
if health_json=$(run_sync_env scheduled MOCK_HEALTH_FAIL=1); then
  fail_test "failed production health check returned success"
fi
assert_json_field "$health_json" status FAILED_BLOCKED
health_sync_id=$(json_field "$health_json" sync_transaction_id)
health_status=$(run_ctl sync-status "$health_sync_id" --json)
health_release_path=$(json_field "$health_status" release_path)
assert_json_field "$health_status" error_code HEALTH_CHECK_FAILED
[[ $(<"$CURRENT_LINK") == "$current_before_health" ]] || \
  fail_test "health failure did not restore current"
[[ $(<"$PREVIOUS_LINK") == "$previous_before_health" ]] || \
  fail_test "health failure did not restore previous"
[[ ! -e "$health_release_path" ]] || fail_test "failed unrecovered release was not cleaned up"
assert_ref_equals refs/algae/published "$commit_after_block"
assert_ref_equals refs/algae/pending "$commit_health"
assert_ref_missing refs/algae/sync-active
if invalid_retry=$(run_ctl sync-pending --trigger scheduled --retry-blocked --json); then
  fail_test "scheduled --retry-blocked was accepted"
fi
assert_json_field "$invalid_retry" code INVALID_ARGUMENTS
health_retry=$(run_ctl sync-pending --trigger manual --retry-blocked --json)
assert_json_field "$health_retry" status PUBLISHED
assert_json_field "$health_retry" attempt 2
assert_ref_equals refs/algae/published "$commit_health"
assert_ref_missing refs/algae/sync-blocked

# Legacy schema v1 without siteCommit blocks safely and never asks for latest main.
tx_missing_site=000000000000000000000000000000a4
commit_missing_site=$(make_content_commit "$commit_health" "Missing site commit")
set_pending_with_upload "$tx_missing_site" "$commit_missing_site"
remove_queue_site_commit
curl_before_missing=$(curl_call_count)
if missing_site_json=$(run_ctl sync-pending --trigger scheduled --json); then
  fail_test "missing trusted site commit synchronized content"
fi
assert_json_field "$missing_site_json" code SITE_COMMIT_UNAVAILABLE
assert_json_field "$missing_site_json" status FAILED_BLOCKED
[[ $(curl_call_count) -eq "$curl_before_missing" ]] || \
  fail_test "missing site commit attempted a network source lookup"
assert_ref_equals refs/algae/published "$commit_health"
assert_ref_equals refs/algae/pending "$commit_missing_site"
missing_site_migration=$(run_ctl queue-init --published "$commit_health" --json)
assert_json_field "$missing_site_migration" site_commit "$site_commit"
missing_site_retry=$(run_ctl sync-pending --trigger manual --retry-blocked --json)
assert_json_field "$missing_site_retry" status PUBLISHED
assert_ref_equals refs/algae/published "$commit_missing_site"

# A crash immediately after snapshot recovers the same immutable transaction.
tx_snapshot_crash=000000000000000000000000000000a5
commit_snapshot_crash=$(make_content_commit "$commit_missing_site" "Snapshot crash recovery")
set_pending_with_upload "$tx_snapshot_crash" "$commit_snapshot_crash"
if run_sync_env manual ALGAE_SYNC_TEST_CRASH_AFTER_SNAPSHOT=1 >/dev/null; then
  fail_test "snapshot crash hook returned success"
fi
snapshot_active=$(run_ctl sync-status --json)
snapshot_sync_id=$(json_field "$snapshot_active" sync_transaction_id)
assert_json_field "$snapshot_active" status SNAPSHOTTING
assert_ref_equals refs/algae/syncing "$commit_snapshot_crash"
if ! snapshot_recovered=$(run_ctl sync-pending --trigger scheduled --json); then
  fail_test "snapshot recovery failed: $snapshot_recovered"
fi
assert_json_field "$snapshot_recovered" sync_transaction_id "$snapshot_sync_id"
assert_json_field "$snapshot_recovered" trigger recovery
assert_json_field "$snapshot_recovered" recovered true
assert_json_field "$snapshot_recovered" status PUBLISHED
assert_ref_equals refs/algae/published "$commit_snapshot_crash"

# A completed build is adopted on recovery without running npm again.
tx_build_crash=000000000000000000000000000000a6
commit_build_crash=$(make_content_commit "$commit_snapshot_crash" "Built release recovery")
set_pending_with_upload "$tx_build_crash" "$commit_build_crash"
builds_before=$(npm_build_count)
if run_sync_env scheduled ALGAE_SYNC_TEST_CRASH_AFTER_BUILD=1 >/dev/null; then
  fail_test "post-build crash hook returned success"
fi
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "post-build crash did not complete exactly one build"
built_active=$(run_ctl sync-status --json)
built_sync_id=$(json_field "$built_active" sync_transaction_id)
built_release_path=$(json_field "$built_active" release_path)
[[ -d "$built_release_path" ]] || fail_test "completed pre-switch release was not retained"
if ! built_recovered=$(run_ctl sync-pending --trigger manual --json); then
  fail_test "built release recovery failed: $built_recovered"
fi
assert_json_field "$built_recovered" sync_transaction_id "$built_sync_id"
assert_json_field "$built_recovered" recovered true
assert_json_field "$built_recovered" status PUBLISHED
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "built release recovery rebuilt the site"
assert_ref_equals refs/algae/published "$commit_build_crash"

# A health-verified switched release only needs atomic ref finalization.
tx_health_marker_crash=000000000000000000000000000000a7
commit_health_marker_crash=$(make_content_commit "$commit_build_crash" "Health marker recovery")
set_pending_with_upload "$tx_health_marker_crash" "$commit_health_marker_crash"
builds_before=$(npm_build_count)
if run_sync_env manual ALGAE_SYNC_TEST_CRASH_AFTER_HEALTH=1 >/dev/null; then
  fail_test "post-health crash hook returned success"
fi
marker_active=$(run_ctl sync-status --json)
marker_sync_id=$(json_field "$marker_active" sync_transaction_id)
assert_json_field "$marker_active" switch_completed true
assert_json_field "$marker_active" health_verified true
if ! marker_recovered=$(run_ctl sync-pending --trigger scheduled --json); then
  fail_test "health-marker recovery failed: $marker_recovered"
fi
assert_json_field "$marker_recovered" sync_transaction_id "$marker_sync_id"
assert_json_field "$marker_recovered" recovered true
assert_json_field "$marker_recovered" status PUBLISHED
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "health-marker recovery rebuilt the site"
assert_ref_equals refs/algae/published "$commit_health_marker_crash"

# A switched release without a marker must pass a fresh live health check.
tx_switch_crash=000000000000000000000000000000a8
commit_switch_crash=$(make_content_commit "$commit_health_marker_crash" "Live health recovery")
set_pending_with_upload "$tx_switch_crash" "$commit_switch_crash"
builds_before=$(npm_build_count)
if run_sync_env scheduled ALGAE_SYNC_TEST_CRASH_AFTER_SWITCH=1 >/dev/null; then
  fail_test "post-switch crash hook returned success"
fi
switch_active=$(run_ctl sync-status --json)
switch_sync_id=$(json_field "$switch_active" sync_transaction_id)
assert_json_field "$switch_active" switch_completed true
assert_json_field "$switch_active" health_verified false
health_calls_before=$(curl_call_count)
if ! switch_recovered=$(run_ctl sync-pending --trigger manual --json); then
  fail_test "live-health recovery failed: $switch_recovered"
fi
assert_json_field "$switch_recovered" sync_transaction_id "$switch_sync_id"
assert_json_field "$switch_recovered" recovered true
assert_json_field "$switch_recovered" status PUBLISHED
[[ $(curl_call_count) -gt "$health_calls_before" ]] || \
  fail_test "post-switch recovery trusted state without a live health check"
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "post-switch live-health recovery rebuilt the site"
assert_ref_equals refs/algae/published "$commit_switch_crash"

# A failed recovery health check rolls back and leaves the commit blocked.
tx_recovery_health=000000000000000000000000000000a9
commit_recovery_health=$(make_content_commit "$commit_switch_crash" "Recovery health rollback")
set_pending_with_upload "$tx_recovery_health" "$commit_recovery_health"
recovery_current_before=$(<"$CURRENT_LINK")
recovery_previous_before=$(<"$PREVIOUS_LINK")
builds_before=$(npm_build_count)
if run_sync_env manual ALGAE_SYNC_TEST_CRASH_AFTER_SWITCH=1 >/dev/null; then
  fail_test "recovery-health crash hook returned success"
fi
recovery_health_active=$(run_ctl sync-status --json)
recovery_health_id=$(json_field "$recovery_health_active" sync_transaction_id)
if recovery_health_failure=$(run_sync_env scheduled MOCK_HEALTH_FAIL=1); then
  fail_test "failed recovery health check returned success"
fi
assert_json_field "$recovery_health_failure" sync_transaction_id "$recovery_health_id"
assert_json_field "$recovery_health_failure" status FAILED_BLOCKED
assert_json_field "$recovery_health_failure" code HEALTH_CHECK_FAILED
[[ $(<"$CURRENT_LINK") == "$recovery_current_before" ]] || \
  fail_test "recovery health failure did not restore current"
[[ $(<"$PREVIOUS_LINK") == "$recovery_previous_before" ]] || \
  fail_test "recovery health failure did not restore previous"
[[ $(npm_build_count) -eq $((builds_before + 1)) ]] || \
  fail_test "failed recovery health check rebuilt the site"
assert_ref_equals refs/algae/published "$commit_switch_crash"
recovery_health_retry=$(run_ctl sync-pending --trigger manual --retry-blocked --json)
assert_json_field "$recovery_health_retry" status PUBLISHED
assert_ref_equals refs/algae/published "$commit_recovery_health"

# Corrupting the active index fails closed and retains every recovery artifact.
tx_corrupt=000000000000000000000000000000aa
commit_corrupt=$(make_content_commit "$commit_recovery_health" "Corrupt active state")
set_pending_with_upload "$tx_corrupt" "$commit_corrupt"
if run_sync_env scheduled ALGAE_SYNC_TEST_CRASH_AFTER_SNAPSHOT=1 >/dev/null; then
  fail_test "corrupt-state setup crash hook returned success"
fi
corrupt_active=$(run_ctl sync-status --json)
corrupt_sync_id=$(json_field "$corrupt_active" sync_transaction_id)
corrupt_transaction_ref="refs/algae/sync-transactions/$corrupt_sync_id"
corrupt_transaction_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$corrupt_transaction_ref")
corrupt_active_old=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/sync-active)
printf '{"broken":true}\n' > "$TEST_ROOT/corrupt-active.json"
corrupt_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$TEST_ROOT/corrupt-active.json")
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref refs/algae/sync-active "$corrupt_blob" "$corrupt_active_old"
current_before_corrupt=$(<"$CURRENT_LINK")
if corrupt_json=$(run_ctl sync-pending --trigger manual --json); then
  fail_test "corrupt active state was overwritten"
fi
assert_json_field "$corrupt_json" code SYNC_STATE_CORRUPT
assert_ref_equals refs/algae/sync-active "$corrupt_blob"
assert_ref_equals "$corrupt_transaction_ref" "$corrupt_transaction_blob"
assert_ref_equals refs/algae/syncing "$commit_corrupt"
assert_ref_equals refs/algae/published "$commit_recovery_health"
[[ $(<"$CURRENT_LINK") == "$current_before_corrupt" ]] || \
  fail_test "corrupt active state changed production current"

if grep -q '/commits/main' "$MOCK_LOG"; then
  fail_test "synchronization silently requested latest main"
fi

printf 'algae-contentctl synchronization tests: PASS (35 required scenarios)\n'
