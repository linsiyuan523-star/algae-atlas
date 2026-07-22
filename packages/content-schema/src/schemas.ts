import { z } from "zod";

import { CONTENT_SCHEMA_VERSION } from "./constants";
import {
  httpsUrlSchema,
  isoDateSchema,
  isoTimestampSchema,
  localizedTextSchema,
  makePresentLocaleSchema,
  missingLocaleSchema,
  sourceSchema,
  stableIdSchema,
} from "./models";

const requiredText = z.string().trim().min(1, "字段不能为空");
const optionalText = requiredText.optional();

const stableIdList = z.array(stableIdSchema).default([]);
const requiredStableIdList = z
  .array(stableIdSchema)
  .min(1, "至少需要一个稳定 ID");
const localizedTextList = z.array(requiredText).default([]);

const legacySchema = z.strictObject({
  sourcePath: z
    .string()
    .regex(
      /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/,
      "旧来源路径必须是安全的仓库相对路径",
    ),
  exportName: optionalText,
  sourceId: optionalText,
  migratedAt: isoTimestampSchema.optional(),
});

const recordIdentifierSchema = z
  .strictObject({
    kind: z.enum(["doi", "isbn", "patent", "accession", "url", "other"]),
    value: requiredText,
  })
  .superRefine((identifier, context) => {
    if (
      identifier.kind === "doi" &&
      !/^10\.\d{4,9}\/\S+$/i.test(identifier.value)
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "DOI 格式无效",
        params: { issueCode: "OUTPUT_DOI_INVALID" },
      });
    }
  });

const teamNewsSharedSchema = z
  .strictObject({
    eventDate: isoDateSchema,
    endDate: isoDateSchema.optional(),
    locationLabel: localizedTextSchema.optional(),
    category: z.enum([
      "research",
      "teaching",
      "fieldwork",
      "meeting",
      "student-research",
      "other",
    ]),
    pinned: z.boolean().default(false),
    coverMediaId: stableIdSchema.optional(),
    galleryMediaIds: stableIdList,
    relatedContentIds: stableIdList,
    participantAuthorIds: stableIdList,
    sources: z.array(sourceSchema).default([]),
    disclosureStatus: z.enum(["pending", "approved"]),
  })
  .superRefine((shared, context) => {
    if (shared.endDate && shared.endDate < shared.eventDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "结束日期不能早于事件日期",
        params: { issueCode: "DATE_RANGE_INVALID" },
      });
    }
  });

const teamNewsLocalizedSchema = z.strictObject({
  participantDescription: optionalText,
  captions: z.record(stableIdSchema, requiredText).default({}),
});

const researchOutputSharedSchema = z.strictObject({
  outputKind: z.enum([
    "publication",
    "patent",
    "dataset",
    "software",
    "student-research",
  ]),
  year: z.number().int().min(1900).max(2100),
  publicationDate: isoDateSchema.optional(),
  venueKind: z.enum([
    "journal",
    "conference",
    "patent-office",
    "repository",
    "other",
  ]),
  venueName: requiredText,
  identifier: recordIdentifierSchema,
  canonicalUrl: httpsUrlSchema.optional(),
  contributorIds: requiredStableIdList,
  relatedProjectIds: stableIdList,
  verificationSources: z.array(sourceSchema).default([]),
  outputStatus: z.enum([
    "published",
    "accepted",
    "granted",
    "released",
    "pending",
  ]),
});

const researchOutputLocalizedSchema = z.strictObject({
  citationNote: requiredText,
  contributionNote: optionalText,
  description: optionalText,
});

const researchProjectSharedSchema = z
  .strictObject({
    projectKind: z.enum([
      "funded",
      "internal",
      "student",
      "collaborative",
      "field-observation",
    ]),
    projectStatus: z.enum([
      "planned",
      "active",
      "completed",
      "suspended",
      "cancelled",
    ]),
    publicProjectCode: optionalText,
    leadAuthorId: stableIdSchema,
    partnerAuthorIds: stableIdList,
    startDate: isoDateSchema,
    endDate: isoDateSchema.optional(),
    fundingSources: z.array(sourceSchema).default([]),
    publicScope: z.enum(["public", "summary-only", "internal"]),
    disclosureStatus: z.enum(["pending", "approved"]),
    relatedOutputIds: stableIdList,
    relatedResearchProfileIds: stableIdList,
    mediaIds: stableIdList,
  })
  .superRefine((shared, context) => {
    if (shared.endDate && shared.endDate < shared.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "项目结束日期不能早于开始日期",
        params: { issueCode: "DATE_RANGE_INVALID" },
      });
    }
  });

