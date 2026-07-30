# Content Types

This registry is the Stage 0 contract for records the desktop workbench may maintain. Type IDs are permanent API values. Display labels may change, but IDs and route families require code review.

## 1. Common record contract

Every type includes:

| Field | Rule |
| --- | --- |
| `schemaVersion` | Positive integer; starts at 1. |
| `id` | Stable lower-case English kebab-case ID. |
| `type` | One registered type ID from this document. |
| `createdAt`, `updatedAt` | ISO 8601 timestamps with timezone. |
| `authors` | Array of public author IDs; at least one accountable author/team for publication. |
| `tags` | Controlled IDs, not presentation labels. |
| `media` | References to media IDs, never arbitrary filesystem paths. |
| `locales.zh`, `locales.en` | Independent language workflow objects. Chinese must exist to publish. |
| `legacy` | Optional provenance used during migration; never displayed directly. |

Each locale owns its title, summary, body reference, localized dedicated fields, review history, translation origin, and publication state. Shared scientific identifiers, dates, subtype, relationships, and media IDs live once at record level.

## 2. Registry

| Type ID | Chinese label | Route family | Creation policy |
| --- | --- | --- | --- |
| `team-news` | 团队动态 | `/[locale]/news/[id]` | New IDs allowed after verification. |
| `research-output` | 科研成果 | `/[locale]/outputs/[id]` | New IDs allowed only with verifiable output evidence. |
| `research-project` | 研究项目 | `/[locale]/projects/[id]` or an approved future code-owned family | New IDs allowed; route activation belongs to the website stage. |
| `learning-resource` | 实验学习资源 | `/[locale]/tutorials/[id]` | New IDs allowed, but procedural publication requires laboratory review. |
| `algae-profile` | 藻类图鉴 | `/[locale]/algae/[id]` | New IDs allowed after taxonomy/source review. |
| `live-feed-profile` | 生物饵料 | `/[locale]/live-feeds/[id]` | New IDs allowed after identity and scope review. |
| `coastal-observation` | 赤潮与近岸观测 | Approved observation/detail family | New IDs allowed; sensitive locations and warnings are gated. |
| `science-article` | 科普文章 | `/[locale]/insights/[id]` | New IDs allowed after scientific/content review. |
| `team-member` | 团队成员 | Existing team page or future code-owned detail family | New IDs require public-scope and portrait consent confirmation. |
| `collaboration` | 合作与交流 | Existing collaboration page or approved detail family | Area singleton IDs are allowlisted; cases/events require disclosure approval. |
| `research-profile` | 研究方向与能力说明 | Existing research detail families | Fixed allowlisted IDs; cannot create routes from the desktop. |

Route families shown as “approved” are design targets, not Stage 0 changes. A schema record cannot make a new route family by itself.

## 3. Type-specific fields

### 3.1 Team news — `team-news`

Shared fields:

- `eventDate`, optional `endDate`, and optional public `locationLabel`;
- `category`: `research`, `teaching`, `fieldwork`, `meeting`, `student-research`, or `other`;
- `pinned`, cover media ID, gallery media IDs, related record IDs;
- disclosure reference confirming the event may be public.

Localized fields:

- title, summary, Markdown body, caption(s), and optional public participant description.

Publication gates:

- date/event/source verified;
- named people and organizations approved for public display;
- all photos have applicable rights and consent;
- news is not populated from existing sample observations.

### 3.2 Research output — `research-output`

Shared fields:

- `outputKind`: `publication`, `patent`, `dataset`, `software`, or `student-research`;
- year, publication date, identifier kind/value, canonical URL, related project IDs;
- contributor/author IDs and verification source;
- publication/patent status where applicable.

Localized fields:

- title, plain-language summary, citation note, contribution note, and Markdown description.

Publication gates:

- identifier, citation, year, and public link are verifiable;
- no placeholder output;
- contributor order is not inferred;
- student information has public-scope approval.

### 3.3 Research project — `research-project`

Shared fields:

