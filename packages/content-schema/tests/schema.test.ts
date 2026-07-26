import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CONTENT_TYPES,
  contentTypeRegistry,
  createRecordDraftDefaults,
  getFieldRegistry,
  migrateRecord,
  parseAuthor,
  parseMedia,
  parseRecord,
  serializeRecord,
} from "../src/index";
import {
  FIXTURE_NOW,
  fixtureAuthor,
  fixtureMedia,
  invalidRecordFixtures,
  validRecordFixtures,
} from "../fixtures/index";

const expectedInvalidPath: Record<(typeof CONTENT_TYPES)[number], string> = {
  "team-news": "shared.eventDate",
  "research-output": "shared.identifier.value",
  "research-project": "shared.endDate",
  "learning-resource": "locales.zh.fields.safetyNotice",
  "algae-profile": "shared.scientificName",
  "live-feed-profile": "shared.cultureDisclosureBoundary",
  "coastal-observation": "shared.observationEndedAt",
  "science-article": "locales.zh.fields.topic",
  "team-member": "shared.publicEndYear",
  collaboration: "shared.endedAt",
  "research-profile": "id",
};

for (const type of CONTENT_TYPES) {
  test(`${type} 有效 fixture 通过`, () => {
    const result = parseRecord(validRecordFixtures[type]);
    assert.equal(result.success, true, JSON.stringify(result.issues, null, 2));
  });

  test(`${type} 无效 fixture 返回定位路径`, () => {
    const result = parseRecord(invalidRecordFixtures[type]);
    assert.equal(result.success, false);
    if (result.success) {
      assert.fail("无效 fixture 不应通过");
    }
    assert.ok(
      result.issues.some((issue) => issue.path === expectedInvalidPath[type]),
      JSON.stringify(result.issues, null, 2),
    );
    assert.ok(result.issues.every((issue) => /[\u3400-\u9fff]/u.test(issue.message)));
  });
}

test("中文发布且英文 missing 通过结构校验", () => {
  const result = parseRecord(validRecordFixtures["science-article"]);
  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail("fixture 应通过");
  }
  assert.equal(result.data.locales.zh.state, "published");
  assert.equal(result.data.locales.en.state, "missing");
});

test("团队动态允许中文署名并省略来源与公开确认", () => {
  const input = structuredClone(validRecordFixtures["team-news"]);
  input.authors = [];
  const shared = input.shared as Record<string, unknown>;
  shared.sources = [];
  delete shared.disclosureStatus;
  const locales = input.locales as Record<string, Record<string, unknown>>;
  const zh = locales.zh;
  const fields = zh.fields as Record<string, unknown>;
  fields.authorName = "林思远";

  const result = parseRecord(input);
  assert.equal(result.success, true, JSON.stringify(result.issues, null, 2));
  if (!result.success) {
    assert.fail("中文署名的团队动态应通过发布校验");
  }
  assert.equal(result.data.shared.disclosureStatus, "pending");
  assert.deepEqual(result.data.shared.sources, []);
  assert.deepEqual(result.data.authors, []);
  assert.equal(result.data.locales.zh.fields.authorName, "林思远");
});

for (const type of CONTENT_TYPES) {
  test(`${type} 发布时允许省略作者与治理审批`, () => {
    const input = structuredClone(validRecordFixtures[type]);
    input.authors = [];
    const shared = input.shared as Record<string, unknown>;

    switch (type) {
      case "team-news": {
        shared.sources = [];
        shared.disclosureStatus = "pending";
        const locales = input.locales as Record<string, Record<string, unknown>>;
        const fields = locales.zh.fields as Record<string, unknown>;
        delete fields.authorName;
        break;
      }
      case "research-output":
        shared.contributorIds = [];
        shared.verificationSources = [];
        break;
      case "research-project":
        delete shared.leadAuthorId;
        shared.publicScope = "internal";
        shared.disclosureStatus = "pending";
        break;
      case "learning-resource":
        shared.hazardLevel = "moderate";
        shared.laboratoryReviewStatus = "pending";
        break;
      case "algae-profile":
        shared.identificationStatus = "unverified";
        shared.taxonomySources = [];
        break;
      case "live-feed-profile":
        shared.cultureDisclosureBoundary = "internal-only";
        break;
      case "coastal-observation":
        delete shared.responsibleAuthorId;
        shared.disclosureStatus = "pending";
        shared.dataSources = [];
        break;
      case "team-member":
        delete shared.authorId;
        shared.profileDisclosure = "pending";
        shared.portraitConsent = "pending";
        break;
      case "collaboration":
        shared.publicAuthorization = "pending";
        shared.collaborationBoundary = "internal-only";
        shared.disclosureStatus = "pending";
        break;
      case "science-article":
      case "research-profile":
        break;
    }

    const result = parseRecord(input);
    assert.equal(result.success, true, JSON.stringify(result.issues, null, 2));
  });
}

