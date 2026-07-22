# Stage 1 Handoff

Status: implementation complete; all code, schema, fixture, browser-contract, website regression, and native production-build gates pass. Exact final branch SHA and bundle identity are written to the external delivery after the final documentation commit.

Stage: Stage 1 — Shared Content Model and Validation Rules
Goal: provide one environment-neutral content schema, runtime validator, field registry, policy API, fixtures, tests, serializer, migration harness, and validation CLI without changing website reads or public output.
Branch: `local/stage-01-schema`
Baseline / predecessor final commit: `6dc2e71f4eaf45fca22ef351b14535d7782583b4`
Predecessor bundle: `stage-00-design-v1.bundle`
Predecessor bundle SHA-256: `5E6F79AF71AD3DF029B87772DA4C6A74B88C083326472056B50616DBFAB1BC31`
Implementation tip before this handoff commit: `ede1d861f853e12086fb275f0e15b8c5618e0953`
Final commit SHA: branch tip recorded in the verified external `MANIFEST.txt` and bundle head after finalization. A committed file cannot embed the SHA of the commit that contains itself.

## Completed

- Created the npm workspace package `@algae-atlas/content-schema` with exact `zod@4.4.3`.
- Kept the schema core browser-compatible and free of Node, React, Next.js, Tauri, filesystem, Git, and network imports.
- Implemented the 11 Stage-00 content types as a strict discriminated union with dedicated shared/localized fields.
- Implemented stable IDs, exact schema version, ISO date/time ordering, DOI, unknown-key, new-media path/MIME, duplicate-reference, and type-specific publication gates.
- Implemented independent Chinese/English locale state, reviewed publication requirements, machine-assisted human verification, substantive-edit fallback, and tested transition policy.
- Implemented author, media, review, structured reference/source, and license models with controlled rights, consent, identification, disclosure, and public-scope values.
- Implemented a serializable field/type registry and deterministic draft defaults for later dynamic forms.
- Implemented field-path Chinese issues, deterministic JSON serialization, explicit schema migration harness, safe Markdown profile, repository snapshot validation, reference resolution, publication eligibility, and URL collision detection.
- Implemented the explicit-file/snapshot CLI at `scripts/validate-content.ts`.
- Added fictional TypeScript and JSON/Markdown fixtures, valid/invalid coverage for every type, repository/Markdown/CLI/workflow tests, and a browser-compatible ES-module contract.
- Added scoped LF attributes for implementation and delivery files.
- Preserved all existing app, component, legacy content, route, image, compatibility, database, Worker, hosting, and deployment files.

## Not completed by design

- No website loader, collection source switch, route/static-param/metadata/sitemap/language-switch change, or public record migration.
- No real `content/records`, authors, media catalog, or real content data.
- No desktop/Tauri project, form UI, preview, media processing, filesystem transaction, Git safety service, or packaging.
- No image byte/signature/EXIF processing; Stage-01 validates catalog metadata and publication policy only.
- No D1/R2/Drizzle/Worker activation or deletion.
- No remote, fetch/pull/push, PR, tag, release, deployment, or production connection.

## Design decisions and deviations

1. Stage-00 canonical storage remains authoritative. Common `status`, `publishedAt`, and `review` concepts live per locale; cover/featured concepts map to type-specific shared fields. No duplicate root state was introduced.
2. Version 1 retains `missing`, `draft`, `internal-review`, `approved`, `published`, and `archived`. The suggested `withdrawn` state was not added because doing so would silently contradict Stage-00; it requires a future versioned amendment.
3. `research-profile` remains the eleventh fixed-ID type even though the shorter Stage-01 minimum list named ten types.
4. The canonical validator is Zod 4.4.3 already present in the locked dependency graph and now pinned as the workspace package dependency.
5. Repository validation accepts an in-memory snapshot. Filesystem discovery/loading belongs to Stage-02, preventing Node-only I/O from entering the shared core.
6. The Markdown profile rejects unsafe input and media paths; it is a validation contract, not a second renderer or sanitizer.
7. A Vite browser library target proves that the same schemas/fixtures bundle without Node polyfills and execute as an ES module. No desktop/browser UI is part of this stage.

## Key files

