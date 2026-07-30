#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077
export PATH="/usr/bin:$PATH"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_TERMINAL_PROMPT=0

readonly TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/algae-content-queue-test.XXXXXX")"
readonly CONTROLLER="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)/algae-contentctl"
readonly GIT_BIN="$(command -v git)"
readonly NODE_BIN="$(command -v node || true)"
readonly CHMOD_BIN="$(command -v chmod)"
readonly SOURCE_REPOSITORY="$TEST_ROOT/source"
readonly CONTENT_ROOT="$TEST_ROOT/content-root"
readonly CONTENT_REPOSITORY="$CONTENT_ROOT/repository"
readonly INCOMING_ROOT="$TEST_ROOT/incoming"
readonly SITE_ROOT="$TEST_ROOT/site"
readonly EXTERNAL_LOG="$TEST_ROOT/external.log"
LOCK_HOLDER_PID=""

cleanup() {
  if [[ -n "$LOCK_HOLDER_PID" ]]; then
    kill "$LOCK_HOLDER_PID" 2>/dev/null || true
    wait "$LOCK_HOLDER_PID" 2>/dev/null || true
  fi
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

[[ -x "$GIT_BIN" ]] || { printf 'git is required\n' >&2; exit 1; }
[[ -n "$NODE_BIN" ]] || { printf 'node is required\n' >&2; exit 1; }

fail_test() {
  printf 'queue test failed: %s\n' "$1" >&2
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

json_field() {
  "$NODE_BIN" -e 'process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]] ?? ""))' "$1" "$2"
}

assert_pending_schema() {
  "$NODE_BIN" -e '
const value = JSON.parse(process.argv[1]);
const expected = ["action", "has_pending_changes", "latest_upload_transaction_id", "message",
  "next_scheduled_sync_at", "ok", "pending_content_commit", "pending_upload_count",
  "published_content_commit", "queue_protocol_version", "schema_version", "server_time",
  "syncing_content_commit"].sort();
if (Object.keys(value).sort().join("\n") !== expected.join("\n")) process.exit(1);
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.server_time)) process.exit(2);
' "$1" || fail_test "pending-status schema changed: $1"
}

git_setup() {
  local repository=$1
  mkdir -p -- "$repository"
  "$GIT_BIN" init -q --initial-branch=main "$repository"
  "$GIT_BIN" -C "$repository" config user.name "Queue Test"
  "$GIT_BIN" -C "$repository" config user.email "queue-test@example.invalid"
  "$GIT_BIN" -C "$repository" config core.autocrlf false
}

write_record() {
  local title=$1
  local updated_at=$2
  printf '%s\n' "{\"schemaVersion\":1,\"id\":\"example-id\",\"type\":\"science-article\",\"updatedAt\":\"$updated_at\",\"media\":[],\"locales\":{\"zh\":{\"title\":\"$title\",\"bodyFile\":\"zh.md\"},\"en\":{\"missing\":true}}}" \
    > "$SOURCE_REPOSITORY/content/records/science-article/example-id/record.json"
}

commit_record() {
  local base=$1
  local title=$2
  local updated_at=$3
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" checkout -q --detach "$base"
  write_record "$title" "$updated_at"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" add -- content/records/science-article/example-id/record.json
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" commit -q -m "content: publish example-id"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse HEAD
}

commit_invalid_record() {
  local base=$1
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" checkout -q --detach "$base"
  printf '{invalid json\n' > "$SOURCE_REPOSITORY/content/records/science-article/example-id/record.json"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" add -- content/records/science-article/example-id/record.json
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" commit -q -m "content: publish example-id"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse HEAD
}

