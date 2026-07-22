import { CONTENT_TYPES, type ContentType } from "../src/constants";

export const FIXTURE_NOW = "2026-07-22T09:00:00+08:00";
export const FIXTURE_DATE = "2026-07-22";
export const FIXTURE_AUTHOR_ID = "fictional-algae-team";

export const verifiedSourceFixture = {
  id: "fictional-verification-source",
  kind: "article",
  title: "Fictional verification source for schema tests",
  href: "https://example.invalid/source",
  verificationStatus: "verified",
  verifiedAt: FIXTURE_DATE,
} as const;

export const fixtureAuthor = {
  schemaVersion: 1,
  id: FIXTURE_AUTHOR_ID,
  kind: "team",
  status: "active",
  displayName: {
    zh: "虚构藻类测试团队",
    en: "Fictional Algae Test Team",
  },
  publicLinks: [],
  publicScope: "approved",
} as const;

export const fixtureMedia = {
  schemaVersion: 1,
  id: "fictional-cover-image",
  filePath: "public/images/uploads/2026/07/fictional-cover-image.jpg",
  sha256: "a".repeat(64),
  mimeType: "image/jpeg",
  bytes: 1024,
  width: 640,
  height: 480,
  uploadedAt: FIXTURE_NOW,
  creatorOrProvider: "Fictional fixture provider",
  sourceUrl: "https://example.invalid/image",
  license: {
    identifier: "permission-granted",
    name: "Fictional fixture permission",
    attribution: "Fictional fixture only",
    usageScope: "public-site",
  },
  rightsStatus: "approved",
  identificationStatus: "not-applicable",
  identifiablePeople: false,
  consentState: "not-applicable",
  alt: {
    zh: "虚构测试封面",
    en: "Fictional test cover",
  },
  relatedContentIds: [],
  legacy: false,
} as const;

const reviewedReview = {
  status: "reviewed",
  updatedAt: FIXTURE_DATE,
  reviewedAt: FIXTURE_DATE,
  version: "1.0",
  reviewerIds: [FIXTURE_AUTHOR_ID],
  references: [],
} as const;

function publishedChinese(fields: Record<string, unknown>) {
  return {
    state: "published",
    title: "虚构测试内容",
    summary: "仅用于自动化校验的虚构摘要。",
    bodyFile: "zh.md",
    fields,
    translationOrigin: "source-authored",
    review: reviewedReview,
    publishedAt: FIXTURE_NOW,
  };
}

function recordFixture(
  type: ContentType,
  id: string,
  shared: Record<string, unknown>,
  localizedFields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    type,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    authors: [FIXTURE_AUTHOR_ID],
    tags: ["fictional-fixture"],
    media: [],
    shared,
    locales: {
      zh: publishedChinese(localizedFields),
      en: { state: "missing" },
    },
  };
}

export const validRecordFixtures: Record<
  ContentType,
  Record<string, unknown>
