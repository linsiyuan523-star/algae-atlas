import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAuthor,
  parseMedia,
  parseRecord,
  publicationEligibility,
  validateRepository,
  type ResolvedReferences,
} from "../src/index";
import {
  fixtureAuthor,
  fixtureMedia,
  validMarkdownFixture,
  validRecordFixtures,
  validRepositorySnapshotFixture,
} from "../fixtures/index";

function parsedFixtureReferences(): {
  record: ReturnType<typeof parseRecord> & { success: true };
  refs: ResolvedReferences;
} {
  const record = parseRecord(validRecordFixtures["science-article"]);
  const author = parseAuthor(fixtureAuthor);
  assert.equal(record.success, true);
  assert.equal(author.success, true);
  if (!record.success || !author.success) {
    assert.fail("基础 fixture 应通过");
  }
  return {
    record,
    refs: {
      records: { [record.data.id]: record.data },
      authors: { [author.data.id]: author.data },
      media: {},
      markdown: {
        "science-article/fictional-science-article/zh.md":
          validMarkdownFixture,
      },
    },
  };
}

test("有效仓库快照无错误", () => {
  const issues = validateRepository(validRepositorySnapshotFixture);
  assert.deepEqual(issues, []);
});

test("中文可发布而英文 missing 不可发布且互不影响", () => {
  const { record, refs } = parsedFixtureReferences();
  const zh = publicationEligibility(record.data, "zh", refs);
  const en = publicationEligibility(record.data, "en", refs);
  assert.equal(zh.eligible, true, JSON.stringify(zh.issues, null, 2));
  assert.equal(en.eligible, false);
  assert.equal(en.issues[0]?.code, "LOCALE_MISSING");
});

test("团队动态仅使用中文署名时无需作者目录或来源即可发布", () => {
  const input = structuredClone(validRecordFixtures["team-news"]);
  input.authors = [];
  const shared = input.shared as Record<string, unknown>;
  shared.sources = [];
  shared.disclosureStatus = "pending";
  const locales = input.locales as Record<string, Record<string, unknown>>;
  const zh = locales.zh;
  const fields = zh.fields as Record<string, unknown>;
  fields.authorName = "林思远";
  const review = zh.review as Record<string, unknown>;
  review.reviewerIds = ["workbench-single-user"];

  const record = parseRecord(input);
  assert.equal(record.success, true, JSON.stringify(record.issues, null, 2));
  if (!record.success) {
    assert.fail("中文署名的团队动态应通过结构校验");
  }

  const eligibility = publicationEligibility(record.data, "zh", {
    records: { [record.data.id]: record.data },
    authors: {},
    media: {},
    markdown: {
      "team-news/fictional-team-news/zh.md": validMarkdownFixture,
    },
  });
  assert.equal(
    eligibility.eligible,
    true,
    JSON.stringify(eligibility.issues, null, 2),
  );
});

test("URL 声明冲突被定位", () => {
  const snapshot = structuredClone(validRepositorySnapshotFixture);
  snapshot.urlClaims = [
    {
      recordId: "first-fictional-record",
      locale: "zh",
      path: "/zh/insights/conflict",
    },
    {
      recordId: "second-fictional-record",
      locale: "zh",
      path: "/zh/insights/conflict/",
    },
  ];
  const issues = validateRepository(snapshot);
  assert.ok(issues.some((issue) => issue.code === "URL_CONFLICT"));
});

test("跨类型重复稳定 ID 被拒绝", () => {
  const article = structuredClone(validRecordFixtures["science-article"]);
  const news = structuredClone(validRecordFixtures["team-news"]);
  news.id = article.id;
  const issues = validateRepository({ records: [article, news] });
  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_STABLE_ID"));
});

