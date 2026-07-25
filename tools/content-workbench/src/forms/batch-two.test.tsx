import { render, screen } from "@testing-library/react";
import {
  CONTENT_TYPES,
  contentRecordSchemas,
  getFieldRegistry,
} from "@algae-atlas/content-schema";
import type { ContentType } from "@algae-atlas/content-schema";
import { expect, test } from "vitest";
import { SchemaForm } from "../components/SchemaForm";
import { createSharedRecordDraft } from "../schema-drafts";
import {
  BATCH_TWO_CONTENT_TYPES,
  batchTwoFormAdapters,
} from "./batch-two";
import type { BatchTwoContentType } from "./batch-two";
import { getContentFormAdapter } from "./content-forms";
import { formFields, FORM_ERROR_KEY } from "./form-engine";
import type { FormValues } from "./form-engine";

const validValues: Record<BatchTwoContentType, FormValues> = {
  "learning-resource": {
    ...batchTwoFormAdapters["learning-resource"].emptyValues(),
    summaryZh: "仅用于实验学习资源表单测试的虚构摘要。",
    instrumentOrTopic: "虚构显微观察主题",
    audience: "虚构学生读者",
    purpose: "验证学习资源表单结构。",
    prerequisites: "已完成虚构基础培训。",
    applicableExperiments: "仅用于虚构教学实验。",
    preCheck: "虚构检查一\n虚构检查二",
    materials: "虚构材料一\n虚构材料二",
    steps: "虚构步骤一\n虚构步骤二",
    commonParameters: "虚构参数说明",
    dataExport: "虚构数据导出说明。",
    cleaningAndShutdown: "虚构清洁说明。",
    commonErrors: "虚构异常说明",
    safetyNotice: "不包含真实危险操作参数。",
    administration: "虚构管理说明。",
    disclaimer: "不替代仪器手册、安全培训、监督或批准的 SOP。",
    resourceKind: "beginner-guide",
    targetAudience: "students",
    hazardLevel: "none",
    laboratoryReviewStatus: "pending",
    version: "1.0",
  },
  "algae-profile": {
    ...batchTwoFormAdapters["algae-profile"].emptyValues(),
    summaryZh: "仅用于藻类图鉴表单测试的虚构摘要。",
    commonName: "虚构石莼",
    categoryLabel: "大型海藻",
    habitat: "虚构海洋生境。",
    morphology: "虚构形态说明。",
    researchFocus: "虚构研究重点。",
    identificationLimitations: "仅用于结构测试，不代表真实鉴定。",
    observationGuidance: "虚构观察建议。",
    referencesNote: "虚构参考说明。",
    samplingLocationLabelZh: "虚构海湾",
    scientificName: "Ulva lactuca",
    taxonomicRank: "species",
    environmentKinds: "marine",
    profileCategory: "macroalgae",
    identificationStatus: "provisional",
    samplingLocationPolicy: "generalized",
  },
  "live-feed-profile": {
    ...batchTwoFormAdapters["live-feed-profile"].emptyValues(),
    summaryZh: "仅用于生物饵料表单测试的虚构摘要。",
    name: "虚构轮虫类群",
    overview: "虚构概述。",
    environment: "虚构水环境。",
    morphology: "虚构形态。",
    lifeHistory: "虚构生活史。",
    ecologicalRole: "虚构生态作用。",
    feedingTraits: "虚构摄食特征。",
    researchFocus: "虚构研究重点。",
    cultureFactors: "不包含真实培养参数。",
    applications: "虚构应用说明。",
    limitations: "不构成培养方案。",
    scientificGroup: "Rotifera",
    taxonomicLevel: "phylum",
    category: "rotifer",
    environmentKinds: "marine",
    cultureDisclosureBoundary: "public-overview",
    identificationConfidence: "high",
  },
  "coastal-observation": {
    ...batchTwoFormAdapters["coastal-observation"].emptyValues(),
    summaryZh: "仅用于近岸观测表单测试的虚构摘要。",
    observedPhenomena: "虚构现场现象。",
    environmentalContext: "虚构环境背景。",
    evidenceLimits: "无真实样品或结论。",
    interpretation: "虚构解释。",
    followUp: "虚构后续行动。",
    officialInformationDisclaimer: "不是官方赤潮预警、食品安全结论或公共卫生建议。",
    generalizedLocationLabelZh: "虚构近岸区域",
    observationStartedAt: "2026-07-23T08:00:00+08:00",
    observationEndedAt: "2026-07-23T09:00:00+08:00",
    observationType: "field-observation",
    evidenceType: "visual",
    observationStatus: "preliminary",
    sampleStatus: "none",
    locationPolicy: "generalized",
    responsibleAuthorId: "fictional-observer",
    disclosureStatus: "pending",
  },
  "research-profile": {
    ...batchTwoFormAdapters["research-profile"].emptyValues(),
    summaryZh: "仅用于研究方向表单测试的虚构摘要。",
    researchObjects: "虚构微藻对象\n虚构环境样品",
    typicalQuestions: "虚构典型问题",
    methodsAndMeasurements: "虚构测量方法",
    resourcesAndConditions: "虚构资源条件。",
    scopeCaveat: "不代表实际设备、藻种、能力、合作方或成果保证。",
    routeKey: "microalgae",
    contentStatus: "under-review",
  },
};