- `projectKind`: `funded`, `internal`, `student`, `collaborative`, or `field-observation`;
- public project code if approved, start/end dates, status, lead author/team ID;
- partner author IDs, related outputs, research profiles, media, and funding disclosure;
- disclosure scope for partner names, sites, data, and results.

Localized fields:

- title, summary, objectives, methods overview, public progress, outcomes, and Markdown body.

Publication gates:

- the record represents a real confirmed project, not a public example framework;
- funding/partner claims and identifiers are evidenced;
- unpublished results and sensitive sites remain excluded.

### 3.4 Learning resource — `learning-resource`

Shared fields:

- `resourceKind`: `instrument-tutorial`, `beginner-guide`, `record-template`, or `safety-note`;
- audience, related instruments, related content IDs, attachments, version;
- hazard level and required approver roles.

Localized fields:

- name/title, purpose, prerequisites, applicable experiments;
- pre-check, materials, steps, common parameters, data export, cleaning/shutdown;
- common errors/anomalies, safety, administration, and Markdown body.

Publication gates:

- public introductory shells may omit operational details and say they are pending;
- specific parameters, hazardous substances, procedures, or equipment settings require laboratory review;
- the page states that it does not replace manuals, safety training, supervision, or approved SOPs.

### 3.5 Algae profile — `algae-profile`

Shared fields:

- accepted scientific name, display scientific name, taxonomic rank, identifiers and taxonomy sources;
- `environmentKinds`: freshwater, marine, brackish, terrestrial/moist, or extreme;
- profile category, identification status, related research and observation IDs;
- primary image and gallery media IDs.

Localized fields:

- common name, category label, summary, habitat, morphology, research focus;
- identification limitations, observation guidance, references note, Markdown body.

Publication gates:

- a higher-level identification is not promoted to a species name;
- taxonomy sources and review date are recorded;
- images represent the stated organism or explicitly state the identification limit.

### 3.6 Live-feed profile — `live-feed-profile`

Shared fields:

- scientific group, taxonomic level, `category`, and water-environment kinds;
- related guide, research, algae, and output IDs;
- primary image and gallery.

Localized fields:

- name, overview, environment, morphology, life history, ecological role;
- feeding traits, research focus, culture factors, applications, limitations;
- image alt/caption and Markdown body.

Publication gates:

- identity and strain/species limits are explicit;
- no invented density, feeding rate, temperature, salinity, photoperiod, chemical, antibiotic, or performance claim;
- group-level information is not presented as one universal culture protocol.

### 3.7 Coastal observation — `coastal-observation`

Shared fields:

- observation start/end time, evidence type, observation status, and sampling/project relationship;
- public location policy: `hidden`, `generalized`, or `exact-approved`;
- optional generalized location label; exact coordinates are prohibited unless separately approved;
- sample IDs approved for public use, taxonomic observations, environmental-variable descriptors;
- media, data-source references, responsible author, and disclosure approval.

Localized fields:

- title, summary, observed phenomena, environmental context, evidence limits;
- interpretation, follow-up, official-information disclaimer, captions, and Markdown body.

Publication gates:

- not an official red-tide alert, seafood-safety conclusion, marine-hazard forecast, or public-health advice;
- “algal bloom,” “red tide,” and “harmful algal bloom” are not treated as synonyms;
- sensitive stations, unpublished data, exact locations, and uncertain identifications are withheld.

### 3.8 Science article — `science-article`

Shared fields:

- `articleKind`: `foundation`, `observation-guide`, `method-explainer`, or `research-context`;
- publication date, optional reading-time estimate, related records, references, and cover media.

Localized fields:

- title, summary, note/category label, Markdown body, captions, and takeaways.

Publication gates:

- claims have appropriate references;
- public articles are not labeled as team news, formal projects, test reports, or products;
- safety, medical, environmental-warning, and product claims are bounded.

### 3.9 Team member — `team-member`

Shared fields:

- public person/author ID, membership status, role category, display order;
- public start/end year only when approved;
- portrait media ID, research-profile links, output links;
- profile disclosure and portrait-consent states.

