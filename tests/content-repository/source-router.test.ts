import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONTENT_TYPES,
  type ContentType,
} from "@algae-atlas/content-schema";

import { websiteContentRepository } from "../../lib/content-repository/default-repository";
import { createFileBackedContentRepository } from "../../lib/content-repository/file-repository";
import {
  createCollectionSourceSelection,
  createPublicContentRepository,
} from "../../lib/content-repository/repository";
import {
  contentLanguageSwitchHref,
  contentRouteAlternates,
  contentRouteStaticParams,
  contentSitemapRoutes,
  findContentRoute,
  getContentRouteRecord,
  listContentRoutes,
} from "../../lib/content-repository/routes";
import type {
  CollectionSourceSelection,
  PublicContentEntry,
  PublicContentRepository,
  PublicLocaleContent,
  PublicContentSource,
} from "../../lib/content-repository/types";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/content-repository/", import.meta.url),
);

const directPublishSections = {
  "team-news": "news",
  "research-output": "outputs",
  "research-project": "projects",
  "learning-resource": "tutorials",
  "algae-profile": "algae",
  "live-feed-profile": "live-feeds",
  "coastal-observation": "observations",
  "science-article": "insights",
  "team-member": "team",
  collaboration: "collaboration",
  "research-profile": "research",
} as const satisfies Record<ContentType, string>;

function directPublishRepository(): PublicContentRepository {
  const entries = Object.fromEntries(
    CONTENT_TYPES.map((type) => {
      const id = type === "research-profile" ? "live-feeds" : `fictional-${type}`;
      const entry: PublicContentEntry = {
        id,
        type,
        source: "records",
        tags: [],
        shared: {},
        locales: {
          zh: {
            locale: "zh",
            title: `Fictional ${type}`,
            summary: `Fictional ${type} summary`,
            fields: {},
            updatedAt: "2026-07-26T09:00:00+08:00",
          },
        },
        media: {},
      };
      return [type, [entry]];
    }),
  ) as Record<ContentType, PublicContentEntry[]>;

  return {
    entries(type) {
      return entries[type];
    },
    list(type, locale) {
      return entries[type].flatMap((entry) => {
        const content = entry.locales[locale];
        return content ? [{ ...entry, locale, content }] : [];
      });
    },
    get(type, id, locale) {
      const entry = entries[type].find((candidate) => candidate.id === id);
      const content = entry?.locales[locale];
      return entry && content ? { ...entry, locale, content } : null;
    },
    availability(type, id) {
      const entry = entries[type].find((candidate) => candidate.id === id);
      return entry
        ? {
            zh: Boolean(entry.locales.zh),
            en: Boolean(entry.locales.en),
            fallbackSection: {
              zh: `/zh/${directPublishSections[type]}`,
              en: `/en/${directPublishSections[type]}`,
            },
          }
        : null;
    },
    sourceKind() {
      return "records";
    },
  };
}

function source(
  kind: PublicContentSource["kind"],
  entries: readonly PublicContentEntry[],
): PublicContentSource {
  return {
    kind,
    entries(type) {
      return entries.filter((entry) => entry.type === type);
    },
  };
}

function localeContent(
  locale: PublicLocaleContent["locale"],
  title: string,
): PublicLocaleContent {
  return {
    locale,
    title,
    summary: title,
    fields: {},
    updatedAt: "2026-07-27",
  };
}

function overlayRepository(): PublicContentRepository {
  const legacyShared: Omit<PublicContentEntry, "id" | "source" | "locales"> = {
    type: "science-article",
    tags: [],
    shared: {},
    media: {},
  };
  const legacy = source("legacy", [
    {
      ...legacyShared,
      id: "legacy-draft",
      source: "legacy",
      locales: {
        zh: localeContent("zh", "Legacy draft zh"),
        en: localeContent("en", "Legacy draft en"),
      },
    },
    {
      ...legacyShared,
      id: "record-owned",
      source: "legacy",
      locales: {
        zh: localeContent("zh", "Old zh"),
        en: localeContent("en", "Old en"),
      },
    },
  ]);
  const records = source("records", [
    { ...legacyShared, id: "legacy-draft", source: "records", locales: {} },
    {
      ...legacyShared,
      id: "record-owned",
      source: "records",
      locales: {
        zh: localeContent("zh", "New zh"),
      },
    },
    { ...legacyShared, id: "record-draft", source: "records", locales: {} },
    {
      ...legacyShared,
      id: "direct-record",
      source: "records",
      locales: {
        zh: localeContent("zh", "Direct"),
      },
    },
  ]);

  return createPublicContentRepository({
    mode: "overlay",
    selection: createCollectionSourceSelection("records"),
    legacySource: legacy,
    recordSource: records,
  });
}

test("overlay keeps legacy for draft records and gives a public record the whole ID", () => {
  const repository = overlayRepository();

  assert.deepEqual(
    repository.entries("science-article").map((entry) => [entry.id, entry.source]),
    [
      ["legacy-draft", "legacy"],
      ["record-owned", "records"],
      ["direct-record", "records"],
    ],
  );
  assert.equal(repository.sourceKind("science-article"), "overlay");
  assert.equal(
    repository.get("science-article", "legacy-draft", "en")?.content.title,
    "Legacy draft en",
  );
  assert.equal(
    repository.get("science-article", "record-owned", "zh")?.content.title,
    "New zh",
  );
  assert.equal(repository.get("science-article", "record-owned", "en"), null);
  assert.deepEqual(repository.availability("science-article", "record-owned"), {
    zh: true,
    en: false,
    fallbackSection: { zh: "/zh/insights", en: "/en/insights" },
  });
});

