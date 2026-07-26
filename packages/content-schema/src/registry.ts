import {
  CONTENT_SCHEMA_VERSION,
  CONTENT_TYPES,
  ENGLISH_WORKFLOW_STATES,
  type ContentType,
} from "./constants";

export type FieldValueKind =
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "enum-list"
  | "group"
  | "id"
  | "id-list"
  | "integer"
  | "reference-list"
  | "text"
  | "text-list"
  | "url";

export type FieldRequirement =
  | "always"
  | "draft"
  | "present-locale"
  | "published-locale"
  | "optional";

export type FieldDefinition = {
  key: string;
  path: string;
  label: { zh: string; en: string };
  kind: FieldValueKind;
  requirement: FieldRequirement;
  localized?: boolean;
  options?: readonly string[];
  defaultValue?: unknown;
  applicableTypes?: readonly ContentType[];
};

export type ReferenceTarget = "author" | "content" | "media";

export type ReferenceRule = {
  path: string;
  target: ReferenceTarget;
  expectedContentTypes?: readonly ContentType[];
  required?: boolean;
};

export type ContentTypeDefinition = {
  type: ContentType;
  label: { zh: string; en: string };
  routeFamily: string;
  sectionPath: string;
  creationPolicy: "open-after-verification" | "fixed-allowlist" | "code-owned-route";
  fixedIds?: readonly string[];
  sharedFields: readonly FieldDefinition[];
  localizedFields: readonly FieldDefinition[];
  references: readonly ReferenceRule[];
  defaultValues: {
    shared: Readonly<Record<string, unknown>>;
    localized: Readonly<Record<string, unknown>>;
  };
};

