# Test Strategy

## 1. Goals

Testing must prove three things simultaneously:

1. content is structurally valid and scientifically/review safe;
2. optional locale behavior and migration preserve correct public output;
3. the desktop cannot damage unrelated files, expand Git authority, or publish invalid data.

A green UI test alone is insufficient. Schema, repository, website, privileged Tauri services, Git behavior, packaging, and existing production build paths all require evidence.

## 2. Baseline that must remain

At Stage 0 baseline `456ff609e27ce5aa46fa0608289a30298bdd3e7f`:

- `npm run check` covers TypeScript and ESLint;
- `npm test` performs the vinext build and 25 rendered HTML tests;
- `tests/indexnow.test.ts` adds one IndexNow unit test, for 26 total;
- `npm run build:next` performs the authoritative Next.js production build and generates 97 static pages;
- image inventory/hashes, domain, ICP filing, routes, metadata, bilingual links, review labels, empty states, content boundaries, and prohibited claims are protected.

Later stages add tests; they do not delete or weaken these assertions merely to make a migration pass.

## 3. Test layers

| Layer | Purpose | Typical owner |
| --- | --- | --- |
| Schema unit | Discriminated fields, workflow, eligibility, deterministic serialization | Stage-01 |
| Contract/fixture | Same validator outcomes in Node and desktop/browser | Stage-01/04 |
| Repository integration | Paths, records, relationships, authors/media, availability | Stage-02 |
| Website route/render | Static params, 404, metadata, sitemap, switch fallback, output parity | Stage-02/03 |
| Desktop component | Forms, type-specific fields, state transitions, validation UX | Stage-05A |
| Privileged service | Filesystem/media/Tauri/Git safety and failure atomicity | Stage-05B/06B |
| End-to-end preview/publish | Form to files to preview/local commit and website render | Stage-06A/06B/07A |
| Packaging/security | Capabilities, installer, clean-machine behavior, logs | Stage-07B |
| Full integration | Every website/desktop suite and artifact verification | Stage-08 |

## 4. Schema fixture matrix

Every content type has:

- minimum valid Chinese draft;
- valid Chinese published and English missing;
- valid bilingual published;
- invalid missing required shared field;
- invalid missing type-specific localized field;
- invalid unknown field and wrong type discriminator;
- invalid reference type/ID;
- deterministic parse/serialize/parse round trip;
- prior schema-version migration fixture when versions advance.

Workflow fixtures cover every permitted and rejected transition:

| From | To | Expected |
| --- | --- | --- |
| missing English | draft | allow with English payload |
| draft | internal-review | allow when required draft fields pass |
| internal-review | approved | allow only with reviewer evidence |
| approved | published | allow only when all publication gates pass |
| published | internal-review | allow for substantive edit |
| published | draft | reject direct downgrade that could obscure review history |
| published | archived | allow with operator reason |
| archived | published | reject without an explicit reviewed restoration flow |

Chinese `missing` always fails.

## 5. Optional-English route acceptance

A synthetic, clearly fictional record must prove:

1. Chinese `published`, English `missing`;
2. Chinese detail returns 200;
3. English same-suffix detail returns localized 404;
4. Chinese canonical points to itself;
5. no English `hreflang` is emitted for the detail;
6. `x-default` points to Chinese detail;
7. sitemap lists Chinese detail only;
8. Chinese language switch points to the English section landing;
9. English section landing remains 200;
10. adding reviewed/published English later creates the matching English detail and alternate without changing ID or Chinese URL.

Repeat the eligibility logic at unit level, repository level, metadata level, sitemap level, and rendered navigation level. All surfaces must consume one availability index.

## 6. Type-specific policy tests

### Team news, members, outputs, projects

- empty real collections retain exact pending states;
- sample observation frameworks never appear as team news/projects;
- no inferred person, partner, publication, patent, identifier, funding, or result;
- private contact fields are rejected;
- photo consent and public scope gate publication.

### Learning resources and live feeds

- introductory pending shells are valid;
- operational parameters/procedures require laboratory review;
- patterns for density, feeding rate, temperature, salinity, photoperiod, disinfectants, preservatives, drugs, antibiotics, or guaranteed effects remain protected;
- group-level identification is not promoted to a species/strain protocol;
- required “does not replace training/manual/SOP” boundaries render.