test("overlay exposes a direct record through lookup and route surfaces", () => {
  const repository = overlayRepository();
  const route = findContentRoute(repository, "insights", "direct-record");

  assert.ok(route);
  assert.equal(
    repository.get("science-article", "direct-record", "zh")?.source,
    "records",
  );
  assert.equal(
    getContentRouteRecord(repository, "insights", "direct-record", "zh")?.source,
    "records",
  );
  assert.ok(
    contentRouteStaticParams(repository).some(
      ({ locale, slug }) =>
        locale === "zh" && slug.join("/") === "insights/direct-record",
    ),
  );
  assert.ok(
    !contentRouteStaticParams(repository).some(
      ({ locale, slug }) =>
        locale === "en" && slug.join("/") === "insights/direct-record",
    ),
  );
  assert.deepEqual(
    contentSitemapRoutes(repository)
      .filter(({ path }) => path.endsWith("/direct-record"))
      .map(({ locale }) => locale),
    ["zh"],
  );
});

test("默认网站 repository 明确让全部真实集合继续使用 legacy", () => {
  const routes = listContentRoutes(websiteContentRepository);
  assert.equal(routes.length, 24);
  assert.ok(routes.every((route) => route.entry.source === "legacy"));
  assert.ok(
    routes.every((route) => route.availability.zh && route.availability.en),
  );
  assert.equal(
    websiteContentRepository.sourceKind("science-article"),
    "legacy",
  );

  const liveFeed = getContentRouteRecord(
    websiteContentRepository,
    "live-feeds",
    "rotifers",
    "en",
  );
  assert.equal(liveFeed?.content.seoTitle, "Rotifers | Live Feeds & Zooplankton");
  assert.equal(
    contentLanguageSwitchHref(
      websiteContentRepository,
      "zh",
      "algae",
      "chlorella-vulgaris",
    ),
    "/en/algae/chlorella-vulgaris",
  );
});

test("整类切换到 records 后不会按 ID 静默混回 legacy", async () => {
  const selection = {
    ...createCollectionSourceSelection("legacy"),
    "science-article": "records",
  } as const satisfies CollectionSourceSelection;
  const repository = await createFileBackedContentRepository(
    fixtureRoot,
    selection,
  );

  assert.deepEqual(
    repository.entries("science-article").map((entry) => entry.id),
    ["fictional-bilingual-article", "fictional-zh-only-article"],
  );
  assert.equal(
    repository.get("science-article", "what-are-algae", "zh"),
    null,
  );
  assert.equal(repository.sourceKind("science-article"), "records");
  assert.equal(repository.sourceKind("algae-profile"), "legacy");
});

test("仅中文记录统一控制静态参数、alternate、sitemap 与语言回退", async () => {
  const selection = {
    ...createCollectionSourceSelection("legacy"),
    "science-article": "records",
  } as const satisfies CollectionSourceSelection;
  const repository = await createFileBackedContentRepository(
    fixtureRoot,
    selection,
  );
  const route = findContentRoute(
    repository,
    "insights",
    "fictional-zh-only-article",
  );
  assert.ok(route);
  assert.deepEqual(route.availability, {
    zh: true,
    en: false,
    fallbackSection: { zh: "/zh/insights", en: "/en/insights" },
  });
  assert.equal(
    getContentRouteRecord(
      repository,
      "insights",
      "fictional-zh-only-article",
      "en",
    ),
    null,
  );
  assert.equal(
    contentLanguageSwitchHref(
      repository,
      "zh",
      "insights",
      "fictional-zh-only-article",
    ),
    "/en/insights",
  );
  assert.deepEqual(contentRouteAlternates(route, "zh"), {
    canonical: "/zh/insights/fictional-zh-only-article",
    languages: {
      "zh-CN": "/zh/insights/fictional-zh-only-article",
      "x-default": "/zh/insights/fictional-zh-only-article",
    },
  });

  const params = contentRouteStaticParams(repository);
  assert.ok(
    params.some(
      (item) =>
        item.locale === "zh" &&
        item.slug.join("/") === "insights/fictional-zh-only-article",
    ),
  );
  assert.ok(
    !params.some(
      (item) =>
        item.locale === "en" &&
        item.slug.join("/") === "insights/fictional-zh-only-article",
    ),
  );

  const sitemap = contentSitemapRoutes(repository);
  const zhOnlyRoutes = sitemap.filter((item) =>
    item.path.endsWith("fictional-zh-only-article"),
  );
  assert.deepEqual(zhOnlyRoutes.map((item) => item.locale), ["zh"]);
  assert.equal("en" in zhOnlyRoutes[0].alternates, false);
});

test("all schema-backed direct publishing types resolve to website detail routes", () => {
  const repository = directPublishRepository();
  const routes = listContentRoutes(repository);

  assert.equal(routes.length, CONTENT_TYPES.length);
  for (const type of CONTENT_TYPES) {
    const id = type === "research-profile" ? "live-feeds" : `fictional-${type}`;
    const section = directPublishSections[type];
    const route = findContentRoute(repository, section, id);

    assert.ok(route, `${type} should resolve at /${section}/${id}`);
    assert.equal(route.type, type);
    assert.equal(route.suffix, `/${section}/${id}`);
    assert.ok(getContentRouteRecord(repository, section, id, "zh"));
  }

  const staticPaths = contentRouteStaticParams(repository)
    .map(({ locale, slug }) => `${locale}/${slug.join("/")}`)
    .sort();
  assert.deepEqual(
    staticPaths,
    CONTENT_TYPES.map((type) => {
      const id = type === "research-profile" ? "live-feeds" : `fictional-${type}`;
      return `zh/${directPublishSections[type]}/${id}`;
    }).sort(),
  );
});