> = {
  "team-news": recordFixture(
    "team-news",
    "fictional-team-news",
    {
      eventDate: FIXTURE_DATE,
      category: "research",
      pinned: false,
      galleryMediaIds: [],
      relatedContentIds: [],
      participantAuthorIds: [],
      sources: [verifiedSourceFixture],
      disclosureStatus: "approved",
    },
    { participantDescription: "虚构参与者说明", captions: {} },
  ),
  "research-output": recordFixture(
    "research-output",
    "fictional-research-output",
    {
      outputKind: "publication",
      year: 2026,
      publicationDate: FIXTURE_DATE,
      venueKind: "journal",
      venueName: "Journal of Fictional Fixtures",
      identifier: { kind: "doi", value: "10.1234/fictional.fixture" },
      canonicalUrl: "https://example.invalid/output",
      contributorIds: [FIXTURE_AUTHOR_ID],
      relatedProjectIds: [],
      verificationSources: [verifiedSourceFixture],
      outputStatus: "published",
    },
    { citationNote: "虚构引用，仅用于测试。" },
  ),
  "research-project": recordFixture(
    "research-project",
    "fictional-research-project",
    {
      projectKind: "internal",
      projectStatus: "active",
      leadAuthorId: FIXTURE_AUTHOR_ID,
      partnerAuthorIds: [],
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      fundingSources: [],
      publicScope: "summary-only",
      disclosureStatus: "approved",
      relatedOutputIds: [],
      relatedResearchProfileIds: [],
      mediaIds: [],
    },
    { objectives: "验证虚构项目字段。" },
  ),
  "learning-resource": recordFixture(
    "learning-resource",
    "fictional-learning-resource",
    {
      resourceKind: "beginner-guide",
      targetAudience: "students",
      hazardLevel: "none",
      laboratoryReviewStatus: "not-required",
      requiredApproverRoles: [],
      version: "1.0",
      relatedInstrumentIds: [],
      relatedContentIds: [],
      attachmentMediaIds: [],
    },
    {
      instrumentOrTopic: "虚构主题",
      audience: "测试读者",
      purpose: "验证学习资源结构。",
      preCheck: [],
      materials: [],
      steps: [],
      commonParameters: [],
      commonErrors: [],
      safetyNotice: "本 fixture 不含真实操作参数。",
      disclaimer: "不替代仪器手册、安全培训、监督或批准的 SOP。",
    },
  ),
  "algae-profile": recordFixture(
    "algae-profile",
    "fictional-algae-profile",
    {
      scientificName: "Ulva lactuca",
      taxonomicRank: "species",
      taxonomicIdentifiers: [],
      taxonomySources: [verifiedSourceFixture],
      environmentKinds: ["marine"],
      profileCategory: "macroalgae",
      identificationStatus: "verified",
      identificationEvidence: [verifiedSourceFixture],
      samplingLocationPolicy: "hidden",
      relatedResearchProfileIds: [],
      relatedObservationIds: [],
      galleryMediaIds: [],
    },
    {
      commonName: "虚构测试石莼",
      categoryLabel: "大型海藻",
      habitat: "虚构环境说明",
      morphology: "虚构形态说明",
      identificationLimitations: "仅用于结构测试，不代表真实鉴定。",
    },
  ),
  "live-feed-profile": recordFixture(
    "live-feed-profile",
    "fictional-live-feed-profile",
    {
      scientificGroup: "Rotifera",
      taxonomicLevel: "phylum",
      category: "rotifer",
      environmentKinds: ["marine"],
      cultureDisclosureBoundary: "public-overview",
      identificationConfidence: "high",
      relatedGuideIds: [],
      relatedResearchProfileIds: [],
      relatedAlgaeIds: [],
      relatedOutputIds: [],
      galleryMediaIds: [],
    },
    {
      name: "虚构轮虫类群",
      overview: "虚构概述",
      environment: "虚构水环境",
      morphology: "虚构形态",
      limitations: "不构成培养方案。",
    },
  ),
  "coastal-observation": recordFixture(
    "coastal-observation",
    "fictional-coastal-observation",
    {
      observationStartedAt: FIXTURE_NOW,
      observationType: "field-observation",
      evidenceType: "visual",
      observationStatus: "verified",
      sampleStatus: "none",
      locationPolicy: "hidden",
      publicSampleIds: [],
      taxonomicObservationIds: [],
      responsibleAuthorId: FIXTURE_AUTHOR_ID,
      dataSources: [verifiedSourceFixture],
      disclosureStatus: "approved",
      relatedProjectIds: [],
      mediaIds: [],
    },
    {
      observedPhenomena: "虚构现场现象",
      evidenceLimits: "无真实样品或结论。",
      officialInformationDisclaimer: "不是官方赤潮预警、食品安全结论或公共卫生建议。",
    },
  ),
  "science-article": recordFixture(
    "science-article",
    "fictional-science-article",
    {
      articleKind: "foundation",
      publicationDate: FIXTURE_DATE,
      targetAudience: "general",
      references: [],
      relatedContentIds: [],
    },
    {
      topic: "虚构科普主题",
      targetAudienceLabel: "公众",
      takeaways: ["所有数据均为虚构 fixture"],
    },
  ),
  "team-member": recordFixture(
    "team-member",
    "fictional-team-member",
    {
      authorId: FIXTURE_AUTHOR_ID,
      membershipStatus: "guest",
      roleCategory: "other",
      displayOrder: 0,
      profileDisclosure: "approved",
      portraitConsent: "not-applicable",
      publicContactEnabled: false,
      researchProfileIds: [],
      outputIds: [],
    },
    {
      displayName: "虚构测试成员",
      roleTitle: "Fixture",
      biography: "该人物并不存在，仅用于测试。",
      interests: [],
      publicLinks: [],
    },
  ),
  collaboration: recordFixture(
    "collaboration",
    "fictional-collaboration",
    {
      collaborationKind: "area",
      collaborationStatus: "open-for-discussion",
      partnerOrganizationIds: [],
      publicAuthorization: "not-required",
      collaborationBoundary: "public-summary",
      disclosureStatus: "approved",
      relatedResearchProfileIds: [],
      relatedContentIds: [],
      mediaIds: [],
    },
    {
      suitablePartners: "虚构合作对象",
      possibleTopics: "虚构合作主题",
      teamMayContribute: "仅表示可讨论，不构成承诺。",
      caveat: "需逐项评估，不保证批准、能力、进度、成果、署名或知识产权安排。",
    },
  ),
  "research-profile": recordFixture(
    "research-profile",
    "microalgae",
    {
      contentStatus: "active",
      relatedCollaborationIds: [],
      routeKey: "microalgae",
      routeRegistered: true,
      mediaIds: [],
    },
    {
      researchObjects: ["虚构微藻对象"],
      typicalQuestions: [],
      methodsAndMeasurements: [],
      scopeCaveat: "不代表实际设备、藻种、能力、合作方或成果保证。",
    },
  ),
};

