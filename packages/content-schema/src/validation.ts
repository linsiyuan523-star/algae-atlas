import type { z } from "zod";

import type { Locale } from "./constants";
import type { ParseResult, ValidationIssue } from "./issues";
import { authorSchema, mediaSchema } from "./models";
import { contentRecordSchema, type ContentRecord } from "./schemas";

function formatPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }
    const value = String(segment);
    return formatted ? `${formatted}.${value}` : value;
  }, "");
}

function issueLocale(path: PropertyKey[]): Locale | undefined {
  const localeIndex = path.findIndex((part) => part === "locales");
  const candidate = localeIndex >= 0 ? path[localeIndex + 1] : undefined;
  return candidate === "zh" || candidate === "en" ? candidate : undefined;
}

function structuralMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "字段类型不正确或缺少必填字段";
    case "invalid_value":
      return "字段值不在允许范围内";
    case "unrecognized_keys":
      return "包含未注册字段";
    case "too_small":
      return "字段内容不足或不能为空";
    case "too_big":
      return "字段内容超过允许范围";
    case "invalid_format":
      return issue.message || "字段格式不正确";
    case "invalid_union":
      return "字段结构不符合任何允许形式";
    default:
      return issue.message || "字段校验失败";
  }
}

function issueCode(issue: z.core.$ZodIssue): string {
  if (issue.code === "custom" && "params" in issue) {
    const params = issue.params as { issueCode?: unknown } | undefined;
    if (typeof params?.issueCode === "string") {
      return params.issueCode;
    }
  }

  switch (issue.code) {
    case "invalid_type":
      return "SCHEMA_INVALID_TYPE";
    case "invalid_value":
      return "SCHEMA_INVALID_VALUE";
    case "unrecognized_keys":
      return "SCHEMA_UNKNOWN_FIELD";
    case "too_small":
      return "SCHEMA_VALUE_REQUIRED";
    case "too_big":
      return "SCHEMA_VALUE_TOO_LARGE";
    case "invalid_format":
      return "SCHEMA_INVALID_FORMAT";
    case "invalid_union":
      return "SCHEMA_INVALID_UNION";
    default:
      return "SCHEMA_INVALID";
  }
}

function remedyFor(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "unrecognized_keys":
      return "删除未注册字段，或通过正式 schema 版本迁移新增字段。";
    case "invalid_type":
      return "按字段注册表补齐字段，并使用规定的数据类型。";
    case "invalid_value":
      return "从字段注册表列出的受控值中选择。";
    case "too_small":
      return "补充该字段要求的最少内容。";
    case "too_big":
      return "缩短或拆分该字段内容。";
    default:
      return "根据字段路径修正内容后重新校验。";
  }
}

export function zodIssuesToValidationIssues(
  issues: readonly z.core.$ZodIssue[],
  input?: unknown,
): ValidationIssue[] {
  const recordId =
    typeof input === "object" &&
    input !== null &&
    "id" in input &&
    typeof input.id === "string"
      ? input.id
      : undefined;

  return issues.flatMap((issue) => {
    const paths =
      issue.code === "unrecognized_keys"
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path];

    return paths.map((path) => ({
      code: issueCode(issue),
      severity: "error" as const,
      ...(recordId ? { recordId } : {}),
      ...(issueLocale(path) ? { locale: issueLocale(path) } : {}),
      path: formatPath(path),
      message: structuralMessage(issue),
      remedy: remedyFor(issue),
    }));
  });
}

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, issues: [] };
  }
  return {
    success: false,
    issues: zodIssuesToValidationIssues(result.error.issues, input),
  };
}

export function parseRecord(input: unknown): ParseResult<ContentRecord> {
  return parseWithSchema(contentRecordSchema, input);
}

export function parseAuthor(
  input: unknown,
): ParseResult<z.infer<typeof authorSchema>> {
  return parseWithSchema(authorSchema, input);
}

export function parseMedia(
  input: unknown,
): ParseResult<z.infer<typeof mediaSchema>> {
  return parseWithSchema(mediaSchema, input);
}