### Algae and research profiles

- scientific name/taxonomic sources and identification status validate;
- research scope does not imply guaranteed capacity, equipment, organism availability, partners, or outputs;
- related collaboration and Atlas links resolve;
- legacy IDs, filters, ordering, images, and review information remain.

### Coastal observations and collaboration

- exact/sensitive location is blocked unless explicitly approved;
- no official warning, seafood-safety, hazard, or public-health conclusion;
- red tide, algal bloom, and harmful algal bloom remain distinct;
- no guaranteed approval, schedule, capacity, outcome, authorship, or IP terms;
- partner/project/data disclosure approval is required.

### Science articles

- public article/observation is not labeled as team news or formal project;
- references and scope notes validate;
- unsafe scientific/medical/environmental/product claims are caught by review fixtures.

## 7. Repository integration tests

Use temporary fixture repositories created under the test temp directory. Test:

- valid directory/type/ID alignment;
- duplicate IDs across types;
- case-colliding IDs on Windows;
- missing/orphan body, media, author, and required relationship;
- unexpected `en.md` when English is missing;
- body path traversal and absolute/UNC/ADS/device paths;
- symlink and junction escape;
- unknown schema version;
- explicit collection source selection;
- invalid migrated collection fails rather than legacy fallback;
- stable ordering and unchanged-save byte identity;
- availability index consistency.

Fixtures must never use the real worktree as a destructive test target.

## 8. Markdown security tests

Include:

- script/style/iframe/object/embed/form;
- raw HTML and event handlers;
- `javascript:`, encoded JavaScript, `data:`, file/UNC URLs;
- MDX/JSX/import expressions and template injection;
- malformed nested links/images, Unicode protocol tricks, and excessive nesting;
- external HTTPS link behavior and `noopener noreferrer`;
- safe headings, lists, tables, quotes, emphasis, and media references.

Run equivalent payloads through desktop preview and website render; sanitizer differences are failures.

## 9. Media tests

Fixture corpus includes:

- accepted small raster images for every initial format;
- extension/MIME/magic mismatch;
- truncated/corrupt images;
- extreme dimensions/pixel count and oversized bytes;
- polyglot/executable content;
- SVG/HTML/archive rejection in initial profile;
- duplicate bytes with different names;
- GPS/device/private metadata removal;
- deterministic normalized output hash;
- missing/invalid license, attribution, consent, alt text, caption;
- identifiable-person consent pending;
- protected legacy file reference and unchanged hash;
- operation failure between binary and metadata write.

Tests verify no partial public file/catalog pair survives a failed transaction.

## 10. Desktop tests

### React/UI

- content type must be selected before fields appear;
- each type shows only its dedicated fields and common fields;
- Chinese fields and workflow cannot be removed;
- English may be added, left missing, or returned for review independently;
- machine-assisted origin remains visible and blocks publish without human verifier;
- validation issues focus the correct field and preserve draft input;
- review/publish confirmation states are distinct;
- no UI route exposes arbitrary shell/path/remote settings.

### Tauri/Rust service

- frontend messages are treated as untrusted;
- capabilities expose only named commands;
- canonical root/path/reparse checks run again in privileged code;
- argument-vector Git commands cannot be injected by IDs/titles;
- media limits and atomic writes hold under failures;
- restart/power-loss recovery rechecks state and never resumes confirmation;
- logs are redacted.

## 11. Git safety tests

Disposable repositories cover:

- correct dedicated local branch, expected base, clean tree, no remote -> allow plan;
- `main`, `integration/main`, wrong stage branch -> block;
- any worker remote -> block;
- unrelated staged/modified/deleted/untracked file -> block and preserve;
- merge/rebase/cherry-pick/revert/bisect in progress -> block;
- malicious alias, hook, path with spaces/unicode, and content resembling options;
- exact allowlist rejects code/config/package/existing-image paths;
- staged diff exactly equals proposed file set;
- commit advances HEAD once, records intended files, and leaves clean;
- validation/test failure creates no commit;
- failed staging/commit does not reset, clean, stash, or delete user work;
- remote/network/tag/release/deploy verbs are unreachable.