function mutableClone(type: ContentType): Record<string, unknown> {
  return structuredClone(validRecordFixtures[type]);
}

function shared(record: Record<string, unknown>): Record<string, unknown> {
  return record.shared as Record<string, unknown>;
}

function zhFields(record: Record<string, unknown>): Record<string, unknown> {
  const locales = record.locales as Record<string, unknown>;
  const zh = locales.zh as Record<string, unknown>;
  return zh.fields as Record<string, unknown>;
}

function invalidFixture(type: ContentType): Record<string, unknown> {
  const record = mutableClone(type);
  switch (type) {
    case "team-news":
      shared(record).eventDate = "2026-99-99";
      break;
    case "research-output":
      shared(record).identifier = { kind: "doi", value: "not-a-doi" };
      break;
    case "research-project":
      shared(record).endDate = "2025-01-01";
      break;
    case "learning-resource":
      delete zhFields(record).safetyNotice;
      break;
    case "algae-profile":
      shared(record).scientificName = "not a scientific name";
      break;
    case "live-feed-profile":
      shared(record).cultureDisclosureBoundary = "internal-only";
      break;
    case "coastal-observation":
      shared(record).disclosureStatus = "pending";
      break;
    case "science-article":
      delete zhFields(record).topic;
      break;
    case "team-member":
      shared(record).profileDisclosure = "pending";
      break;
    case "collaboration":
      shared(record).publicAuthorization = "pending";
      break;
    case "research-profile":
      record.id = "unregistered-research-profile";
      break;
  }
  return record;
}

export const invalidRecordFixtures = Object.fromEntries(
  CONTENT_TYPES.map((type) => [type, invalidFixture(type)]),
) as Record<ContentType, Record<string, unknown>>;

export const validMarkdownFixture = [
  "## 虚构测试正文",
  "",
  "这是只用于 schema 测试的内容。",
  "",
  "- [安全来源](https://example.invalid/reference)",
].join("\n");

export const validRepositorySnapshotFixture = {
  records: [validRecordFixtures["science-article"]],
  authors: [fixtureAuthor],
  media: [],
  markdown: {
    "science-article/fictional-science-article/zh.md": validMarkdownFixture,
  },
  recordPaths: {
    "fictional-science-article":
      "content/records/science-article/fictional-science-article/record.json",
  },
};
