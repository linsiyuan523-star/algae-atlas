# Stage 3 Delivery Handoff

Status: PASS; ready for final delivery-doc commit and post-commit bundle verification.

- Stage: Stage-03 — Legacy Content Migration Tool
- Branch: `local/stage-03-migration`
- Baseline / Stage-02 final commit: `86c2e209fe77cc644d946bff9901d740f9fb3ee1`
- Predecessor bundle SHA-256: `C0114AE0EFB01D14E44D8D1A20F297A7DDB3D7513CD9384F8F665665BF9B7D88`
- Design: `e43dca1c77bf2774b05b034a4a9cf5d942957051`
- Plan: `77a1e677823d5ca6731b42367bb3379e641b1d2d`
- Implementation tip before delivery docs: `bb6075240d96e9877f2e334f484c748456127742`
- Final bundle head: `EXTERNAL_BUNDLE_HEAD` in this file's verified external copy.

## Goal and result

Stage-03 added a default-dry-run migration planner, a schema-backed `science-article` adapter, no-overwrite exclusive writer, atomic optional reports, deterministic migration ledger, formal repository validation by default, and safety/parity regression tests.

Three real legacy articles were preserved as bilingual drafts: `what-are-algae`, `why-water-turns-green`, and `photobioreactor-basics`. They are valid repository records but not public records. Every production source selector remains explicitly `legacy`; source-switch count is zero.

## Safety and blockers

- No arguments and `--dry-run` write nothing; only explicit `--write` authorizes creation.
- Existing complete targets are skipped; partial/unsafe targets, divergent ledger, or existing report block the whole write.
- Final files use exclusive creation. Injected candidate and final-report failures both roll back only operation-created paths.
- Candidate authors, reviewers, media, and unverified references remain empty.
- Author/reviewer evidence, translation provenance, body completeness, publication review, and image usage scope remain explicit blockers.
- Three project-like entries remain manual classification; empty collections remain empty; other adapters are deferred.

## Validation

- Offline install: PASS (509 packages, 0 vulnerabilities; two known deprecated transitive warnings).
- Formal `content:validate`: PASS.
- Dry-run: 3 planned, 0 conflicts, 0 validation issues, Git state unchanged.
- Initial write: 3 written; second write: 0 written, 3 `TARGET_EXISTS`, 1 `LEDGER_EXISTS`.
- `npm.cmd run check`: PASS.
- `npm.cmd test`: PASS (58 schema; browser contract; 10 loader; 15 migration; vinext build; 25 rendered; 1 IndexNow).
- `npm.cmd run build:next`: PASS (97/97 static pages).
- Legacy data, media, selectors, routes, and rendered output: unchanged/PASS.
- Worker remote count: 0; no network, remote, production, release, or deployment action.

The vinext compatibility build emitted only its existing informational notice that some dynamic routes cannot yet be statically classified. One early approval-channel disconnect affected focused read-only command dispatch; the restricted-sandbox rerun passed. No final gate was retried.

## Modified files

See `delivery/CHANGED-FILES.txt`. Primary areas are `scripts/content-migration/`, the three `content/records/science-article/` candidates, `content/migration-ledger.json`, migration tests, the validator CLI, operation/handoff docs, and delivery evidence.

## Known limits

- Only three article candidates are migrated; no author/media/project/other-collection migration is included.
- Candidates remain drafts and are ineligible for public records output.
- No selector switch or complete public parity approval is included.
- No editor, preview, Git publisher, database, remote, deployment, or production change is included.

## Integration order

Verify bundle/hash/head and exact Stage-02 baseline, import the complete history, run offline install plus all gates, and keep all selectors on `legacy`. Resolve shared files line by line; never choose wholesale ours/theirs versions.

## Next executor's first step

Read `docs/content-workbench/MIGRATION-TOOL.md`, the ledger, and the initial report. Obtain authorized review/rights facts and full public parity evidence before considering any selector change.

## Do not repeat

Do not overwrite the existing initial report, recreate schema/loader policy, infer missing facts, publish drafts, switch selectors, delete legacy sources, add a remote, push, merge, tag, release, deploy, connect to production, or use destructive Git cleanup.

## Rollback

Omit the bundle before integration, or use ordinary revert commits for Stage-03 and rerun all gates. All production selectors remain `legacy`, so no public source rollback is needed. Never reset or clean unrelated work.
