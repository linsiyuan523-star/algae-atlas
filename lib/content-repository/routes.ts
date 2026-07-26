import type { ContentType, Locale } from "@algae-atlas/content-schema";

import type {
  ContentAvailability,
  PublicContentEntry,
  PublicContentRepository,
  PublicRecord,
} from "./types";

type RouteRegistration = {
  type: ContentType;
  section: string;
  allowedIds?: readonly string[];
};

const routeRegistrations = [
  { type: "team-news", section: "news" },
  { type: "research-output", section: "outputs" },
  { type: "research-project", section: "projects" },
  {
    type: "research-profile",
    section: "research",
    allowedIds: ["microalgae", "macroalgae", "live-feeds", "algal-blooms"],
  },
  { type: "live-feed-profile", section: "live-feeds" },
  { type: "learning-resource", section: "tutorials" },
  { type: "algae-profile", section: "algae" },
  { type: "coastal-observation", section: "observations" },
  { type: "science-article", section: "insights" },
  { type: "team-member", section: "team" },
  { type: "collaboration", section: "collaboration" },
] as const satisfies readonly RouteRegistration[];

export type WebsiteContentRoute = {
  type: ContentType;
  id: string;
  section: string;
  suffix: string;
  entry: PublicContentEntry;
  availability: ContentAvailability;
};

export type ContentRouteAlternates = {
  canonical: string;
  languages: Record<string, string>;
};

export type ContentSitemapRoute = {
  locale: Locale;
  path: string;
  alternates: Record<string, string>;
  source: PublicRecord["source"];
  updatedAt: string;
};

function registrationAllows(
  registration: RouteRegistration,
  id: string,
): boolean {
  return !registration.allowedIds || registration.allowedIds.includes(id);
}

function makeRoute(
  repository: PublicContentRepository,
  registration: RouteRegistration,
  entry: PublicContentEntry,
): WebsiteContentRoute | null {
  if (!registrationAllows(registration, entry.id)) return null;
  const availability = repository.availability(registration.type, entry.id);
  if (!availability) return null;
  return {
    type: registration.type,
    id: entry.id,
    section: registration.section,
    suffix: `/${registration.section}/${entry.id}`,
    entry,
    availability,
  };
}

export function listContentRoutes(
  repository: PublicContentRepository,
): readonly WebsiteContentRoute[] {
  return routeRegistrations.flatMap((registration) =>
    repository
      .entries(registration.type)
      .map((entry) => makeRoute(repository, registration, entry))
      .filter(
        (route): route is WebsiteContentRoute =>
          route !== null && (route.availability.zh || route.availability.en),
      ),
  );
}

export function findContentRoute(
  repository: PublicContentRepository,
  section: string | undefined,
  id: string | undefined,
): WebsiteContentRoute | null {
  if (!section || !id) return null;
  for (const registration of routeRegistrations) {
    if (registration.section !== section || !registrationAllows(registration, id)) {
      continue;
    }
    const entry = repository
      .entries(registration.type)
      .find((candidate) => candidate.id === id);
    if (entry) return makeRoute(repository, registration, entry);
  }
  return null;
}

export function getContentRouteRecord(
  repository: PublicContentRepository,
  section: string | undefined,
  id: string | undefined,
  locale: Locale,
): PublicRecord | null {
  const route = findContentRoute(repository, section, id);
  return route ? repository.get(route.type, route.id, locale) : null;
}

export function contentRouteStaticParams(
  repository: PublicContentRepository,
): Array<{ locale: Locale; slug: [string, string] }> {
  return listContentRoutes(repository).flatMap((route) =>
    (["zh", "en"] as const)
      .filter((locale) => route.availability[locale])
      .map((locale) => ({
        locale,
        slug: [route.section, route.id],
      })),
  );
}

export function contentRouteAlternates(
  route: WebsiteContentRoute,
  locale: Locale,
): ContentRouteAlternates | null {
  if (!route.availability[locale]) return null;
  const languages: Record<string, string> = {};
  if (route.availability.zh) languages["zh-CN"] = `/zh${route.suffix}`;
  if (route.availability.en) languages.en = `/en${route.suffix}`;
  if (route.availability.zh) languages["x-default"] = `/zh${route.suffix}`;
  return {
    canonical: `/${locale}${route.suffix}`,
    languages,
  };
}

export function contentLanguageSwitchHref(
  repository: PublicContentRepository,
  locale: Locale,
  section: string | undefined,
  id: string | undefined,
): string | null {
  const route = findContentRoute(repository, section, id);
  if (!route || !route.availability[locale]) return null;
  const targetLocale: Locale = locale === "zh" ? "en" : "zh";
  return route.availability[targetLocale]
    ? `/${targetLocale}${route.suffix}`
    : route.availability.fallbackSection[targetLocale];
}

export function contentSitemapRoutes(
  repository: PublicContentRepository,
): readonly ContentSitemapRoute[] {
  return listContentRoutes(repository).flatMap((route) =>
    (["zh", "en"] as const).flatMap((locale) => {
      if (!route.availability[locale]) return [];
      const record = repository.get(route.type, route.id, locale);
      if (!record) return [];
      const alternates = contentRouteAlternates(route, locale);
      if (!alternates) return [];
      return [
        {
          locale,
          path: `${locale}${route.suffix}`,
          alternates: alternates.languages,
          source: record.source,
          updatedAt: record.content.updatedAt,
        },
      ];
    }),
  );
}
