# Content maintenance

## Core rule

Publish only information that the team has confirmed for public use. When a member, output, project, event, contact detail, capability or procedure is not verified, preserve the explicit pending state instead of inventing a plausible value.

Chinese is required and may be published independently. English is optional and is evaluated independently; never block valid Chinese publication or synthesize published English. When both locales are public, keep their factual claims aligned.

## Maintenance map

| Content | File or data set | Required checks |
| --- | --- | --- |
| Team positioning and research areas | `lib/team-data.ts` | Bilingual summary, public scope, linked routes |
| Team members | `teamMembers` in `lib/team-data.ts` | Confirm name, role, biography, image consent |
| Outputs and projects | `outputs` in `lib/team-data.ts` | Verify citation, year, identifier and public link |
| News | `news` in `lib/team-data.ts` | Verify event, date, body, caption and image rights |
| Instrument tutorials | `tutorials` in `lib/team-data.ts` | Laboratory review before specific steps or parameters |
| Research capabilities | `lib/research-capabilities-data.ts` | Confirm actual resources and collaboration boundaries |
| Live feeds | `lib/live-feeds-data.ts` | Taxonomy, bilingual fields, safe parameter boundary |
| Collaboration | `lib/collaboration-data.ts` | No guarantee, approval claim or unconfirmed partner |
| Algae Atlas and public articles | `lib/site-data.ts` | Scientific name, habitat, bilingual text, source |
| Navigation and brand | `lib/site-data.ts` | Header, footer, language paths and route tests |
| Images and credits | `public/images/`, `imageCredits` | Author/provider, source URL, licence, usage scope |

The table above remains the production source map while every collection selects `legacy`. Stage-03 may switch a complete reviewed collection to repository records; it must not mix both sources by ID.

## Structured repository workflow

Structured content uses the fixed Stage-01/02 layout:

~~~text
content/records/<content-type>/<stable-id>/record.json
content/records/<content-type>/<stable-id>/zh.md
content/records/<content-type>/<stable-id>/en.md
content/authors/<stable-id>.json
content/media/<stable-id>.json
~~~

Use stable lowercase English IDs. Save every JSON and Markdown file as UTF-8 without BOM, LF only, with a final newline. The full repository graph must pass the shared schema, Markdown, author/media, review, reference, and per-locale publication rules before the website reads it.

Do not copy fictional fixtures from `tests/fixtures/` into `content/`. See `docs/content-workbench/CONTENT-LOADER.md` for source selection, locale routing, metadata, sitemap, renderer, rollback, and validation details.

## Review metadata

Scientific and instructional content uses `ContentReview` from `lib/content-review.ts`:

```ts
review: {
  status: "draft",
  updatedAt: "YYYY-MM-DD",
  version: "0.1",
}
```

- `draft`: material is being prepared and must not contain unreviewed procedures or claims.
- `internal-review`: the current version is being checked but is not yet confirmed for publication as reviewed.
- `reviewed`: the current version completed internal review; this does not grant laboratory access, project approval or collaboration approval.
- `reviewedAt` is present only for the version actually reviewed.
- `author` and `reviewer` are optional and must not be invented.
- A substantive edit to reviewed content returns it to `internal-review` until the new version is reviewed.

## Team, research and outputs

Team member records remain empty until public names, roles, descriptions and optional photos are confirmed. Do not infer membership from personal pages, search results or photographs.

Research pages describe areas of interest and maintainable capability boundaries. They must not imply that every instrument, strain, sample, site, partner or method is currently available. Outputs require a verifiable publication, patent, project or student-research record; never create placeholder outputs to make a category look populated.

## Live feeds and laboratory tutorials

Live-feed entries use stable English IDs for route slugs and keep Chinese and English fields aligned. A class-level image must not be presented as a confirmed species identification.

Before laboratory review, do not publish specific culture density, feeding rate, temperature, salinity, photoperiod, disinfectant, preservative, drug or antibiotic instructions. Public learning material does not replace instrument manuals, safety training, supervision or an approved SOP.

## Collaboration and coastal observations

Use cautious language such as “may be discussed” and “subject to feasibility assessment.” Do not promise approval, capacity, schedule, experimental outcome, publication, authorship or intellectual-property terms.

Partner names, sampling stations, unpublished data and event interpretations remain private until the relevant parties confirm the public scope. Coastal bloom content is research and education material, not an official marine warning, seafood-safety conclusion or public-health notice.

## Images and attribution

For every new or replacement image:

1. confirm that the image represents the stated subject;
2. record the author or provider and source URL where applicable;
3. record the licence or agreed public-use scope;
4. confirm consent for identifiable people;
5. add bilingual alternative text;
6. update `imageCredits` and rendered tests;
7. check desktop and mobile layouts.

Do not copy images from search results or remove a “usage scope pending confirmation” notice without evidence.

## Validation checklist

After a content change:

```bash
npm run check:content-loader
npm run test:content-loader
npm run check
npm test
npm run build:next
```

Also inspect the affected Chinese and English routes, language switching, image credit display, canonical metadata, sitemap entries and mobile overflow.
