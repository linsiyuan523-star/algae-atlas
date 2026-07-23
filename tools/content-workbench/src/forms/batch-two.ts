import {
  algaeProfileRecordSchema,
  coastalObservationRecordSchema,
  getFieldRegistry,
  learningResourceRecordSchema,
  liveFeedProfileRecordSchema,
  researchProfileRecordSchema,
} from "@algae-atlas/content-schema";
import type {
  ContentType,
  FieldDefinition,
} from "@algae-atlas/content-schema";
import type { RecordDraft } from "../schema-drafts";
import type { ContentFormAdapter } from "./content-forms";
import { FORM_ERROR_KEY, validateFormValues } from "./form-engine";
import type {
  FormFieldDefinition,
  FormOption,
  FormSchemaDefinition,
  FormValues,
} from "./form-engine";

export const BATCH_TWO_CONTENT_TYPES = [
  "learning-resource",
  "algae-profile",
  "live-feed-profile",
  "coastal-observation",
  "research-profile",
] as const;

export type BatchTwoContentType = (typeof BATCH_TWO_CONTENT_TYPES)[number];

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

type BindingMode =
  | "string"
  | "string-list"
  | "first-string"
  | "localized-zh";

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
  contentType: BatchTwoContentType;
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
  resourceKind: {
    "instrument-tutorial": "仪器教程",
    "beginner-guide": "入门指南",
    "record-template": "记录模板",
    "safety-note": "安全说明",
  },
  targetAudience: {
    general: "公众",
    students: "学生",
    "laboratory-members": "实验室成员",
    researchers: "研究人员",
  },
  hazardLevel: {
    none: "无",
    low: "低",
    moderate: "中",
    high: "高",
  },
  laboratoryReviewStatus: {
    "not-required": "无需审核",
    pending: "待审核",
    reviewed: "已审核",
  },
  taxonomicRank: {
    kingdom: "界",
    phylum: "门",
    class: "纲",
    order: "目",
    family: "科",
    genus: "属",
    species: "种",
    group: "类群",
  },
  taxonomicLevel: {
    phylum: "门",
    class: "纲",
    order: "目",
    family: "科",
    genus: "属",
    species: "种",
    group: "类群",
  },
  environmentKinds: {
    freshwater: "淡水",
    marine: "海水",
    brackish: "半咸水",
    "terrestrial-moist": "陆生或湿润环境",
    extreme: "极端环境",
  },
  profileCategory: {
    microalgae: "微藻",
    macroalgae: "大型海藻",
    cyanobacteria: "蓝细菌",
    other: "其他",
  },
  identificationStatus: {
    unverified: "未核验",
    provisional: "暂定",
    verified: "已核验",
    limited: "鉴定受限",
  },
  samplingLocationPolicy: {
    hidden: "隐藏",
    generalized: "概化",
    "exact-approved": "精确地点已批准",
  },
  category: {
    microalgae: "微藻",
    rotifer: "轮虫",
    copepod: "桡足类",
    cladoceran: "枝角类",
    other: "其他",
  },
  cultureDisclosureBoundary: {
    "public-overview": "公开概述",
    "reviewed-procedure": "经审核流程",
    "internal-only": "仅内部",
  },
  identificationConfidence: {
    low: "低",
    medium: "中",
    high: "高",
    confirmed: "已确认",
  },
  observationType: {
    "water-discoloration": "水色异常",
    "field-observation": "现场观测",
    "sample-analysis": "样品分析",
    microscopy: "显微观察",
    "environmental-measurement": "环境测量",
    other: "其他",
  },
  evidenceType: {
    visual: "目视",
    sample: "样品",
    microscopy: "显微镜",
    instrumental: "仪器",
    combined: "综合证据",
  },
  observationStatus: {
    preliminary: "初步",
    "under-review": "审核中",
    verified: "已核验",
    closed: "已结束",
  },
  sampleStatus: {
    none: "无样品",
    collected: "已采集",
    processing: "处理中",
    verified: "已核验",
    archived: "已归档",
  },
  locationPolicy: {
    hidden: "隐藏",
    generalized: "概化",
    "exact-approved": "精确地点已批准",
  },
  disclosureStatus: {
    pending: "待确认",
    approved: "已确认",
  },
  routeKey: {
    microalgae: "微藻",
    macroalgae: "大型海藻",
    "live-feeds": "生物饵料",
    "algal-blooms": "藻华与赤潮",
  },
  contentStatus: {
    active: "有效",
    "under-review": "审核中",
    archived: "已归档",
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
  type: BatchTwoContentType,
  key: string,
  control: FormFieldDefinition["control"],
  options: BindingOptions = {},
): FieldBinding {
  const definition = registeredDefinition(type, key);
  const {
    recordPath = definition.path.replace("{locale}", "zh"),
    mode = control === "text-list" ? "string-list" : "string",
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
  type: BatchTwoContentType,
  key: keyof typeof optionLabels,
  options: BindingOptions = {},
) {
  const definition = registeredDefinition(type, key);
  return registeredBinding(type, key, "enum", {
    options: registeredOptions(definition, optionLabels[key]),
    ...options,
  });
}

function primaryEnumBinding(
  type: BatchTwoContentType,
  key: keyof typeof optionLabels,
  label: string,
) {
  const definition = registeredDefinition(type, key);
  return registeredBinding(type, key, "enum", {
    label,
    path: `${definition.path}[0]`,
    recordPath: definition.path,
    mode: "first-string",
    options: registeredOptions(definition, optionLabels[key]),
  });
}

function localizedZhBinding(
  type: BatchTwoContentType,
  key: string,
  label: string,
) {
  const definition = registeredDefinition(type, key);
  return registeredBinding(type, key, "text", {
    id: `${key}Zh`,
    label,
    path: `${definition.path}.zh`,
    recordPath: definition.path,
    mode: "localized-zh",
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
    contentType: "learning-resource",
    label: "实验学习资源字段",
    recordSchema: learningResourceRecordSchema,
    defaults: {
      hazardLevel: "none",
      laboratoryReviewStatus: "pending",
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("learning-resource", "instrumentOrTopic", "text"),
          registeredBinding("learning-resource", "audience", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "purpose", "textarea", { rows: 4 }),
          registeredBinding("learning-resource", "prerequisites", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "applicableExperiments", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "preCheck", "text-list", { rows: 4 }),
          registeredBinding("learning-resource", "materials", "text-list", { rows: 4 }),
          registeredBinding("learning-resource", "steps", "text-list", { rows: 6 }),
          registeredBinding("learning-resource", "commonParameters", "text-list", { rows: 4 }),
          registeredBinding("learning-resource", "dataExport", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "cleaningAndShutdown", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "commonErrors", "text-list", { rows: 4 }),
          registeredBinding("learning-resource", "safetyNotice", "textarea", { rows: 4 }),
          registeredBinding("learning-resource", "administration", "textarea", { rows: 3 }),
          registeredBinding("learning-resource", "disclaimer", "textarea", { rows: 4 }),
        ],
      },
      {
        id: "resource-details",
        label: "资源信息",
        bindings: [
          enumBinding("learning-resource", "resourceKind"),
          enumBinding("learning-resource", "targetAudience"),
          enumBinding("learning-resource", "hazardLevel"),
          enumBinding("learning-resource", "laboratoryReviewStatus"),
          registeredBinding("learning-resource", "version", "text", {
            placeholder: "1.0",
          }),
        ],
      },
    ],
  },
  {
    contentType: "algae-profile",
    label: "藻类图鉴字段",
    recordSchema: algaeProfileRecordSchema,
    defaults: {
      identificationStatus: "unverified",
      samplingLocationPolicy: "hidden",
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("algae-profile", "commonName", "text"),
          registeredBinding("algae-profile", "categoryLabel", "text"),
          registeredBinding("algae-profile", "habitat", "textarea", { rows: 4 }),
          registeredBinding("algae-profile", "morphology", "textarea", { rows: 4 }),
          registeredBinding("algae-profile", "researchFocus", "textarea", { rows: 3 }),
          registeredBinding("algae-profile", "identificationLimitations", "textarea", { rows: 4 }),
          registeredBinding("algae-profile", "observationGuidance", "textarea", { rows: 3 }),
          registeredBinding("algae-profile", "referencesNote", "textarea", { rows: 3 }),
          localizedZhBinding("algae-profile", "samplingLocationLabel", "采样地点（中文）"),
        ],
      },
      {
        id: "taxonomy-details",
        label: "分类与鉴定",
        bindings: [
          registeredBinding("algae-profile", "scientificName", "text"),
          enumBinding("algae-profile", "taxonomicRank"),
          primaryEnumBinding("algae-profile", "environmentKinds", "主要环境类型"),
          enumBinding("algae-profile", "profileCategory"),
          enumBinding("algae-profile", "identificationStatus"),
          enumBinding("algae-profile", "samplingLocationPolicy"),
        ],
      },
    ],
  },
  {
    contentType: "live-feed-profile",
    label: "生物饵料字段",
    recordSchema: liveFeedProfileRecordSchema,
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("live-feed-profile", "name", "text"),
          registeredBinding("live-feed-profile", "overview", "textarea", { rows: 4 }),
          registeredBinding("live-feed-profile", "environment", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "morphology", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "lifeHistory", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "ecologicalRole", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "feedingTraits", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "researchFocus", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "cultureFactors", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "applications", "textarea", { rows: 3 }),
          registeredBinding("live-feed-profile", "limitations", "textarea", { rows: 4 }),
        ],
      },
      {
        id: "identity-details",
        label: "身份与公开边界",
        bindings: [
          registeredBinding("live-feed-profile", "scientificGroup", "text"),
          enumBinding("live-feed-profile", "taxonomicLevel"),
          enumBinding("live-feed-profile", "category"),
          primaryEnumBinding("live-feed-profile", "environmentKinds", "主要水环境类型"),
          enumBinding("live-feed-profile", "cultureDisclosureBoundary"),
          enumBinding("live-feed-profile", "identificationConfidence"),
        ],
      },
    ],
  },
  {
    contentType: "coastal-observation",
    label: "赤潮与近岸观测字段",
    recordSchema: coastalObservationRecordSchema,
    defaults: {
      sampleStatus: "none",
      locationPolicy: "hidden",
      disclosureStatus: "pending",
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("coastal-observation", "observedPhenomena", "textarea", { rows: 4 }),
          registeredBinding("coastal-observation", "environmentalContext", "textarea", { rows: 3 }),
          registeredBinding("coastal-observation", "evidenceLimits", "textarea", { rows: 4 }),
          registeredBinding("coastal-observation", "interpretation", "textarea", { rows: 3 }),
          registeredBinding("coastal-observation", "followUp", "textarea", { rows: 3 }),
          registeredBinding("coastal-observation", "officialInformationDisclaimer", "textarea", { rows: 4 }),
          localizedZhBinding("coastal-observation", "generalizedLocationLabel", "公开地点（中文）"),
        ],
      },
      {
        id: "observation-details",
        label: "观测信息",
        bindings: [
          registeredBinding("coastal-observation", "observationStartedAt", "datetime", {
            placeholder: "2026-07-23T08:00:00+08:00",
          }),
          registeredBinding("coastal-observation", "observationEndedAt", "datetime", {
            placeholder: "2026-07-23T09:00:00+08:00",
          }),
          enumBinding("coastal-observation", "observationType"),
          enumBinding("coastal-observation", "evidenceType"),
          enumBinding("coastal-observation", "observationStatus"),
          enumBinding("coastal-observation", "sampleStatus"),
          enumBinding("coastal-observation", "locationPolicy"),
          registeredBinding("coastal-observation", "responsibleAuthorId", "author-reference", {
            placeholder: "author-id",
          }),
          enumBinding("coastal-observation", "disclosureStatus"),
        ],
      },
    ],
  },
  {
    contentType: "research-profile",
    label: "研究方向与能力说明字段",
    recordSchema: researchProfileRecordSchema,
    defaults: {
      contentStatus: "under-review",
    },
    sections: [
      {
        id: "localized-content",
        label: "中文内容",
        bindings: [
          summaryBinding(),
          registeredBinding("research-profile", "researchObjects", "text-list", { rows: 4 }),
          registeredBinding("research-profile", "typicalQuestions", "text-list", { rows: 4 }),
          registeredBinding("research-profile", "methodsAndMeasurements", "text-list", { rows: 4 }),
          registeredBinding("research-profile", "resourcesAndConditions", "textarea", { rows: 4 }),
          registeredBinding("research-profile", "scopeCaveat", "textarea", { rows: 4 }),
        ],
      },
      {
        id: "profile-details",
        label: "固定研究方向",
        bindings: [
          enumBinding("research-profile", "routeKey"),
          enumBinding("research-profile", "contentStatus"),
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
      ...Object.fromEntries(bindings.map((binding) => [binding.field.id, ""])),
      ...config.defaults,
    };
  }

  function validate(recordDraft: unknown, values: FormValues) {
    const errors = validateFormValues(schema, values);
    const candidate = applyBindings(recordDraft, bindings, values);
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
      return { values, errors: validate(recordDraft, values).errors };
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
    const text = typeof value === "string" ? value.trim() : "";

    if (binding.mode === "string-list") {
      setPath(candidate, binding.recordPath, textList(value));
    } else if (binding.mode === "first-string") {
      const current = getPath(candidate, binding.recordPath);
      const items = Array.isArray(current)
        ? current.filter((item): item is string => typeof item === "string")
        : [];
      setPath(
        candidate,
        binding.recordPath,
        text
          ? [text, ...items.slice(1).filter((item) => item !== text)]
          : items.slice(1),
      );
    } else if (binding.mode === "localized-zh") {
      if (text) {
        const current = asRecord(getPath(candidate, binding.recordPath)) ?? {};
        setPath(candidate, binding.recordPath, { ...current, zh: text });
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
  if (binding.mode === "string-list") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").join("\n")
      : "";
  }
  if (binding.mode === "first-string") {
    return Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";
  }
  if (binding.mode === "localized-zh") {
    const localized = asRecord(value);
    return typeof localized?.zh === "string" ? localized.zh : "";
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
        issuePath.startsWith(`${binding.recordPath}.`) ||
        (binding.mode === "localized-zh" &&
          binding.recordPath.startsWith(`${issuePath}.`)),
    )?.field.id;
}

function textList(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
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

export const batchTwoFormAdapters = Object.fromEntries(
  configs.map((config) => [config.contentType, createAdapter(config)]),
) as Record<BatchTwoContentType, ContentFormAdapter>;

export const batchTwoFormSchemas = Object.fromEntries(
  BATCH_TWO_CONTENT_TYPES.map((type) => [
    type,
    batchTwoFormAdapters[type].schema,
  ]),
) as Record<BatchTwoContentType, FormSchemaDefinition>;