const expectedRecords: Record<BatchTwoContentType, object> = {
  "learning-resource": {
    shared: {
      resourceKind: "beginner-guide",
      targetAudience: "students",
      version: "1.0",
    },
    locales: {
      zh: {
        fields: {
          instrumentOrTopic: "虚构显微观察主题",
          preCheck: ["虚构检查一", "虚构检查二"],
        },
      },
    },
  },
  "algae-profile": {
    shared: {
      scientificName: "Ulva lactuca",
      environmentKinds: ["marine"],
      samplingLocationLabel: { zh: "虚构海湾" },
    },
    locales: { zh: { fields: { commonName: "虚构石莼" } } },
  },
  "live-feed-profile": {
    shared: {
      scientificGroup: "Rotifera",
      category: "rotifer",
      environmentKinds: ["marine"],
    },
    locales: { zh: { fields: { name: "虚构轮虫类群" } } },
  },
  "coastal-observation": {
    shared: {
      observationStartedAt: "2026-07-23T08:00:00+08:00",
      generalizedLocationLabel: { zh: "虚构近岸区域" },
      responsibleAuthorId: "fictional-observer",
    },
    locales: { zh: { fields: { observedPhenomena: "虚构现场现象。" } } },
  },
  "research-profile": {
    shared: {
      routeKey: "microalgae",
      routeRegistered: true,
    },
    locales: {
      zh: {
        fields: {
          researchObjects: ["虚构微藻对象", "虚构环境样品"],
        },
      },
    },
  },
};