function field(
  key: string,
  path: string,
  zh: string,
  en: string,
  kind: FieldValueKind,
  requirement: FieldRequirement,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition {
  return { key, path, label: { zh, en }, kind, requirement, ...extra };
}

export const commonFieldRegistry: readonly FieldDefinition[] = [
  field("id", "id", "稳定 ID", "Stable ID", "id", "always"),
  field("type", "type", "内容类型", "Content type", "enum", "always", {
    options: CONTENT_TYPES,
  }),
  field(
    "status",
    "locales.{locale}.state",
    "语言状态",
    "Locale state",
    "enum",
    "always",
    { options: ENGLISH_WORKFLOW_STATES },
  ),
  field("createdAt", "createdAt", "创建时间", "Created at", "datetime", "always"),
  field("updatedAt", "updatedAt", "更新时间", "Updated at", "datetime", "always"),
  field(
    "publishedAt",
    "locales.{locale}.publishedAt",
    "发布时间",
    "Published at",
    "datetime",
    "published-locale",
    { localized: true },
  ),
  field("authors", "authors", "作者", "Authors", "id-list", "optional", {
    defaultValue: [],
  }),
  field("tags", "tags", "标签", "Tags", "id-list", "optional", {
    defaultValue: [],
  }),
  field("media", "media", "关联图片", "Related media", "id-list", "optional", {
    defaultValue: [],
  }),
  field(
    "coverImage",
    "shared.{coverMediaField}",
    "封面图片",
    "Cover image",
    "id",
    "optional",
    {
      applicableTypes: [
        "team-news",
        "science-article",
        "algae-profile",
        "live-feed-profile",
        "team-member",
      ],
    },
  ),
  field(
    "featured",
    "shared.pinned",
    "精选内容",
    "Featured",
    "boolean",
    "optional",
    { defaultValue: false, applicableTypes: ["team-news"] },
  ),
  field("zh", "locales.zh", "中文内容", "Chinese content", "group", "always", {
    localized: true,
  }),
  field("en", "locales.en", "英文内容", "English content", "group", "optional", {
    localized: true,
    defaultValue: { state: "missing" },
  }),
  field(
    "review",
    "locales.{locale}.review",
    "审核记录",
    "Review record",
    "group",
    "present-locale",
    { localized: true },
  ),
];

const teamNewsFields = {
  shared: [
    field("eventDate", "shared.eventDate", "事件日期", "Event date", "date", "always"),
    field("endDate", "shared.endDate", "结束日期", "End date", "date", "optional"),
    field("locationLabel", "shared.locationLabel", "地点", "Location", "group", "optional"),
    field(
      "category",
      "shared.category",
      "活动类型",
      "Activity type",
      "enum",
      "always",
      {
        options: [
          "research",
          "teaching",
          "fieldwork",
          "meeting",
          "student-research",
          "other",
        ],
      },
    ),
    field(
      "participantAuthorIds",
      "shared.participantAuthorIds",
      "参与者",
      "Participants",
      "id-list",
      "optional",
    ),
    field("sources", "shared.sources", "新闻来源", "News sources", "reference-list", "optional"),
    field(
      "disclosureStatus",
      "shared.disclosureStatus",
      "公开确认",
      "Disclosure status",
      "enum",
      "optional",
      { options: ["pending", "approved"], defaultValue: "pending" },
    ),
  ],
  localized: [
    field(
      "authorName",
      "locales.{locale}.fields.authorName",
      "作者",
      "Author byline",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "participantDescription",
      "locales.{locale}.fields.participantDescription",
      "参与者说明",
      "Participant description",
      "text",
      "optional",
      { localized: true },
    ),
  ],
};

const outputFields = {
  shared: [
    field("outputKind", "shared.outputKind", "成果类型", "Output kind", "enum", "always", {
      options: ["publication", "patent", "dataset", "software", "student-research"],
    }),
    field("contributorIds", "shared.contributorIds", "作者", "Contributors", "id-list", "optional"),
    field("year", "shared.year", "年份", "Year", "integer", "always"),
    field("publicationDate", "shared.publicationDate", "公开日期", "Publication date", "date", "optional"),
    field("venueKind", "shared.venueKind", "期刊/会议/专利类型", "Venue kind", "enum", "always", {
      options: ["journal", "conference", "patent-office", "repository", "other"],
    }),
    field("venueName", "shared.venueName", "期刊/会议/专利", "Venue", "text", "always"),
    field("identifier", "shared.identifier", "DOI 或其他标识符", "DOI or identifier", "group", "always"),
    field("identifierKind", "shared.identifier.kind", "标识符类型", "Identifier kind", "enum", "always", {
      options: ["doi", "isbn", "patent", "accession", "url", "other"],
    }),
    field("identifierValue", "shared.identifier.value", "标识符", "Identifier", "text", "always"),
    field("canonicalUrl", "shared.canonicalUrl", "公开链接", "Public URL", "url", "optional"),
    field("outputStatus", "shared.outputStatus", "成果状态", "Output status", "enum", "always", {
      options: ["published", "accepted", "granted", "released", "pending"],
    }),
  ],
  localized: [
    field("citationNote", "locales.{locale}.fields.citationNote", "引用说明", "Citation note", "text", "always", {
      localized: true,
    }),
    field(
      "contributionNote",
      "locales.{locale}.fields.contributionNote",
      "贡献说明",
      "Contribution note",
      "text",
      "optional",
      { localized: true },
    ),
    field("description", "locales.{locale}.fields.description", "成果简介", "Description", "text", "optional", {
      localized: true,
    }),
  ],
};

const projectFields = {
  shared: [
    field("projectKind", "shared.projectKind", "项目类型", "Project kind", "enum", "always", {
      options: ["funded", "internal", "student", "collaborative", "field-observation"],
    }),
    field("projectStatus", "shared.projectStatus", "项目状态", "Project status", "enum", "always", {
      options: ["planned", "active", "completed", "suspended", "cancelled"],
    }),
    field("publicProjectCode", "shared.publicProjectCode", "公开项目编号", "Public project code", "text", "optional"),
    field("leadAuthorId", "shared.leadAuthorId", "负责人", "Lead", "id", "optional"),
    field("startDate", "shared.startDate", "开始日期", "Start date", "date", "always"),
    field("endDate", "shared.endDate", "结束日期", "End date", "date", "optional"),
    field("fundingSources", "shared.fundingSources", "资助来源", "Funding sources", "reference-list", "optional"),
    field("publicScope", "shared.publicScope", "公开范围", "Public scope", "enum", "always", {
      options: ["public", "summary-only", "internal"],
    }),
    field(
      "disclosureStatus",
      "shared.disclosureStatus",
      "公开确认",
      "Disclosure status",
      "enum",
      "always",
      { options: ["pending", "approved"] },
    ),
  ],
  localized: [
    field("objectives", "locales.{locale}.fields.objectives", "项目目标", "Objectives", "text", "always", {
      localized: true,
    }),
    field(
      "methodsOverview",
      "locales.{locale}.fields.methodsOverview",
      "方法概述",
      "Methods overview",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "publicProgress",
      "locales.{locale}.fields.publicProgress",
      "公开进展",
      "Public progress",
      "text",
      "optional",
      { localized: true },
    ),
    field("outcomes", "locales.{locale}.fields.outcomes", "项目成果", "Outcomes", "text", "optional", {
      localized: true,
    }),
  ],
};

const learningFields = {
  shared: [
    field("resourceKind", "shared.resourceKind", "资源类型", "Resource kind", "enum", "always", {
      options: ["instrument-tutorial", "beginner-guide", "record-template", "safety-note"],
    }),
    field("targetAudience", "shared.targetAudience", "适用对象", "Audience", "enum", "always", {
      options: ["general", "students", "laboratory-members", "researchers"],
    }),
    field("hazardLevel", "shared.hazardLevel", "风险等级", "Hazard level", "enum", "always", {
      options: ["none", "low", "moderate", "high"],
    }),
    field(
      "laboratoryReviewStatus",
      "shared.laboratoryReviewStatus",
      "实验室审核状态",
      "Laboratory review status",
      "enum",
      "always",
      { options: ["not-required", "pending", "reviewed"] },
    ),
    field("version", "shared.version", "资源版本", "Resource version", "text", "always"),
  ],
  localized: [
    field(
      "instrumentOrTopic",
      "locales.{locale}.fields.instrumentOrTopic",
      "仪器或主题",
      "Instrument or topic",
      "text",
      "always",
      { localized: true },
    ),
    field("audience", "locales.{locale}.fields.audience", "适用对象说明", "Audience note", "text", "always", {
      localized: true,
    }),
    field("purpose", "locales.{locale}.fields.purpose", "资源目的", "Purpose", "text", "always", {
      localized: true,
    }),
    field(
      "prerequisites",
      "locales.{locale}.fields.prerequisites",
      "前置条件",
      "Prerequisites",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "applicableExperiments",
      "locales.{locale}.fields.applicableExperiments",
      "适用实验",
      "Applicable experiments",
      "text",
      "optional",
      { localized: true },
    ),
    field("preCheck", "locales.{locale}.fields.preCheck", "操作前检查", "Pre-check", "text-list", "optional", {
      localized: true,
    }),
    field("materials", "locales.{locale}.fields.materials", "材料", "Materials", "text-list", "optional", {
      localized: true,
    }),
    field("steps", "locales.{locale}.fields.steps", "步骤", "Steps", "text-list", "optional", {
      localized: true,
    }),
    field(
      "commonParameters",
      "locales.{locale}.fields.commonParameters",
      "常用参数",
      "Common parameters",
      "text-list",
      "optional",
      { localized: true },
    ),
    field("dataExport", "locales.{locale}.fields.dataExport", "数据导出", "Data export", "text", "optional", {
      localized: true,
    }),
    field(
      "cleaningAndShutdown",
      "locales.{locale}.fields.cleaningAndShutdown",
      "清洁与关机",
      "Cleaning and shutdown",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "commonErrors",
      "locales.{locale}.fields.commonErrors",
      "常见错误",
      "Common errors",
      "text-list",
      "optional",
      { localized: true },
    ),
    field(
      "safetyNotice",
      "locales.{locale}.fields.safetyNotice",
      "安全说明",
      "Safety notice",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "administration",
      "locales.{locale}.fields.administration",
      "管理说明",
      "Administration",
      "text",
      "optional",
      { localized: true },
    ),
    field("disclaimer", "locales.{locale}.fields.disclaimer", "使用声明", "Disclaimer", "text", "always", {
      localized: true,
    }),
  ],
};

const algaeFields = {
  shared: [
    field("scientificName", "shared.scientificName", "学名", "Scientific name", "text", "always"),
    field("taxonomicRank", "shared.taxonomicRank", "分类层级", "Taxonomic rank", "enum", "always", {
      options: ["kingdom", "phylum", "class", "order", "family", "genus", "species", "group"],
    }),
    field("environmentKinds", "shared.environmentKinds", "环境类型", "Environment kinds", "enum-list", "always", {
      options: ["freshwater", "marine", "brackish", "terrestrial-moist", "extreme"],
    }),
    field("profileCategory", "shared.profileCategory", "图鉴类别", "Profile category", "enum", "always", {
      options: ["microalgae", "macroalgae", "cyanobacteria", "other"],
    }),
    field(
      "samplingLocationLabel",
      "shared.samplingLocationLabel",
      "采样地",
      "Sampling location",
      "group",
      "optional",
    ),
    field(
      "identificationStatus",
      "shared.identificationStatus",
      "鉴定状态",
      "Identification status",
      "enum",
      "always",
      { options: ["unverified", "provisional", "verified", "limited"] },
    ),
    field(
      "samplingLocationPolicy",
      "shared.samplingLocationPolicy",
      "采样地点公开策略",
      "Sampling location policy",
      "enum",
      "always",
      { options: ["hidden", "generalized", "exact-approved"] },
    ),
    field(
      "identificationEvidence",
      "shared.identificationEvidence",
      "鉴定依据",
      "Identification evidence",
      "reference-list",
      "optional",
    ),
  ],
  localized: [
    field("commonName", "locales.{locale}.fields.commonName", "中文名/常用名", "Common name", "text", "always", {
      localized: true,
    }),
    field("categoryLabel", "locales.{locale}.fields.categoryLabel", "类别说明", "Category label", "text", "always", {
      localized: true,
    }),
    field("habitat", "locales.{locale}.fields.habitat", "生境", "Habitat", "text", "always", {
      localized: true,
    }),
    field("morphology", "locales.{locale}.fields.morphology", "形态", "Morphology", "text", "always", {
      localized: true,
    }),
    field(
      "researchFocus",
      "locales.{locale}.fields.researchFocus",
      "研究重点",
      "Research focus",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "identificationLimitations",
      "locales.{locale}.fields.identificationLimitations",
      "鉴定限制",
      "Identification limitations",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "observationGuidance",
      "locales.{locale}.fields.observationGuidance",
      "观察建议",
      "Observation guidance",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "referencesNote",
      "locales.{locale}.fields.referencesNote",
      "参考说明",
      "References note",
      "text",
      "optional",
      { localized: true },
    ),
  ],
};

const liveFeedFields = {
  shared: [
    field("scientificGroup", "shared.scientificGroup", "类群", "Scientific group", "text", "always"),
    field("taxonomicLevel", "shared.taxonomicLevel", "分类层级", "Taxonomic level", "enum", "always", {
      options: ["phylum", "class", "order", "family", "genus", "species", "group"],
    }),
    field("category", "shared.category", "生物饵料类别", "Live-feed category", "enum", "always", {
      options: ["microalgae", "rotifer", "copepod", "cladoceran", "other"],
    }),
    field("environmentKinds", "shared.environmentKinds", "水环境类型", "Water environments", "enum-list", "always", {
      options: ["freshwater", "marine", "brackish"],
    }),
    field(
      "cultureDisclosureBoundary",
      "shared.cultureDisclosureBoundary",
      "培养说明公开边界",
      "Culture disclosure boundary",
      "enum",
      "always",
      { options: ["public-overview", "reviewed-procedure", "internal-only"] },
    ),
    field(
      "identificationConfidence",
      "shared.identificationConfidence",
      "鉴定可信度",
      "Identification confidence",
      "enum",
      "always",
      { options: ["low", "medium", "high", "confirmed"] },
    ),
  ],
  localized: [
    field("name", "locales.{locale}.fields.name", "名称", "Name", "text", "always", { localized: true }),
    field("overview", "locales.{locale}.fields.overview", "概述", "Overview", "text", "always", {
      localized: true,
    }),
    field("environment", "locales.{locale}.fields.environment", "环境", "Environment", "text", "always", {
      localized: true,
    }),
    field("morphology", "locales.{locale}.fields.morphology", "形态", "Morphology", "text", "always", {
      localized: true,
    }),
    field("lifeHistory", "locales.{locale}.fields.lifeHistory", "生活史", "Life history", "text", "optional", {
      localized: true,
    }),
    field(
      "ecologicalRole",
      "locales.{locale}.fields.ecologicalRole",
      "生态作用",
      "Ecological role",
      "text",
      "optional",
      { localized: true },
    ),
    field("feedingTraits", "locales.{locale}.fields.feedingTraits", "摄食特征", "Feeding traits", "text", "optional", {
      localized: true,
    }),
    field("researchFocus", "locales.{locale}.fields.researchFocus", "研究重点", "Research focus", "text", "optional", {
      localized: true,
    }),
    field("cultureFactors", "locales.{locale}.fields.cultureFactors", "培养因素", "Culture factors", "text", "optional", {
      localized: true,
    }),
    field("applications", "locales.{locale}.fields.applications", "应用", "Applications", "text", "optional", {
      localized: true,
    }),
    field("limitations", "locales.{locale}.fields.limitations", "限制说明", "Limitations", "text", "always", {
      localized: true,
    }),
  ],
};

const observationFields = {
  shared: [
    field(
      "observationStartedAt",
      "shared.observationStartedAt",
      "观测日期",
      "Observation time",
      "datetime",
      "always",
    ),
    field(
      "observationEndedAt",
      "shared.observationEndedAt",
      "观测结束时间",
      "Observation end time",
      "datetime",
      "optional",
    ),
    field("generalizedLocationLabel", "shared.generalizedLocationLabel", "地点", "Location", "group", "optional"),
    field("observationType", "shared.observationType", "观测类型", "Observation type", "enum", "always", {
      options: ["water-discoloration", "field-observation", "sample-analysis", "microscopy", "environmental-measurement", "other"],
    }),
    field("evidenceType", "shared.evidenceType", "证据类型", "Evidence type", "enum", "always", {
      options: ["visual", "sample", "microscopy", "instrumental", "combined"],
    }),
    field("observationStatus", "shared.observationStatus", "观测状态", "Observation status", "enum", "always", {
      options: ["preliminary", "under-review", "verified", "closed"],
    }),
    field("sampleStatus", "shared.sampleStatus", "样品状态", "Sample status", "enum", "always", {
      options: ["none", "collected", "processing", "verified", "archived"],
    }),
    field("locationPolicy", "shared.locationPolicy", "地点公开策略", "Location policy", "enum", "always", {
      options: ["hidden", "generalized", "exact-approved"],
    }),
    field("responsibleAuthorId", "shared.responsibleAuthorId", "负责作者", "Responsible author", "id", "optional"),
    field("disclosureStatus", "shared.disclosureStatus", "公开确认", "Disclosure status", "enum", "always", {
      options: ["pending", "approved"],
    }),
  ],
  localized: [
    field(
      "observedPhenomena",
      "locales.{locale}.fields.observedPhenomena",
      "观测现象",
      "Observed phenomena",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "environmentalContext",
      "locales.{locale}.fields.environmentalContext",
      "环境背景",
      "Environmental context",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "evidenceLimits",
      "locales.{locale}.fields.evidenceLimits",
      "证据限制",
      "Evidence limits",
      "text",
      "always",
      { localized: true },
    ),
    field("interpretation", "locales.{locale}.fields.interpretation", "解释", "Interpretation", "text", "optional", {
      localized: true,
    }),
    field("followUp", "locales.{locale}.fields.followUp", "后续行动", "Follow-up", "text", "optional", {
      localized: true,
    }),
    field(
      "officialInformationDisclaimer",
      "locales.{locale}.fields.officialInformationDisclaimer",
      "免责声明",
      "Disclaimer",
      "text",
      "always",
      { localized: true },
    ),
  ],
};

const articleFields = {
  shared: [
    field("articleKind", "shared.articleKind", "文章类型", "Article kind", "enum", "always", {
      options: ["foundation", "observation-guide", "method-explainer", "research-context"],
    }),
    field("publicationDate", "shared.publicationDate", "发布日期", "Publication date", "date", "always"),
    field("targetAudience", "shared.targetAudience", "目标读者", "Target audience", "enum", "always", {
      options: ["general", "students", "educators", "researchers"],
    }),
    field(
      "readingTimeMinutes",
      "shared.readingTimeMinutes",
      "阅读时长（分钟）",
      "Reading time (minutes)",
      "integer",
      "optional",
    ),
    field("references", "shared.references", "参考资料", "References", "reference-list", "optional"),
  ],
  localized: [
    field("topic", "locales.{locale}.fields.topic", "主题", "Topic", "text", "always", { localized: true }),
    field(
      "targetAudienceLabel",
      "locales.{locale}.fields.targetAudienceLabel",
      "目标读者说明",
      "Target audience label",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "categoryLabel",
      "locales.{locale}.fields.categoryLabel",
      "分类标签",
      "Category label",
      "text",
      "optional",
      { localized: true },
    ),
  ],
};

const memberFields = {
  shared: [
    field("authorId", "shared.authorId", "作者档案 ID", "Author profile ID", "id", "optional"),
    field("membershipStatus", "shared.membershipStatus", "成员状态", "Membership status", "enum", "always", {
      options: ["active", "alumni", "guest", "inactive"],
    }),
    field("roleCategory", "shared.roleCategory", "角色", "Role category", "enum", "always", {
      options: ["faculty", "researcher", "student", "technician", "collaborator", "other"],
    }),
    field("displayOrder", "shared.displayOrder", "显示顺序", "Display order", "integer", "always"),
    field("publicStartYear", "shared.publicStartYear", "公开起始年份", "Public start year", "integer", "optional"),
    field("publicEndYear", "shared.publicEndYear", "公开结束年份", "Public end year", "integer", "optional"),
    field(
      "profileDisclosure",
      "shared.profileDisclosure",
      "资料公开确认",
      "Profile disclosure",
      "enum",
      "always",
      { options: ["pending", "approved"] },
    ),
    field("portraitConsent", "shared.portraitConsent", "照片授权", "Portrait consent", "enum", "always", {
      options: ["not-applicable", "pending", "confirmed"],
    }),
    field(
      "publicContactEnabled",
      "shared.publicContactEnabled",
      "公开联系方式开关",
      "Public contact enabled",
      "boolean",
      "always",
      { defaultValue: false },
    ),
  ],
  localized: [
    field("displayName", "locales.{locale}.fields.displayName", "姓名", "Name", "text", "always", {
      localized: true,
    }),
    field("englishName", "locales.{locale}.fields.englishName", "英文名", "English name", "text", "optional", {
      localized: true,
    }),
    field("roleTitle", "locales.{locale}.fields.roleTitle", "角色", "Role", "text", "always", {
      localized: true,
    }),
    field("biography", "locales.{locale}.fields.biography", "简介", "Biography", "text", "always", {
      localized: true,
    }),
  ],
};

const collaborationFields = {
  shared: [
    field(
      "collaborationKind",
      "shared.collaborationKind",
      "合作类型",
      "Collaboration kind",
      "enum",
      "always",
      { options: ["area", "exchange", "case-study"] },
    ),
    field(
      "collaborationStatus",
      "shared.collaborationStatus",
      "合作状态",
      "Collaboration status",
      "enum",
      "always",
      { options: ["open-for-discussion", "case-by-case", "internal-only"] },
    ),
    field("startedAt", "shared.startedAt", "开始时间", "Start date", "date", "optional"),
    field("endedAt", "shared.endedAt", "结束时间", "End date", "date", "optional"),
    field(
      "publicAuthorization",
      "shared.publicAuthorization",
      "公开授权",
      "Public authorization",
      "enum",
      "always",
      { options: ["pending", "bilateral-approved", "not-required"] },
    ),
    field(
      "collaborationBoundary",
      "shared.collaborationBoundary",
      "合作边界",
      "Collaboration boundary",
      "enum",
      "always",
      { options: ["public-summary", "approved-details", "internal-only"] },
    ),
    field(
      "disclosureStatus",
      "shared.disclosureStatus",
      "公开确认",
      "Disclosure status",
      "enum",
      "always",
      { options: ["pending", "approved"] },
    ),
  ],
  localized: [
    field(
      "organizationName",
      "locales.{locale}.fields.organizationName",
      "单位",
      "Organization",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "suitablePartners",
      "locales.{locale}.fields.suitablePartners",
      "适合合作对象",
      "Suitable partners",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "possibleTopics",
      "locales.{locale}.fields.possibleTopics",
      "可合作主题",
      "Possible topics",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "partnerPreparation",
      "locales.{locale}.fields.partnerPreparation",
      "合作方准备",
      "Partner preparation",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "teamMayContribute",
      "locales.{locale}.fields.teamMayContribute",
      "团队可提供内容",
      "Team contribution",
      "text",
      "always",
      { localized: true },
    ),
    field("caveat", "locales.{locale}.fields.caveat", "合作边界说明", "Caveat", "text", "always", {
      localized: true,
    }),
    field(
      "processSummary",
      "locales.{locale}.fields.processSummary",
      "过程摘要",
      "Process summary",
      "text",
      "optional",
      { localized: true },
    ),
    field(
      "outcomeSummary",
      "locales.{locale}.fields.outcomeSummary",
      "成果摘要",
      "Outcome summary",
      "text",
      "optional",
      { localized: true },
    ),
  ],
};

const researchProfileFields = {
  shared: [
    field("routeKey", "shared.routeKey", "固定路由键", "Fixed route key", "enum", "always", {
      options: ["microalgae", "macroalgae", "live-feeds", "algal-blooms"],
    }),
    field("contentStatus", "shared.contentStatus", "内容状态", "Content status", "enum", "always", {
      options: ["active", "under-review", "archived"],
    }),
  ],
  localized: [
    field(
      "researchObjects",
      "locales.{locale}.fields.researchObjects",
      "研究对象",
      "Research objects",
      "text-list",
      "always",
      { localized: true },
    ),
    field(
      "typicalQuestions",
      "locales.{locale}.fields.typicalQuestions",
      "典型问题",
      "Typical questions",
      "text-list",
      "optional",
      { localized: true },
    ),
    field(
      "methodsAndMeasurements",
      "locales.{locale}.fields.methodsAndMeasurements",
      "方法与测量",
      "Methods and measurements",
      "text-list",
      "optional",
      { localized: true },
    ),
    field(
      "scopeCaveat",
      "locales.{locale}.fields.scopeCaveat",
      "范围边界",
      "Scope caveat",
      "text",
      "always",
      { localized: true },
    ),
    field(
      "resourcesAndConditions",
      "locales.{locale}.fields.resourcesAndConditions",
      "资源与条件",
      "Resources and conditions",
      "text",
      "optional",
      { localized: true },
    ),
  ],
};

export const contentTypeRegistry = {
  "team-news": {
    type: "team-news",
    label: { zh: "团队动态", en: "Team news" },
    routeFamily: "/[locale]/news/[id]",
    sectionPath: "/[locale]/news",
    creationPolicy: "open-after-verification",
    sharedFields: teamNewsFields.shared,
    localizedFields: teamNewsFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.participantAuthorIds[]", target: "author" },
      { path: "shared.coverMediaId", target: "media" },
      { path: "shared.galleryMediaIds[]", target: "media" },
      { path: "shared.relatedContentIds[]", target: "content" },
    ],
    defaultValues: {
      shared: { pinned: false, galleryMediaIds: [], relatedContentIds: [], participantAuthorIds: [], sources: [], disclosureStatus: "pending" },
      localized: { captions: {} },
    },
  },
  "research-output": {
    type: "research-output",
    label: { zh: "科研成果", en: "Research output" },
    routeFamily: "/[locale]/outputs/[id]",
    sectionPath: "/[locale]/outputs",
    creationPolicy: "open-after-verification",
    sharedFields: outputFields.shared,
    localizedFields: outputFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.contributorIds[]", target: "author" },
      { path: "shared.relatedProjectIds[]", target: "content", expectedContentTypes: ["research-project"] },
    ],
    defaultValues: { shared: { relatedProjectIds: [], verificationSources: [] }, localized: {} },
  },
  "research-project": {
    type: "research-project",
    label: { zh: "研究项目", en: "Research project" },
    routeFamily: "/[locale]/projects/[id]",
    sectionPath: "/[locale]/projects",
    creationPolicy: "code-owned-route",
    sharedFields: projectFields.shared,
    localizedFields: projectFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.leadAuthorId", target: "author" },
      { path: "shared.partnerAuthorIds[]", target: "author" },
      { path: "shared.relatedOutputIds[]", target: "content", expectedContentTypes: ["research-output"] },
      {
        path: "shared.relatedResearchProfileIds[]",
        target: "content",
        expectedContentTypes: ["research-profile"],
      },
      { path: "shared.mediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { partnerAuthorIds: [], fundingSources: [], relatedOutputIds: [], relatedResearchProfileIds: [], mediaIds: [] },
      localized: {},
    },
  },
  "learning-resource": {
    type: "learning-resource",
    label: { zh: "实验学习资源", en: "Learning resource" },
    routeFamily: "/[locale]/tutorials/[id]",
    sectionPath: "/[locale]/tutorials",
    creationPolicy: "open-after-verification",
    sharedFields: learningFields.shared,
    localizedFields: learningFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.relatedContentIds[]", target: "content" },
      { path: "shared.attachmentMediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { hazardLevel: "none", laboratoryReviewStatus: "pending", requiredApproverRoles: [], relatedInstrumentIds: [], relatedContentIds: [], attachmentMediaIds: [] },
      localized: { preCheck: [], materials: [], steps: [], commonParameters: [], commonErrors: [] },
    },
  },
  "algae-profile": {
    type: "algae-profile",
    label: { zh: "藻类图鉴", en: "Algae profile" },
    routeFamily: "/[locale]/algae/[id]",
    sectionPath: "/[locale]/algae",
    creationPolicy: "open-after-verification",
    sharedFields: algaeFields.shared,
    localizedFields: algaeFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      {
        path: "shared.relatedResearchProfileIds[]",
        target: "content",
        expectedContentTypes: ["research-profile"],
      },
      {
        path: "shared.relatedObservationIds[]",
        target: "content",
        expectedContentTypes: ["coastal-observation"],
      },
      { path: "shared.primaryMediaId", target: "media" },
      { path: "shared.galleryMediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { taxonomicIdentifiers: [], taxonomySources: [], identificationStatus: "unverified", identificationEvidence: [], samplingLocationPolicy: "hidden", relatedResearchProfileIds: [], relatedObservationIds: [], galleryMediaIds: [] },
      localized: {},
    },
  },
  "live-feed-profile": {
    type: "live-feed-profile",
    label: { zh: "生物饵料", en: "Live-feed profile" },
    routeFamily: "/[locale]/live-feeds/[id]",
    sectionPath: "/[locale]/live-feeds",
    creationPolicy: "open-after-verification",
    sharedFields: liveFeedFields.shared,
    localizedFields: liveFeedFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.relatedGuideIds[]", target: "content", expectedContentTypes: ["learning-resource"] },
      {
        path: "shared.relatedResearchProfileIds[]",
        target: "content",
        expectedContentTypes: ["research-profile"],
      },
      { path: "shared.relatedAlgaeIds[]", target: "content", expectedContentTypes: ["algae-profile"] },
      { path: "shared.relatedOutputIds[]", target: "content", expectedContentTypes: ["research-output"] },
      { path: "shared.primaryMediaId", target: "media" },
      { path: "shared.galleryMediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { relatedGuideIds: [], relatedResearchProfileIds: [], relatedAlgaeIds: [], relatedOutputIds: [], galleryMediaIds: [] },
      localized: {},
    },
  },
  "coastal-observation": {
    type: "coastal-observation",
    label: { zh: "赤潮与近岸观测", en: "Coastal observation" },
    routeFamily: "/[locale]/observations/[id]",
    sectionPath: "/[locale]/research/algal-blooms",
    creationPolicy: "code-owned-route",
    sharedFields: observationFields.shared,
    localizedFields: observationFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.responsibleAuthorId", target: "author" },
      { path: "shared.relatedProjectIds[]", target: "content", expectedContentTypes: ["research-project"] },
      { path: "shared.mediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { sampleStatus: "none", locationPolicy: "hidden", publicSampleIds: [], taxonomicObservationIds: [], dataSources: [], relatedProjectIds: [], mediaIds: [] },
      localized: {},
    },
  },
  "science-article": {
    type: "science-article",
    label: { zh: "科普文章", en: "Science article" },
    routeFamily: "/[locale]/insights/[id]",
    sectionPath: "/[locale]/insights",
    creationPolicy: "open-after-verification",
    sharedFields: articleFields.shared,
    localizedFields: articleFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.relatedContentIds[]", target: "content" },
      { path: "shared.coverMediaId", target: "media" },
    ],
    defaultValues: { shared: { references: [], relatedContentIds: [] }, localized: { takeaways: [] } },
  },
  "team-member": {
    type: "team-member",
    label: { zh: "团队成员", en: "Team member" },
    routeFamily: "/[locale]/team/[id]",
    sectionPath: "/[locale]/team",
    creationPolicy: "code-owned-route",
    sharedFields: memberFields.shared,
    localizedFields: memberFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.authorId", target: "author" },
      { path: "shared.portraitMediaId", target: "media" },
      {
        path: "shared.researchProfileIds[]",
        target: "content",
        expectedContentTypes: ["research-profile"],
      },
      { path: "shared.outputIds[]", target: "content", expectedContentTypes: ["research-output"] },
    ],
    defaultValues: {
      shared: { displayOrder: 0, profileDisclosure: "pending", portraitConsent: "pending", publicContactEnabled: false, researchProfileIds: [], outputIds: [] },
      localized: { interests: [], publicLinks: [] },
    },
  },
  collaboration: {
    type: "collaboration",
    label: { zh: "合作与交流", en: "Collaboration" },
    routeFamily: "/[locale]/collaboration/[id]",
    sectionPath: "/[locale]/collaboration",
    creationPolicy: "fixed-allowlist",
    sharedFields: collaborationFields.shared,
    localizedFields: collaborationFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      { path: "shared.partnerOrganizationIds[]", target: "author" },
      {
        path: "shared.relatedResearchProfileIds[]",
        target: "content",
        expectedContentTypes: ["research-profile"],
      },
      { path: "shared.relatedContentIds[]", target: "content" },
      { path: "shared.mediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { partnerOrganizationIds: [], publicAuthorization: "pending", collaborationBoundary: "internal-only", disclosureStatus: "pending", relatedResearchProfileIds: [], relatedContentIds: [], mediaIds: [] },
      localized: {},
    },
  },
  "research-profile": {
    type: "research-profile",
    label: { zh: "研究方向与能力说明", en: "Research profile" },
    routeFamily: "/[locale]/research/[id]",
    sectionPath: "/[locale]/research",
    creationPolicy: "fixed-allowlist",
    fixedIds: ["microalgae", "macroalgae", "live-feeds", "algal-blooms"],
    sharedFields: researchProfileFields.shared,
    localizedFields: researchProfileFields.localized,
    references: [
      { path: "authors[]", target: "author" },
      {
        path: "shared.relatedCollaborationIds[]",
        target: "content",
        expectedContentTypes: ["collaboration"],
      },
      { path: "shared.mediaIds[]", target: "media" },
    ],
    defaultValues: {
      shared: { contentStatus: "under-review", routeRegistered: true, relatedCollaborationIds: [], mediaIds: [] },
      localized: { researchObjects: [], typicalQuestions: [], methodsAndMeasurements: [] },
    },
  },
} as const satisfies Record<ContentType, ContentTypeDefinition>;

export function getFieldRegistry(type: ContentType): {
  common: readonly FieldDefinition[];
  shared: readonly FieldDefinition[];
  localized: readonly FieldDefinition[];
} {
  const definition = contentTypeRegistry[type];
  return {
    common: commonFieldRegistry,
    shared: definition.sharedFields,
    localized: definition.localizedFields,
  };
}

export function createRecordDraftDefaults(
  type: ContentType,
  id: string,
  now: string,
): Record<string, unknown> {
  const definition = contentTypeRegistry[type];
  const date = now.slice(0, 10);

  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id,
    type,
    createdAt: now,
    updatedAt: now,
    authors: [],
    tags: [],
    media: [],
    shared: structuredClone(definition.defaultValues.shared),
    locales: {
      zh: {
        state: "draft",
        title: "",
        summary: "",
        fields: structuredClone(definition.defaultValues.localized),
        translationOrigin: "source-authored",
        review: {
          status: "draft",
          updatedAt: date,
          version: "0.1",
          reviewerIds: [],
          references: [],
        },
      },
      en: { state: "missing" },
    },
  };
}
