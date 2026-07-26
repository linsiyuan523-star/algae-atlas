import {
  collaborationRecordSchema,
  getFieldRegistry,
  researchOutputRecordSchema,
  researchProjectRecordSchema,
  scienceArticleRecordSchema,
  teamMemberRecordSchema,
} from "@algae-atlas/content-schema";
import type {
  ContentType,
  FieldDefinition,
} from "@algae-atlas/content-schema";
import type { RecordDraft } from "../schema-drafts";
import type { ContentFormAdapter } from "./content-forms";
import {
  FORM_ERROR_KEY,
  validateFormValues,
} from "./form-engine";
import type {
  FormFieldDefinition,
  FormOption,
  FormSchemaDefinition,
  FormValidationMode,
  FormValues,
} from "./form-engine";

export const BATCH_ONE_CONTENT_TYPES = [
  "research-output",
  "research-project",
  "science-article",
  "collaboration",
  "team-member",
] as const;

export type BatchOneContentType = (typeof BATCH_ONE_CONTENT_TYPES)[number];

type RecordSchema = {
  safeParse(value: unknown):
    | { success: true; data: unknown }
    | {
        success: false;
        error: {
          issues: readonly {
            path: readonly PropertyKey[];
            message: string;
          }[];
        };
      };
};

type BindingMode = "string" | "boolean" | "integer" | "first-id";

type FieldBinding = {
  field: FormFieldDefinition;
  recordPath: string;
  mode: BindingMode;
};

type BindingOptions = Partial<FormFieldDefinition> & {
  recordPath?: string;
  mode?: BindingMode;
};

type AdapterConfig = {
  contentType: BatchOneContentType;
  label: string;
  recordSchema: RecordSchema;
  sections: readonly {
    id: string;
    label: string;
    bindings: readonly FieldBinding[];
  }[];
  defaults?: FormValues;
};

const optionLabels = {
  outputKind: {
    publication: "论文",
    patent: "专利",
    dataset: "数据集",
    software: "软件",
    "student-research": "学生科研成果",
  },
  venueKind: {
    journal: "期刊",
    conference: "会议",
    "patent-office": "专利机构",
    repository: "数据或软件仓库",
    other: "其他",
  },
  identifierKind: {
    doi: "DOI",
    isbn: "ISBN",
    patent: "专利号",
    accession: "登录号",
    url: "URL",
    other: "其他",
  },
  outputStatus: {
    published: "已发表",
    accepted: "已接收",
    granted: "已授权",
    released: "已发布",
    pending: "待确认",
  },
  projectKind: {
    funded: "资助项目",
    internal: "内部项目",
    student: "学生项目",
    collaborative: "合作项目",
    "field-observation": "野外观测",
  },
  projectStatus: {
    planned: "计划中",
    active: "进行中",
    completed: "已完成",
    suspended: "已暂停",
    cancelled: "已取消",
  },
  publicScope: {
    public: "公开",
    "summary-only": "仅公开摘要",
    internal: "仅内部",
  },
  disclosureStatus: {
    pending: "待确认",
    approved: "已确认",
  },
  articleKind: {
    foundation: "基础知识",
    "observation-guide": "观察指南",
    "method-explainer": "方法解读",
    "research-context": "研究背景",
  },
  targetAudience: {
    general: "公众",
    students: "学生",
    educators: "教育工作者",
    researchers: "研究人员",
  },
  membershipStatus: {
    active: "在队",
    alumni: "校友",
    guest: "访问成员",
    inactive: "不活跃",
  },
  roleCategory: {
    faculty: "教师",
    researcher: "研究人员",
    student: "学生",
    technician: "技术人员",
    collaborator: "合作成员",
    other: "其他",
  },
  profileDisclosure: {
    pending: "待确认",
    approved: "已确认",
  },
  portraitConsent: {
    "not-applicable": "不适用",
    pending: "待确认",
    confirmed: "已确认",
  },
  collaborationKind: {
    area: "合作领域",
    exchange: "交流活动",
    "case-study": "合作案例",
  },
  collaborationStatus: {
    "open-for-discussion": "开放洽谈",
    "case-by-case": "逐项评估",
    "internal-only": "仅内部",
  },
  publicAuthorization: {
    pending: "待确认",
    "bilateral-approved": "双方已授权",
    "not-required": "无需授权",
  },
  collaborationBoundary: {
    "public-summary": "公开摘要",
    "approved-details": "经批准的详情",
    "internal-only": "仅内部",
  },
} satisfies Record<string, Record<string, string>>;

