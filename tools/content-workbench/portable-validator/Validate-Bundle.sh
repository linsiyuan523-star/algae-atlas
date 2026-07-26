#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' \
    'VALIDATION_RESULT=FAIL' \
    'VALIDATION_STAGE=RUNTIME' \
    'VALIDATION_ERROR=Node.js is required to run the portable validator.'
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec node "$script_dir/validate-bundle.mjs" "$@"
