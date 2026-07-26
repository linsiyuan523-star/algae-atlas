# Content Schema

This document defines the repository representation shared by the website loader and desktop workbench. It is a design contract; Stage 0 does not create the directories or runtime implementation described below.

## 1. Storage layout

~~~text
content/
  records/
    <content-type>/
      <stable-id>/
        record.json
        zh.md
        en.md                 # optional; absent when English state is missing
  authors/
    <author-id>.json
  media/
    <media-id>.json

public/
  images/
    uploads/
      YYYY/
        MM/
          <media-id>.<ext>
~~~

Rules:

- Content type and ID in `record.json` must match the containing directories.
- Body filenames are fixed to `zh.md` and `en.md`; JSON cannot point outside the record directory.
- `en.md` must not exist when English is `missing`.
- Existing images outside `uploads/` remain valid legacy references during migration and are never moved automatically.
- Generated availability indexes and previews are build artifacts and are not committed.

## 2. Canonical record shape

The Stage 1 implementation will express this contract as a pure TypeScript runtime schema with inferred types. A single pinned validation library will be used by both Next.js and the desktop front end; parallel handwritten validators are prohibited.

~~~ts
type ContentType =
  | "team-news"
  | "research-output"
  | "research-project"
  | "learning-resource"
  | "algae-profile"
  | "live-feed-profile"
  | "coastal-observation"
  | "science-article"
  | "team-member"
  | "collaboration"
  | "research-profile";

type WorkflowState =
  | "missing"
  | "draft"
  | "internal-review"
  | "approved"
  | "published"
  | "archived";

type TranslationOrigin =
  | "source-authored"
  | "human-translated"
  | "machine-assisted";

type Review = {
  status: "draft" | "internal-review" | "reviewed";
  updatedAt: string;
  reviewedAt?: string;
  version: string;
  reviewerIds: string[];
  references: Reference[];
};

type PresentLocale<TFields> = {
  state: Exclude<WorkflowState, "missing">;
  title: string;
  summary: string;
  bodyFile?: "zh.md" | "en.md";
  fields: TFields;
  translationOrigin: TranslationOrigin;
  humanVerifiedBy?: string;
  review: Review;
  publishedAt?: string;
};

type MissingLocale = {
  state: "missing";
};

type ContentRecord<TType extends ContentType, TShared, TLocalized> = {
  schemaVersion: 1;
  id: string;
  type: TType;
  createdAt: string;
  updatedAt: string;
  authors: string[];
  tags: string[];
  media: string[];
  shared: TShared;
  locales: {
    zh: PresentLocale<TLocalized>;
    en: PresentLocale<TLocalized> | MissingLocale;
  };
  legacy?: {
    sourcePath: string;
    exportName?: string;
    sourceId?: string;
    migratedAt?: string;
  };
};
~~~

The concrete record union is discriminated by `type`; each type supplies the exact shared and localized fields specified in [CONTENT-TYPES.md](CONTENT-TYPES.md). Unknown keys fail validation except inside an explicitly versioned extension object added by a future schema migration.

## 3. Example: Chinese published, English missing

~~~json
{
  "schemaVersion": 1,
  "id": "coastal-observation-basics",
  "type": "science-article",
  "createdAt": "2026-07-22T09:00:00+08:00",
  "updatedAt": "2026-07-22T09:00:00+08:00",
  "authors": ["algae-research-team"],
  "tags": ["coastal-observation"],
  "media": ["coastal-observation-cover"],
  "shared": {
    "articleKind": "observation-guide",
    "publicationDate": "2026-07-22",
    "relatedContentIds": ["algal-blooms"],
    "coverMediaId": "coastal-observation-cover"
  },
  "locales": {
    "zh": {
      "state": "published",
      "title": "近岸藻类观察入门",
      "summary": "说明现场记录与判断边界。",
      "bodyFile": "zh.md",
      "fields": {
        "categoryLabel": "水环境观察",
        "takeaways": ["记录环境背景", "避免仅凭水色下结论"]
      },
      "translationOrigin": "source-authored",
      "review": {
        "status": "reviewed",
        "updatedAt": "2026-07-22",
        "reviewedAt": "2026-07-22",
        "version": "1.0",
        "reviewerIds": ["algae-research-team"],
        "references": []
      },
      "publishedAt": "2026-07-22T09:00:00+08:00"
    },
    "en": {
      "state": "missing"
    }
  }
}
~~~

The example is structural only and is not approved public content.

## 4. Identity and path invariants

- Record IDs match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and are unique across all content types.
- Author and media IDs use the same pattern and separate namespaces.
- IDs, type, and original creation time become immutable after first publication.
- Directory names are compared case-sensitively by validation even on Windows.
- Absolute paths, drive letters, `..`, encoded traversal, alternate data streams, junctions, and symlinks are rejected for managed files.
- JSON paths use repository-relative forward slashes when a path is unavoidable.
- A record may reference only registered content, author, and media IDs.
- Published references marked required must resolve to an eligible target.

## 5. Workflow and review

### 5.1 State transitions

~~~text
missing -> draft -> internal-review -> approved -> published -> archived
             ^            |             |           |
             +------------+-------------+-----------+
                   substantive edit returns to review
~~~

- Chinese cannot be `missing`.
- English may remain `missing` indefinitely.
- `approved` is reviewed but not public.
- `published` is the only state that creates a public locale detail.
- `archived` retains identity and history but is not listed as current content.
- A substantive edit to `approved` or `published` content moves that locale to `internal-review` before a publication commit.
- Git branches preserve the current production version while a draft is reviewed; the desktop does not overwrite `main`.