LAST_DELIVERY=""
LAST_BUNDLE=""
LAST_SHA=""
create_delivery() {
  local transaction_id=$1
  local head_commit=$2
  local base_commit=$3
  local branch="content/direct-$transaction_id-example-id"
  local branch_ref="refs/heads/$branch"
  local delivery="$INCOMING_ROOT/$transaction_id"
  local bundle_name="content-direct-$transaction_id-example-id-v1.bundle"
  local bundle="$delivery/$bundle_name"
  mkdir -p -- "$delivery"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" update-ref "$branch_ref" "$head_commit"
  "$GIT_BIN" -C "$SOURCE_REPOSITORY" bundle create "$bundle" "$branch_ref" >/dev/null
  local bundle_sha bundle_size
  bundle_sha=$(sha256sum -- "$bundle" | awk '{print toupper($1)}')
  bundle_size=$(stat -c '%s' -- "$bundle")
  printf '%s  %s\n' "$bundle_sha" "$bundle_name" > "$delivery/$bundle_name.sha256.txt"
  printf '%s\n' 'queue test handoff' > "$delivery/HANDOFF.md"
  printf '%s\n' 'queue test summary' > "$delivery/TEST-SUMMARY.txt"
  printf '%s\n' 'content/records/science-article/example-id/record.json' > "$delivery/CHANGED-FILES.txt"
  printf '%s\n' 'queue test import helper' > "$delivery/Import-Bundle.ps1"
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$delivery/Validate-Bundle.sh"
  printf '%s\n' 'process.exit(0);' > "$delivery/validate-bundle.mjs"
  cat > "$delivery/MANIFEST.txt" <<MANIFEST
FormatVersion=1
Branch=$branch
HeadCommit=$head_commit
BaseCommit=$base_commit
BundleFile=$bundle_name
BundleSizeBytes=$bundle_size
BundleSha256=$bundle_sha
History=complete
ImportBranch=import/content-direct-$transaction_id-example-id
ChangedFileCount=1
Artifacts=$bundle_name,$bundle_name.sha256.txt,MANIFEST.txt,HANDOFF.md,TEST-SUMMARY.txt,CHANGED-FILES.txt,Import-Bundle.ps1,Validate-Bundle.sh,validate-bundle.mjs
MANIFEST
  LAST_DELIVERY=$delivery
  LAST_BUNDLE=$bundle
  LAST_SHA=$bundle_sha
}

