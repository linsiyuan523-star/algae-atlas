import {
  CONTENT_SCHEMA_VERSION,
  CONTENT_TYPES,
  contentTypeRegistry,
  createRecordDraftDefaults,
  stableIdSchema,
} from "@algae-atlas/content-schema";
import type { ContentType, Locale } from "@algae-atlas/content-schema";

export type RecordDraft = ReturnType<typeof createRecordDraftDefaults>;

export type DraftFields = {
  contentType: string;
  stableId: string;
  titleZh: string;
};

export type DraftFieldName = keyof DraftFields | "schemaVersion";
export type DraftFieldErrors = Partial<Record<DraftFieldName, string>>;
export const SHARED_SCHEMA_VERSION = CONTENT_SCHEMA_VERSION;

export const contentTypeOptions = CONTENT_TYPES.map((type) => ({
  value: type,
  labelZh: contentTypeRegistry[type].label.zh,
  labelEn: contentTypeRegistry[type].label.en,
}));

export type DraftRecordInspection = {
  fields: DraftFields;
  errors: DraftFieldErrors;
};

export type DraftRecordResult =
  | { success: true; recordDraft: RecordDraft; errors: DraftFieldErrors }
  | { success: false; errors: DraftFieldErrors };

export function inspectRecordDraft(recordDraft: unknown): DraftRecordInspection {
  const record = asRecord(recordDraft);
  const locales = asRecord(record?.locales);
  const zh = asRecord(locales?.zh);
  const fields = {
    contentType: typeof record?.type === "string" ? record.type : "",
    stableId: typeof record?.id === "string" ? record.id : "",
    titleZh: typeof zh?.title === "string" ? zh.title : "",
  };
  const errors = validateDraftFields(fields);

  if (record?.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    errors.schemaVersion = `仅支持 Schema v${CONTENT_SCHEMA_VERSION}。`;
  }

  return { fields, errors };
}

export function validateDraftFields(fields: DraftFields): DraftFieldErrors {
  const errors: DraftFieldErrors = {};

  if (!isContentType(fields.contentType)) {
    errors.contentType = "请选择有效的内容类型。";
  }

  const stableId = stableIdSchema.safeParse(fields.stableId);
  if (!stableId.success) {
    errors.stableId = stableId.error.issues[0]?.message ?? "稳定 ID 无效。";
  }

  if (!fields.titleZh.trim()) {
    errors.titleZh = "中文标题不能为空。";
  } else if (fields.titleZh.length > 500) {
    errors.titleZh = "中文标题不能超过 500 个字符。";
  }

  return errors;
}

export function createSharedRecordDraft(
  fields: DraftFields,
  now: string,
): DraftRecordResult {
  const errors = validateDraftFields(fields);
  if (Object.keys(errors).length > 0 || !isContentType(fields.contentType)) {
    return { success: false, errors };
  }

  const recordDraft = createRecordDraftDefaults(
    fields.contentType,
    fields.stableId,
    now,
  );
  setChineseTitle(recordDraft, fields.titleZh.trim());
  return { success: true, recordDraft, errors: {} };
}

export function updateSharedRecordDraft(
  existing: unknown,
  fields: DraftFields,
  now: string,
): DraftRecordResult {
  const errors = validateDraftFields(fields);
  const current = asRecord(existing);
  if (existing !== null && current?.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    errors.schemaVersion = `仅支持 Schema v${CONTENT_SCHEMA_VERSION}，不会覆盖其他版本。`;
  }
  if (Object.keys(errors).length > 0 || !isContentType(fields.contentType)) {
    return { success: false, errors };
  }

  const canPreserve =
    current?.schemaVersion === CONTENT_SCHEMA_VERSION &&
    current.type === fields.contentType;
  const recordDraft = canPreserve
    ? structuredClone(current)
    : createRecordDraftDefaults(fields.contentType, fields.stableId, now);

  recordDraft.schemaVersion = CONTENT_SCHEMA_VERSION;
  recordDraft.id = fields.stableId;
  recordDraft.type = fields.contentType;
  recordDraft.updatedAt = now;
  if (typeof recordDraft.createdAt !== "string") {
    recordDraft.createdAt = now;
  }
  setChineseTitle(recordDraft, fields.titleZh.trim());

  return { success: true, recordDraft, errors: {} };
}

export function updateChineseBodyReference(
  existing: RecordDraft,
  bodyZh: string,
): RecordDraft {
  return updateLocaleBodyReference(existing, "zh", bodyZh);
}

export function updateLocaleBodyReference(
  existing: RecordDraft,
  locale: Locale,
  body: string,
): RecordDraft {
  const recordDraft = structuredClone(existing);
  const locales = asRecord(recordDraft.locales);
  const localized = asRecord(locales?.[locale]);
  if (!localized || localized.state === "missing") {
    throw new Error(`共享 Schema 草稿缺少 ${locale} 字段。`);
  }

  if (body.trim()) {
    localized.bodyFile = locale === "zh" ? "zh.md" : "en.md";
  } else {
    delete localized.bodyFile;
  }
  return recordDraft;
}

export function contentTypeLabel(value: string): string | null {
  return isContentType(value) ? contentTypeRegistry[value].label.zh : null;
}

function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function setChineseTitle(recordDraft: Record<string, unknown>, title: string) {
  const locales = asRecord(recordDraft.locales);
  const zh = asRecord(locales?.zh);
  if (!locales || !zh) {
    throw new Error("共享 Schema 默认草稿缺少中文字段。");
  }
  zh.title = title;
}