function summaryBinding(): FieldBinding {
  return {
    field: {
      id: "summaryZh",
      path: "locales.zh.summary",
      label: "中文摘要",
      control: "textarea",
      required: true,
      rows: 4,
    },
    recordPath: "locales.zh.summary",
    mode: "string",
  };
}

function registeredDefinition(type: ContentType, key: string) {
  const registry = getFieldRegistry(type);
  const definition = [
    ...registry.common,
    ...registry.shared,
    ...registry.localized,
  ].find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error(`${type} 字段注册表缺少 ${key}。`);
  }
  return definition;
}

function registeredBinding(
  type: BatchOneContentType,
  key: string,
  control: FormFieldDefinition["control"],
  options: BindingOptions = {},
): FieldBinding {
  const definition = registeredDefinition(type, key);
  const {
    recordPath = definition.path.replace("{locale}", "zh"),
    mode = control === "boolean" ? "boolean" : "string",
    ...fieldOverrides
  } = options;
  return {
    field: {
      id: definition.key,
      path: recordPath,
      label: definition.label.zh,
      control,
      required: definition.requirement === "always",
      ...fieldOverrides,
    },
    recordPath,
    mode,
  };
}

function enumBinding(
  type: BatchOneContentType,
  key: keyof typeof optionLabels,
) {
  const definition = registeredDefinition(type, key);
  return registeredBinding(type, key, "enum", {
    options: registeredOptions(definition, optionLabels[key]),
  });
}

function registeredOptions(
  definition: FieldDefinition,
  labels: Record<string, string>,
): readonly FormOption[] {
  if (!definition.options?.length) {
    throw new Error(`枚举字段 ${definition.key} 缺少选项。`);
  }
  return definition.options.map((value) => ({
    value,
    label: labels[value] ?? value,
  }));
}