corrupt_bundle_and_refresh_manifest() {
  local bundle=$LAST_BUNDLE
  local bundle_name=${bundle##*/}
  local delivery=${bundle%/*}
  local original_size
  original_size=$(stat -c '%s' -- "$bundle")
  head -c "$((original_size / 2))" -- "$bundle" > "$bundle.truncated"
  mv -- "$bundle.truncated" "$bundle"
  LAST_SHA=$(sha256sum -- "$bundle" | awk '{print toupper($1)}')
  local bundle_size
  bundle_size=$(stat -c '%s' -- "$bundle")
  sed -i -e "s/^BundleSizeBytes=.*/BundleSizeBytes=$bundle_size/" \
    -e "s/^BundleSha256=.*/BundleSha256=$LAST_SHA/" "$delivery/MANIFEST.txt"
  printf '%s  %s\n' "$LAST_SHA" "$bundle_name" > "$delivery/$bundle_name.sha256.txt"
}

cat > "$TEST_ROOT/fail-external" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$0 $*" >> "${QUEUE_EXTERNAL_LOG:?}"
exit 97
MOCK
chmod 0755 -- "$TEST_ROOT/fail-external"
: > "$EXTERNAL_LOG"

cat > "$TEST_ROOT/git-wrapper" <<'MOCK_GIT'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${QUEUE_FAIL_FINAL_UPDATE:-0}" == "1" && " $* " == *" update-ref --stdin "* ]]; then
  while IFS= read -r _line; do :; done
  exit 97
fi
exec "${MOCK_REAL_GIT_BIN:?}" "$@"
MOCK_GIT
chmod 0755 -- "$TEST_ROOT/git-wrapper"

COMMON_ENV=(
  ALGAE_CONTENTCTL_TESTING=1
  ALGAE_CONTENT_ROOT="$CONTENT_ROOT"
  ALGAE_INCOMING_ROOT="$INCOMING_ROOT"
  ALGAE_SITE_ROOT="$SITE_ROOT"
  ALGAE_GIT_BIN="$GIT_BIN"
  ALGAE_NODE_BIN="$NODE_BIN"
  ALGAE_CHMOD_BIN="$CHMOD_BIN"
  ALGAE_NPM_BIN="$TEST_ROOT/fail-external"
  ALGAE_SYSTEMCTL_BIN="$TEST_ROOT/fail-external"
  ALGAE_CURL_BIN="$TEST_ROOT/fail-external"
  ALGAE_TAR_BIN="$TEST_ROOT/fail-external"
  ALGAE_TIMEOUT_BIN="$TEST_ROOT/fail-external"
  QUEUE_EXTERNAL_LOG="$EXTERNAL_LOG"
)

run_ctl() {
  env "${COMMON_ENV[@]}" bash "$CONTROLLER" "$@"
}

run_queue_upload() {
  local transaction_id=$1
  local delivery=$2
  local bundle_sha=$3
  run_ctl queue-upload --transaction "$transaction_id" --bundle "$delivery" \
    --bundle-sha256 "$bundle_sha" --json
}

run_queue_upload_with_atomic_failure() {
  local transaction_id=$1
  local delivery=$2
  local bundle_sha=$3
  env "${COMMON_ENV[@]}" \
    ALGAE_GIT_BIN="$TEST_ROOT/git-wrapper" \
    MOCK_REAL_GIT_BIN="$GIT_BIN" \
    QUEUE_FAIL_FINAL_UPDATE=1 \
    bash "$CONTROLLER" queue-upload --transaction "$transaction_id" --bundle "$delivery" \
      --bundle-sha256 "$bundle_sha" --json
}

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
write_record "Published baseline" "2026-07-29T00:00:00Z"
printf 'Baseline body\n' > "$SOURCE_REPOSITORY/content/records/science-article/example-id/zh.md"
"$GIT_BIN" -C "$SOURCE_REPOSITORY" add .
"$GIT_BIN" -C "$SOURCE_REPOSITORY" commit -q -m "content: initialize queue fixture"
published_commit=$("$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse HEAD)
mkdir -p -- "$CONTENT_ROOT" "$INCOMING_ROOT" "$SITE_ROOT"
"$GIT_BIN" clone -q --no-hardlinks "$SOURCE_REPOSITORY" "$CONTENT_REPOSITORY"
"$GIT_BIN" -C "$CONTENT_REPOSITORY" remote remove origin
printf 'production-current-sentinel\n' > "$SITE_ROOT/current"
current_digest=$(sha256sum -- "$SITE_ROOT/current" | awk '{print $1}')

missing_commit=1111111111111111111111111111111111111111
if missing_init_json=$(run_ctl queue-init --published "$missing_commit" --json); then
  fail_test "queue-init accepted a missing published commit"
fi
assert_json_field "$missing_init_json" code CONTENT_COMMIT_NOT_FOUND
! "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet refs/algae/queue-state || \
  fail_test "failed queue-init created queue refs"

init_json=$(run_ctl queue-init --published "$published_commit" --json)
assert_json_field "$init_json" ok true
assert_json_field "$init_json" action queue-init
assert_json_field "$init_json" published_content_commit "$published_commit"
assert_json_field "$init_json" pending_content_commit "$published_commit"

initial_status=$(run_ctl pending-status --json)
assert_pending_schema "$initial_status"
assert_json_field "$initial_status" has_pending_changes false
assert_json_field "$initial_status" pending_upload_count 0
assert_json_field "$initial_status" latest_upload_transaction_id null
assert_json_field "$initial_status" next_scheduled_sync_at null

tx_a=0000000000000000000000000000000a
commit_a=$(commit_record "$published_commit" "Queued A" "2026-07-29T00:01:00Z")
create_delivery "$tx_a" "$commit_a" "$published_commit"
delivery_a=$LAST_DELIVERY
sha_a=$LAST_SHA
queued_a=$(run_queue_upload "$tx_a" "$delivery_a" "$sha_a")
assert_json_field "$queued_a" ok true
assert_json_field "$queued_a" status QUEUED
assert_json_field "$queued_a" sourceCommit "$commit_a"
status_a=$(run_ctl pending-status --json)
pending_a=$(json_field "$status_a" pending_content_commit)
[[ "$pending_a" != "$published_commit" ]] || fail_test "first upload did not advance pending"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse HEAD) == "$published_commit" ]] || \
  fail_test "queue upload changed repository HEAD"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/published) == "$published_commit" ]] || \
  fail_test "queue upload changed published"
[[ $(sha256sum -- "$SITE_ROOT/current" | awk '{print $1}') == "$current_digest" ]] || \
  fail_test "queue upload changed production current"
[[ ! -s "$EXTERNAL_LOG" ]] || fail_test "queue upload invoked a build, service, network, or release command"

commit_candidate_b=$(commit_record "$commit_a" "Candidate B" "2026-07-29T00:02:00Z")
tx_bad_sha=0000000000000000000000000000001a
create_delivery "$tx_bad_sha" "$commit_candidate_b" "$commit_a"
delivery_bad_sha=$LAST_DELIVERY
sha_bad_sha=$LAST_SHA
wrong_sha=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
[[ "$wrong_sha" != "$sha_bad_sha" ]] || wrong_sha=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
if bad_sha_json=$(run_queue_upload "$tx_bad_sha" "$delivery_bad_sha" "$wrong_sha"); then
  fail_test "queue upload accepted the wrong Bundle SHA-256"