const researchProjectLocalizedSchema = z.strictObject({
  objectives: requiredText,
  methodsOverview: optionalText,
  publicProgress: optionalText,
  outcomes: optionalText,
});

const learningResourceSharedSchema = z.strictObject({
  resourceKind: z.enum([
    "instrument-tutorial",
    "beginner-guide",
    "record-template",
    "safety-note",
  ]),
  targetAudience: z.enum([
    "general",
    "students",
    "laboratory-members",
    "researchers",
  ]),
  hazardLevel: z.enum(["none", "low", "moderate", "high"]),
  laboratoryReviewStatus: z.enum(["not-required", "pending", "reviewed"]),
  requiredApproverRoles: z
    .array(z.enum(["content-reviewer", "laboratory-reviewer", "safety-reviewer"]))
    .default([]),
  version: z.string().regex(/^\d+\.\d+$/, "资源版本必须使用 major.minor 格式"),
  relatedInstrumentIds: stableIdList,
  relatedContentIds: stableIdList,
  attachmentMediaIds: stableIdList,
});

const learningResourceLocalizedSchema = z.strictObject({
  instrumentOrTopic: requiredText,
  audience: requiredText,
  purpose: requiredText,
  prerequisites: optionalText,
  applicableExperiments: optionalText,
  preCheck: localizedTextList,
  materials: localizedTextList,
  steps: localizedTextList,
  commonParameters: localizedTextList,
  dataExport: optionalText,
  cleaningAndShutdown: optionalText,
  commonErrors: localizedTextList,
  safetyNotice: requiredText,
  administration: optionalText,
  disclaimer: requiredText,
});

const algaeProfileSharedSchema = z.strictObject({
  scientificName: z
    .string()
    .trim()
    .regex(
      /^[A-Z][A-Za-z-]+(?:\s+(?:[a-z][A-Za-z.-]*|sp\.|spp\.)){0,3}$/,
      "学名必须使用规范的拉丁字母形式",
    ),
  taxonomicRank: z.enum([
    "kingdom",
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "group",
  ]),
  taxonomicIdentifiers: z.array(recordIdentifierSchema).default([]),
  taxonomySources: z.array(sourceSchema).default([]),
  environmentKinds: z
    .array(
      z.enum([
        "freshwater",
        "marine",
        "brackish",
        "terrestrial-moist",
        "extreme",
      ]),
    )
    .min(1, "至少需要一种环境类型"),
  profileCategory: z.enum([
    "microalgae",
    "macroalgae",
    "cyanobacteria",
    "other",
  ]),
  identificationStatus: z.enum([
    "unverified",
    "provisional",
    "verified",
    "limited",
  ]),
  identificationEvidence: z.array(sourceSchema).default([]),
  samplingLocationPolicy: z.enum(["hidden", "generalized", "exact-approved"]),
  samplingLocationLabel: localizedTextSchema.optional(),
  relatedResearchProfileIds: stableIdList,
  relatedObservationIds: stableIdList,
  primaryMediaId: stableIdSchema.optional(),
  galleryMediaIds: stableIdList,
});

const algaeProfileLocalizedSchema = z.strictObject({
  commonName: requiredText,
  categoryLabel: requiredText,
  habitat: requiredText,
  morphology: requiredText,
  researchFocus: optionalText,
  identificationLimitations: requiredText,
  observationGuidance: optionalText,
  referencesNote: optionalText,
});

const liveFeedProfileSharedSchema = z.strictObject({
  scientificGroup: requiredText,
  taxonomicLevel: z.enum([
    "phylum",
    "class",
    "order",
    "family",
    "genus",
    "species",
    "group",
  ]),
  category: z.enum([
    "microalgae",
    "rotifer",
    "copepod",
    "cladoceran",
    "other",
  ]),
  environmentKinds: z
    .array(z.enum(["freshwater", "marine", "brackish"]))
    .min(1, "至少需要一种水环境类型"),
  cultureDisclosureBoundary: z.enum([
    "public-overview",
    "reviewed-procedure",
    "internal-only",
  ]),
  identificationConfidence: z.enum(["low", "medium", "high", "confirmed"]),
  relatedGuideIds: stableIdList,
  relatedResearchProfileIds: stableIdList,
  relatedAlgaeIds: stableIdList,
  relatedOutputIds: stableIdList,
  primaryMediaId: stableIdSchema.optional(),
  galleryMediaIds: stableIdList,
});