const configs: readonly AdapterConfig[] = [
  {
    contentType: "research-output",
    label: "科研成果字段",
    recordSchema: researchOutputRecordSchema,
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("research-output", "citationNote", "textarea", { rows: 3 }),
          registeredBinding("research-output", "contributionNote", "textarea", { rows: 3 }),
          registeredBinding("research-output", "description", "textarea", { rows: 4 }),
        ],
      },
      {
        id: "output-details",
        label: "成果信息",
        bindings: [
          enumBinding("research-output", "outputKind"),
          registeredBinding("research-output", "year", "number", {
            mode: "integer",
            min: 1900,
            max: 2100,
            step: 1,
          }),
          registeredBinding("research-output", "publicationDate", "date"),
          enumBinding("research-output", "venueKind"),
          registeredBinding("research-output", "venueName", "text"),
          enumBinding("research-output", "identifierKind"),
          registeredBinding("research-output", "identifierValue", "text"),
          registeredBinding("research-output", "canonicalUrl", "url", {
            placeholder: "https://",
          }),
          enumBinding("research-output", "outputStatus"),
        ],
      },
      {
        id: "contributors",
        label: "责任信息",
        bindings: [
          registeredBinding("research-output", "contributorIds", "author-reference", {
            id: "contributorId",
            path: "shared.contributorIds[0]",
            recordPath: "shared.contributorIds",
            mode: "first-id",
            label: "主要贡献者稳定 ID",
            placeholder: "author-id",
          }),
        ],
      },
    ],
  },
  {
    contentType: "research-project",
    label: "研究项目字段",
    recordSchema: researchProjectRecordSchema,
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("research-project", "objectives", "textarea", { rows: 4 }),
          registeredBinding("research-project", "methodsOverview", "textarea", { rows: 3 }),
          registeredBinding("research-project", "publicProgress", "textarea", { rows: 3 }),
          registeredBinding("research-project", "outcomes", "textarea", { rows: 3 }),
        ],
      },
      {
        id: "project-details",
        label: "项目信息",
        bindings: [
          enumBinding("research-project", "projectKind"),
          enumBinding("research-project", "projectStatus"),
          registeredBinding("research-project", "publicProjectCode", "text"),
          registeredBinding("research-project", "leadAuthorId", "author-reference", {
            placeholder: "author-id",
          }),
          registeredBinding("research-project", "startDate", "date"),
          registeredBinding("research-project", "endDate", "date"),
          enumBinding("research-project", "publicScope"),
          enumBinding("research-project", "disclosureStatus"),
        ],
      },
    ],
  },
  {
    contentType: "science-article",
    label: "科普文章字段",
    recordSchema: scienceArticleRecordSchema,
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("science-article", "topic", "text"),
          registeredBinding("science-article", "targetAudienceLabel", "text"),
          registeredBinding("science-article", "categoryLabel", "text"),
        ],
      },
      {
        id: "article-details",
        label: "文章信息",
        bindings: [
          enumBinding("science-article", "articleKind"),
          registeredBinding("science-article", "publicationDate", "date"),
          enumBinding("science-article", "targetAudience"),
          registeredBinding("science-article", "readingTimeMinutes", "number", {
            mode: "integer",
            min: 1,
            max: 180,
            step: 1,
          }),
        ],
      },
    ],
  },
  {
    contentType: "collaboration",
    label: "合作与交流字段",
    recordSchema: collaborationRecordSchema,
    defaults: {
      publicAuthorization: "pending",
      collaborationBoundary: "internal-only",
      disclosureStatus: "pending",
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("collaboration", "organizationName", "text"),
          registeredBinding("collaboration", "suitablePartners", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "possibleTopics", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "partnerPreparation", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "teamMayContribute", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "caveat", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "processSummary", "textarea", { rows: 3 }),
          registeredBinding("collaboration", "outcomeSummary", "textarea", { rows: 3 }),
        ],
      },
      {
        id: "collaboration-details",
        label: "合作信息",
        bindings: [
          enumBinding("collaboration", "collaborationKind"),
          enumBinding("collaboration", "collaborationStatus"),
          registeredBinding("collaboration", "startedAt", "date"),
          registeredBinding("collaboration", "endedAt", "date"),
          enumBinding("collaboration", "publicAuthorization"),
          enumBinding("collaboration", "collaborationBoundary"),
          enumBinding("collaboration", "disclosureStatus"),
        ],
      },
    ],
  },
  {
    contentType: "team-member",
    label: "团队成员字段",
    recordSchema: teamMemberRecordSchema,
    defaults: {
      displayOrder: "0",
      profileDisclosure: "pending",
      portraitConsent: "pending",
      publicContactEnabled: false,
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("team-member", "displayName", "text"),
          registeredBinding("team-member", "englishName", "text"),
          registeredBinding("team-member", "roleTitle", "text"),
          registeredBinding("team-member", "biography", "textarea", { rows: 5 }),
        ],
      },
      {
        id: "member-details",
        label: "成员信息",
        bindings: [
          registeredBinding("team-member", "authorId", "author-reference", {
            placeholder: "author-id",
          }),
          enumBinding("team-member", "membershipStatus"),
          enumBinding("team-member", "roleCategory"),
          registeredBinding("team-member", "displayOrder", "number", {
            mode: "integer",
            min: 0,
            step: 1,
          }),
          registeredBinding("team-member", "publicStartYear", "number", {
            mode: "integer",
            min: 1900,
            max: 2100,
            step: 1,
          }),
          registeredBinding("team-member", "publicEndYear", "number", {
            mode: "integer",
            min: 1900,
            max: 2100,
            step: 1,
          }),
          enumBinding("team-member", "profileDisclosure"),
          enumBinding("team-member", "portraitConsent"),
          registeredBinding("team-member", "publicContactEnabled", "boolean"),
        ],
      },
    ],
  },
];

