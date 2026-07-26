# Migration Plan

## 1. Objective

Move maintainable public content from TypeScript constants and selected component copy into validated repository records without changing public output, deleting compatibility structures, inventing data, or losing a reliable rollback path.

Migration is collection-by-collection. A broad conversion commit is prohibited.

## 2. Principles

1. Inventory before conversion.
2. Preserve record IDs, URLs, wording, ordering, images, review labels, SEO, and empty states unless a separately approved content change says otherwise.
3. Keep one authoritative source per collection.
4. Fail closed; never hide a broken migrated collection by silently reading legacy data.
5. Existing bilingual records remain bilingual during parity migration. Optional-English behavior is proved with synthetic fixtures before it is used for new public records.
6. Empty real-world collections stay empty. Fixtures live only under test paths and are visibly fictitious.
7. Existing images are registered as protected legacy assets and are not moved, recompressed, or renamed.
8. D1/Drizzle/Worker/Sites/vinext and native Next.js remain intact.
9. Every migration batch is an ordinary reviewable commit with tests and an ordinary revert path.
10. Only the integration workflow can merge into the future GitHub branch; production remains main-only.

## 3. Migration ledger

A future `content/migration-ledger.json` records audited migration state, not live content precedence:

~~~json
{
  "schemaVersion": 1,
  "collections": {
    "algae-profile": {
      "source": "legacy",
      "legacyFiles": ["lib/site-data.ts"],
      "recordCount": 6,
      "parityStatus": "not-started",
      "lastVerifiedCommit": null
    }
  }
}
~~~

The website source selector is reviewed code that agrees with the ledger. Changing a collection from `legacy` to `records` must occur in the same tested commit as the completed records and parity evidence.

## 4. Phases

### Phase M0 — audit and freeze

Stage 0 outputs:

- current source and route inventory;
- content type and ownership registry;
- schema, locale, review, author, and media contracts;
- security/test strategy and stage dependency graph.

No runtime or content changes occur.

### Phase M1 — schema and fixtures

Implement the environment-neutral schema package and validation CLI.

Required fixtures include:

- valid bilingual published record;
- valid Chinese-published/English-missing record;
- every workflow state;
- each content type;
- invalid IDs, paths, references, Markdown, media rights, and consent;
- machine-assisted English blocked until human verification;
- schema migration fixtures.

No website collection switches source in this phase.

### Phase M2 — loader, availability, and legacy adapter

Introduce `PublicContentRepository`, record source, legacy source, explicit collection router, and availability index.

Initially every public collection selects `legacy`. Existing pages, static params, metadata, language switches, and sitemap must render byte/semantic-equivalent output. Synthetic record fixtures test optional English without changing real pages.

This phase establishes route behavior before any content is moved.

### Phase M3 — record migration batches

Migrate low-risk collections one at a time in this order unless evidence requires a documented change:

1. algae profiles;
2. live-feed profiles;
3. research profiles/capabilities;
4. collaboration area singletons;
5. learning-resource shells;
6. science articles and individually classified public background records;
7. future verified news, outputs, projects, observations, and members.

For each batch:

1. record current count, IDs, ordering, fields, routes, metadata, images, and test expectations;
2. generate candidate JSON/Markdown records without deleting legacy;
3. validate records and relationships;
4. render legacy and record sources in a parity harness;
5. review an exact diff of public HTML/metadata/sitemap;
6. switch only that collection to `records`;
7. run full checks;
8. commit records, source switch, ledger, and tests together;
9. retain legacy source until final deprecation criteria are met.

The current `applications` and `projects` arrays require manual classification. The latter are explicitly sample observation frameworks, not verified team projects.

### Phase M4 — component copy extraction

After record loaders are stable, audit sustainable copy embedded in components:

- home/team/research editorial copy;
- about/contact public information;
- algal-bloom workflow and explanatory sections;
- empty-state content;
- page-level SEO copy.

Extract only copy that operators genuinely need to maintain. Keep layout, navigation, route registration, global footer, global legal/filing content, and safety disclaimers code-owned or allowlisted singleton fields. Every extraction needs rendered parity tests.

### Phase M5 — desktop-managed creation

Enable create/edit workflows only for types whose website loader, form, validation, and tests are complete. New records begin on a local feature/stage branch, not `main`.

Start with lower-risk science articles or team news after real approval data exists. Do not use team members, outputs, collaboration cases, operational tutorials, or sensitive observations as convenience demos.

### Phase M6 — legacy deprecation

Legacy TypeScript content can be removed only when all are true:

- every mapped record is migrated with reviewed provenance;
- record loader has been used through at least one integrated release and rollback rehearsal;
- URL, locale, SEO, sitemap, image, ordering, empty-state, and policy parity tests pass;
- no component or compatibility build imports the legacy export;
- integration approves a specific deletion commit and recovery point;
- documentation and rollback instructions are updated.