const liveFeedProfileLocalizedSchema = z.strictObject({
  name: requiredText,
  overview: requiredText,
  environment: requiredText,
  morphology: requiredText,
  lifeHistory: optionalText,
  ecologicalRole: optionalText,
  feedingTraits: optionalText,
  researchFocus: optionalText,
  cultureFactors: optionalText,
  applications: optionalText,
  limitations: requiredText,
});

const coastalObservationSharedSchema = z
  .strictObject({
    observationStartedAt: isoTimestampSchema,
    observationEndedAt: isoTimestampSchema.optional(),
    observationType: z.enum([
      "water-discoloration",
      "field-observation",
      "sample-analysis",
      "microscopy",
      "environmental-measurement",
      "other",
    ]),
    evidenceType: z.enum([
      "visual",
      "sample",
      "microscopy",
      "instrumental",
      "combined",
    ]),
    observationStatus: z.enum([
      "preliminary",
      "under-review",
      "verified",
      "closed",
    ]),
    sampleStatus: z.enum([
      "none",
      "collected",
      "processing",
      "verified",
      "archived",
    ]),
    locationPolicy: z.enum(["hidden", "generalized", "exact-approved"]),
    generalizedLocationLabel: localizedTextSchema.optional(),
    publicSampleIds: stableIdList,
    taxonomicObservationIds: stableIdList,
    responsibleAuthorId: stableIdSchema,
    dataSources: z.array(sourceSchema).default([]),
    disclosureStatus: z.enum(["pending", "approved"]),
    relatedProjectIds: stableIdList,
    mediaIds: stableIdList,
  })
  .superRefine((shared, context) => {
    if (
      shared.observationEndedAt &&
      Date.parse(shared.observationEndedAt) < Date.parse(shared.observationStartedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["observationEndedAt"],
        message: "观测结束时间不能早于开始时间",
        params: { issueCode: "DATE_RANGE_INVALID" },
      });
    }

    if (
      shared.locationPolicy !== "hidden" &&
      !shared.generalizedLocationLabel
    ) {
      context.addIssue({
        code: "custom",
        path: ["generalizedLocationLabel"],
        message: "公开或概化地点必须提供地点标签",
        params: { issueCode: "OBSERVATION_LOCATION_LABEL_REQUIRED" },
      });
    }
  });

const coastalObservationLocalizedSchema = z.strictObject({
  observedPhenomena: requiredText,
  environmentalContext: optionalText,
  evidenceLimits: requiredText,
  interpretation: optionalText,
  followUp: optionalText,
  officialInformationDisclaimer: requiredText,
});

const scienceArticleSharedSchema = z.strictObject({
  articleKind: z.enum([
    "foundation",
    "observation-guide",
    "method-explainer",
    "research-context",
  ]),
  publicationDate: isoDateSchema,
  targetAudience: z.enum(["general", "students", "educators", "researchers"]),
  readingTimeMinutes: z.number().int().positive().max(180).optional(),
  references: z.array(sourceSchema).default([]),
  relatedContentIds: stableIdList,
  coverMediaId: stableIdSchema.optional(),
});

const scienceArticleLocalizedSchema = z.strictObject({
  topic: requiredText,
  targetAudienceLabel: requiredText,
  categoryLabel: optionalText,
  takeaways: localizedTextList,
});

const teamMemberSharedSchema = z
  .strictObject({
    authorId: stableIdSchema,
    membershipStatus: z.enum(["active", "alumni", "guest", "inactive"]),
    roleCategory: z.enum([
      "faculty",
      "researcher",
      "student",
      "technician",
      "collaborator",
      "other",
    ]),
    displayOrder: z.number().int().min(0),
    publicStartYear: z.number().int().min(1900).max(2100).optional(),
    publicEndYear: z.number().int().min(1900).max(2100).optional(),
    portraitMediaId: stableIdSchema.optional(),
    profileDisclosure: z.enum(["pending", "approved"]),
    portraitConsent: z.enum(["not-applicable", "pending", "confirmed"]),
    publicContactEnabled: z.boolean().default(false),
    researchProfileIds: stableIdList,
    outputIds: stableIdList,
  })
  .superRefine((shared, context) => {
    if (
      shared.publicStartYear &&
      shared.publicEndYear &&
      shared.publicEndYear < shared.publicStartYear
    ) {
      context.addIssue({
        code: "custom",
        path: ["publicEndYear"],
        message: "结束年份不能早于开始年份",
        params: { issueCode: "DATE_RANGE_INVALID" },
      });
    }
  });

