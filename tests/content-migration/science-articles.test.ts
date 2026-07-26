import assert from "node:assert/strict";
import test from "node:test";

import { parseRecord } from "@algae-atlas/content-schema";
import { articles, projects } from "../../lib/site-data";
import { buildScienceArticleCandidates } from "../../scripts/content-migration/science-articles";

const operationAt = "2026-07-22T21:00:00+08:00";

test("three public-insight articles become bilingual draft candidates", () => {
  const candidates = buildScienceArticleCandidates(operationAt);
  assert.deepEqual(
    candidates.map(({ record }) => record.id),
    [
      "what-are-algae",
      "why-water-turns-green",
      "photobioreactor-basics",
    ],
  );
  assert.equal(candidates.length, articles.length);
  assert.notEqual(candidates.length, projects.length + articles.length);

  for (const candidate of candidates) {
    assert.equal(candidate.record.type, "science-article");
    assert.equal(candidate.record.locales.zh.state, "draft");
    assert.equal(candidate.record.locales.en.state, "draft");
    assert.deepEqual(candidate.record.authors, []);
    assert.deepEqual(candidate.record.media, []);
    assert.equal("coverMediaId" in candidate.record.shared, false);
    assert.equal(parseRecord(candidate.record).success, true);
    assert.equal(candidate.markdown.zh.endsWith("\n"), true);
    assert.equal(candidate.markdown.en?.endsWith("\n"), true);
    assert.equal(candidate.source.sourcePath, "lib/site-data.ts");
    assert.equal(candidate.source.exportName, "articles");
  }
});

test("classification, text, route identity, and blockers are explicit", () => {
  const candidates = buildScienceArticleCandidates(operationAt);
  assert.deepEqual(
    candidates.map(({ record }) => {
      if (record.type !== "science-article") assert.fail("unexpected record type");
      return record.shared.articleKind;
    }),
    ["foundation", "observation-guide", "method-explainer"],
  );
  candidates.forEach((candidate, index) => {
    const source = articles[index];
    assert.equal(candidate.record.id, source.id);
    assert.equal(candidate.record.locales.zh.title, source.title.zh);
    if (candidate.record.locales.en.state === "missing") {
      assert.fail("English legacy text must remain a draft candidate");
    }
    assert.equal(candidate.record.locales.en.state, "draft");
    assert.equal(candidate.record.locales.en.title, source.title.en);
    assert.equal(candidate.record.locales.zh.summary, source.summary.zh);
    if (candidate.record.type !== "science-article") {
      assert.fail("unexpected record type");
    }
    assert.equal(candidate.record.shared.publicationDate, source.date);
    assert.ok(
      candidate.manualReview.some(
        ({ code }) => code === "AUTHOR_CONFIRMATION_REQUIRED",
      ),
    );
    assert.ok(
      candidate.manualReview.some(
        ({ code }) => code === "TRANSLATION_PROVENANCE_UNVERIFIED",
      ),
    );
    assert.ok(
      candidate.missingImageAttribution.some(
        ({ code }) => code === "IMAGE_USAGE_SCOPE_PENDING",
      ),
    );
  });
});