D1/Drizzle/Worker/Sites/vinext are outside this deprecation decision.

## 5. Collection parity matrix

| Dimension | Required evidence |
| --- | --- |
| Identity | Same IDs and list ordering; no duplicate or renamed stable ID. |
| Routes | Same existing status codes and suffixes; optional-English fixture follows the new contract. |
| Visible content | Required headings, copy, empty states, caution text, and review panel remain equivalent. |
| SEO | Titles, descriptions, canonicals, published alternates, Open Graph, and Twitter metadata. |
| Sitemap | Same existing public URLs until an intentional locale-state change; no drafts. |
| Relationships | Related routes, guides, research, collaboration anchors, and filters resolve. |
| Media | Same paths and byte hashes for legacy assets; complete new metadata. |
| Safety | Existing prohibited-claim, hazardous-parameter, privacy, and attribution tests remain. |
| Builds | `npm run check`, `npm test`, and `npm run build:next`. |

Rendered parity may normalize framework-generated attribute order and build IDs, but it must compare semantic HTML, metadata, URLs, and protected copy. Any allowed difference is listed explicitly in the batch handoff.

## 6. Locale migration

Existing entries currently require both languages. During migration:

- set both existing public locales to `published` only after confirming current rendered content and review metadata;
- do not mark machine-generated or placeholder English as reviewed;
- use test fixtures, not public content, to prove a missing English locale;
- future Chinese-only records set `en.state = "missing"` and omit `en.md`;
- adding English later is a separate reviewed content commit.

The source switch and route availability must never produce a window where a draft English page is public.

## 7. Media migration

### Existing assets

- Keep paths and bytes unchanged.
- Create media catalog entries that record current known attribution and explicitly retain `pending` rights where applicable.
- Mark unreferenced `bloom.jpg`, `diatoms.jpg`, and `photobioreactor.jpg` as protected legacy inventory, not deletion candidates.
- Do not fabricate missing author, license, consent, alt text, or caption information.
- Existing image hash tests remain until equivalent catalog/hash tests supersede them.

### New assets

- Ingest only below `public/images/uploads/YYYY/MM/`.
- Generate collision-resistant media IDs independent of the original filename.
- Validate file signature, dimensions, bytes, hash, rights, consent, and localized accessibility metadata.
- Remove private location/device metadata from the public copy.
- Keep originals and consent evidence outside Git under operator-controlled storage.

Image optimization/CDN work remains separate.

## 8. Component and route compatibility

The migration adapter supplies the shape existing components need, limiting page rewrites. When a type has fields the current component cannot display, the field can be stored and validated before a code-reviewed renderer change, but it must not silently alter output.

Route-family additions for news, outputs, projects, observations, or member details are separate code changes. A desktop-created record cannot cause an unknown route to exist.

## 9. Rollback

### Before commit

- discard only the in-memory proposal or operation-created temporary files;
- do not touch pre-existing untracked files;
- restore the previous target file from the operation's verified pre-write bytes if atomic replacement fails.

### After local commit

- create a normal revert commit or continue with a correcting commit;
- do not reset or rewrite history;
- record the reverted record IDs and reason.

### After integration but before production

- integration creates a revert commit on its local integration branch and reruns all checks;
- it does not force-move any branch.

### After production

Production response belongs to the established main-only release process: deploy a reviewed fixing/revert commit or use the documented server rollback. Stage workers and the desktop never connect to production.

### Collection rollback

Reverting the tested source-switch commit returns the whole collection to legacy. Partial per-record runtime fallback is prohibited because it obscures authority.

## 10. Failure stop conditions

Stop a migration batch when:

- a record count or stable ID cannot be reconciled;
- legacy and record renderers differ without an approved reason;
- a route, language alternative, canonical, sitemap entry, image hash, or protected warning changes unexpectedly;
- rights, consent, source, public scope, or review evidence is missing;
- a collection would need data invented to satisfy the schema;
- the worktree contains unrelated changes;
- validation/build/test failure is not understood;
- a required predecessor interface or bundle is missing.

The batch writes a failure summary and leaves legacy as authoritative.

## 11. Completion evidence per batch

Each batch handoff records:

- base/final SHA and branch;
- collection and source files;
- old/new record counts and IDs;
- classification decisions;
- locale state summary;
- media inventory and rights gaps;
- parity test command/results;
- changed files;
- rollback commit or source-switch location;
- explicit remaining legacy dependencies.

## 12. Items intentionally deferred

- production database or object-storage migration;
- image CDN, compression, responsive formats, and caching;
- route redesign or new navigation;
- visual redesign;
- bulk translation;
- automatic external citation lookup;
- removal of compatibility files;
- direct GitHub publishing or production deployment.