Localized fields:

- display name, role title, biography, interests, and optional approved public links.

Publication gates:

- no member is inferred from photographs, search results, papers, or personal pages;
- the person or authorized team source confirms public scope;
- private email, phone, student ID, schedule, or internal role notes are never stored.

### 3.10 Collaboration — `collaboration`

Shared fields:

- `collaborationKind`: `area`, `exchange`, or `case-study`;
- status: `open-for-discussion`, `case-by-case`, or `internal-only`;
- related research/content IDs, partner author IDs, dates, media;
- disclosure approval, data/IP/publication scope.

Localized fields:

- title, summary, suitable partners, possible topics, partner preparation;
- team may-contribute wording, caveat, process/outcome summary, Markdown body.

Publication gates:

- “may discuss” language does not imply approval, capacity, schedule, outcome, authorship, or IP terms;
- partner names, project names, images, sites, and results require bilateral approval;
- fixed collaboration-area IDs are allowlisted by code and cannot be added from the desktop.

### 3.11 Research profile — `research-profile`

Shared fields:

- fixed ID: initially `microalgae`, `macroalgae`, `live-feeds`, or `algal-blooms`;
- content status, related collaboration IDs, related route key, media;
- code-owned route registration flag.

Localized fields:

- title, research objects, typical questions, methods/measurements;
- available resources/conditions, scope caveat, Markdown overview.

Publication gates:

- describes public research scope, not guaranteed instruments, strains, capacity, partners, or results;
- desktop editing cannot change the fixed ID, route, or add another top-level research area.

## 4. Code-owned information that is not a content type

The workbench must not edit:

- primary or secondary navigation and route dispatch;
- site name, domain, canonical base, global metadata defaults, global footer, ICP filing;
- CSS, components, page layout, breakpoints, or theme;
- IndexNow route or submission code;
- Next.js, vinext, Vite, Worker, D1/Drizzle, Sites, Vercel, Nginx, systemd, or deployment settings;
- package manifests, lockfiles, TypeScript config, test runner, or CI;
- schema/type registry itself.

Changes to these areas require a normal code stage and review.

## 5. Legacy-to-target mapping

| Current source | Target type | Migration note |
| --- | --- | --- |
| `news` | `team-news` | Empty today; preserve exact empty state until a verified record exists. |
| `outputs` publications/patents/student work | `research-output` | Empty today; do not manufacture fixtures as real data. |
| real future projects | `research-project` | Current `projects` array contains sample observations, not team projects. |
| `tutorials`, `beginnerGuides`, live-feed guides | `learning-resource` | Preserve pending procedural fields and review boundaries. |
| `algae` | `algae-profile` | Migrate six entries with route and rendered parity. |
| `liveFeedEntries` | `live-feed-profile` | Preserve three group profiles and related-guide links. |
| future verified field records | `coastal-observation` | Do not reinterpret existing bloom research copy as an event record. |
| `articles` and eligible public background entries | `science-article` | Classify sample observation frameworks explicitly. |
| `teamMembers` | `team-member` | Empty today; require evidence and consent before first record. |
| `collaborationAreas` | `collaboration` with kind `area` | Fixed IDs and public caveats remain protected. |
| `researchCapabilities` and research areas | `research-profile` | Allowlisted singleton migration; routes remain code-owned. |

`applications` and the current sample `projects` require a record-by-record classification review. They must not be bulk relabeled as team projects.

## 6. Relationship rules

- References use stable IDs plus an expected target type.
- Broken required references fail validation; optional unavailable links are omitted.
- Circular relationships are allowed only for non-owning related-content links.
- Parent/child ownership, such as a project owning outputs, must have one canonical direction.
- Published records normally use `archived` and retain their IDs. The B3A desktop may submit an explicit server removal only after Queue mode is confirmed active; that operation creates one controlled deletion commit limited to the target `record.json`, `zh.md`, and optional `en.md`, remains pending until synchronization, and does not manage redirects or HTTP status.