const teamMemberLocalizedSchema = z.strictObject({
  displayName: requiredText,
  englishName: optionalText,
  roleTitle: requiredText,
  biography: requiredText,
  interests: localizedTextList,
  publicLinks: z
    .array(
      z.strictObject({
        label: requiredText,
        href: httpsUrlSchema,
      }),
    )
    .default([]),
});

const collaborationSharedSchema = z
  .strictObject({
    collaborationKind: z.enum(["area", "exchange", "case-study"]),
    collaborationStatus: z.enum([
      "open-for-discussion",
      "case-by-case",
      "internal-only",
    ]),
    partnerOrganizationIds: stableIdList,
    startedAt: isoDateSchema.optional(),
    endedAt: isoDateSchema.optional(),
    publicAuthorization: z.enum([
      "pending",
      "bilateral-approved",
      "not-required",
    ]),
    collaborationBoundary: z.enum([
      "public-summary",
      "approved-details",
      "internal-only",
    ]),
    disclosureStatus: z.enum(["pending", "approved"]),
    relatedResearchProfileIds: stableIdList,
    relatedContentIds: stableIdList,
    mediaIds: stableIdList,
  })
  .superRefine((shared, context) => {
    if (shared.startedAt && shared.endedAt && shared.endedAt < shared.startedAt) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "合作结束日期不能早于开始日期",
        params: { issueCode: "DATE_RANGE_INVALID" },
      });
    }
  });

const collaborationLocalizedSchema = z.strictObject({
  organizationName: optionalText,
  suitablePartners: requiredText,
  possibleTopics: requiredText,
  partnerPreparation: optionalText,
  teamMayContribute: requiredText,
  caveat: requiredText,
  processSummary: optionalText,
  outcomeSummary: optionalText,
});

const researchProfileSharedSchema = z.strictObject({
  contentStatus: z.enum(["active", "under-review", "archived"]),
  relatedCollaborationIds: stableIdList,
  routeKey: z.enum(["microalgae", "macroalgae", "live-feeds", "algal-blooms"]),
  routeRegistered: z.literal(true),
  mediaIds: stableIdList,
});

const researchProfileLocalizedSchema = z.strictObject({
  researchObjects: z.array(requiredText).min(1, "至少需要一个研究对象"),
  typicalQuestions: localizedTextList,
  methodsAndMeasurements: localizedTextList,
  resourcesAndConditions: optionalText,
  scopeCaveat: requiredText,
});

function createRecordSchema<
  TType extends string,
  TShared extends z.ZodType,
  TLocalized extends z.ZodType,
>(type: TType, sharedSchema: TShared, localizedSchema: TLocalized) {
  return z.strictObject({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    id: stableIdSchema,
    type: z.literal(type),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    authors: stableIdList,
    tags: stableIdList,
    media: stableIdList,
    shared: sharedSchema,
    locales: z.strictObject({
      zh: makePresentLocaleSchema(localizedSchema, "zh"),
      en: z.union([
        makePresentLocaleSchema(localizedSchema, "en"),
        missingLocaleSchema,
      ]),
    }),
    legacy: legacySchema.optional(),
  });
}

export const teamNewsRecordSchema = createRecordSchema(
  "team-news",
  teamNewsSharedSchema,
  teamNewsLocalizedSchema,
);
export const researchOutputRecordSchema = createRecordSchema(
  "research-output",
  researchOutputSharedSchema,
  researchOutputLocalizedSchema,
);
export const researchProjectRecordSchema = createRecordSchema(
  "research-project",
  researchProjectSharedSchema,
  researchProjectLocalizedSchema,
);
export const learningResourceRecordSchema = createRecordSchema(
  "learning-resource",
  learningResourceSharedSchema,
  learningResourceLocalizedSchema,
);
export const algaeProfileRecordSchema = createRecordSchema(
  "algae-profile",
  algaeProfileSharedSchema,
  algaeProfileLocalizedSchema,
);
export const liveFeedProfileRecordSchema = createRecordSchema(
  "live-feed-profile",
  liveFeedProfileSharedSchema,
  liveFeedProfileLocalizedSchema,
);
export const coastalObservationRecordSchema = createRecordSchema(
  "coastal-observation",
  coastalObservationSharedSchema,
  coastalObservationLocalizedSchema,
);
export const scienceArticleRecordSchema = createRecordSchema(
  "science-article",
  scienceArticleSharedSchema,
  scienceArticleLocalizedSchema,
);
export const teamMemberRecordSchema = createRecordSchema(
  "team-member",
  teamMemberSharedSchema,
  teamMemberLocalizedSchema,
);
export const collaborationRecordSchema = createRecordSchema(
  "collaboration",
  collaborationSharedSchema,
  collaborationLocalizedSchema,
);
export const researchProfileRecordSchema = createRecordSchema(
  "research-profile",
  researchProfileSharedSchema,
  researchProfileLocalizedSchema,
);

