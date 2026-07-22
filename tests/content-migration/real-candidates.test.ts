import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectionSourceSelection } from "../../lib/content-repository/default-repository";
import { loadContentRepository } from "../../lib/content-repository/file-loader";
import { articles } from "../../lib/site-data";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

test("formal candidates preserve key legacy fields but remain non-public", async () => {
  const loaded = await loadContentRepository(repositoryRoot);
  assert.equal(loaded.records.length, 3);
  assert.deepEqual(
    loaded.records.map(({ id }) => id).sort(),
    articles.map(({ id }) => id).sort(),
  );
  for (const source of articles) {
    const record = loaded.records.find(({ id }) => id === source.id);
    assert.ok(record && record.type === "science-article");
    assert.equal(record.locales.zh.title, source.title.zh);
    assert.equal(
      record.locales.en.state === "missing"
        ? undefined
        : record.locales.en.title,
      source.title.en,
    );
    assert.equal(record.locales.zh.summary, source.summary.zh);
    assert.equal(record.shared.publicationDate, source.date);
    assert.equal(record.locales.zh.state, "draft");
    assert.equal(record.locales.en.state, "draft");
    assert.deepEqual(record.media, []);
  }
  assert.ok(
    Object.values(collectionSourceSelection).every(
      (source) => source === "legacy",
    ),
  );
});