fi
assert_json_field "$bad_sha_json" code TRANSACTION_BUNDLE_MISMATCH
assert_json_field "$(run_ctl publish-status --transaction "$tx_bad_sha" --json)" status FAILED
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_a"

tx_corrupt=0000000000000000000000000000002a
create_delivery "$tx_corrupt" "$commit_candidate_b" "$commit_a"
delivery_corrupt=$LAST_DELIVERY
corrupt_bundle_and_refresh_manifest
sha_corrupt=$LAST_SHA
if corrupt_json=$(run_queue_upload "$tx_corrupt" "$delivery_corrupt" "$sha_corrupt"); then
  fail_test "queue upload accepted a corrupt Git Bundle"
fi
assert_json_field "$corrupt_json" code BUNDLE_INVALID
assert_json_field "$(run_ctl publish-status --transaction "$tx_corrupt" --json)" status FAILED
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_a"

tx_invalid=0000000000000000000000000000003a
invalid_commit=$(commit_invalid_record "$commit_a")
create_delivery "$tx_invalid" "$invalid_commit" "$commit_a"
delivery_invalid=$LAST_DELIVERY
sha_invalid=$LAST_SHA
if invalid_json=$(run_queue_upload "$tx_invalid" "$delivery_invalid" "$sha_invalid"); then
  fail_test "queue upload accepted invalid record JSON"
fi
assert_json_field "$invalid_json" code INVALID_BUNDLE
assert_json_field "$(run_ctl publish-status --transaction "$tx_invalid" --json)" status FAILED
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_a"

tx_b=0000000000000000000000000000000b
commit_b=$(commit_record "$commit_a" "Queued B" "2026-07-29T00:03:00Z")
create_delivery "$tx_b" "$commit_b" "$commit_a"
delivery_b=$LAST_DELIVERY
sha_b=$LAST_SHA
queued_b=$(run_queue_upload "$tx_b" "$delivery_b" "$sha_b")
assert_json_field "$queued_b" status QUEUED
status_b=$(run_ctl pending-status --json)
pending_b=$(json_field "$status_b" pending_content_commit)
[[ "$pending_b" != "$pending_a" ]] || fail_test "fast-forward upload did not advance pending"
assert_json_field "$(run_ctl publish-status --transaction "$tx_a" --json)" status COALESCED

tx_equal=0000000000000000000000000000004a
create_delivery "$tx_equal" "$commit_b" "$commit_a"
delivery_equal=$LAST_DELIVERY
sha_equal=$LAST_SHA
equal_json=$(run_queue_upload "$tx_equal" "$delivery_equal" "$sha_equal")
assert_json_field "$equal_json" status QUEUED
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_b"
assert_json_field "$(run_ctl publish-status --transaction "$tx_b" --json)" status QUEUED

tx_older=0000000000000000000000000000005a
create_delivery "$tx_older" "$commit_a" "$published_commit"
if older_json=$(run_queue_upload "$tx_older" "$LAST_DELIVERY" "$LAST_SHA"); then
  fail_test "queue upload moved pending backward"
fi
assert_json_field "$older_json" code PENDING_BASE_MISMATCH
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_b"

tx_divergent=0000000000000000000000000000006a
divergent_commit=$(commit_record "$commit_a" "Divergent" "2026-07-29T00:04:00Z")
create_delivery "$tx_divergent" "$divergent_commit" "$commit_a"
if divergent_json=$(run_queue_upload "$tx_divergent" "$LAST_DELIVERY" "$LAST_SHA"); then
  fail_test "queue upload accepted divergent history"
fi
assert_json_field "$divergent_json" code PENDING_BASE_MISMATCH
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_b"