test("英文标记 published 但字段和审核不完整时失败", () => {
  const input = structuredClone(validRecordFixtures["science-article"]);
  const locales = input.locales as Record<string, unknown>;
  locales.en = {
    state: "published",
    title: "Fictional English title",
    summary: "Fictional summary",
    fields: {
      topic: "Fictional topic",
      targetAudienceLabel: "General public",
      takeaways: [],
    },
    translationOrigin: "machine-assisted",
    review: {
      status: "draft",
      updatedAt: "2026-07-22",
      version: "0.1",
      reviewerIds: [],
      references: [],
    },
  };

  const result = parseRecord(input);
  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("不完整英文发布不应通过");
  }
  const paths = result.issues.map((issue) => issue.path);
  assert.ok(paths.includes("locales.en.bodyFile"));
  assert.ok(paths.includes("locales.en.publishedAt"));
  assert.ok(paths.includes("locales.en.review.status"));
  assert.ok(paths.includes("locales.en.humanVerifiedBy"));
});

test("未知字段、无效 ID 与错误时间顺序失败", () => {
  const input = structuredClone(validRecordFixtures["science-article"]);
  input.id = "Bad ID";
  input.updatedAt = "2025-01-01T00:00:00Z";
  input.unregistered = true;

  const result = parseRecord(input);
  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("无效输入不应通过");
  }
  assert.ok(result.issues.some((issue) => issue.path === "id"));
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "SCHEMA_UNKNOWN_FIELD" && issue.path === "unregistered",
    ),
  );
});

test("作者和图片模型使用受控授权状态", () => {
  assert.equal(parseAuthor(fixtureAuthor).success, true);
  assert.equal(parseMedia(fixtureMedia).success, true);

  const unsafePath = structuredClone(fixtureMedia) as Record<string, unknown>;
  unsafePath.filePath = "public/images/uploads/2026/07/../secret.jpg";
  const invalidPath = parseMedia(unsafePath);
  assert.equal(invalidPath.success, false);
  if (!invalidPath.success) {
    assert.ok(invalidPath.issues.some((issue) => issue.path === "filePath"));
  }

  const mismatch = structuredClone(fixtureMedia) as Record<string, unknown>;
  mismatch.mimeType = "image/png";
  const invalidMime = parseMedia(mismatch);
  assert.equal(invalidMime.success, false);
  if (!invalidMime.success) {
    assert.ok(
      invalidMime.issues.some(
        (issue) => issue.code === "MEDIA_MIME_EXTENSION_MISMATCH",
      ),
    );
  }
});

