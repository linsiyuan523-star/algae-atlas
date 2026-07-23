import {
  getFieldRegistry,
  isIsoDate,
  stableIdSchema,
  teamNewsRecordSchema,
} from "@algae-atlas/content-schema";
import type { FieldDefinition } from "@algae-atlas/content-schema";
import type { RecordDraft } from "../schema-drafts";
import {
  FORM_ERROR_KEY,
  validateFormValues,
} from "./form-engine";
import type {
  FormErrors,
  FormFieldDefinition,
  FormOption,
  FormSchemaDefinition,
  FormValues,
} from "./form-engine";

export type TeamNewsFormValues = FormValues & {
  summaryZh: string;
  locationZh: string;
  participantDescription: string;
  eventDate: string;
  endDate: string;
  category: string;
  pinned: boolean;
  authorId: string;
  sourceTitle: string;
  sourceUrl: string;
  disclosureStatus: string;
};

const teamNewsRegistry = getFieldRegistry("team-news");

const categoryLabels: Record<string, string> = {
  research: "科研活动",
  teaching: "教学活动",
  fieldwork: "野外工作",
  meeting: "会议交流",
  "student-research": "学生科研",
  other: "其他",
};

const disclosureLabels: Record<string, string> = {
  pending: "待确认",
  approved: "已确认",
};

function registeredField(key: string) {
  const definition = [
    ...teamNewsRegistry.common,
    ...teamNewsRegistry.shared,
    ...teamNewsRegistry.localized,
  ].find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error(`团队动态字段注册表缺少 ${key}。`);
  }
  return definition;
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

function fromRegisteredField(
  definition: FieldDefinition,
  control: FormFieldDefinition["control"],
  extra: Partial<FormFieldDefinition> = {},
): FormFieldDefinition {
  return {
    id: definition.key,
    path: definition.path,
    label: definition.label.zh,
    control,
    required: definition.requirement === "always",
    ...extra,
  };
}

const eventDate = registeredField("eventDate");
const endDate = registeredField("endDate");
const locationLabel = registeredField("locationLabel");
const category = registeredField("category");
const participantDescription = registeredField("participantDescription");
const pinned = registeredField("featured");
const authors = registeredField("authors");
const sources = registeredField("sources");
const disclosureStatus = registeredField("disclosureStatus");

export const teamNewsFormSchema: FormSchemaDefinition = {
  id: "team-news",
  label: "团队动态字段",
  sections: [
    {
      id: "localized-content",
      label: "中文内容",
      fields: [
        {
          id: "summaryZh",
          path: "locales.zh.summary",
          label: "中文摘要",
          control: "textarea",
          required: true,
          rows: 4,
        },
        fromRegisteredField(locationLabel, "text", {
          id: "locationZh",
          path: "shared.locationLabel.zh",
        }),
        fromRegisteredField(participantDescription, "textarea", {
          path: "locales.zh.fields.participantDescription",
          rows: 3,
        }),
      ],
    },
    {
      id: "event-details",
      label: "活动信息",
      fields: [
        fromRegisteredField(eventDate, "date"),
        fromRegisteredField(endDate, "date"),
        fromRegisteredField(category, "enum", {
          options: registeredOptions(category, categoryLabels),
        }),
        fromRegisteredField(pinned, "boolean", { id: "pinned" }),
      ],
    },
    {
      id: "responsibility",
      label: "责任与来源",
      fields: [
        fromRegisteredField(authors, "author-reference", {
          id: "authorId",
          path: "authors[0]",
          label: "负责作者稳定 ID",
          placeholder: "author-id",
        }),
        fromRegisteredField(sources, "text", {
          id: "sourceTitle",
          path: "shared.sources[0].title",
          label: "主要来源标题",
        }),
        fromRegisteredField(sources, "url", {
          id: "sourceUrl",
          path: "shared.sources[0].href",
          label: "主要来源链接",
          placeholder: "https://",
        }),
        fromRegisteredField(disclosureStatus, "enum", {
          options: registeredOptions(disclosureStatus, disclosureLabels),
        }),
      ],
    },
  ],
};

export function emptyTeamNewsFormValues(): TeamNewsFormValues {
  return {
    summaryZh: "",
    locationZh: "",
    participantDescription: "",
    eventDate: "",
    endDate: "",
    category: "",
    pinned: false,
    authorId: "",
    sourceTitle: "",
    sourceUrl: "",
    disclosureStatus: "",
  };
}

export function inspectTeamNewsForm(recordDraft: unknown) {
  const record = asRecord(recordDraft);
  const shared = asRecord(record?.shared);
  const locales = asRecord(record?.locales);
  const zh = asRecord(locales?.zh);
  const localizedFields = asRecord(zh?.fields);
  const location = asRecord(shared?.locationLabel);
  const authorsValue = Array.isArray(record?.authors) ? record.authors : [];
  const sourcesValue = Array.isArray(shared?.sources) ? shared.sources : [];
  const primarySource = asRecord(sourcesValue[0]);
  const values: TeamNewsFormValues = {
    summaryZh: stringValue(zh?.summary),
    locationZh: stringValue(location?.zh),
    participantDescription: stringValue(localizedFields?.participantDescription),
    eventDate: stringValue(shared?.eventDate),
    endDate: stringValue(shared?.endDate),
    category: stringValue(shared?.category),
    pinned: shared?.pinned === true,
    authorId: stringValue(authorsValue[0]),
    sourceTitle: stringValue(primarySource?.title),
    sourceUrl: stringValue(primarySource?.href),
    disclosureStatus: stringValue(shared?.disclosureStatus),
  };

  return {
    values,
    errors: validateTeamNewsRecordDraft(recordDraft, values).errors,
  };
}

