# Stage 1 Delivery Handoff

Status: PASS, ready for post-final-commit bundle creation.
Stage: Stage-01 — Shared Content Model and Validation Rules
Branch: `local/stage-01-schema`
Baseline / predecessor final commit: `6dc2e71f4eaf45fca22ef351b14535d7782583b4`
Predecessor bundle: `stage-00-design-v1.bundle`
Predecessor SHA-256: `5E6F79AF71AD3DF029B87772DA4C6A74B88C083326472056B50616DBFAB1BC31`
Implementation tip before delivery docs: `ede1d861f853e12086fb275f0e15b8c5618e0953`
Final commit SHA: exact branch tip in the external USB `MANIFEST.txt` and verified bundle head.

## Goal and result

Stage-01 implemented one strict, environment-neutral, version 1 TypeScript/Zod contract shared by later website and Tauri stages. It includes 11 content types, locale/review workflow, author/media/source/license models, field registry, defaults, publication eligibility, repository snapshot validation, safe Markdown, deterministic serialization, migration harness, CLI, fictional fixtures, Node tests, and a browser-compatible contract.

The website still reads the same legacy TypeScript data. No page, route, content, image, database, Worker, hosting, deployment, remote, or production state changed.

## Important decisions

- Per-locale state is canonical: `locales.zh` is required; `locales.en` may be `missing`.
- Version 1 states are `missing` (English only), `draft`, `internal-review`, `approved`, `published`, and `archived`. `withdrawn` requires a future explicit versioned amendment.
- All 11 Stage-00 type IDs are present, including fixed-ID `research-profile`.
- `zod@4.4.3` is exact and shared; consumers must not copy validation policy.
- Repository/platform I/O stays outside the schema core.
- `contentTypeRegistry` is form metadata, not route-creation authority.

## Validation

- Offline lock install: PASS (509 packages, 0 vulnerabilities).
- `npm.cmd run check`: PASS, no warnings.
- `npm.cmd test`: PASS (58 Stage-01 Node tests; browser bundle/ES-module execution; 25 existing rendered tests; 1 existing IndexNow test).
- `npm.cmd run build:next`: PASS (97 static pages).
- Example CLI fixture: PASS.
- Protected website/page/content/image/runtime diff: empty.
- Worker remote: empty.

## Modified files

See `delivery/CHANGED-FILES.txt`. Primary areas are `packages/content-schema/`, `scripts/validate-content.ts`, root workspace/check/test configuration, `docs/content-workbench/SCHEMA-USAGE.md`, and delivery handoff files.

## Not completed / known limits

- No website loader, content migration, desktop UI, media byte processing, Git publisher, database, route change, or deployment.
- No real content records or real personal/partner/site/permission data.
- Stage-02 owns snapshot construction; Stage-04 owns desktop consumption; Stage-05B owns privileged media/path operations.

## Integration order

Import after Stage-00 and before Stage-02/04. Verify the bundle/hash/head, run `npm.cmd ci`, `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run build:next`, then branch consumers from the tested integrated tip. Resolve package/config conflicts in prerequisite order, never by wholesale ours/theirs selection.

## Next executor's first step

Read `docs/content-workbench/SCHEMA-USAGE.md`, import the package, and consume `parseRecord`, `validateRepository`, `publicationEligibility`, and `contentTypeRegistry`; do not write a parallel validator.

## Do not repeat

Do not reimplement schema/workflow policy, add `withdrawn` ad hoc, duplicate types, couple locales, activate routes, migrate legacy content, move images, add a remote, push, merge main, tag, release, or deploy.

## Rollback

Omit the bundle before integration, or revert the Stage-01 commits with ordinary revert commits after integration and rerun all gates. Never reset or clean unrelated work.
