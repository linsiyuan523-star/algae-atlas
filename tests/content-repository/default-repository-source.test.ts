import assert from "node:assert/strict";
import test from "node:test";

import { createLegacyContentSource } from "../../lib/content-repository/legacy-source";
import type { PublicContentRepository } from "../../lib/content-repository/types";

type DefaultRepositoryModule = {
  websiteContentRepository: PublicContentRepository;
};

const defaultRepositoryUrl = new URL(
  "../../lib/content-repository/default-repository.ts",
  import.meta.url,
);

async function importDefaultRepository(cacheKey: string) {
  const url = new URL(defaultRepositoryUrl);
  url.search = `test=${cacheKey}`;
  return import(url.href) as Promise<DefaultRepositoryModule>;
}

function withRepositorySource<T>(
  source: string | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = process.env.CONTENT_REPOSITORY_SOURCE;
  if (source === undefined) delete process.env.CONTENT_REPOSITORY_SOURCE;
  else process.env.CONTENT_REPOSITORY_SOURCE = source;
  return callback().finally(() => {
    if (previous === undefined) delete process.env.CONTENT_REPOSITORY_SOURCE;
    else process.env.CONTENT_REPOSITORY_SOURCE = previous;
  });
}

test("unset CONTENT_REPOSITORY_SOURCE uses legacy", async () => {
  await withRepositorySource(undefined, async () => {
    const { websiteContentRepository } = await importDefaultRepository("legacy");
    assert.equal(websiteContentRepository.sourceKind("science-article"), "legacy");
    assert.equal(
      websiteContentRepository.get("science-article", "what-are-algae", "en")?.source,
      "legacy",
    );
  });
});

test("CONTENT_REPOSITORY_SOURCE=records uses content/records", async () => {
  await withRepositorySource("records", async () => {
    const { websiteContentRepository } = await importDefaultRepository("records");
    assert.equal(websiteContentRepository.sourceKind("science-article"), "records");
    assert.deepEqual(
      websiteContentRepository.entries("science-article").map((entry) => entry.id),
      ["photobioreactor-basics", "what-are-algae", "why-water-turns-green"],
    );
    assert.equal(
      websiteContentRepository.get("science-article", "what-are-algae", "en"),
      null,
    );
  });
});

test("CONTENT_REPOSITORY_SOURCE=overlay preserves legacy entries for draft migrations", async () => {
  await withRepositorySource("overlay", async () => {
    const { websiteContentRepository } = await importDefaultRepository("overlay");
    assert.equal(websiteContentRepository.sourceKind("science-article"), "overlay");
    assert.equal(
      websiteContentRepository.get("science-article", "what-are-algae", "en")?.source,
      "legacy",
    );
    const entries = websiteContentRepository.entries("science-article");
    assert.deepEqual(
      entries.map((entry) => entry.id),
      createLegacyContentSource().entries("science-article").map((entry) => entry.id),
    );
    assert.ok(entries.every((entry) => entry.source === "legacy"));
  });
});

test("a non-empty invalid CONTENT_REPOSITORY_SOURCE is rejected", async () => {
  await withRepositorySource("unexpected", async () => {
    await assert.rejects(
      importDefaultRepository("invalid"),
      /Invalid CONTENT_REPOSITORY_SOURCE value "unexpected"/,
    );
  });
});
