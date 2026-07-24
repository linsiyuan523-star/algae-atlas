# Final Integration Handoff

Status: READY_FOR_DRAFT_PR_WITH_RELEASE_BLOCKERS

- Branch: `feature/algae-content-workbench`
- Website/migration head: `3b4ca41ee91ff47d3cd1de0e567b5c99820a1548`
- Desktop/acceptance head: `d3bf0f057a7cb36b6e4c30cc128bb981a3eec1ed`
- Baseline: `456ff609e27ce5aa46fa0608289a30298bdd3e7f`
- Validation head: `53e43181b848f0c4f3bbe0a5742a62fe9a84fe40`
- Remote writes: none

## Integrated

- Stage 0 through Stage 3 content design, schema, repository loader, and migration tool.
- Stage 4 through Stage 8C desktop authoring, preview, local Git, Bundle, packaging, and acceptance work.
- Root checks and tests now include both migration and desktop constituents.
- Shared delivery files were reconciled without discarding either history line.

## Safety Boundaries

- The three migrated science articles remain drafts.
- All production collection selectors remain `legacy`.
- Missing author/reviewer approval, translation provenance, body review, and image-rights evidence remain blockers.
- Integration mode for GitHub remains disabled by default in the desktop app.
- No remote, push, PR, main-branch merge, tag, release, signing, or deployment has occurred.

## Completed Gates

- Final `npm ci`, `check`, `test`, and `build:next` passed.
- Desktop TypeScript/component tests, Rust tests, `cargo check`, format, Clippy,
  Tauri startup, and NSIS candidate build passed.
- Formal content validation, migration dry-run, and offline Bundle round trip passed.
- Final integration, security, acceptance, and release-candidate reports exist.

## Release Blockers

- Production npm audit reports 3 high findings with no compatible stable 16.x
  Next fix currently available.
- The NSIS candidate is unsigned.
- Rust lockfile vulnerability scanning remains incomplete because the local
  audit tool could not be acquired within its bounded window.

Do not change selectors, publish migrated drafts, enable credentials, or perform a
remote write without explicit integration-host approval. Keep any created PR as
Draft and do not merge or deploy until the release blockers are resolved or
explicitly accepted.