export type TeamNewsRecordDraftResult =
  | { success: true; recordDraft: RecordDraft; errors: FormErrors }
  | { success: false; errors: FormErrors };

export function validateTeamNewsRecordDraft(
  recordDraft: unknown,
  values: TeamNewsFormValues,
): TeamNewsRecordDraftResult {
  const errors = validateFormValues(teamNewsFormSchema, values);
  const sourceTitle = values.sourceTitle.trim();
  const sourceUrl = values.sourceUrl.trim();

  if (sourceUrl && !sourceTitle) {
    errors.sourceTitle = "填写来源链接时必须提供主要来源标题。";
  }
  if (
    isIsoDate(values.eventDate.trim()) &&
    isIsoDate(values.endDate.trim()) &&
    values.endDate.trim() < values.eventDate.trim()
  ) {
    errors.endDate = "结束日期不能早于事件日期";
  }

  const candidate = applyTeamNewsFormValues(recordDraft, values);
  const parsed = teamNewsRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const fieldId = fieldIdForIssue(issue.path);
      if (fieldId) {
        errors[fieldId] ??= issue.message;
      } else {
        const issuePath = issue.path.map(String).join(".") || "根结构";
        errors[FORM_ERROR_KEY] ??=
          `团队动态字段包含当前表单不支持或无法映射的字段：${issuePath}。`;
      }
    }
  }

  if (Object.values(errors).some(Boolean) || !parsed.success) {
    return { success: false, errors };
  }

  return {
    success: true,
    recordDraft: parsed.data as RecordDraft,
    errors: {},
  };
}

function applyTeamNewsFormValues(
  recordDraft: unknown,
  values: TeamNewsFormValues,
) {
  const candidate = structuredClone(asRecord(recordDraft) ?? {});
  const shared = ensureRecord(candidate, "shared");
  const locales = ensureRecord(candidate, "locales");
  const zh = ensureRecord(locales, "zh");
  const localizedFields = ensureRecord(zh, "fields");

  zh.summary = values.summaryZh.trim();
  shared.eventDate = values.eventDate.trim();
  setOptionalString(shared, "endDate", values.endDate);
  shared.category = values.category.trim();
  shared.pinned = values.pinned;
  shared.disclosureStatus = values.disclosureStatus.trim();

  const locationZh = values.locationZh.trim();
  if (locationZh) {
    const location = asRecord(shared.locationLabel) ?? {};
    shared.locationLabel = { ...location, zh: locationZh };
  } else {
    delete shared.locationLabel;
  }

  setOptionalString(
    localizedFields,
    "participantDescription",
    values.participantDescription,
  );

  const existingAuthors = Array.isArray(candidate.authors)
    ? candidate.authors.filter((value): value is string => typeof value === "string")
    : [];
  const authorId = values.authorId.trim();
  candidate.authors = authorId
    ? [authorId, ...existingAuthors.slice(1).filter((value) => value !== authorId)]
    : existingAuthors.slice(1);

  const existingSources = Array.isArray(shared.sources)
    ? structuredClone(shared.sources)
    : [];
  const sourceTitle = values.sourceTitle.trim();
  const sourceUrl = values.sourceUrl.trim();
  if (sourceTitle || sourceUrl) {
    const original = asRecord(existingSources[0]) ?? {};
    const source = { ...original };
    if (!stableIdSchema.safeParse(source.id).success) {
      source.id = `${stringValue(candidate.id) || "team-news"}-source`;
    }
    if (typeof source.kind !== "string") {
      source.kind = "other";
    }
    source.title = sourceTitle;
    if (sourceUrl) {
      source.href = sourceUrl;
    } else {
      delete source.href;
    }
    if (
      source.title !== original.title ||
      source.href !== original.href ||
      typeof source.verificationStatus !== "string"
    ) {
      source.verificationStatus = "pending";
      delete source.verifiedAt;
    }
    shared.sources = [source, ...existingSources.slice(1)];
  } else {
    shared.sources = existingSources.slice(1);
  }

  return candidate;
}

function fieldIdForIssue(path: readonly PropertyKey[]) {
  const value = path.map(String).join(".");
  const mappings: Array<[string, keyof TeamNewsFormValues]> = [
    ["locales.zh.summary", "summaryZh"],
    ["shared.locationLabel", "locationZh"],
    ["locales.zh.fields.participantDescription", "participantDescription"],
    ["shared.eventDate", "eventDate"],
    ["shared.endDate", "endDate"],
    ["shared.category", "category"],
    ["shared.pinned", "pinned"],
    ["authors", "authorId"],
    ["shared.sources.0.title", "sourceTitle"],
    ["shared.sources.0.href", "sourceUrl"],
    ["shared.disclosureStatus", "disclosureStatus"],
  ];
  return mappings.find(([prefix]) => value.startsWith(prefix))?.[1];
}

function ensureRecord(parent: Record<string, unknown>, key: string) {
  const existing = asRecord(parent[key]);
  if (existing) {
    return existing;
  }
  const created: Record<string, unknown> = {};
  parent[key] = created;
  return created;
}

function setOptionalString(
  parent: Record<string, unknown>,
  key: string,
  value: string,
) {
  const normalized = value.trim();
  if (normalized) {
    parent[key] = normalized;
  } else {
    delete parent[key];
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