test("字段注册表覆盖基础字段和全部内容类型", () => {
  const commonKeys = new Set(
    getFieldRegistry("science-article").common.map((field) => field.key),
  );
  for (const key of [
    "id",
    "type",
    "status",
    "createdAt",
    "updatedAt",
    "publishedAt",
    "authors",
    "coverImage",
    "tags",
    "featured",
    "zh",
    "en",
    "review",
  ]) {
    assert.ok(commonKeys.has(key), `缺少基础字段 ${key}`);
  }
  assert.equal(
    getFieldRegistry("science-article").common.find(
      (field) => field.key === "authors",
    )?.requirement,
    "optional",
  );

  assert.deepEqual(Object.keys(contentTypeRegistry), [...CONTENT_TYPES]);
  for (const type of CONTENT_TYPES) {
    const definition = contentTypeRegistry[type];
    assert.ok(
      definition.sharedFields.length + definition.localizedFields.length > 0,
      `${type} 缺少专用字段`,
    );
    assert.doesNotThrow(() => JSON.stringify(definition));
  }

  const teamNewsFields = getFieldRegistry("team-news").shared;
  assert.deepEqual(
    teamNewsFields.find((field) => field.key === "category")?.options,
    [
      "research",
      "teaching",
      "fieldwork",
      "meeting",
      "student-research",
      "other",
    ],
  );
  assert.deepEqual(
    teamNewsFields.find((field) => field.key === "disclosureStatus")?.options,
    ["pending", "approved"],
  );
  assert.equal(
    teamNewsFields.find((field) => field.key === "sources")?.requirement,
    "optional",
  );
  assert.deepEqual(
    teamNewsFields.find((field) => field.key === "disclosureStatus"),
    {
      key: "disclosureStatus",
      path: "shared.disclosureStatus",
      label: { zh: "公开确认", en: "Disclosure status" },
      kind: "enum",
      requirement: "optional",
      options: ["pending", "approved"],
      defaultValue: "pending",
    },
  );
  assert.deepEqual(
    getFieldRegistry("team-news").localized.find(
      (field) => field.key === "authorName",
    ),
    {
      key: "authorName",
      path: "locales.{locale}.fields.authorName",
      label: { zh: "作者", en: "Author byline" },
      kind: "text",
      requirement: "optional",
      localized: true,
    },
  );
});

test("责任作者字段在所有相关内容类型中均为可选", () => {
  for (const [type, key] of [
    ["research-output", "contributorIds"],
    ["research-project", "leadAuthorId"],
    ["coastal-observation", "responsibleAuthorId"],
    ["team-member", "authorId"],
  ] as const) {
    const registered = [
      ...getFieldRegistry(type).shared,
      ...getFieldRegistry(type).localized,
    ].find((field) => field.key === key);
    assert.equal(registered?.requirement, "optional");
  }
});

test("草稿默认值区分中文草稿和英文缺失", () => {
  const draft = createRecordDraftDefaults(
    "science-article",
    "fictional-default-draft",
    FIXTURE_NOW,
  );
  const locales = draft.locales as Record<string, Record<string, unknown>>;
  assert.equal(locales.zh.state, "draft");
  assert.deepEqual(locales.en, { state: "missing" });
  assert.deepEqual(draft.authors, []);
  assert.deepEqual(draft.tags, []);
});

test("确定性序列化排序集合并保持 LF 和尾随换行", () => {
  const input = structuredClone(validRecordFixtures["science-article"]);
  input.tags = ["z-tag", "a-tag"];
  input.authors = ["z-author", "a-author"];
  const serialized = serializeRecord(input);
  assert.ok(serialized.endsWith("\n"));
  assert.equal(serialized.includes("\r"), false);
  const data = JSON.parse(serialized) as Record<string, unknown>;
  assert.deepEqual(data.tags, ["a-tag", "z-tag"]);
  assert.deepEqual(data.authors, ["a-author", "z-author"]);
  assert.equal(serializeRecord(data), serialized);
});

test("schema 1 到 1 的迁移为显式恒等迁移，未知版本失败", () => {
  const sameVersion = migrateRecord(
    validRecordFixtures["science-article"],
    1,
    1,
  );
  assert.equal(sameVersion.success, true);

  const unsupported = migrateRecord(
    validRecordFixtures["science-article"],
    1,
    2,
  );
  assert.equal(unsupported.success, false);
  if (!unsupported.success) {
    assert.equal(unsupported.issues[0]?.code, "SCHEMA_MIGRATION_UNSUPPORTED");
  }
});

test("仓库中的 JSON 示例 fixture 通过校验", async () => {
  const fixtureUrl = new URL(
    "../fixtures/example-science-article/record.json",
    import.meta.url,
  );
  const input = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
  const result = parseRecord(input);
  assert.equal(result.success, true, JSON.stringify(result.issues, null, 2));
});