tx_c=0000000000000000000000000000000c
commit_c=$(commit_record "$commit_b" "Queued C" "2026-07-29T00:05:00Z")
create_delivery "$tx_c" "$commit_c" "$commit_b"
delivery_c=$LAST_DELIVERY
sha_c=$LAST_SHA
queued_c=$(run_queue_upload "$tx_c" "$delivery_c" "$sha_c")
assert_json_field "$queued_c" status QUEUED
status_c=$(run_ctl pending-status --json)
pending_c=$(json_field "$status_c" pending_content_commit)
[[ "$pending_c" != "$pending_b" ]] || fail_test "C upload did not advance canonical pending"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$pending_c:content") == \
   $("$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse "$commit_c:content") ]] || \
  fail_test "canonical pending content tree does not match source commit C"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$pending_c:public/images/uploads") == \
   $("$GIT_BIN" -C "$SOURCE_REPOSITORY" rev-parse "$commit_c:public/images/uploads") ]] || \
  fail_test "canonical pending upload tree does not match source commit C"
assert_json_field "$status_c" latest_upload_transaction_id "$tx_c"
assert_json_field "$status_c" pending_upload_count 4
for coalesced_id in "$tx_a" "$tx_b" "$tx_equal"; do
  coalesced_json=$(run_ctl publish-status --transaction "$coalesced_id" --json)
  assert_json_field "$coalesced_json" status COALESCED
  assert_json_field "$coalesced_json" coalescedIntoCommit "$pending_c"
done

coalesced_ref="refs/algae/upload-transactions/$tx_a"
coalesced_state_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$coalesced_ref^{blob}")
coalesced_content=$(json_field "$(run_ctl publish-status --transaction "$tx_a" --json)" contentCommit)
coalesced_tree=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "$coalesced_content^{tree}")
off_history_commit=$(printf 'queue test off-history commit\n' | \
  env GIT_AUTHOR_NAME='Queue Test' GIT_AUTHOR_EMAIL='queue-test@example.invalid' \
    GIT_COMMITTER_NAME='Queue Test' GIT_COMMITTER_EMAIL='queue-test@example.invalid' \
    "$GIT_BIN" -C "$CONTENT_REPOSITORY" commit-tree "$coalesced_tree" -p "$coalesced_content")
coalesced_state_file="$TEST_ROOT/coalesced-state.json"
"$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file blob "$coalesced_ref" > "$coalesced_state_file"
"$NODE_BIN" -e '
const fs = require("fs");
const [file, commit] = process.argv.slice(1);
const state = JSON.parse(fs.readFileSync(file, "utf8"));
state.coalescedIntoCommit = commit;
fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
' "$coalesced_state_file" "$off_history_commit"
corrupt_coalesced_blob=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w -- "$coalesced_state_file")
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref "$coalesced_ref" \
  "$corrupt_coalesced_blob" "$coalesced_state_before"
if corrupt_transaction_json=$(run_ctl publish-status --transaction "$tx_a" --json); then
  fail_test "publish-status accepted a coalesced target outside pending history"
fi
assert_json_field "$corrupt_transaction_json" code STATE_CORRUPT
if corrupt_pending_json=$(run_ctl pending-status --json); then
  fail_test "pending-status accepted a coalesced target outside pending history"
fi
assert_json_field "$corrupt_pending_json" code QUEUE_STATE_CORRUPT
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref "$coalesced_ref" \
  "$coalesced_state_before" "$corrupt_coalesced_blob"
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_c"

transaction_c_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_c")
rm -f -- "$delivery_c/content-direct-$tx_c-example-id-v1.bundle"
duplicate_c=$(run_queue_upload "$tx_c" "$delivery_c" "$sha_c")
assert_json_field "$duplicate_c" status QUEUED
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_c") == "$transaction_c_before" ]] || \
  fail_test "same transaction rewrote retained state"
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_c"

if mismatch_json=$(run_queue_upload "$tx_c" "$delivery_c" "$wrong_sha"); then
  fail_test "same transaction accepted a different Bundle hash"
fi
assert_json_field "$mismatch_json" code TRANSACTION_BUNDLE_MISMATCH
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_c") == "$transaction_c_before" ]] || \
  fail_test "Bundle mismatch changed retained transaction state"

queue_status_json=$(run_ctl publish-status --transaction "$tx_c" --json)
assert_json_field "$queue_status_json" action publish-status
assert_json_field "$queue_status_json" status QUEUED
assert_json_field "$queue_status_json" sourceCommit "$commit_c"
assert_json_field "$queue_status_json" contentCommit "$pending_c"

commit_d=$(commit_record "$commit_c" "Queued D" "2026-07-29T00:06:00Z")
tx_missing_head=0000000000000000000000000000008a
create_delivery "$tx_missing_head" "$commit_d" "$commit_c"
missing_head_delivery=$LAST_DELIVERY
missing_head_sha=$LAST_SHA
sed -i 's/^HeadCommit=.*/HeadCommit=2222222222222222222222222222222222222222/' \
  "$missing_head_delivery/MANIFEST.txt"