- Implementation: `packages/content-schema/src/`
- Machine-readable registry: `packages/content-schema/src/registry.ts`
- Fixtures: `packages/content-schema/fixtures/`
- Tests: `packages/content-schema/tests/`
- Browser contract: `packages/content-schema/browser/contract.ts`
- CLI: `scripts/validate-content.ts`
- Usage: `docs/content-workbench/SCHEMA-USAGE.md`
- Delivery: `delivery/`

The exact file list is in `delivery/CHANGED-FILES.txt`.

## Local commits

- `04fd809` — `feat: add shared content domain foundation`
- `eaa24de` — `feat: add schema validation and field registry`
- `27f5cad` — `test: cover content schemas and language states`
- `ede1d86` — `feat: enforce locale workflow and reference policy`
- final documentation/delivery commit: exact branch tip in the external manifest.

## Validation

Final code-state validation on 2026-07-22:

- `npm.cmd ci --offline --ignore-scripts`: PASS (509 packages installed; 0 vulnerabilities; only two known deprecated transitive `@esbuild-kit` warnings).
- `npm.cmd run check`: PASS with no warnings.
- `npm.cmd test`: PASS.
  - Stage-01 Node schema/CLI/repository/Markdown/workflow tests: 58 passed, 0 failed.
  - Browser-compatible bundle: 94 modules transformed; generated ES module executed successfully.
  - Existing rendered-site tests: 25 passed, 0 failed.
  - Existing IndexNow test: 1 passed, 0 failed.
- `npm.cmd run build:next`: PASS; 97 static pages generated.
- Standalone example CLI validation: PASS.
- Protected page/source/image/runtime surface diff: empty.
- Worker Git remote: empty.

Final post-documentation status, diff checks, secret scan, bundle verify, hashes, USB copy verification, and exact final SHA are recorded in the external delivery files.

## Known issues and limits

- `withdrawn` is not a schema 1 state; do not add it ad hoc in Stage-02/04.
- Stage-02 must provide filesystem snapshots and use these exact APIs; it must not reimplement publication eligibility.
- Stage-04 must import the workspace package; it must not copy the union or registry.
- Image magic-byte, dimension, EXIF, normalization, and atomic media writes remain Stage-05B work.
- The schema contains no real team/member/output/project/news data, by design.
- Existing Stage-00 factual gaps about real people, outputs, images, sites, procedures, partners, and permissions remain unresolved and must not be invented.

## Interface versions

| Interface | Version tested |
| --- | --- |
| Content schema | 1 |
| Repository API | 1 |
| Desktop command API | 1 |
| Media metadata | 1 |
| Git publish plan | 1 |
| Migration ledger | 1 |

## Integration order and conflict risks

1. Verify this bundle, SHA-256, exact `local/stage-01-schema` head, and predecessor SHA.
2. Import Stage-01 after Stage-00 and before Stage-02 or Stage-04.
3. Review the root workspace/package-lock changes; do not replace the existing package manager, lockfile, build scripts, or hosting structure.
4. Run `npm.cmd ci`, `npm.cmd run check`, `npm.cmd test`, and `npm.cmd run build:next` on the integration host.
5. Branch Stage-02 and Stage-04 only from the tested integrated Stage-01 tip.

Likely conflict surfaces are `package.json`, `package-lock.json`, `.gitattributes`, `.gitignore`, `eslint.config.mjs`, and the latest HANDOFF/delivery files. Resolve them in prerequisite order; do not select wholesale ours/theirs versions.

## Next executor's first step

For Stage-02 or Stage-04, verify/import the Stage-01 bundle and exact predecessor chain, run the four validation commands, then read `SCHEMA-USAGE.md` and import `@algae-atlas/content-schema`. Do not create a parallel type or validator.

## Do not repeat or redesign silently

- Do not re-audit or rewrite the Stage-00 schema contract from assumptions.
- Do not copy schema/type definitions into website or desktop code.
- Do not add a second publication eligibility function.
- Do not couple English publication to Chinese or synthesize missing English.
- Do not activate routes, migrate content, move images, or promote a database in this bundle.
- Do not loosen strict issues or tests to accept unverified real content.
- Do not add a remote, push, merge `main`, tag, release, or deploy.

## Rollback

Before integration, omit the bundle. After local integration, use ordinary revert commits for the Stage-01 commits in reverse order, then rerun all gates. Do not reset, rewrite history, delete Stage-00 documents, or remove unrelated compatibility files.
