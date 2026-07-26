import { render, screen } from "@testing-library/react";
import {
  contentRecordSchemas,
  getFieldRegistry,
} from "@algae-atlas/content-schema";
import { expect, test } from "vitest";
import { SchemaForm } from "../components/SchemaForm";
import { createSharedRecordDraft } from "../schema-drafts";
import {
  BATCH_ONE_CONTENT_TYPES,
  batchOneFormAdapters,
} from "./batch-one";
import type { BatchOneContentType } from "./batch-one";
import { formFields } from "./form-engine";
import type { FormValues } from "./form-engine";

const validValues: Record<BatchOneContentType, FormValues> = {
  "research-output": {
    ...batchOneFormAdapters["research-output"].emptyValues(),
    summaryZh: "仅用于科研成果表单测试的虚构摘要。",
    citationNote: "虚构引用说明。",
    contributionNote: "虚构贡献说明。",
    description: "虚构成果简介。",
    outputKind: "publication",
    year: "2026",
    publicationDate: "2026-07-20",
    venueKind: "journal",
    venueName: "虚构期刊",
    identifierKind: "doi",
    identifierValue: "10.0000/fictional-output",
    canonicalUrl: "https://example.invalid/output",
    outputStatus: "published",
    contributorId: "fictional-contributor",
  },
  "research-project": {
    ...batchOneFormAdapters["research-project"].emptyValues(),
    summaryZh: "仅用于研究项目表单测试的虚构摘要。",
    objectives: "虚构项目目标。",
    methodsOverview: "虚构方法概述。",
    publicProgress: "虚构公开进展。",
    outcomes: "虚构项目成果。",
    projectKind: "funded",
    projectStatus: "active",
    publicProjectCode: "FICTIONAL-2026",
    leadAuthorId: "fictional-lead",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    publicScope: "summary-only",
    disclosureStatus: "pending",
  },
  "science-article": {
    ...batchOneFormAdapters["science-article"].emptyValues(),
    summaryZh: "仅用于科普文章表单测试的虚构摘要。",
    topic: "虚构藻类主题",
    targetAudienceLabel: "对藻类感兴趣的公众",
    categoryLabel: "基础知识",
    articleKind: "foundation",
    publicationDate: "2026-07-23",
    targetAudience: "general",
    readingTimeMinutes: "8",
  },
  collaboration: {
    ...batchOneFormAdapters.collaboration.emptyValues(),
    summaryZh: "仅用于合作表单测试的虚构摘要。",
    organizationName: "虚构合作单位",
    suitablePartners: "虚构适合合作对象。",
    possibleTopics: "虚构合作主题。",
    partnerPreparation: "虚构准备说明。",
    teamMayContribute: "虚构团队贡献。",
    caveat: "虚构合作边界。",
    processSummary: "虚构过程摘要。",
    outcomeSummary: "虚构成果摘要。",
    collaborationKind: "exchange",
    collaborationStatus: "open-for-discussion",
    startedAt: "2026-01-01",
    endedAt: "2026-12-31",
    publicAuthorization: "pending",
    collaborationBoundary: "public-summary",
    disclosureStatus: "pending",
  },
  "team-member": {
    ...batchOneFormAdapters["team-member"].emptyValues(),
    summaryZh: "仅用于团队成员表单测试的虚构摘要。",
    displayName: "虚构成员",
    englishName: "Fictional Member",
    roleTitle: "虚构研究人员",
    biography: "虚构成员简介。",
    authorId: "fictional-member",
    membershipStatus: "active",
    roleCategory: "researcher",
    displayOrder: "10",
    publicStartYear: "2024",
    publicEndYear: "2026",
    profileDisclosure: "pending",
    portraitConsent: "pending",
    publicContactEnabled: true,
  },
};

const expectedRecords: Record<BatchOneContentType, object> = {
  "research-output": {
    shared: {
      outputKind: "publication",
      year: 2026,
      identifier: { kind: "doi", value: "10.0000/fictional-output" },
      contributorIds: ["fictional-contributor"],
      outputStatus: "published",
    },
    locales: { zh: { fields: { citationNote: "虚构引用说明。" } } },
  },
  "research-project": {
    shared: {
      projectKind: "funded",
      leadAuthorId: "fictional-lead",
      startDate: "2026-01-01",
      publicScope: "summary-only",
    },
    locales: { zh: { fields: { objectives: "虚构项目目标。" } } },
  },
  "science-article": {
    shared: {
      articleKind: "foundation",
      publicationDate: "2026-07-23",
      readingTimeMinutes: 8,
    },
    locales: { zh: { fields: { topic: "虚构藻类主题" } } },
  },
  collaboration: {
    shared: {
      collaborationKind: "exchange",
      collaborationStatus: "open-for-discussion",
      collaborationBoundary: "public-summary",
    },
    locales: { zh: { fields: { organizationName: "虚构合作单位" } } },
  },
  "team-member": {
    shared: {
      authorId: "fictional-member",
      displayOrder: 10,
      publicContactEnabled: true,
    },
    locales: { zh: { fields: { displayName: "虚构成员" } } },
  },
};

