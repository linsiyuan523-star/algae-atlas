import {
  CONTENT_TYPES,
  contentRecordSchemas,
  contentTypeRegistry,
} from "@algae-atlas/content-schema";
import type {
  ContentType,
  FieldDefinition,
} from "@algae-atlas/content-schema";
import {
  ensureEnglishLocale,
} from "../locale-workflow";
import type { RecordDraft } from "../schema-drafts";
import {
  FORM_ERROR_KEY,
  validateFormValues,
} from "./form-engine";
import type {
  FormErrors,
  FormFieldDefinition,
  FormSchemaDefinition,
  FormValues,
} from "./form-engine";

export type EnglishContentFormAdapter = {
  contentType: ContentType;
  schema: FormSchemaDefinition;
  emptyValues: () => FormValues;
  inspect: (recordDraft: unknown) => FormValues;
  copyChineseValues: (
    titleZh: string,
    chineseValues: FormValues,
  ) => FormValues;
  apply: (
    recordDraft: RecordDraft,
    values: FormValues,
    now: string,
  ) => RecordDraft;
  validateValues: (values: FormValues) => FormErrors;
  validateCompleteRecord: (recordDraft: unknown) => FormErrors;
};

const adapters = new Map<ContentType, EnglishContentFormAdapter>();

export function getEnglishContentFormAdapter(
  contentType: string,
): EnglishContentFormAdapter | null {
  if (!(CONTENT_TYPES as readonly string[]).includes(contentType)) {
    return null;
  }
  const type = contentType as ContentType;
  const existing = adapters.get(type);
  if (existing) {
    return existing;
  }
  const created = createAdapter(type);
  adapters.set(type, created);
  return created;
}

function createAdapter(contentType: ContentType): EnglishContentFormAdapter {
  const definition = contentTypeRegistry[contentType];
  const localizedFields = definition.localizedFields;
  const schema: FormSchemaDefinition = {
    id: `${contentType}-english`,
    label: "英文内容字段",
    sections: [
      {
        id: "english-core",
        label: "标题与摘要",
        fields: [
          {
            id: "titleEn",
            path: "locales.en.title",
            label: "英文标题",
            control: "text",
            required: true,
            maxLength: 500,
          },
          {
            id: "summaryEn",
            path: "locales.en.summary",
            label: "英文摘要",
            control: "textarea",
            required: true,
            rows: 4,
          },
        ],
      },
      ...(localizedFields.length > 0
        ? [
            {
              id: "english-type-fields",
              label: `${definition.label.zh}英文字段`,
              fields: localizedFields.map(englishField),
            },
          ]
        : []),
    ],
  };

  function emptyValues(): FormValues {
    return {
      titleEn: "",
      summaryEn: "",
      ...Object.fromEntries(localizedFields.map((field) => [field.key, ""])),
    };
  }

  function inspect(recordDraft: unknown): FormValues {
    const values = emptyValues();
    const record = asRecord(recordDraft);
    const locales = asRecord(record?.locales);
    const english = asRecord(locales?.en);
    if (!english || english.state === "missing") {
      return values;
    }
    const fields = asRecord(english.fields);
    values.titleEn = stringValue(english.title);
    values.summaryEn = stringValue(english.summary);
    for (const field of localizedFields) {
      values[field.key] = readLocalizedValue(fields?.[field.key], field);
    }
    return values;
  }

  function copyChineseValues(
    titleZh: string,
    chineseValues: FormValues,
  ): FormValues {
    const values = emptyValues();
    values.titleEn = titleZh;
    values.summaryEn = stringValue(chineseValues.summaryZh);
    for (const field of localizedFields) {
      const source = chineseValues[field.key];
      values[field.key] =
        typeof source === "string" || typeof source === "boolean" ? source : "";
    }
    return values;
  }

  function apply(
    recordDraft: RecordDraft,
    values: FormValues,
    now: string,
  ): RecordDraft {
    const record = ensureEnglishLocale(recordDraft, now);
    const locales = ensureRecord(record, "locales");
    const english = ensureRecord(locales, "en");
    const currentFields = asRecord(english.fields) ?? {};
    const fields: Record<string, unknown> = {
      ...structuredClone(definition.defaultValues.localized),
      ...currentFields,
    };

    english.title = stringValue(values.titleEn).trim();
    english.summary = stringValue(values.summaryEn).trim();
    for (const field of localizedFields) {
      const value = stringValue(values[field.key]);
      if (field.kind === "text-list") {
        fields[field.key] = textList(value);
      } else if (value.trim() || field.requirement === "always") {
        fields[field.key] = value.trim();
      } else {
        delete fields[field.key];
      }
    }
    english.fields = fields;
    return record;
  }

  function validateCompleteRecord(recordDraft: unknown): FormErrors {
    const parsed = contentRecordSchemas[contentType].safeParse(recordDraft);
    if (parsed.success) {
      return {};
    }
    const errors: FormErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String);
      const fieldId = englishFieldId(path, localizedFields);
      if (fieldId) {
        errors[fieldId] ??= issue.message;
      } else {
        errors[FORM_ERROR_KEY] ??= `英文发布条件未满足：${issue.message}`;
      }
    }
    return errors;
  }

  return {
    contentType,
    schema,
    emptyValues,
    inspect,
    copyChineseValues,
    apply,
    validateValues: (values) => validateFormValues(schema, values),
    validateCompleteRecord,
  };
}

function englishField(definition: FieldDefinition): FormFieldDefinition {
  return {
    id: definition.key,
    path: definition.path.replace("{locale}", "en"),
    label: definition.label.en,
    control: definition.kind === "text-list" ? "text-list" : "textarea",
    required: definition.requirement === "always",
    rows: definition.kind === "text-list" ? 5 : 3,
  };
}

function englishFieldId(
  path: readonly string[],
  localizedFields: readonly FieldDefinition[],
) {
  if (path[0] !== "locales" || path[1] !== "en") {
    return null;
  }
  if (path[2] === "title") {
    return "titleEn";
  }
  if (path[2] === "summary") {
    return "summaryEn";
  }
  if (path[2] === "fields" && localizedFields.some((field) => field.key === path[3])) {
    return path[3];
  }
  return null;
}

function readLocalizedValue(value: unknown, field: FieldDefinition) {
  if (field.kind === "text-list") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").join("\n")
      : "";
  }
  return stringValue(value);
}

function textList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
