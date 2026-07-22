# Content Workbench Requirements

Status: Stage 0 design
Repository baseline: `456ff609e27ce5aa46fa0608289a30298bdd3e7f`
Stage branch: `local/stage-00`

## 1. Purpose

The Guangdong Ocean University Algae Research Team needs a Windows-first desktop workbench for maintaining content that changes over time. The workbench will write validated repository files and prepare local Git commits. It will not become a general website builder, a production administration console, or a replacement for code review.

Stage 0 defines the contract only. It does not change public rendering, move current content, add desktop dependencies, or activate a database.

## 2. Fixed product decisions

1. Editors select an explicit content type before editing. Each type has dedicated fields and validation.
2. Chinese is the required source language and may be published independently.
3. English is optional. Missing or unapproved English content does not produce an English detail page and is never filled by automatically published machine translation.
4. Stable English IDs identify records. Chinese titles are never filenames or keys.
5. Markdown stores long-form prose. Versioned JSON stores structured metadata and workflow state.
6. New images initially live below `public/images/uploads/YYYY/MM/`; media metadata records rights, consent, attribution, and localized accessibility text.
7. Publication is a Git workflow. Stage workers have no remote and cannot push, merge `main`, create releases, or deploy.
8. Navigation, route families, theme, shared shell, footer, deployment configuration, and server settings remain code-owned.
9. Existing D1, Drizzle, Worker, Sites, vinext, and legacy content structures stay in place until a later approved migration proves parity and rollback.
10. Native production verification remains `npm run build:next`.

## 3. Evidence-based repository audit

### 3.1 Runtime and build surfaces

| Area | Current evidence | Stage 0 conclusion |
| --- | --- | --- |
| Website | Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3 | The website remains the public renderer. |
| Production build | `npm run build:next` runs `next build` | This is the release gate. |
| Compatibility build | vinext, Vite, Cloudflare plugin, Worker entry | Retain; `npm test` depends on the vinext build. |
| Hosting | Native Next.js behind Nginx/systemd is authoritative | The desktop app never deploys or changes hosting. |
| Desktop | No Tauri project or desktop dependency exists | Desktop implementation starts only in its assigned later stage. |
| Package policy | `engines.node >=22.13.0`; project baseline uses Node 22.23.1 | All stage hosts use the exact baseline version. |

### 3.2 Routes and locale behavior

The shared catch-all route `app/[locale]/[[...slug]]/page.tsx` dispatches every public page. It currently generates both `zh` and `en` variants for every known detail. `SiteShell` switches language by preserving the same suffix, while metadata and `app/sitemap.ts` always advertise paired language alternatives.

That behavior conflicts with optional English content. A later website stage must make route generation, metadata, sitemap entries, and the language switch consult a validated availability index. The current route table and layout remain unchanged during Stage 0.

### 3.3 Current content sources

| Source | Current records or responsibility | Findings |
| --- | --- | --- |
| `lib/site-data.ts` | 6 algae profiles, 4 application background cards, 3 sample observation projects, 3 science articles, site identity, navigation, 4 image-credit records | Mixes maintainable records with code-owned site structure. |
| `lib/team-data.ts` | 2 research areas, 5 topics, 6 tutorial shells, 8 beginner-guide shells; members, outputs, and news are empty | Stable IDs already exist, but all localized fields require both languages. |
| `lib/live-feeds-data.ts` | 3 group profiles, 6 research topics, 9 guide shells | Strong type-specific fields exist; many operational fields intentionally remain empty pending review. |
| `lib/collaboration-data.ts` | 6 collaboration areas, preparation checklist, 5 process steps, 7 boundaries | Public policy and reusable area records are mixed together. |
| `lib/research-capabilities-data.ts` | 4 capability profiles | Records are public scope descriptions, not evidence of capacity. |
| `components/*.tsx` | Page layout plus substantial home, team, research, about, contact, privacy, and algal-bloom copy | Some sustainable content is embedded in rendering code and needs gradual extraction, but structure must remain code-owned. |
| `app/*.ts(x)` | Routing, SEO metadata, sitemap, IndexNow key route | Code-owned. Content records may feed metadata but cannot create route families. |
| `public/images/` | 7 existing binaries | Existing files and hashes are protected by tests. Three files are not currently referenced; none may be deleted automatically. |

### 3.4 Review and publication model

`lib/content-review.ts` defines `draft`, `internal-review`, and `reviewed`, with update dates, optional people, version, and references. The review panel displays this metadata, but the current renderer does not use it as a publication gate: draft scientific records are publicly rendered.

The target model keeps compatible review concepts but moves status to each language. Validation, not display convention, decides whether a locale can produce a public route.

### 3.5 Images and attribution

Image paths are stored directly in data or components. `imageCredits` has file, credit, licence, and optional source URL, but it does not yet cover every binary or record MIME type, dimensions, hash, consent, localized alternative text, localized caption, or usage scope as machine-validatable fields.

Existing images remain untouched. New uploads use a separate metadata catalog and a protected upload directory.

### 3.6 D1, Drizzle, Worker, and compatibility status

The repository does not currently use a production database as its public content source:

- `db/schema.ts` is intentionally empty.
- `drizzle/meta/_journal.json` contains no migration entries.
- `.openai/hosting.json` sets both `d1` and `r2` to `null`.
- `examples/d1/` is an opt-in notes example.
- `worker/index.ts` is the vinext compatibility entry and declares bindings for that surface.

These files are compatibility scaffolding. Stage 0 neither deletes them nor promotes them into the content architecture. The first implementation is repository-file based.

### 3.7 Existing automated boundaries

The baseline contains 25 rendered-site tests and one IndexNow unit test. They cover:

