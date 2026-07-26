#!/usr/bin/env bash

# Installation-only helper. The caller supplies fixed production values; this
# file has no command-line entry point and is never installed into sudoers.

algae_bootstrap_fail() {
  printf 'algae-content bootstrap: %s\n' "$1" >&2
  return 1
}

algae_bootstrap_assert_tree() {
  local tree=$1
  [[ -d "$tree" && ! -L "$tree" ]] || algae_bootstrap_fail "source tree is missing or unsafe"
  local unsafe_entry
  unsafe_entry=$(find -P "$tree" \( -type l -o \( ! -type d ! -type f \) \) -print -quit) || \
    algae_bootstrap_fail "source tree cannot be inspected"
  [[ -z "$unsafe_entry" ]] || algae_bootstrap_fail "source tree contains a link or special file"
}

algae_bootstrap_content_repository() (
  set -Eeuo pipefail
  IFS=$'\n\t'
  umask 022

  [[ $# -eq 5 ]] || algae_bootstrap_fail "internal argument count is invalid"
  local git_bin=$1
  local source_url=$2
  local source_branch=$3
  local destination_input=$4
  local workspace_input=$5

  [[ -f "$git_bin" && -x "$git_bin" && ! -L "$git_bin" ]] || \
    algae_bootstrap_fail "git executable is unavailable"
  [[ -n "$source_url" ]] || algae_bootstrap_fail "site repository URL is empty"
  [[ "$source_branch" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$ ]] || \
    algae_bootstrap_fail "site branch is invalid"
  [[ "$source_branch" != -* && "$source_branch" != *..* && "$source_branch" != *//* ]] || \
    algae_bootstrap_fail "site branch is unsafe"

  local workspace_parent
  workspace_parent=$(realpath -e -- "$workspace_input") || \
    algae_bootstrap_fail "bootstrap workspace is unavailable"
  [[ -d "$workspace_parent" && ! -L "$workspace_parent" ]] || \
    algae_bootstrap_fail "bootstrap workspace is unsafe"

  local destination_parent destination_name destination
  destination_parent=$(realpath -e -- "$(dirname -- "$destination_input")") || \
    algae_bootstrap_fail "repository parent is unavailable"
  destination_name=$(basename -- "$destination_input")
  [[ "$destination_parent" == "$workspace_parent" ]] || \
    algae_bootstrap_fail "repository must be a direct child of the bootstrap workspace"
  [[ "$destination_name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || \
    algae_bootstrap_fail "repository directory name is invalid"
  destination="$workspace_parent/$destination_name"
  [[ ! -e "$destination" && ! -L "$destination" ]] || \
    algae_bootstrap_fail "repository destination already exists"

  local bootstrap_root=""
  algae_bootstrap_cleanup() {
    [[ -n "$bootstrap_root" && -d "$bootstrap_root" && ! -L "$bootstrap_root" ]] || return 0
    case "$bootstrap_root" in
      "$workspace_parent"/.algae-content-bootstrap.*) rm -rf -- "$bootstrap_root" ;;
      *) printf 'algae-content bootstrap: refusing unsafe cleanup path\n' >&2 ;;
    esac
  }
  trap algae_bootstrap_cleanup EXIT

  bootstrap_root=$(mktemp -d "$workspace_parent/.algae-content-bootstrap.XXXXXX") || \
    algae_bootstrap_fail "cannot create bootstrap workspace"
  local source_checkout="$bootstrap_root/site-main"
  local candidate_repository="$bootstrap_root/repository"

  "$git_bin" clone --quiet --depth 1 --branch "$source_branch" --single-branch --no-tags \
    "$source_url" "$source_checkout" || algae_bootstrap_fail "cannot clone fresh site source"
  [[ $("$git_bin" -C "$source_checkout" rev-parse --is-shallow-repository) == "true" ]] || \
    algae_bootstrap_fail "site source clone is not shallow"
  [[ $("$git_bin" -C "$source_checkout" symbolic-ref --quiet --short HEAD) == "$source_branch" ]] || \
    algae_bootstrap_fail "site source branch does not match"
  [[ -z "$("$git_bin" -C "$source_checkout" status --porcelain --untracked-files=all)" ]] || \
    algae_bootstrap_fail "site source checkout is not clean"

  local source_sha
  source_sha=$("$git_bin" -C "$source_checkout" rev-parse --verify HEAD) || \
    algae_bootstrap_fail "site source commit cannot be read"
  [[ "$source_sha" =~ ^[0-9a-f]{40,64}$ ]] || \
    algae_bootstrap_fail "site source commit is invalid"

  algae_bootstrap_assert_tree "$source_checkout/content"
  if [[ -e "$source_checkout/public/images/uploads" || -L "$source_checkout/public/images/uploads" ]]; then
    algae_bootstrap_assert_tree "$source_checkout/public/images/uploads"
  fi

  mkdir -p -- "$candidate_repository/content" "$candidate_repository/public/images/uploads"
  cp -a -- "$source_checkout/content/." "$candidate_repository/content/"
  if [[ -d "$source_checkout/public/images/uploads" ]]; then
    cp -a -- "$source_checkout/public/images/uploads/." "$candidate_repository/public/images/uploads/"
  else
    touch "$candidate_repository/public/images/uploads/.gitkeep"
  fi
  find -P "$candidate_repository/content" "$candidate_repository/public/images/uploads" -type d -exec chmod 0755 -- {} +
  find -P "$candidate_repository/content" "$candidate_repository/public/images/uploads" -type f -exec chmod 0644 -- {} +

  "$git_bin" -C "$candidate_repository" init --quiet --initial-branch=main
  "$git_bin" -C "$candidate_repository" config user.name "Algae Content Controller"
  "$git_bin" -C "$candidate_repository" config user.email "algae-contentctl@localhost"
  "$git_bin" -C "$candidate_repository" add -- content public/images/uploads
  "$git_bin" -C "$candidate_repository" commit --quiet --no-gpg-sign --no-verify \
    -m "content: bootstrap from site main $source_sha"

  [[ -z "$("$git_bin" -C "$candidate_repository" remote)" ]] || \
    algae_bootstrap_fail "independent content repository unexpectedly has a remote"
  [[ -z "$("$git_bin" -C "$candidate_repository" status --porcelain --untracked-files=all)" ]] || \
    algae_bootstrap_fail "independent content repository is not clean"
  local tracked_file="$bootstrap_root/tracked-files"
  "$git_bin" -C "$candidate_repository" ls-files -z > "$tracked_file"
  local tracked_path tracked_count=0
  while IFS= read -r -d '' tracked_path; do
    ((tracked_count += 1))
    case "$tracked_path" in
      content/*|public/images/uploads/*) ;;
      *) algae_bootstrap_fail "independent repository contains an out-of-scope path" ;;
    esac
  done < "$tracked_file"
  [[ $tracked_count -gt 0 ]] || algae_bootstrap_fail "independent repository is empty"

  mv -- "$candidate_repository" "$destination" || \
    algae_bootstrap_fail "cannot install independent content repository"
  printf '%s\n' "$source_sha"
)
