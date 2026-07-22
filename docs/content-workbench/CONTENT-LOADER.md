# Website content loader

Stage: Stage-02 — Website Content Loader
Contract versions: content schema 1, repository API 1

## 1. Scope

The website adapter reads the Stage-01 JSON/Markdown repository contract, validates the complete snapshot, derives independently publishable Chinese and English records, and presents legacy TypeScript data and repository records through one `PublicContentRepository` interface.

Stage-02 does not migrate real content. Every real collection in `lib/content-repository/default-repository.ts` deliberately selects `legacy`, so the current public site remains unchanged. The records source is exercised only with fictional fixtures below `tests/fixtures/content-repository/` until Stage-03 performs a reviewed collection migration.

## 2. Repository layout

~~~text
content/
├─ records/
│  └─ <content-type>/
│     └─ <stable-id>/
│        ├─ record.json
│        ├─ zh.md
│        └─ en.md              # only when the record declares English content
├─ authors/
│  └─ <stable-id>.json
└─ media/
   └─ <stable-id>.json
~~~

`record.json` remains the Stage-01 schema source of truth. Markdown keys are derived as `<type>/<id>/<locale>.md`; files do not contain executable TypeScript. Directory names and catalog filenames must exactly match their record IDs.

## 3. Fail-closed file rules

`loadContentRepository(repositoryRoot)` accepts a repository worktree root and reads only the fixed `content/` layout. It rejects:

- symbolic links, junctions, non-regular files, and unexpected directory entries;
- unknown content types, invalid stable IDs, mismatched directory/record identity, or extra files;
- invalid JSON, invalid UTF-8, UTF-8 BOM, CR/CRLF line endings, or a missing final LF;
- any Stage-01 schema, reference, Markdown, rights, review, locale, or publication-policy error.

The loader builds one `RepositorySnapshot` and calls the shared `parseRecord`, `parseAuthor`, `parseMedia`, and `validateRepository` APIs. It does not duplicate schema or publication rules. Validation errors identify repository-relative paths and do not expose the host's absolute worktree path.

## 4. Read and publication pipeline

1. Discover records, authors, media, and locale Markdown in deterministic order.
2. Parse JSON without executing it and build the Stage-01 snapshot.
3. Validate the complete graph before creating a public source.
4. Run the shared `publicationEligibility` policy separately for `zh` and `en`.
5. Materialize only eligible locale payloads.
6. Sort and filter through `PublicContentRepository`.
7. Derive one availability result for detail lookup, static params, metadata, language switching, and sitemap entries.

A schema or repository error throws `ContentRepositoryLoadError`; it is never converted into a silent legacy fallback.

## 5. Explicit source selection

`CollectionSourceSelection` is an exhaustive mapping for all 11 schema content types. The router selects exactly one source for a whole content type:

~~~ts
const selection = {
  ...createCollectionSourceSelection("legacy"),
  "science-article": "records",
} satisfies CollectionSourceSelection;
~~~

The repository never merges records and legacy entries by ID. If a migrated type selects `records`, absent or invalid repository entries do not fall back to a same-ID legacy entry. Stage-03 owns real migration evidence and source-switch changes; rollback is the explicit code/config switch back to `legacy`, followed by the full validation gates.

## 6. Code-owned detail routes

Content cannot create route families. `lib/content-repository/routes.ts` registers only the existing detail families:

| Content type | Existing route family | ID policy |
| --- | --- | --- |
| `research-profile` | `/<locale>/research/<id>` | `microalgae`, `macroalgae`, `algal-blooms` only |
| `live-feed-profile` | `/<locale>/live-feeds/<id>` | schema-valid stable ID |
| `learning-resource` | `/<locale>/tutorials/<id>` | schema-valid stable ID |
| `algae-profile` | `/<locale>/algae/<id>` | schema-valid stable ID |
| `science-article` | `/<locale>/insights/<id>` | schema-valid stable ID |

Other schema types are available through the repository API but require a separately reviewed, code-owned page integration. A content file cannot alter navigation, the footer, a section path, or the renderer registry.

## 7. Locale-aware routing behavior

| Record state | Detail/static params | Metadata and sitemap | Language switch |
| --- | --- | --- | --- |
| Chinese published, English missing/draft | Chinese only | Chinese canonical; no English alternate or sitemap URL | Chinese detail → English section landing |
| Chinese and English published | Both locales | Per-locale canonical plus `zh-CN`, `en`, and Chinese `x-default` | Same detail in the other locale |
| Requested locale unavailable | No generated detail; lookup returns `null` and the page returns 404 | No metadata for that unavailable detail | Not applicable |

Section pages retain their existing bilingual behavior. File-backed metadata uses `seoTitle` when present, otherwise `title`, and always uses the validated localized summary.

## 8. Structured body renderer

`StructuredContentPage` renders the safe Stage-01 Markdown profile as React nodes without raw HTML or `dangerouslySetInnerHTML`. It supports paragraphs, headings levels 2–6, unordered and ordered lists, blockquotes, simple tables, safe HTTPS/root/hash links, and `media:<stable-id>` image references resolved from validated media metadata.

HTTPS links open with `noopener noreferrer`. Missing media is not rendered. The schema validator remains the security boundary; the renderer is not a second permissive Markdown parser.

## 9. Authoring and verification

Real records must be added only by an approved migration stage. For a reviewed change:

1. use a stable lowercase English ID and the exact schema version;
2. save JSON and Markdown as UTF-8 without BOM, LF only, with a final newline;
3. keep Chinese required and evaluate English independently; never synthesize published English;
4. add only referenced, public-scope author/media metadata;
5. validate the whole repository and run all website gates.

~~~powershell
npm.cmd run check:content-loader
npm.cmd run test:content-loader
npm.cmd run check
npm.cmd test
npm.cmd run build:next
~~~

The fictional fixtures are test-only and must never be copied into `content/` or exposed through the public route repository.

## 10. Implementation map

- Filesystem loader and diagnostics: `lib/content-repository/file-loader.ts`
- Validated record adapter: `lib/content-repository/record-source.ts`
- Legacy adapters: `lib/content-repository/legacy-source.ts`
- Per-type source router: `lib/content-repository/repository.ts`
- Production selection: `lib/content-repository/default-repository.ts`
- Route/locale/sitemap helpers: `lib/content-repository/routes.ts`
- Structured renderer: `components/StructuredContentPage.tsx`
- Loader/route/render tests: `tests/content-repository/`

## 11. Known boundaries

- Stage-02 contains no real repository record, author, or media migration.
- All current production collections still select `legacy`; current visible pages remain equivalent.
- Only existing detail route families listed above are integrated.
- Image byte/signature/dimension/EXIF processing remains Stage-05B work.
- Desktop editing, preview, Git publishing, remote operations, deployment, and production changes are outside this stage.
