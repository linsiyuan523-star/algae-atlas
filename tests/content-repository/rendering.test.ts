import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LegacyDetail } from "../../components/SitePages";
import { StructuredContentPage } from "../../components/StructuredContentPage";
import { websiteContentRepository } from "../../lib/content-repository/default-repository";
import { createFileBackedContentRepository } from "../../lib/content-repository/file-repository";
import { createCollectionSourceSelection } from "../../lib/content-repository/repository";
import type { CollectionSourceSelection } from "../../lib/content-repository/types";
import type { PublicRecord } from "../../lib/content-repository/types";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/content-repository/", import.meta.url),
);

test("a published Chinese-only record renders through the structured page", async () => {
  const selection = {
    ...createCollectionSourceSelection("legacy"),
    "science-article": "records",
  } as const satisfies CollectionSourceSelection;
  const repository = await createFileBackedContentRepository(
    fixtureRoot,
    selection,
  );
  const record = repository.get(
    "science-article",
    "fictional-zh-only-article",
    "zh",
  );

  assert.ok(record);
  assert.equal(record.source, "records");
  const html = renderToStaticMarkup(
    createElement(StructuredContentPage, { record }),
  );
  assert.ok(html.includes(record.content.title));
  assert.ok(html.includes(record.content.summary));
  assert.match(html, /<h2>/);
  assert.match(
    html,
    /href="https:\/\/example\.invalid\/fictional-source" target="_blank" rel="noopener noreferrer"/,
  );
  assert.ok(html.includes("Markdown"));
});

test("a legacy repository record still renders through its existing detail page", () => {
  const record = websiteContentRepository.get(
    "science-article",
    "what-are-algae",
    "en",
  );

  assert.ok(record);
  assert.equal(record.source, "legacy");
  assert.ok(record.legacyData);
  const entry = record.legacyData as ComponentProps<typeof LegacyDetail>["entry"];
  const html = renderToStaticMarkup(
    createElement(LegacyDetail, { locale: "en", entry }),
  );
  assert.ok(html.includes(record.content.title));
  assert.ok(html.includes(record.content.summary));
  assert.ok(html.includes("Scope note"));
});

test("team news renders its localized free-text author name", async () => {
  const selection = {
    ...createCollectionSourceSelection("legacy"),
    "science-article": "records",
  } as const satisfies CollectionSourceSelection;
  const repository = await createFileBackedContentRepository(
    fixtureRoot,
    selection,
  );
  const source = repository.get(
    "science-article",
    "fictional-zh-only-article",
    "zh",
  );

  assert.ok(source);
  const record: PublicRecord = {
    ...source,
    type: "team-news",
    record: undefined,
    content: {
      ...source.content,
      fields: { ...source.content.fields, authorName: "张海宁" },
    },
  };
  const html = renderToStaticMarkup(
    createElement(StructuredContentPage, { record }),
  );

  assert.ok(html.includes("作者: 张海宁"));
});