const baseContentRecordSchema = z.discriminatedUnion("type", [
  teamNewsRecordSchema,
  researchOutputRecordSchema,
  researchProjectRecordSchema,
  learningResourceRecordSchema,
  algaeProfileRecordSchema,
  liveFeedProfileRecordSchema,
  coastalObservationRecordSchema,
  scienceArticleRecordSchema,
  teamMemberRecordSchema,
  collaborationRecordSchema,
  researchProfileRecordSchema,
]);

function addRecordIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  issueCode: string,
  message: string,
) {
  context.addIssue({
    code: "custom",
    path,
    message,
    params: { issueCode },
  });
}

function hasPublishedLocale(record: z.infer<typeof baseContentRecordSchema>) {
  return (
    record.locales.zh.state === "published" ||
    record.locales.en.state === "published"
  );
}

function sourcesAreVerified(sources: Array<z.infer<typeof sourceSchema>>) {
  return sources.length > 0 && sources.every((source) => source.verificationStatus === "verified");
}

export const contentRecordSchema = baseContentRecordSchema.superRefine(
  (record, context) => {
    if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
      addRecordIssue(
        context,
        ["updatedAt"],
        "RECORD_DATE_ORDER_INVALID",
        "更新时间不能早于创建时间",
      );
    }

    if (hasPublishedLocale(record) && record.authors.length === 0) {
      addRecordIssue(
        context,
        ["authors"],
        "AUTHOR_REQUIRED_FOR_PUBLICATION",
        "发布内容必须至少有一位可追责作者或团队",
      );
    }

    for (const locale of ["zh", "en"] as const) {
      const localized = record.locales[locale];
      if (localized.state !== "published" || !localized.publishedAt) {
        continue;
      }

      if (Date.parse(localized.publishedAt) < Date.parse(record.createdAt)) {
        addRecordIssue(
          context,
          ["locales", locale, "publishedAt"],
          "PUBLICATION_DATE_ORDER_INVALID",
          "发布时间不能早于记录创建时间",
        );
      }
    }

    const setFields: Array<[string, string[]]> = [
      ["authors", record.authors],
      ["tags", record.tags],
      ["media", record.media],
    ];
    for (const [field, values] of setFields) {
      if (new Set(values).size !== values.length) {
        addRecordIssue(
          context,
          [field],
          "DUPLICATE_ID_REFERENCE",
          `${field} 中不能包含重复 ID`,
        );
      }
    }

    if (!hasPublishedLocale(record)) {
      return;
    }

    switch (record.type) {
      case "team-news":
        if (record.shared.disclosureStatus !== "approved") {
          addRecordIssue(
            context,
            ["shared", "disclosureStatus"],
            "NEWS_DISCLOSURE_REQUIRED",
            "团队动态发布前必须确认公开范围",
          );
        }
        if (!sourcesAreVerified(record.shared.sources)) {
          addRecordIssue(
            context,
            ["shared", "sources"],
            "NEWS_SOURCE_REQUIRED",
            "团队动态发布前必须有已核验来源",
          );
        }
        break;
      case "research-output":
        if (!sourcesAreVerified(record.shared.verificationSources)) {
          addRecordIssue(
            context,
            ["shared", "verificationSources"],
            "OUTPUT_SOURCE_REQUIRED",
            "科研成果发布前必须有已核验来源",
          );
        }
        break;
      case "research-project":
        if (
          record.shared.publicScope === "internal" ||
          record.shared.disclosureStatus !== "approved"
        ) {
          addRecordIssue(
            context,
            ["shared", "publicScope"],
            "PROJECT_DISCLOSURE_REQUIRED",
            "研究项目发布前必须批准公开范围",
          );
        }
        break;
      case "learning-resource": {
        const hasOperationalDetails = ["zh", "en"].some((locale) => {
          const value = record.locales[locale as "zh" | "en"];
          return (
            value.state !== "missing" &&
            (value.fields.steps.length > 0 ||
              value.fields.commonParameters.length > 0 ||
              value.fields.materials.length > 0)
          );
        });
        if (
          (record.shared.hazardLevel !== "none" || hasOperationalDetails) &&
          record.shared.laboratoryReviewStatus !== "reviewed"
        ) {
          addRecordIssue(
            context,
            ["shared", "laboratoryReviewStatus"],
            "LAB_REVIEW_REQUIRED",
            "含操作步骤、参数、材料或风险的资源必须完成实验室审核",
          );
        }
        break;
      }
      case "algae-profile":
        if (
          record.shared.identificationStatus === "unverified" ||
          !sourcesAreVerified(record.shared.taxonomySources)
        ) {
          addRecordIssue(
            context,
            ["shared", "identificationStatus"],
            "TAXONOMY_REVIEW_REQUIRED",
            "藻类图鉴发布前必须记录可核验分类来源和鉴定边界",
          );
        }
        break;
      case "live-feed-profile":
        if (record.shared.cultureDisclosureBoundary === "internal-only") {
          addRecordIssue(
            context,
            ["shared", "cultureDisclosureBoundary"],
            "CULTURE_SCOPE_NOT_PUBLIC",
            "内部培养说明不能作为公开内容发布",
          );
        }
        break;
      case "coastal-observation":
        if (record.shared.disclosureStatus !== "approved") {
          addRecordIssue(
            context,
            ["shared", "disclosureStatus"],
            "OBSERVATION_DISCLOSURE_REQUIRED",
            "近岸观测发布前必须完成公开范围审核",
          );
        }
        break;
      case "team-member":
        if (
          record.shared.profileDisclosure !== "approved" ||
          (record.shared.portraitMediaId &&
            record.shared.portraitConsent !== "confirmed")
        ) {
          addRecordIssue(
            context,
            ["shared", "profileDisclosure"],
            "MEMBER_PUBLIC_SCOPE_REQUIRED",
            "团队成员发布前必须确认个人资料和照片公开授权",
          );
        }
        break;
      case "collaboration":
        if (
          record.shared.collaborationBoundary === "internal-only" ||
          record.shared.disclosureStatus !== "approved" ||
          record.shared.publicAuthorization === "pending"
        ) {
          addRecordIssue(
            context,
            ["shared", "publicAuthorization"],
            "COLLABORATION_DISCLOSURE_REQUIRED",
            "合作内容发布前必须完成公开授权和边界审核",
          );
        }
        break;
      case "research-profile":
        if (record.id !== record.shared.routeKey) {
          addRecordIssue(
            context,
            ["id"],
            "RESEARCH_PROFILE_ID_FIXED",
            "研究方向记录 ID 必须与已注册路由键一致",
          );
        }
        break;
      case "science-article":
        break;
    }
  },
);