function baseRecord(type: BatchOneContentType) {
  const prepared = createSharedRecordDraft(
    {
      contentType: type,
      stableId: `fictional-${type}`,
      titleZh: `虚构${type}标题`,
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  return prepared.recordDraft;
}

test.each(BATCH_ONE_CONTENT_TYPES)(
  "%s form serializes through its shared schema and round-trips",
  (type) => {
    const adapter = batchOneFormAdapters[type];
    const result = adapter.validate(baseRecord(type), validValues[type]);
    expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
    if (!result.success) {
      return;
    }

    expect(contentRecordSchemas[type].safeParse(result.recordDraft).success).toBe(true);
    expect(result.recordDraft).toMatchObject(expectedRecords[type]);
    expect(result.recordDraft).toMatchObject({
      type,
      locales: { zh: { summary: validValues[type].summaryZh } },
    });
    expect(adapter.inspect(result.recordDraft)).toEqual({
      values: validValues[type],
      errors: {},
    });
  },
);

test.each([
  ["research-output", "contributorId"],
  ["research-project", "leadAuthorId"],
  ["team-member", "authorId"],
] as const)("%s form permits an empty responsibility field", (type, field) => {
  const result = batchOneFormAdapters[type].validate(baseRecord(type), {
    ...validValues[type],
    [field]: "",
  });
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
});

const invalidCases: Array<{
  type: BatchOneContentType;
  changes: FormValues;
  field: string;
}> = [
  { type: "research-output", changes: { year: "1899" }, field: "year" },
  {
    type: "research-output",
    changes: { identifierValue: "not-a-doi" },
    field: "identifierValue",
  },
  {
    type: "research-project",
    changes: { startDate: "2026-07-24", endDate: "2026-07-23" },
    field: "endDate",
  },
  {
    type: "science-article",
    changes: { readingTimeMinutes: "181" },
    field: "readingTimeMinutes",
  },
  {
    type: "collaboration",
    changes: { startedAt: "2026-07-24", endedAt: "2026-07-23" },
    field: "endedAt",
  },
  {
    type: "team-member",
    changes: { publicStartYear: "2026", publicEndYear: "2025" },
    field: "publicEndYear",
  },
];

test.each(invalidCases)(
  "$type form maps invalid values to $field",
  ({ type, changes, field }) => {
    const result = batchOneFormAdapters[type].validate(baseRecord(type), {
      ...validValues[type],
      ...changes,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[field]).toBeTruthy();
    }
  },
);

test("allows incomplete batch-one values in draft mode but keeps format checks", () => {
  const adapter = batchOneFormAdapters["science-article"];
  const draftResult = adapter.validate(
    baseRecord("science-article"),
    adapter.emptyValues(),
    "draft",
  );

  expect(draftResult.success).toBe(true);
  if (draftResult.success) {
    expect(
      contentRecordSchemas["science-article"].safeParse(draftResult.recordDraft)
        .success,
    ).toBe(false);
    expect(adapter.inspect(draftResult.recordDraft).errors).toEqual({});
  }

  const invalidResult = adapter.validate(
    baseRecord("science-article"),
    { ...adapter.emptyValues(), readingTimeMinutes: "not-a-number" },
    "draft",
  );
  expect(invalidResult.success).toBe(false);
  if (!invalidResult.success) {
    expect(invalidResult.errors.readingTimeMinutes).toBeTruthy();
  }
});

test("takes every batch-one enum value from the shared field registry", () => {
  for (const type of BATCH_ONE_CONTENT_TYPES) {
    const registry = getFieldRegistry(type);
    const definitions = [...registry.shared, ...registry.localized];
    for (const field of formFields(batchOneFormAdapters[type].schema)) {
      if (field.control !== "enum") {
        continue;
      }
      expect(field.options?.map((option) => option.value)).toEqual(
        definitions.find((definition) => definition.key === field.id)?.options,
      );
    }
  }
});

const renderedFields: Array<{
  type: BatchOneContentType;
  heading: string;
  field: string;
}> = [
  { type: "research-output", heading: "科研成果字段", field: "主要贡献者稳定 ID" },
  { type: "research-project", heading: "研究项目字段", field: "项目类型" },
  { type: "science-article", heading: "科普文章字段", field: "阅读时长（分钟）" },
  { type: "collaboration", heading: "合作与交流字段", field: "合作状态" },
  { type: "team-member", heading: "团队成员字段", field: "资料公开确认" },
];

test.each(renderedFields)(
  "renders the $type component fields",
  ({ type, heading, field }) => {
    const adapter = batchOneFormAdapters[type];
    render(
      <SchemaForm
        schema={adapter.schema}
        values={adapter.emptyValues()}
        errors={{}}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByLabelText(new RegExp(field))).toBeVisible();
  },
);
