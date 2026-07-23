import {
  isHttpsUrl,
  isIsoDate,
  stableIdSchema,
} from "@algae-atlas/content-schema";

export type FormControl =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "enum"
  | "boolean"
  | "url"
  | "author-reference";

export type FormOption = {
  value: string;
  label: string;
};

export type FormFieldDefinition = {
  id: string;
  path: string;
  label: string;
  control: FormControl;
  required?: boolean;
  options?: readonly FormOption[];
  placeholder?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
};

export type FormSectionDefinition = {
  id: string;
  label: string;
  fields: readonly FormFieldDefinition[];
};

export type FormSchemaDefinition = {
  id: string;
  label: string;
  sections: readonly FormSectionDefinition[];
};

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;
export type FormErrors = Record<string, string | undefined>;

export const FORM_ERROR_KEY = "$form";

export function formFields(
  schema: FormSchemaDefinition,
): readonly FormFieldDefinition[] {
  return schema.sections.flatMap((section) => section.fields);
}

export function validateFormValues(
  schema: FormSchemaDefinition,
  values: FormValues,
): FormErrors {
  const errors: FormErrors = {};

  for (const field of formFields(schema)) {
    const value = values[field.id];
    if (field.control === "boolean") {
      if (typeof value !== "boolean") {
        errors[field.id] = `${field.label}必须是布尔值。`;
      }
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (field.required) {
        errors[field.id] = `${field.label}不能为空。`;
      }
      continue;
    }

    if (field.maxLength && text.length > field.maxLength) {
      errors[field.id] = `${field.label}不能超过 ${field.maxLength} 个字符。`;
      continue;
    }

    if (field.control === "date" && !isIsoDate(text)) {
      errors[field.id] = `${field.label}必须是有效日期。`;
    } else if (field.control === "number") {
      const number = Number(text);
      if (!Number.isFinite(number)) {
        errors[field.id] = `${field.label}必须是有效数字。`;
      } else if (field.step === 1 && !Number.isInteger(number)) {
        errors[field.id] = `${field.label}必须是整数。`;
      } else if (field.min !== undefined && number < field.min) {
        errors[field.id] = `${field.label}不能小于 ${field.min}。`;
      } else if (field.max !== undefined && number > field.max) {
        errors[field.id] = `${field.label}不能大于 ${field.max}。`;
      }
    } else if (field.control === "url" && !isHttpsUrl(text)) {
      errors[field.id] = `${field.label}必须使用有效的 HTTPS URL。`;
    } else if (
      field.control === "author-reference" &&
      !stableIdSchema.safeParse(text).success
    ) {
      errors[field.id] = `${field.label}格式无效，必须使用有效的稳定 ID。`;
    } else if (
      field.control === "enum" &&
      !field.options?.some((option) => option.value === text)
    ) {
      errors[field.id] = `请选择有效的${field.label}。`;
    }
  }

  return errors;
}

export function sameFormValues(
  schema: FormSchemaDefinition,
  left: FormValues,
  right: FormValues,
) {
  return formFields(schema).every((field) => left[field.id] === right[field.id]);
}
