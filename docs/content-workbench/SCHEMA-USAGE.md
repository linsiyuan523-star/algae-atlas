# Shared Content Schema Usage

Status: Stage-01 implementation complete
Package: `@algae-atlas/content-schema`
Content schema version: `1`
Runtime validator: exact `zod@4.4.3`

## 1. Scope

`packages/content-schema/` is the canonical environment-neutral contract shared by later Next.js and Tauri stages. Its `src/` files import no Node.js, React, Next.js, Tauri, filesystem, Git, network, or UI APIs. Platform I/O stays in wrappers such as `scripts/validate-content.ts`.

Stage-01 does not read the live repository tree, switch a website collection, render a page, create a desktop UI, ingest image bytes, migrate content, add a database, or change routes/deployment. Those responsibilities remain with the stages named in `STAGE-DEPENDENCIES.md`.

## 2. Import and required interfaces

~~~ts
import {
  parseRecord,
  validateRepository,
  publicationEligibility,
  serializeRecord,
  migrateRecord,
  contentTypeRegistry,
} from "@algae-atlas/content-schema";
~~~

The Stage-00 required interfaces are implemented as:

| Contract | Implementation |
| --- | --- |
| `parseRecord(input)` | Strict discriminated-union parse with defaults and Chinese field-path issues. |
| `validateRepository(snapshot)` | Cross-record IDs, paths, authors, reviewers, media, Markdown, relationships, publication eligibility, and URL conflicts. |
| `publicationEligibility(record, locale, resolvedRefs)` | One per-locale fail-closed publication decision. |
| `serializeRecord(record)` | Validates first, applies canonical ordering, emits UTF-8-compatible JSON text with two spaces and one trailing LF. |
| `migrateRecord(input, fromVersion, toVersion)` | Explicit version harness; version 1 to 1 is tested, unknown transitions fail. |

Additional exports include author/media/reference/source/license/review schemas, `validateMarkdown`, `validateWorkflowTransition`, `stateAfterSubstantiveEdit`, issue/result types, schema constants, draft defaults, and the machine-readable field/type registry.

## 3. Canonical field paths

Stage-00 made language state independent, so Stage-01 does not duplicate state or review data at the record root. The Stage-01 instruction's common concepts map to the version 1 storage contract as follows:

| Concept | Canonical path |
| --- | --- |
| `id` | `id` |
| `type` | `type` |
| `status` | `locales.{locale}.state` |
| `createdAt` | `createdAt` |
| `updatedAt` | `updatedAt` |
| `publishedAt` | `locales.{locale}.publishedAt` |
| `authors` | `authors` plus type-specific public-author relationships |
| `coverImage` | Type-specific `shared.coverMediaId`, `primaryMediaId`, or `portraitMediaId` |
| `tags` | `tags` |
| `featured` | `team-news.shared.pinned`; it is not meaningful for every type |
| `zh` | `locales.zh` |
| `en` | `locales.en` |
| `review` | `locales.{locale}.review` |

`commonFieldRegistry` exposes these conceptual keys and paths for later dynamic forms without adding duplicate persisted fields.

## 4. Language and workflow policy

Version 1 follows the approved Stage-00 workflow exactly:

~~~text
English missing -> draft -> internal-review -> approved -> published -> archived
Chinese          draft -> internal-review -> approved -> published -> archived
~~~

- Chinese cannot be `missing`.
- English `missing` is distinct from an English draft and forbids `en.md`.
- Only `published` is public.
- `approved` means reviewed but not public.
- A substantive edit to `approved` or `published` returns that locale to `internal-review`.
- Direct `published -> draft` and `archived -> published` transitions fail.
- Publishing requires review evidence; archiving a published locale requires a reason.
- Machine-assisted text cannot publish without a resolvable human verifier.

The later-stage suggestion `withdrawn` was not added because Stage-00 version 1 selected `approved` and `archived`. Adding another persistent state requires an explicit schema-version amendment and migration rather than a silent Stage-01 deviation.

## 5. Content types and registry

The strict union contains all 11 Stage-00 IDs:

- `team-news`
- `research-output`
- `research-project`
- `learning-resource`
- `algae-profile`
- `live-feed-profile`
- `coastal-observation`
- `science-article`
- `team-member`
- `collaboration`
- `research-profile`

`contentTypeRegistry` is plain serializable metadata. Each entry supplies bilingual labels, route/section metadata, creation policy, optional fixed IDs, dedicated shared/localized fields, reference rules, and safe initial defaults. Schemas remain the enforcement source; the registry is the dynamic-form description and must not be treated as permission to change code-owned routes.

`createRecordDraftDefaults(type, id, now)` returns an intentionally incomplete editor draft with deterministic defaults, Chinese `draft`, and English `missing`. Required operator fields remain blank or absent until entered; the returned draft is not claimed to pass `parseRecord` immediately.

## 6. Validation results

Every blocking issue has:

~~~ts
type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  recordId?: string;
  locale?: "zh" | "en";
  path: string;
  message: string;
  remedy: string;
};
~~~

Zod issues are converted to stable issue families with exact paths, including individual unknown keys. Cross-record errors cover duplicate/case-colliding stable IDs, directory identity, broken or wrong-type relationships, unresolved authors/reviewers/media, non-public rights/consent, missing localized alt text, body-state mismatch, unsafe Markdown, and URL collisions.

## 7. Repository snapshot boundary

Stage-01 validates a platform-neutral snapshot; Stage-02 owns filesystem discovery and loading:

~~~ts
type RepositorySnapshot = {
  records: readonly unknown[];
  authors?: readonly unknown[];
  media?: readonly unknown[];
  markdown?: Readonly<Record<string, string>>;
  recordPaths?: Readonly<Record<string, string>>;
  urlClaims?: readonly UrlClaim[];
};
~~~

Markdown keys are `<type>/<id>/<locale>.md`. A future repository reader must build this snapshot without redefining validation policy.

## 8. CLI

Validate standalone records:

~~~powershell
npm.cmd run content:validate -- path\to\record.json
~~~

Validate a prepared snapshot:

~~~powershell
npm.cmd run content:validate -- --snapshot path\to\snapshot.json
~~~

Add `--json` for machine-readable output. The CLI reads only paths explicitly supplied by the operator; it does not scan a worktree, write content, stage Git files, contact a remote, or expose environment values.

## 9. Fixtures and tests

- TypeScript fixtures: `packages/content-schema/fixtures/index.ts`
- Human-readable JSON/Markdown example: `packages/content-schema/fixtures/example-science-article/`
- Node contract tests: `packages/content-schema/tests/`
- Browser-compatible ES-module contract: `packages/content-schema/browser/contract.ts`

All fixtures are visibly fictional and must never be migrated into public content.

Commands:

~~~powershell
npm.cmd run check
npm.cmd run test:schema
npm.cmd run test:schema:browser
npm.cmd test
npm.cmd run build:next
~~~

The browser target bundles the same source/fixtures without Node polyfills and executes the generated ES module. Stage-04 must consume the package rather than copy its types or rules.

## 10. Change rules

- Preserve schema version 1 and stable type IDs unless a dedicated schema amendment adds a fixture-tested migration.
- Do not add a second validator in website, desktop, Rust, or CLI code.
- Keep platform I/O outside `packages/content-schema/src/`.
- Do not weaken strict unknown-key, locale, review, rights, disclosure, path, or Markdown failures to make a fixture pass.
- Do not treat route metadata in the form registry as authority to create or activate routes.