### 5.2 Publication eligibility

A locale is eligible only when all are true:

1. state is `published`;
2. review status is `reviewed`, with reviewer and reviewed date;
3. required localized and type-specific fields are present;
4. referenced media, authors, and required content resolve;
5. every referenced media item is permitted for that locale and use;
6. Markdown passes safety and link validation;
7. type-specific scientific, consent, and disclosure gates pass;
8. a machine-assisted locale has `humanVerifiedBy` matching a public reviewer ID.

An ineligible published record is a build error. The loader never silently falls back to legacy data for a collection selected as migrated.

## 6. Locale routing contract

| Chinese state | English state | Chinese detail | English detail | Chinese page switch target | English alternate metadata |
| --- | --- | --- | --- | --- | --- |
| published | published | yes | yes | matching English detail | emitted |
| published | approved/draft/internal-review | yes | no | English section landing | omitted |
| published | missing | yes | no | English section landing | omitted |
| approved/draft/internal-review | any | no | no | not applicable | omitted |
| archived | any | no current listing | based on English state only if independently valid | code-reviewed archive behavior | only for an existing detail |

Additional rules:

- A direct request to a missing or unpublished English detail returns localized 404; it does not redirect and masquerade as an English translation.
- The visible language switch on a published Chinese detail falls back to the corresponding English section landing when English is unavailable.
- Canonical metadata is emitted only for the rendered locale.
- `hreflang` includes only published locale variants; `x-default` points to the published Chinese detail.
- The sitemap lists only eligible locale URLs.
- Section landing pages remain code-owned and bilingual, so they are safe fallback targets.
- Adding English later keeps the same record ID and suffix.

## 7. Markdown contract

Markdown bodies are UTF-8 without BOM and LF terminated. The initial profile supports:

- headings beginning at level 2;
- paragraphs, emphasis, strong text, ordered and unordered lists;
- block quotes, tables, and safe links;
- repository media references through validated media IDs, not raw relative paths.

The initial profile rejects or strips:

- raw HTML, script/style/iframe/object/embed/form elements;
- event-handler attributes, JavaScript/data URLs, inline SVG, and remote executable embeds;
- MDX, JSX, imports, directives that execute code, and template interpolation;
- absolute local paths or links to secrets and environment files.

External links allow only `https` by default. Any exception is explicit in the validator and test fixtures. Link labels and scientific citations remain reviewable structured content.

## 8. References

~~~ts
type Reference = {
  id: string;
  kind: "article" | "dataset" | "taxonomy" | "policy" | "manual" | "other";
  title: string;
  href?: string;
  identifier?: {
    scheme: "doi" | "isbn" | "url" | "other";
    value: string;
  };
  note?: string;
  accessedAt?: string;
};
~~~

References do not prove a team output. A DOI in a source list cannot be converted into a team publication without separate output verification.

## 9. Author model

`content/authors/<id>.json` stores public attribution only:

~~~ts
type Author = {
  schemaVersion: 1;
  id: string;
  kind: "person" | "team" | "organization";
  status: "active" | "inactive";
  displayName: { zh: string; en?: string };
  role?: { zh: string; en?: string };
  publicLinks?: Array<{ label: string; href: string }>;
  publicScope: "approved" | "pending";
  consentReference?: string;
};
~~~

- `algae-research-team` is the preferred accountable team author for records lacking an approved personal byline.
- Private email, phone, student number, home address, identity documents, schedules, signatures, and consent evidence files are not stored.
- `consentReference` is a non-secret internal reference label, not the consent document.
- A person author cannot be published while public scope is pending.

## 10. Media model

`content/media/<id>.json` contains:

- ID, repository file path, SHA-256, MIME type, bytes, width, height, and upload time;
- creator/provider, source URL, license identifier/name/URL, attribution text, and usage scope;
- consent state: `not-applicable`, `confirmed`, or `pending`;
- whether identifiable people are present and a non-secret consent reference;
- localized alternative text and captions;
- optional focal point and related content IDs;
- legacy flag for protected existing assets.

Publication requires:

- file extension, MIME declaration, file signature, dimensions, byte size, and hash to agree;
- a path below the new upload directory, unless explicitly marked as a protected legacy asset;
- rights status that permits the intended public use;
- confirmed consent when identifiable people are present;
- alt text for every published locale and captions when the design displays one;
- removal of GPS and unnecessary private EXIF from newly normalized public copies, while originals remain outside Git.

## 11. Deterministic serialization

- JSON uses two-space indentation, LF, one trailing newline, and UTF-8 without BOM.
- Canonical key order is defined by the serializer, not alphabetically rewritten by arbitrary tools.
- Arrays whose order affects presentation retain operator order; set-like ID arrays are sorted.
- Dates and timestamps use ISO 8601; calendar-only fields use `YYYY-MM-DD`.
- Saving an unchanged record produces no byte change.
- The workbench writes a sibling temporary file, flushes and validates it, then atomically replaces only the intended file.

## 12. Schema versions and migrations

- `schemaVersion` changes only through a dedicated schema stage.
- Readers support the current version and any explicitly documented transition version.
- Migration functions are pure, version-to-version, fixture-tested, and never run implicitly during a website build.
- The desktop previews a migration diff and creates a local commit; it does not mutate records on application startup.
- Unknown future versions fail with an actionable error.

## 13. Validation error contract

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

Stable error families include identity/path, schema/type, locale workflow, review, reference, media rights/consent, Markdown safety, disclosure, and repository/Git safety. Only errors block publication; warnings remain visible and must not be silently discarded.