function createAdapter(config: AdapterConfig): ContentFormAdapter {
  const bindings = config.sections.flatMap((section) => section.bindings);
  const schema: FormSchemaDefinition = {
    id: config.contentType,
    label: config.label,
    sections: config.sections.map((section) => ({
      id: section.id,
      label: section.label,
      fields: section.bindings.map((binding) => binding.field),
    })),
  };

  function emptyValues(): FormValues {
    return {
      ...Object.fromEntries(
        bindings.map((binding) => [
          binding.field.id,
          binding.mode === "boolean" ? false : "",
        ]),
      ),
      ...config.defaults,
    };
  }

  function validate(
    recordDraft: unknown,
    values: FormValues,
    mode: FormValidationMode = "publish",
  ) {
    const errors = validateFormValues(schema, values, mode);
    const candidate = applyBindings(recordDraft, bindings, values);
    if (mode === "draft") {
      return Object.values(errors).some(Boolean)
        ? { success: false as const, errors }
        : {
            success: true as const,
            recordDraft: candidate as RecordDraft,
            errors: {},
          };
    }

    const parsed = config.recordSchema.safeParse(candidate);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const fieldId = fieldIdForIssue(bindings, issue.path);
        if (fieldId) {
          errors[fieldId] ??= issue.message;
        } else {
          const issuePath = issue.path.map(String).join(".") || "根结构";
          errors[FORM_ERROR_KEY] ??=
            `${config.label}包含当前表单不支持或无法映射的字段：${issuePath}。`;
        }
      }
    }

    if (Object.values(errors).some(Boolean) || !parsed.success) {
      return { success: false as const, errors };
    }

    return {
      success: true as const,
      recordDraft: parsed.data as RecordDraft,
      errors: {},
    };
  }

  return {
    contentType: config.contentType,
    schema,
    emptyValues,
    inspect(recordDraft) {
      const record = asRecord(recordDraft);
      const values = emptyValues();
      if (record?.type === config.contentType) {
        for (const binding of bindings) {
          values[binding.field.id] = readBinding(record, binding);
        }
      }
      return { values, errors: validate(recordDraft, values, "draft").errors };
    },
    validate,
  };
}

function applyBindings(
  recordDraft: unknown,
  bindings: readonly FieldBinding[],
  values: FormValues,
) {
  const candidate = structuredClone(asRecord(recordDraft) ?? {});
  for (const binding of bindings) {
    const value = values[binding.field.id];
    if (binding.mode === "boolean") {
      setPath(candidate, binding.recordPath, value === true);
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (binding.mode === "first-id") {
      const current = getPath(candidate, binding.recordPath);
      const ids = Array.isArray(current)
        ? current.filter((item): item is string => typeof item === "string")
        : [];
      setPath(
        candidate,
        binding.recordPath,
        text
          ? [text, ...ids.slice(1).filter((item) => item !== text)]
          : ids.slice(1),
      );
    } else if (binding.mode === "integer") {
      if (text) {
        setPath(candidate, binding.recordPath, Number(text));
      } else {
        deletePath(candidate, binding.recordPath);
      }
    } else if (text || binding.field.required) {
      setPath(candidate, binding.recordPath, text);
    } else {
      deletePath(candidate, binding.recordPath);
    }
  }
  return candidate;
}

function readBinding(record: Record<string, unknown>, binding: FieldBinding) {
  const value = getPath(record, binding.recordPath);
  if (binding.mode === "boolean") {
    return value === true;
  }
  if (binding.mode === "first-id") {
    return Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
  }
  if (binding.mode === "integer") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  }
  return typeof value === "string" ? value : "";
}

function fieldIdForIssue(
  bindings: readonly FieldBinding[],
  path: readonly PropertyKey[],
) {
  const issuePath = path.map(String).join(".");
  return [...bindings]
    .sort((left, right) => right.recordPath.length - left.recordPath.length)
    .find(
      (binding) =>
        issuePath === binding.recordPath ||
        issuePath.startsWith(`${binding.recordPath}.`),
    )?.field.id;
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  let current: unknown = record;
  for (const segment of path.split(".")) {
    const object = asRecord(current);
    if (!object) {
      return undefined;
    }
    current = object[segment];
  }
  return current;
}

function setPath(
  record: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const segments = path.split(".");
  let current = record;
  for (const segment of segments.slice(0, -1)) {
    const existing = asRecord(current[segment]);
    if (existing) {
      current = existing;
    } else {
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    }
  }
  const key = segments.at(-1);
  if (key) {
    current[key] = value;
  }
}

function deletePath(record: Record<string, unknown>, path: string) {
  const segments = path.split(".");
  let current: Record<string, unknown> | null = record;
  for (const segment of segments.slice(0, -1)) {
    current = asRecord(current?.[segment]);
    if (!current) {
      return;
    }
  }
  const key = segments.at(-1);
  if (key) {
    delete current[key];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export const batchOneFormAdapters = Object.fromEntries(
  configs.map((config) => [config.contentType, createAdapter(config)]),
) as Record<BatchOneContentType, ContentFormAdapter>;

export const batchOneFormSchemas = Object.fromEntries(
  BATCH_ONE_CONTENT_TYPES.map((type) => [
    type,
    batchOneFormAdapters[type].schema,
  ]),
) as Record<BatchOneContentType, FormSchemaDefinition>;
