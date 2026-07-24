# Final Integration Handoff

Status: LOCAL_MERGE_COMPLETE_VALIDATION_PENDING

- Branch: `feature/algae-content-workbench`
- Website/migration head: `3b4ca41ee91ff47d3cd1de0e567b5c99820a1548`
- Desktop/acceptance head: `d3bf0f057a7cb36b6e4c30cc128bb981a3eec1ed`
- Baseline: `456ff609e27ce5aa46fa0608289a30298bdd3e7f`
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

## Pending Gates

- Clean dependency install and complete website checks.
- Desktop TypeScript/component tests, Rust tests, `cargo check`, and Tauri launch.
- Windows installation candidate and offline Bundle round trip.
- Security and acceptance reports plus Draft PR text.

Do not change selectors, publish migrated drafts, enable credentials, or perform a
remote write without explicit integration-host approval.