test("内容引用类型不匹配被拒绝", () => {
  const output = structuredClone(validRecordFixtures["research-output"]);
  const outputShared = output.shared as Record<string, unknown>;
  outputShared.relatedProjectIds = ["fictional-science-article"];
  const issues = validateRepository({
    records: [output, validRecordFixtures["science-article"]],
    authors: [fixtureAuthor],
    markdown: {
      "research-output/fictional-research-output/zh.md": validMarkdownFixture,
      "science-article/fictional-science-article/zh.md": validMarkdownFixture,
    },
  });
  assert.ok(
    issues.some((issue) => issue.code === "CONTENT_REFERENCE_TYPE_MISMATCH"),
  );
});

test("英文 missing 时存在 en.md 被拒绝", () => {
  const snapshot = structuredClone(validRepositorySnapshotFixture);
  snapshot.markdown[
    "science-article/fictional-science-article/en.md"
  ] = "## Unexpected English";
  const issues = validateRepository(snapshot);
  assert.ok(issues.some((issue) => issue.code === "UNEXPECTED_ENGLISH_BODY"));
});

test("审核人和机器翻译人工复核人必须解析到公开作者", () => {
  const record = structuredClone(validRecordFixtures["science-article"]);
  const locales = record.locales as Record<string, Record<string, unknown>>;
  const zh = locales.zh;
  const review = zh.review as Record<string, unknown>;
  review.reviewerIds = ["missing-fictional-reviewer"];
  const snapshot = structuredClone(validRepositorySnapshotFixture);
  snapshot.records = [record];
  const issues = validateRepository(snapshot);
  assert.ok(
    issues.some((issue) => issue.code === "REVIEWER_REFERENCE_MISSING"),
  );
});

test("单用户直发操作人保留在审核字段但不要求成为文章作者", () => {
  const record = structuredClone(validRecordFixtures["science-article"]);
  const locales = record.locales as Record<string, Record<string, unknown>>;
  const review = locales.zh.review as Record<string, unknown>;
  review.reviewerIds = ["workbench-single-user"];
  const snapshot = structuredClone(validRepositorySnapshotFixture);
  snapshot.records = [record];
  const issues = validateRepository(snapshot);
  assert.equal(
    issues.some((issue) => issue.code === "REVIEWER_REFERENCE_MISSING"),
    false,
  );
});

test("单用户直发操作人不能替代公开文章作者", () => {
  const record = structuredClone(validRecordFixtures["science-article"]);
  record.authors = ["workbench-single-user"];
  const snapshot = structuredClone(validRepositorySnapshotFixture);
  snapshot.records = [record];
  const issues = validateRepository(snapshot);
  assert.equal(
    issues.some(
      (issue) =>
        issue.code === "AUTHOR_REFERENCE_MISSING" && issue.path === "authors",
    ),
    true,
  );
});

test("图片权利或人物授权未完成会阻止发布", () => {
  const recordInput = structuredClone(validRecordFixtures["science-article"]);
  recordInput.media = [fixtureMedia.id];
  const mediaInput = structuredClone(fixtureMedia) as Record<string, unknown>;
  mediaInput.rightsStatus = "pending";
  mediaInput.identifiablePeople = true;
  mediaInput.consentState = "pending";

  const record = parseRecord(recordInput);
  const author = parseAuthor(fixtureAuthor);
  const media = parseMedia(mediaInput);
  assert.equal(record.success, true);
  assert.equal(author.success, true);
  assert.equal(media.success, true);
  if (!record.success || !author.success || !media.success) {
    assert.fail("待授权图片应能保存为目录草稿，但不能发布");
  }

  const eligibility = publicationEligibility(record.data, "zh", {
    records: { [record.data.id]: record.data },
    authors: { [author.data.id]: author.data },
    media: { [media.data.id]: media.data },
    markdown: {
      "science-article/fictional-science-article/zh.md":
        validMarkdownFixture,
    },
  });
  assert.equal(eligibility.eligible, false);
  assert.ok(
    eligibility.issues.some((issue) => issue.code === "MEDIA_RIGHTS_NOT_PUBLIC"),
  );
  assert.ok(
    eligibility.issues.some((issue) => issue.code === "MEDIA_CONSENT_REQUIRED"),
  );
});
