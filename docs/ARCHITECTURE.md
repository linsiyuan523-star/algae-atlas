# Architecture

## Runtime overview

Algae Atlas is a bilingual Next.js application with one shared route surface and data-driven page components.

```text
Browser
  -> Nginx :80/:443
  -> Next.js on 127.0.0.1:3000
  -> app/[locale]/[[...slug]]
  -> components/
  -> lib/ content data
```

Production runs the native Next.js server under systemd. Nginx terminates HTTPS, redirects `www.sycszy.icu` to the root domain while preserving the path, and proxies application requests to the loopback-only Next.js process.

## Routing and locales

- `app/(redirect)/page.tsx` redirects the root route to `/zh`.
- `app/[locale]/layout.tsx` sets the document language, shared metadata and viewport.
- `app/[locale]/[[...slug]]/page.tsx` validates `zh` and `en`, resolves the shared route table, generates metadata and renders the matching page component.
- `app/sitemap.ts` emits localized canonical routes and language alternates.
- Unknown locales, route depths or entry IDs return the localized 404 page.

The language is encoded in the URL. New public routes must preserve the same suffix in both locales and update static params, metadata, language switching, the sitemap and rendered tests.

## Components

- `components/SiteShell.tsx` owns the shared header, navigation, language switcher and global footer.
- `components/SitePages.tsx` contains the general team, research, tutorial, Atlas and information pages.
- `components/LiveFeedsPages.tsx`, `CollaborationPages.tsx` and `ResearchCapabilityPages.tsx` contain the corresponding specialist page families.
- `components/ContentReviewPanel.tsx` presents the common review metadata.
- `components/PagePrimitives.tsx` provides shared layout primitives.

Do not duplicate the global shell or hard-code the same footer, navigation or filing information in individual pages.

## Data and content

Public content is maintained in `lib/` rather than fetched from a production database:

- `site-data.ts`: brand, navigation, Atlas entries, public articles and image credits;
- `team-data.ts`: team, research areas, outputs, tutorials and news;
- `live-feeds-data.ts`: live-feed groups, research topics and guide structures;
- `collaboration-data.ts`: collaboration areas, preparation, process and boundaries;
- `research-capabilities-data.ts`: shared research-capability model;
- `content-review.ts`: `draft`, `internal-review` and `reviewed` metadata.

The checked-in D1, Drizzle, example and Worker files are compatibility scaffolding and are not the current source of public team content. Remove or migrate them only through a dedicated, tested architecture change.

## Images

Public image files are under `public/images/`. References live in data or page components, while source and licence information is maintained in `lib/site-data.ts` as `imageCredits` and displayed on the About page.

Image delivery optimization is intentionally deferred to GitHub issue #2. Do not combine compression, cropping, Next.js `Image`, CDN or Nginx cache changes with unrelated maintenance.

## Builds

| Command | Purpose |
| --- | --- |
| `npm run dev:next` | Native Next.js local development |
| `npm run check` | TypeScript and ESLint |
| `npm test` | vinext build plus rendered HTML tests |
| `npm run build:next` | Native Next.js production build |
| `npm run dev` / `npm run build` | vinext/Cloudflare compatibility path |

Production deployment must use `npm run build:next`. The vinext build is retained because the test suite and `.openai/hosting.json` integration use it; it is not a substitute for the native production build.

## Hosting compatibility

- `.openai/hosting.json`, `vite.config.ts`, `build/sites-vite-plugin.ts` and `worker/index.ts` support the existing Sites/Cloudflare-compatible build surface.
- `vercel.json` selects `npm run build:next` for Vercel previews.
- The authoritative production deployment is the server process described in `docs/DEPLOYMENT.md`, sourced only from `origin/main`.

No hosting integration may silently promote a feature branch to the production domain.
