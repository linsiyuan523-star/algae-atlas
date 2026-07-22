import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { websiteContentRepository } from "../../lib/content-repository/default-repository";
import { createFileBackedContentRepository } from "../../lib/content-repository/file-repository";
import {
  createCollectionSourceSelection,
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
import type { CollectionSourceSelection } from "../../lib/content-repository/types";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/content-repository/", import.meta.url),
);

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
