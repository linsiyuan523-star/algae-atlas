#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
readonly SERVICE_UNIT="$REPOSITORY_ROOT/ops/systemd/algae-content-sync.service"
readonly TIMER_UNIT="$REPOSITORY_ROOT/ops/systemd/algae-content-sync.timer"
readonly INSTALLER="$REPOSITORY_ROOT/ops/algae-contentctl/install.sh"
readonly SUDOERS_POLICY="$REPOSITORY_ROOT/ops/algae-contentctl/sudoers.example"
readonly CALENDAR='*-*-* *:00,30:00 UTC'

fail_test() {
  printf 'sync systemd test failed: %s\n' "$1" >&2
  exit 1
}

assert_unit_line() {
  local file=$1
  local line=$2
  grep -Fqx -- "$line" "$file" || fail_test "missing unit directive in $(basename -- "$file"): $line"
}

[[ -f "$SERVICE_UNIT" && ! -L "$SERVICE_UNIT" ]] || fail_test "service unit is missing or unsafe"
[[ -f "$TIMER_UNIT" && ! -L "$TIMER_UNIT" ]] || fail_test "timer unit is missing or unsafe"

assert_unit_line "$SERVICE_UNIT" 'Type=oneshot'
assert_unit_line "$SERVICE_UNIT" 'User=root'
assert_unit_line "$SERVICE_UNIT" 'WorkingDirectory=/srv/algae-content'
assert_unit_line "$SERVICE_UNIT" 'ExecStart=/usr/local/sbin/algae-contentctl sync-pending --trigger scheduled --json'
assert_unit_line "$SERVICE_UNIT" 'TimeoutStartSec=10min'
assert_unit_line "$SERVICE_UNIT" 'NoNewPrivileges=true'
assert_unit_line "$SERVICE_UNIT" 'ProtectSystem=full'

assert_unit_line "$TIMER_UNIT" "OnCalendar=$CALENDAR"
assert_unit_line "$TIMER_UNIT" 'Persistent=true'
assert_unit_line "$TIMER_UNIT" 'AccuracySec=1s'
assert_unit_line "$TIMER_UNIT" 'RandomizedDelaySec=0'
assert_unit_line "$TIMER_UNIT" 'Unit=algae-content-sync.service'
if grep -Eq '^(OnUnitActiveSec|OnBootSec|RandomizedOffsetSec)=' "$TIMER_UNIT"; then
  fail_test "timer contains a relative or randomized schedule"
fi

installer_output=$(bash "$INSTALLER" --dry-run) || fail_test "installer dry run rejected the sync units"
grep -Fq -- '/etc/systemd/system/algae-content-sync.service' <<< "$installer_output" || \
  fail_test "installer does not install the sync service"
grep -Fq -- '/etc/systemd/system/algae-content-sync.timer' <<< "$installer_output" || \
  fail_test "installer does not install the sync timer"
if grep -Eq 'systemctl[[:space:]]+(enable|start|restart)[[:space:]].*algae-content-sync' <<< "$installer_output"; then
  fail_test "installer activates the synchronization timer"
fi

grep -Fq -- '/usr/local/sbin/algae-contentctl sync-pending --trigger manual --json' "$SUDOERS_POLICY" || \
  fail_test "sudoers policy does not expose the fixed manual sync command"
if grep -Eq 'sync-pending .*--trigger scheduled|sync-pending .*--retry-blocked' "$SUDOERS_POLICY"; then
  fail_test "sudoers policy exposes an administrator-only synchronization command"
fi
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "$SUDOERS_POLICY" >/dev/null || fail_test "visudo rejected the sudoers policy"
fi

if command -v systemd-analyze >/dev/null 2>&1; then
  calendar_output=$(LC_ALL=C systemd-analyze calendar --iterations=4 \
    --base-time='2026-07-30 12:07:00 UTC' "$CALENDAR") || \
    fail_test "systemd-analyze calendar rejected the fixed schedule"
  for expected in \
    '2026-07-30 12:30:00 UTC' \
    '2026-07-30 13:00:00 UTC' \
    '2026-07-30 13:30:00 UTC' \
    '2026-07-30 14:00:00 UTC'; do
    grep -Fq -- "$expected" <<< "$calendar_output" || \
      fail_test "calendar did not include $expected"
  done
  systemd-analyze verify "$SERVICE_UNIT" "$TIMER_UNIT" || \
    fail_test "systemd-analyze verify rejected the synchronization units"
  printf 'algae-contentctl systemd tests: PASS (calendar and unit verification)\n'
else
  printf 'algae-contentctl systemd tests: PASS (static checks; systemd-analyze unavailable)\n'
fi
