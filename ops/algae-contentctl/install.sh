#!/usr/bin/env bash
# Installs the fixed server-side controller. Run this only on the target server
# after reviewing the paths and sudoers policy; it is not used by local tests.

set -Eeuo pipefail
IFS=$'\n\t'
umask 022

readonly SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly CONTROLLER_SOURCE="$SCRIPT_DIRECTORY/algae-contentctl"
readonly BOOTSTRAP_SOURCE="$SCRIPT_DIRECTORY/bootstrap.sh"
readonly SUDOERS_SOURCE="$SCRIPT_DIRECTORY/sudoers.example"
readonly CONTROLLER_DESTINATION="/usr/local/sbin/algae-contentctl"
readonly CONTENT_ROOT="/srv/algae-content"
readonly CONTENT_REPOSITORY="$CONTENT_ROOT/repository"
readonly TRANSACTION_ROOT="$CONTENT_ROOT/transactions"
readonly PUBLISH_STATE_ROOT="$CONTENT_ROOT/publish-state"
readonly SITE_SOURCE_CACHE_ROOT="$CONTENT_ROOT/site-source-cache"
readonly INCOMING_ROOT="/home/ubuntu/algae-content-workbench/incoming"
readonly SUDOERS_DESTINATION="/etc/sudoers.d/algae-contentctl"
readonly SITE_REPOSITORY_URL="https://github.com/linsiyuan523-star/algae-atlas.git"
readonly SITE_BRANCH="main"

INSTALL_SUDOERS=false
DRY_RUN=false

usage() {
  cat >&2 <<'USAGE'
Usage: sudo ./install.sh [--install-sudoers] [--dry-run]

--install-sudoers  Install the reviewed restricted sudoers policy.
--dry-run          Print the planned actions without changing the server.
USAGE
}

run() {
  if $DRY_RUN; then
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-sudoers) INSTALL_SUDOERS=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
  shift
done

[[ -f "$CONTROLLER_SOURCE" && -f "$BOOTSTRAP_SOURCE" && -f "$SUDOERS_SOURCE" ]] || {
  printf 'install.sh must remain beside algae-contentctl, bootstrap.sh, and sudoers.example\n' >&2
  exit 1
}

# shellcheck source=bootstrap.sh
source "$BOOTSTRAP_SOURCE"

if ! $DRY_RUN && [[ $EUID -ne 0 ]]; then
  printf 'install.sh must run as root\n' >&2
  exit 1
fi

if ! $DRY_RUN; then
  command -v git >/dev/null 2>&1 || { printf 'git is required\n' >&2; exit 1; }
  command -v node >/dev/null 2>&1 || { printf 'node is required\n' >&2; exit 1; }
  command -v npm >/dev/null 2>&1 || { printf 'npm is required\n' >&2; exit 1; }
  id ubuntu >/dev/null 2>&1 || { printf 'ubuntu user is required\n' >&2; exit 1; }
fi

GIT_BIN="$(command -v git 2>/dev/null || printf 'git')"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_TERMINAL_PROMPT=0

run install -d -o root -g root -m 0755 "$CONTENT_ROOT"
run install -d -o root -g root -m 0700 "$TRANSACTION_ROOT"
run install -d -o root -g root -m 0700 "$PUBLISH_STATE_ROOT"
run install -d -o root -g root -m 0700 "$SITE_SOURCE_CACHE_ROOT"
run install -d -o ubuntu -g ubuntu -m 0750 "$INCOMING_ROOT"

if [[ ! -e "$CONTENT_REPOSITORY" && ! -L "$CONTENT_REPOSITORY" ]]; then
  if $DRY_RUN; then
    printf '+ git clone --depth 1 --branch %q --single-branch --no-tags %q <temporary-site-main>\n' "$SITE_BRANCH" "$SITE_REPOSITORY_URL"
    printf '+ validate and copy fresh-main content/ and public/images/uploads/ into an independent repository\n'
    printf '+ git init --initial-branch=main %q\n' "$CONTENT_REPOSITORY"
    printf '+ install the independent repository atomically with no Git remote\n'
  else
    bootstrap_sha=$(algae_bootstrap_content_repository \
      "$GIT_BIN" \
      "$SITE_REPOSITORY_URL" \
      "$SITE_BRANCH" \
      "$CONTENT_REPOSITORY" \
      "$CONTENT_ROOT") || {
        printf 'Cannot bootstrap the independent content repository from fresh GitHub main.\n' >&2
        exit 1
      }
    printf 'Bootstrapped independent content repository from site commit %s\n' "$bootstrap_sha"
  fi
elif [[ ! -d "$CONTENT_REPOSITORY/.git" || -L "$CONTENT_REPOSITORY" ]]; then
  printf 'Refusing to overwrite an existing non-repository path at %s\n' "$CONTENT_REPOSITORY" >&2
  exit 1
fi

run install -o root -g root -m 0755 "$CONTROLLER_SOURCE" "$CONTROLLER_DESTINATION"

if $INSTALL_SUDOERS; then
  if ! $DRY_RUN; then
    visudo -cf "$SUDOERS_SOURCE"
  fi
  run install -o root -g root -m 0440 "$SUDOERS_SOURCE" "$SUDOERS_DESTINATION"
fi

if $DRY_RUN; then
  printf 'Dry run complete; no files were installed.\n'
else
  printf 'Installed %s\n' "$CONTROLLER_DESTINATION"
fi
if ! $INSTALL_SUDOERS; then
  printf 'Restricted sudoers policy was not installed. Review and install it explicitly with --install-sudoers.\n'
fi
