# Final Integration Report

Status: BLOCKED

- Repository: `linsiyuan523-star/algae-atlas`
- PR: Draft #7, base `main`
- Initial verified PR head: `47af7a17cbe107813aca71fae7cf33787fdf8239`
- Audited implementation head: `af8ecd4cdccf6f689794887d18f432ff17f8983e`
- Base observed at start: `456ff609e27ce5aa46fa0608289a30298bdd3e7f`
- Report commit: the commit containing this file; resolve the exact final PR
  head with `git rev-parse HEAD` or the PR API after push.

The initial worktree was clean, the local branch matched the remote PR head,
and PR #7 was open and Draft. Commit
`53e43181b848f0c4f3bbe0a5742a62fe9a84fe40` is an ancestor of the initial PR
head. Its installer is not accepted as the current candidate, even though the
intervening tracked changes were reports and delivery metadata.

## GitHub Actions

`.github/workflows/pr-validation.yml` now provides three PR jobs:

- Website and content checks on Node.js 22.13.0.
- Windows Rust and desktop checks on Rust 1.97.1, with Clippy warnings denied.
- npm production/full audits and RustSec scanning with `cargo-audit` 0.22.2.

Workflow permissions are `contents: read`. Action references are pinned to
verified commit SHAs. Per-PR concurrency cancels obsolete runs. The only upload
is a seven-day audit/unsigned NSIS artifact; the workflow has no write,
release, deployment, or package-publication permission.

## Local Verification

| Gate | Result |
| --- | --- |
| `npm ci` | PASS; 660 packages installed from the updated lockfile |
| `npm run check` | PASS |
| `npm test` | PASS; schema 58, loader 10, migration 15, scaffold 1, desktop 159, rendered HTML 25, IndexNow 1 |
| `npm run build:next` | PASS; 97/97 static pages on Next 16.2.11 |
| `npm run content:validate` | PASS |
| `npm run content:migrate -- --dry-run` | PASS; 0 planned, 15 skipped, 0 conflicts, 0 validation issues; Git state unchanged |
| `npm run desktop:rust:fmt` | PASS |
| `npm run desktop:rust:check` | PASS |
| `npm run desktop:rust:clippy` | PASS with `-D warnings` |
| `npm run desktop:rust:test` | PASS; 37 tests |
| `npm run desktop:build` | PASS after one transient truncated NSIS download retry |
| `npm audit --omit=dev` | BLOCKED; 3 high |
| `npm audit` | BLOCKED; 6 high, 4 moderate, 1 low |
| RustSec | COMPLETE, BLOCKED; 0 vulnerabilities, 17 warnings including one unsound advisory |

## Pre-Report Candidate

- Source head: `af8ecd4cdccf6f689794887d18f432ff17f8983e`
- Relative path:
  `tools/content-workbench/src-tauri/target/release/bundle/nsis/藻类团队内容发布工作台_0.1.0_x64-setup.exe`
- SHA-256: `3A737A83DA4606ADEDF351CD8E6C651D1E7AE81A48741FBA1593AAC35D25951F`
- Size: 2,626,740 bytes
- Authenticode: `NotSigned`

NSIS output is nondeterministic: rebuilding unchanged source changed the hash.
This pre-report candidate therefore is not represented as a final release
package. A fresh candidate must be built from the final report commit; its
exact hash belongs in CI/task evidence rather than a self-referential report
commit.

## Remaining Blockers

1. The production npm audit has 3 unresolved high findings and no compatible
   stable Next 16 fix.
2. RustSec reports the unsound `glib` RUSTSEC-2024-0429 warning in the
   cross-platform Tauri dependency chain.
3. No Authenticode certificate or owner-approved unsigned internal-only
   distribution decision exists.
4. Remote PR jobs have not yet run for the new workflow.

The PR must remain Draft. Do not merge, release, upload a formal installer, or
deploy production from this state.