if missing_head_json=$(run_queue_upload "$tx_missing_head" "$missing_head_delivery" "$missing_head_sha"); then
  fail_test "queue upload accepted a manifest commit missing from its Bundle"
fi
assert_json_field "$missing_head_json" code BUNDLE_INVALID
assert_json_field "$(run_ctl pending-status --json)" pending_content_commit "$pending_c"

tx_atomic=0000000000000000000000000000009a
create_delivery "$tx_atomic" "$commit_d" "$commit_c"
atomic_delivery=$LAST_DELIVERY
atomic_sha=$LAST_SHA
atomic_queue_state_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/queue-state)
atomic_pending_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/pending)
atomic_source_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/source/pending)
if atomic_json=$(run_queue_upload_with_atomic_failure "$tx_atomic" "$atomic_delivery" "$atomic_sha"); then
  fail_test "queue upload survived an injected final ref transaction failure"
fi
assert_json_field "$atomic_json" code QUEUE_STATE_UPDATE_FAILED
assert_json_field "$atomic_json" status FAILED
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/queue-state) == "$atomic_queue_state_before" ]] || \
  fail_test "failed atomic update changed queue-state"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/pending) == "$atomic_pending_before" ]] || \
  fail_test "failed atomic update changed canonical pending"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/source/pending) == "$atomic_source_before" ]] || \
  fail_test "failed atomic update changed source pending"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_c") == "$transaction_c_before" ]] || \
  fail_test "failed atomic update rewrote an earlier queued transaction"
assert_json_field "$(run_ctl publish-status --transaction "$tx_c" --json)" status QUEUED
! "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet "refs/algae/upload-sources/$tx_atomic" || \
  fail_test "failed atomic update retained an accepted source ref"
! "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet "refs/algae/upload-content/$tx_atomic" || \
  fail_test "failed atomic update retained an accepted content ref"
assert_json_field "$(run_ctl publish-status --transaction "$tx_atomic" --json)" status FAILED

queue_state_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/queue-state)
malformed_blob=$(printf '{broken\n' | "$GIT_BIN" -C "$CONTENT_REPOSITORY" hash-object -w --stdin)
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref refs/algae/queue-state "$malformed_blob" "$queue_state_before"
if corrupt_state_json=$(run_ctl pending-status --json); then
  fail_test "pending-status accepted corrupt queue state"
fi
assert_json_field "$corrupt_state_json" code QUEUE_STATE_CORRUPT
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref refs/algae/queue-state "$queue_state_before" "$malformed_blob"

"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref -d refs/algae/pending "$pending_c"
if missing_ref_json=$(run_ctl pending-status --json); then
  fail_test "pending-status accepted a missing pending ref"
fi
assert_json_field "$missing_ref_json" code QUEUE_STATE_CORRUPT
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref refs/algae/pending "$pending_c"

failed_ref_before=$("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_invalid")
if repeated_failure=$(run_queue_upload "$tx_invalid" "$delivery_invalid" "$sha_invalid"); then
  fail_test "deterministic failed transaction restarted"
fi
assert_json_field "$repeated_failure" status FAILED
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse "refs/algae/upload-transactions/$tx_invalid") == "$failed_ref_before" ]] || \
  fail_test "failed transaction duplicate rewrote state"

tx_collision=0000000000000000000000000000007a
create_delivery "$tx_collision" "$commit_c" "$commit_b"
mkdir -p -- "$CONTENT_ROOT/publish-state"
printf '{}\n' > "$CONTENT_ROOT/publish-state/$tx_collision.json"
if collision_json=$(run_queue_upload "$tx_collision" "$LAST_DELIVERY" "$LAST_SHA"); then
  fail_test "queue upload reused a synchronous publish transaction id"
fi
assert_json_field "$collision_json" code TRANSACTION_KIND_MISMATCH

tx_lock=000000000000000000000000000000aa
create_delivery "$tx_lock" "$commit_c" "$commit_b"
lock_delivery=$LAST_DELIVERY
lock_sha=$LAST_SHA
lock_staging_ref="refs/algae/staging/source/$tx_lock"
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref "$lock_staging_ref" "$commit_c"
lock_ready="$TEST_ROOT/lock-ready"
lock_directory="$CONTENT_ROOT/.algae-contentctl.lockdir"
lock_uses_directory=false
if command -v flock >/dev/null 2>&1; then
  (
    exec 8>"$CONTENT_ROOT/.algae-contentctl.lock"
    flock 8
    : > "$lock_ready"
    sleep 15
  ) &
  LOCK_HOLDER_PID=$!