No Git test accesses GitHub or production.

## 12. Migration parity tests

For each collection, compare legacy and record sources for:

- IDs/count/order/filter membership;
- route status and suffix;
- headings, protected copy, fields, empty states, and review display;
- canonical, description, Open Graph/Twitter, and language alternatives;
- sitemap URL set;
- internal related links;
- image path and protected binary hash;
- prohibited-claim/privacy/safety assertions.

Framework-generated volatile attributes may be normalized. Every intentional difference is an explicit fixture expectation and handoff entry.

## 13. End-to-end scenarios

Minimum Stage-07A scenarios:

1. create fictional Chinese-only science article, review, publish locally, render Chinese only;
2. add human-reviewed English later, render both and update alternates;
3. edit published Chinese, observe return to review and no accidental public commit;
4. ingest licensed non-person image with bilingual alt/caption;
5. block person image with pending consent;
6. create each content type minimum draft and validate dedicated fields;
7. block hazardous learning-resource details without laboratory review;
8. block sensitive coastal location and warning claim;
9. archive a record and verify listing/route policy;
10. inject a write/media/Git failure and verify atomic recovery;
11. import a representative migrated collection and prove legacy parity;
12. build a complete offline delivery bundle from a clean worktree.

All fixtures are visibly fictional and excluded from production content.

## 14. Packaging tests

On a clean supported Windows host:

- install/uninstall without administrator privilege where the chosen installer permits;
- verify expected application/data locations and no repository deletion;
- open an approved bundle-derived worktree;
- run schema validation and preview offline;
- confirm no network connection or credential prompt;
- inspect Tauri capabilities and CSP in packaged artifact;
- verify application/package SHA-256 and dependency/license inventory;
- simulate restart/power interruption around draft save;
- verify logs contain no secrets/private metadata;
- remove application without deleting operator content.

Signing requires a separately supplied certificate outside Git; unsigned rehearsal status must be reported honestly.

## 15. Commands and stage gates

Current website gate:

~~~powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build:next
~~~

Later stages add documented schema, desktop, Rust, and package commands. A stage handoff lists the exact commands available in that commit; executors must not invent a missing script.

Order:

1. install from lockfile when required;
2. focused unit/component tests per subtask;
3. schema/repository/security integration;
4. website `check`, `test`, `build:next`;
5. desktop/Rust checks for desktop stages;
6. packaging/clean-machine acceptance where applicable;
7. final Git status/remote/bundle verification.

## 16. Test data and secrets

- No real member, partner, email, sample coordinate, unpublished result, consent form, token, private key, or production environment value in fixtures or snapshots.
- Use `example.invalid`, obvious fictional IDs, and tiny generated media.
- Do not snapshot full environment or user directory listings.
- Test reports contain command, version, duration/summary, pass/fail/skip, and concise errors—not full npm/build logs.
- Network-dependent tests are isolated, opt-in, and not part of core content validation.

## 17. Failure policy

- Never disable a test, loosen an assertion, cast away types, or reuse stale output to declare success.
- Distinguish baseline failure, environment failure, and introduced failure.
- An unexplained new failure stops the stage.
- If a required test cannot run, record the exact reason and mark it not-run; do not report pass.
- After sleep, power loss, VPN/network switch, or toolchain restart, recheck worktree state and rerun affected gates.
- Final worktree is clean and remote state matches the stage role.

## 18. Traceability

| Requirement area | Primary evidence |
| --- | --- |
| Content types/fields | Schema fixtures + desktop form round trips |
| Stable identity/paths | Repository and Windows path tests |
| Independent locales | Eligibility + route/metadata/sitemap/switch tests |
| Review/translation | Workflow transition fixtures |
| Media rights/consent | Media catalog and ingestion tests |
| Authors/privacy | Author schema/disclosure tests |
| Scientific boundaries | Existing rendered tests + type-specific policy fixtures |
| Gradual migration | Legacy parity harness and collection switch tests |
| Git/offline workflow | Disposable-repository safety tests |
| Rollback/atomicity | Failure injection and revert rehearsal |
| No page regression | Existing 26 tests + native Next build |
| Windows delivery | Packaged clean-host acceptance |