export const contentRecordSchemas = {
  "team-news": teamNewsRecordSchema,
  "research-output": researchOutputRecordSchema,
  "research-project": researchProjectRecordSchema,
  "learning-resource": learningResourceRecordSchema,
  "algae-profile": algaeProfileRecordSchema,
  "live-feed-profile": liveFeedProfileRecordSchema,
  "coastal-observation": coastalObservationRecordSchema,
  "science-article": scienceArticleRecordSchema,
  "team-member": teamMemberRecordSchema,
  collaboration: collaborationRecordSchema,
  "research-profile": researchProfileRecordSchema,
} as const;

export type ContentRecord = z.infer<typeof contentRecordSchema>;
export type TeamNewsRecord = z.infer<typeof teamNewsRecordSchema>;
export type ResearchOutputRecord = z.infer<typeof researchOutputRecordSchema>;
export type ResearchProjectRecord = z.infer<typeof researchProjectRecordSchema>;
export type LearningResourceRecord = z.infer<typeof learningResourceRecordSchema>;
export type AlgaeProfileRecord = z.infer<typeof algaeProfileRecordSchema>;
export type LiveFeedProfileRecord = z.infer<typeof liveFeedProfileRecordSchema>;
export type CoastalObservationRecord = z.infer<typeof coastalObservationRecordSchema>;
export type ScienceArticleRecord = z.infer<typeof scienceArticleRecordSchema>;
export type TeamMemberRecord = z.infer<typeof teamMemberRecordSchema>;
export type CollaborationRecord = z.infer<typeof collaborationRecordSchema>;
export type ResearchProfileRecord = z.infer<typeof researchProfileRecordSchema>;