function baseRecord(type: ContentType) {
  const prepared = createSharedRecordDraft(
    {
      contentType: type,
      stableId: type === "research-profile" ? "microalgae" : `fictional-${type}`,
      titleZh: `虚构${type}标题`,
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  return prepared.recordDraft;
}

test.each(BATCH_TWO_CONTENT_TYPES)(
  "%s form serializes through its shared schema and round-trips",
  (type) => {
    const adapter = batchTwoFormAdapters[type];
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

const invalidCases: Array<{
  type: BatchTwoContentType;
  changes: FormValues;
  field: string;
}> = [
  { type: "learning-resource", changes: { version: "1" }, field: "version" },
  { type: "algae-profile", changes: { scientificName: "not latin" }, field: "scientificName" },
  { type: "live-feed-profile", changes: { environmentKinds: "" }, field: "environmentKinds" },
  {
    type: "coastal-observation",
    changes: { observationStartedAt: "2026-07-23T08:00:00" },
    field: "observationStartedAt",
  },
  {
    type: "coastal-observation",
    changes: {
      observationStartedAt: "2026-07-23T09:00:00+08:00",
      observationEndedAt: "2026-07-23T08:00:00+08:00",
    },
    field: "observationEndedAt",
  },
  {
    type: "coastal-observation",
    changes: { locationPolicy: "generalized", generalizedLocationLabelZh: "" },
    field: "generalizedLocationLabelZh",
  },
  { type: "research-profile", changes: { researchObjects: "" }, field: "researchObjects" },
];

test.each(invalidCases)(
  "$type form maps invalid values to $field",
  ({ type, changes, field }) => {
    const result = batchTwoFormAdapters[type].validate(baseRecord(type), {
      ...validValues[type],
      ...changes,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[field]).toBeTruthy();
    }
  },
);

test("allows incomplete batch-two values in draft mode but keeps format checks", () => {
  const adapter = batchTwoFormAdapters["coastal-observation"];
  const draftResult = adapter.validate(
    baseRecord("coastal-observation"),
    adapter.emptyValues(),
    "draft",
  );

  expect(draftResult.success).toBe(true);
  if (draftResult.success) {
    expect(
      contentRecordSchemas["coastal-observation"].safeParse(draftResult.recordDraft)
        .success,
    ).toBe(false);
    expect(adapter.inspect(draftResult.recordDraft).errors).toEqual({});
  }

  const invalidResult = adapter.validate(
    baseRecord("coastal-observation"),
    {
      ...adapter.emptyValues(),
      observationStartedAt: "not-a-timestamp",
    },
    "draft",
  );
  expect(invalidResult.success).toBe(false);
  if (!invalidResult.success) {
    expect(invalidResult.errors.observationStartedAt).toBeTruthy();
  }
});

test("takes every batch-two enum value from the shared field registry", () => {
  for (const type of BATCH_TWO_CONTENT_TYPES) {
    const registry = getFieldRegistry(type);
    const definitions = [...registry.shared, ...registry.localized];
    for (const field of formFields(batchTwoFormAdapters[type].schema)) {
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
  type: BatchTwoContentType;
  heading: string;
  field: string;
}> = [
  { type: "learning-resource", heading: "实验学习资源字段", field: "资源版本" },
  { type: "algae-profile", heading: "藻类图鉴字段", field: "主要环境类型" },
  { type: "live-feed-profile", heading: "生物饵料字段", field: "培养说明公开边界" },
  { type: "coastal-observation", heading: "赤潮与近岸观测字段", field: "观测日期" },
  { type: "research-profile", heading: "研究方向与能力说明字段", field: "固定路由键" },
];

test.each(renderedFields)(
  "renders the $type component fields",
  ({ type, heading, field }) => {
    const adapter = batchTwoFormAdapters[type];
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

function completeValues(type: ContentType, overrides: FormValues) {
  const adapter = getContentFormAdapter(type);
  if (!adapter) {
    throw new Error(`missing form adapter for ${type}`);
  }
  return { ...adapter.emptyValues(), ...overrides };
}

const allRegisteredValues: Record<ContentType, FormValues> = {
  "team-news": completeValues("team-news", {
    summaryZh: "虚构团队动态摘要。",
    eventDate: "2026-07-23",
    category: "research",
    disclosureStatus: "pending",
  }),
  "research-output": completeValues("research-output", {
    summaryZh: "虚构科研成果摘要。",
    citationNote: "虚构引用说明。",
    outputKind: "publication",
    year: "2026",
    venueKind: "journal",
    venueName: "虚构期刊",
    identifierKind: "doi",
    identifierValue: "10.0000/fictional-output",
    outputStatus: "published",
    contributorId: "fictional-contributor",
  }),
  "research-project": completeValues("research-project", {
    summaryZh: "虚构研究项目摘要。",
    objectives: "虚构研究目标。",
    projectKind: "funded",
    projectStatus: "active",
    leadAuthorId: "fictional-lead",
    startDate: "2026-01-01",
    publicScope: "summary-only",
    disclosureStatus: "pending",
  }),
  "learning-resource": validValues["learning-resource"],
  "algae-profile": validValues["algae-profile"],
  "live-feed-profile": validValues["live-feed-profile"],
  "coastal-observation": validValues["coastal-observation"],
  "science-article": completeValues("science-article", {
    summaryZh: "虚构科普文章摘要。",
    topic: "虚构科普主题",
    targetAudienceLabel: "公众",
    articleKind: "foundation",
    publicationDate: "2026-07-23",
    targetAudience: "general",
  }),
  "team-member": completeValues("team-member", {
    summaryZh: "虚构成员摘要。",
    displayName: "虚构成员",
    roleTitle: "虚构角色",
    biography: "虚构成员简介。",
    authorId: "fictional-member",
    membershipStatus: "active",
    roleCategory: "researcher",
  }),
  collaboration: completeValues("collaboration", {
    summaryZh: "虚构合作摘要。",
    suitablePartners: "虚构合作对象。",
    possibleTopics: "虚构合作主题。",
    teamMayContribute: "虚构团队贡献。",
    caveat: "虚构合作边界。",
    collaborationKind: "area",
    collaborationStatus: "open-for-discussion",
    publicAuthorization: "pending",
    collaborationBoundary: "public-summary",
    disclosureStatus: "pending",
  }),
  "research-profile": validValues["research-profile"],
};

test.each(CONTENT_TYPES)("%s has an adapter that creates a valid draft", (type) => {
  const adapter = getContentFormAdapter(type);
  expect(adapter).not.toBeNull();
  if (!adapter) {
    return;
  }

  const result = adapter.validate(baseRecord(type), allRegisteredValues[type]);
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  if (result.success) {
    expect(contentRecordSchemas[type].safeParse(result.recordDraft).success).toBe(true);
  }
});

test("rejects form values that are not declared by the active schema", () => {
  const adapter = batchTwoFormAdapters["learning-resource"];
  const result = adapter.validate(baseRecord("learning-resource"), {
    ...validValues["learning-resource"],
    unsupportedFutureField: "must not be silently discarded",
  });

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.errors[FORM_ERROR_KEY]).toBe(
      "当前表单不支持字段：unsupportedFutureField。",
    );
  }
});