else
  mkdir -- "$lock_directory"
  : > "$lock_ready"
  lock_uses_directory=true
fi
for _attempt in {1..50}; do
  [[ -f "$lock_ready" ]] && break
  sleep 0.1
done
[[ -f "$lock_ready" ]] || fail_test "test lock holder did not start"
if busy_json=$(run_queue_upload "$tx_lock" "$lock_delivery" "$lock_sha"); then
  fail_test "queue upload ignored the shared controller lock"
fi
assert_json_field "$busy_json" code CONTROLLER_BUSY
"$NODE_BIN" -e '
const value = JSON.parse(process.argv[1]);
if (Object.prototype.hasOwnProperty.call(value, "status")) process.exit(1);
' "$busy_json" || fail_test "non-persisted busy response claimed a terminal transaction status"
"$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet "$lock_staging_ref" || \
  fail_test "lock loser deleted staging state owned by another process"
! "$GIT_BIN" -C "$CONTENT_REPOSITORY" show-ref --verify --quiet "refs/algae/upload-transactions/$tx_lock" || \
  fail_test "busy queue request persisted a failed transaction"
if $lock_uses_directory; then
  [[ -d "$lock_directory" ]] || fail_test "lock loser removed a lock directory owned by another process"
  rmdir -- "$lock_directory"
else
  kill "$LOCK_HOLDER_PID" 2>/dev/null || true
  wait "$LOCK_HOLDER_PID" 2>/dev/null || true
  LOCK_HOLDER_PID=""
fi
"$GIT_BIN" -C "$CONTENT_REPOSITORY" update-ref -d "$lock_staging_ref" "$commit_c"

tx_legacy=000000000000000000000000000000ab
create_delivery "$tx_legacy" "$commit_d" "$commit_c"
if legacy_publish_json=$(run_ctl publish --transaction "$tx_legacy" --bundle "$LAST_DELIVERY" \
  --bundle-sha256 "$LAST_SHA" --json); then
  fail_test "synchronous publish ran after queue initialization"
fi
assert_json_field "$legacy_publish_json" code QUEUE_MODE_ACTIVE
[[ ! -e "$CONTENT_ROOT/publish-state/$tx_legacy.json" ]] || \
  fail_test "rejected synchronous publish created transaction state"
if legacy_delete_json=$(run_ctl delete --type science-article --id example-id --json); then
  fail_test "synchronous delete ran after queue initialization"
fi
assert_json_field "$legacy_delete_json" code QUEUE_MODE_ACTIVE

final_status=$(run_ctl pending-status --json)
assert_pending_schema "$final_status"
assert_json_field "$final_status" published_content_commit "$published_commit"
assert_json_field "$final_status" pending_content_commit "$pending_c"
assert_json_field "$final_status" syncing_content_commit null
assert_json_field "$final_status" has_pending_changes true
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse HEAD) == "$published_commit" ]] || \
  fail_test "queue tests changed repository HEAD"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" rev-parse refs/algae/source/pending) == "$commit_c" ]] || \
  fail_test "pending source ref does not retain the latest uploaded commit"
[[ $("$GIT_BIN" -C "$CONTENT_REPOSITORY" cat-file -t refs/algae/queue-state) == blob ]] || \
  fail_test "queue state is not stored as a Git blob"
[[ -z "$("$GIT_BIN" -C "$CONTENT_REPOSITORY" for-each-ref --format='%(refname)' refs/algae/staging/)" ]] || \
  fail_test "queue staging refs were retained"
[[ -z "$("$GIT_BIN" -C "$CONTENT_REPOSITORY" status --porcelain --untracked-files=all)" ]] || \
  fail_test "queue operations dirtied the content repository"
[[ $(sha256sum -- "$SITE_ROOT/current" | awk '{print $1}') == "$current_digest" ]] || \
  fail_test "queue operations changed production current"
[[ ! -s "$EXTERNAL_LOG" ]] || fail_test "queue operations invoked an external build or production command"

printf 'algae-contentctl queue tests: PASS (20 required scenarios plus collision checks)\n'