- root redirect, locales, canonical URLs, language alternatives, and sitemap entries;
- navigation and footer invariants, ICP filing, production domain, and 404 behavior;
- team, research, live-feed, collaboration, tutorial, Atlas, outputs, news, and public-observation boundaries;
- review metadata visibility and empty-state wording;
- prohibited invented claims, hazardous parameters, unverified people, outputs, email addresses, and projects;
- exact image inventory and SHA-256 hashes;
- separation of public sample observations from team news;
- exact IndexNow key behavior.

Future tests must preserve these protections while adding schema, locale-availability, migration-parity, desktop, media, and Git-safety coverage.

## 4. Ownership boundary

| Workbench may maintain | Code review remains responsible for |
| --- | --- |
| Records of approved content types | Adding or removing a route family |
| Per-language titles, summaries, fields, Markdown body, review state | Navigation labels/order and global shell |
| Authors and public attribution records | Theme, CSS, layout components, footer, ICP information |
| New media files under the upload directory and their metadata | Existing legacy image moves or deletions |
| Record relationships through validated IDs | Arbitrary imports, executable code, dependencies, build scripts |
| Local validation, preview data, allowlisted Git commits, delivery summaries | Remotes, push, PR, merge, tags, releases, deployment, server configuration |

Allowlisted singleton records may edit copy for an existing code-owned route, but they cannot add a new route or change its slug.

## 5. Functional requirements

| ID | Requirement |
| --- | --- |
| R-001 | The editor must select a registered content type before creating a record. |
| R-002 | Every record must have a globally stable lower-case English ID matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`. |
| R-003 | IDs and content types are immutable after first publication; replacement uses an explicit redirect/migration reviewed in code. |
| R-004 | Chinese is required for publication. English may remain `missing`, `draft`, or `internal-review` while Chinese is published. |
| R-005 | A locale produces a detail route only when that locale is `published` and passes validation. |
| R-006 | Machine-assisted text must be marked and cannot become `published` until a named human reviewer approves that locale. |
| R-007 | Long-form bodies are Markdown files; raw executable HTML, scripts, embedded forms, and unsafe URLs are rejected. |
| R-008 | JSON metadata is validated as a discriminated union keyed by content type and schema version. |
| R-009 | Every substantive edit records an update date and returns the edited locale to review before publication. |
| R-010 | Scientific, instructional, collaboration, and observation records retain the existing caution and evidence boundaries. |
| R-011 | New images require metadata, file-signature validation, a SHA-256 hash, rights status, applicable consent state, and localized alt text for every published locale. |
| R-012 | Authors, reviewers, and media contributors use stable public IDs; no private personnel dossier is stored in Git. |
| R-013 | References use structured title, URL/identifier, note, and access metadata rather than unvalidated prose links. |
| R-014 | The website loader must fail closed on invalid published records and report actionable file/field errors. |
| R-015 | The workbench must never write outside approved content, media, and delivery paths. |
| R-016 | Publishing is atomic: validate a clean allowed worktree, stage only allowlisted paths, show the diff, then create a local commit after operator confirmation. |
| R-017 | The workbench must not add a remote, invoke network Git operations, push, merge protected branches, tag, release, or deploy. |
| R-018 | All generated content files use UTF-8 without BOM, LF line endings, deterministic key ordering, and stable formatting. |
| R-019 | Existing TypeScript content remains readable through a legacy adapter until migrated records pass parity tests. |
| R-020 | Rollback is performed by reverting or selecting a prior commit; never by destructive reset or deleting the only legacy source. |

## 6. Quality and operational requirements

- Windows 10/11 x64 is the first supported desktop platform.
- Shared TypeScript types and validation rules must be usable by both Next.js and Tauri without importing browser, Node-only, or Tauri-only APIs into the schema core.
- A content-only change must produce deterministic output on identical inputs.
- Validation errors must include stable codes, record ID, locale, field path, and a human-readable remedy.
- A failed save or publish must leave the prior files and Git index unchanged.
- Build-time content loading must not require a database, desktop app, network connection, or secret.
- Public rendering must not expose draft, missing, archived, or invalid locale variants.
- The workbench must preserve unrelated dirty or untracked user files and stop when safe staging cannot be proven.
- Logs and reports must redact environment values and must never include tokens, passwords, private keys, or real `.env` content.

## 7. Stage 0 non-goals

Stage 0 does not:

- add Tauri, React desktop, schema libraries, or new package dependencies;
- change current TypeScript content or page rendering;
- create, move, or optimize images;
- migrate content or activate D1/R2;
- modify routes, metadata, sitemap, navigation, CSS, hosting, deployment, or production;
- connect to GitHub or a production host.

## 8. Acceptance for later implementation

The eventual workbench is acceptable only when:

1. each registered type has type-specific create/edit validation;
2. a Chinese-only published fixture builds a Chinese detail, no English detail, no English alternate, and a language-switch fallback to the English section page;
3. a reviewed English variant can be added later without changing the record ID or Chinese URL;
4. invalid rights, consent, review, references, paths, or unsafe Markdown block publication;
5. legacy and migrated fixtures render equivalent public output during the compatibility period;
6. local Git publication stages only allowlisted files and is recoverable through ordinary commits;
7. `npm run check`, `npm test`, and `npm run build:next` pass.

## 9. Information that must be confirmed, not invented

Future editors must preserve explicit pending states until the operator supplies evidence for:

- public team-member names, roles, biographies, and portrait consent;
- publications, patents, funded projects, student outputs, identifiers, and links;
- public contact channels and laboratory address;
- specific instruments, strains, capacities, collaborators, sites, or outcomes;
- rights and usage scope for existing user-provided images;
- operational tutorial parameters, safety steps, and laboratory approval;
- permissions to disclose partner names, sampling locations, unpublished data, and observation interpretations.
