import { z } from "zod";

import {
  AUTHOR_KINDS,
  AUTHOR_STATUSES,
  LICENSE_IDENTIFIERS,
  MEDIA_CONSENT_STATES,
  MEDIA_IDENTIFICATION_STATUSES,
  MEDIA_MIME_TYPES,
  MEDIA_RIGHTS_STATUSES,
  PRESENT_WORKFLOW_STATES,
  PUBLIC_SCOPES,
  REFERENCE_IDENTIFIER_SCHEMES,
  REFERENCE_KINDS,
  REVIEW_STATUSES,
  TRANSLATION_ORIGINS,
  type Locale,
} from "./constants";

export const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isIsoTimestamp(value: string): boolean {
  return (
    ISO_TIMESTAMP_WITH_ZONE_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export const stableIdSchema = z
  .string()
  .regex(
    STABLE_ID_PATTERN,
    "必须使用小写英文、数字和单个连字符组成的稳定 ID",
  );

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, "必须是有效的 YYYY-MM-DD 日期");

export const isoTimestampSchema = z
  .string()
  .refine(isIsoTimestamp, "必须是带时区的有效 ISO 8601 时间");

export const httpsUrlSchema = z
  .string()
  .refine(isHttpsUrl, "公开链接必须使用有效的 HTTPS URL");

export const localizedTextSchema = z.strictObject({
  zh: z.string().trim().min(1, "中文文本不能为空"),
  en: z.string().trim().min(1, "英文文本不能为空").optional(),
});

export const referenceIdentifierSchema = z.strictObject({
  scheme: z.enum(REFERENCE_IDENTIFIER_SCHEMES),
  value: z.string().trim().min(1, "标识符不能为空"),
});

export const referenceSchema = z.strictObject({
  id: stableIdSchema,
  kind: z.enum(REFERENCE_KINDS),
  title: z.string().trim().min(1, "来源标题不能为空"),
  href: httpsUrlSchema.optional(),
  identifier: referenceIdentifierSchema.optional(),
  note: z.string().trim().min(1, "来源备注不能为空").optional(),
  accessedAt: isoDateSchema.optional(),
});

export const sourceSchema = z.strictObject({
  ...referenceSchema.shape,
  verificationStatus: z.enum(["pending", "verified", "rejected"]),
  verifiedAt: isoDateSchema.optional(),
}).superRefine((source, context) => {
  if (source.verificationStatus === "verified" && !source.verifiedAt) {
    context.addIssue({
      code: "custom",
      path: ["verifiedAt"],
      message: "已核验来源必须记录核验日期",
      params: { issueCode: "SOURCE_VERIFIED_AT_REQUIRED" },
    });
  }
});

export const licenseSchema = z.strictObject({
  identifier: z.enum(LICENSE_IDENTIFIERS),
  name: z.string().trim().min(1, "许可名称不能为空"),
  href: httpsUrlSchema.optional(),
  attribution: z.string().trim().min(1, "署名信息不能为空"),
  usageScope: z.enum(["public-site", "education-only", "internal-only"]),
});

export const reviewSchema = z
  .strictObject({
    status: z.enum(REVIEW_STATUSES),
    updatedAt: isoDateSchema,
    reviewedAt: isoDateSchema.optional(),
    version: z
      .string()
      .regex(/^\d+\.\d+$/, "审核版本必须使用 major.minor 格式"),
    reviewerIds: z.array(stableIdSchema).default([]),
    references: z.array(referenceSchema).default([]),
  })
  .superRefine((review, context) => {
    if (review.status !== "reviewed") {
      return;
    }

    if (!review.reviewedAt) {
      context.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: "已审核状态必须记录审核日期",
        params: { issueCode: "REVIEW_DATE_REQUIRED" },
      });
    }

    if (review.reviewerIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["reviewerIds"],
        message: "已审核状态必须至少记录一位审核人",
        params: { issueCode: "REVIEWER_REQUIRED" },
      });
    }

    if (review.reviewedAt && review.reviewedAt < review.updatedAt) {
      context.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: "审核日期不能早于本版本更新时间",
        params: { issueCode: "REVIEW_DATE_ORDER_INVALID" },
      });
    }
  });

export const authorSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: stableIdSchema,
    kind: z.enum(AUTHOR_KINDS),
    status: z.enum(AUTHOR_STATUSES),
    displayName: localizedTextSchema,
    role: localizedTextSchema.optional(),
    publicLinks: z
      .array(
        z.strictObject({
          label: z.string().trim().min(1, "链接名称不能为空"),
          href: httpsUrlSchema,
        }),
      )
      .default([]),
    publicScope: z.enum(PUBLIC_SCOPES),
    consentReference: z
      .string()
      .trim()
      .min(1, "授权引用不能为空")
      .optional(),
  })
  .superRefine((author, context) => {
    if (
      author.kind === "person" &&
      author.publicScope === "approved" &&
      !author.consentReference
    ) {
      context.addIssue({
        code: "custom",
        path: ["consentReference"],
        message: "公开人物作者必须记录非敏感授权引用",
        params: { issueCode: "AUTHOR_CONSENT_REFERENCE_REQUIRED" },
      });
    }
  });

export const mediaSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: stableIdSchema,
    filePath: z
      .string()
      .regex(
        /^public\/images\/(?:uploads\/\d{4}\/\d{2}\/)?[a-zA-Z0-9._/-]+$/,
        "图片路径必须是 public/images 下的仓库相对路径",
      )
      .refine((filePath) => {
        const parts = filePath.split("/");
        const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
        return parts.every(
          (part) =>
            part.length > 0 &&
            part !== "." &&
            part !== ".." &&
            !part.endsWith(".") &&
            !part.endsWith(" ") &&
            !reserved.test(part),
        );
      }, "图片路径包含不安全的 Windows 路径片段"),
    sha256: z.string().regex(SHA256_PATTERN, "SHA-256 必须是 64 位小写十六进制"),
    mimeType: z.enum(MEDIA_MIME_TYPES),
    bytes: z.number().int().positive("图片字节数必须大于 0"),
    width: z.number().int().positive("图片宽度必须大于 0"),
    height: z.number().int().positive("图片高度必须大于 0"),
    uploadedAt: isoTimestampSchema,
    creatorOrProvider: z.string().trim().min(1, "图片作者或提供者不能为空"),
    sourceUrl: httpsUrlSchema.optional(),
    license: licenseSchema,
    rightsStatus: z.enum(MEDIA_RIGHTS_STATUSES),
    identificationStatus: z.enum(MEDIA_IDENTIFICATION_STATUSES),
    identifiablePeople: z.boolean(),
    consentState: z.enum(MEDIA_CONSENT_STATES),
    consentReference: z
      .string()
      .trim()
      .min(1, "人物授权引用不能为空")
      .optional(),
    alt: localizedTextSchema,
    caption: localizedTextSchema.optional(),
    relatedContentIds: z.array(stableIdSchema).default([]),
    focalPoint: z
      .strictObject({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .optional(),
    legacy: z.boolean().default(false),
  })
  .superRefine((media, context) => {
    const extension = media.filePath.split(".").pop()?.toLowerCase();
    const expectedMime = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      avif: "image/avif",
    }[extension ?? ""];
    if (!expectedMime || expectedMime !== media.mimeType) {
      context.addIssue({
        code: "custom",
        path: ["mimeType"],
        message: "图片扩展名与 MIME 类型不一致",
        params: { issueCode: "MEDIA_MIME_EXTENSION_MISMATCH" },
      });
    }

    if (!media.legacy && !/^public\/images\/uploads\/\d{4}\/\d{2}\//.test(media.filePath)) {
      context.addIssue({
        code: "custom",
        path: ["filePath"],
        message: "新图片必须存放在 public/images/uploads/YYYY/MM/ 下",
        params: { issueCode: "MEDIA_UPLOAD_PATH_INVALID" },
      });
    }
  });

export const missingLocaleSchema = z.strictObject({
  state: z.literal("missing"),
});

export function makePresentLocaleSchema<TFields extends z.ZodType>(
  fieldsSchema: TFields,
  locale: Locale,
) {
  const expectedBodyFile = locale === "zh" ? "zh.md" : "en.md";

  return z
    .strictObject({
      state: z.enum(PRESENT_WORKFLOW_STATES),
      title: z.string().trim().min(1, "标题不能为空"),
      summary: z.string().trim().min(1, "摘要不能为空"),
      bodyFile: z.literal(expectedBodyFile).optional(),
      fields: fieldsSchema,
      translationOrigin: z.enum(TRANSLATION_ORIGINS),
      humanVerifiedBy: stableIdSchema.optional(),
      review: reviewSchema,
      publishedAt: isoTimestampSchema.optional(),
    })
    .superRefine((value, context) => {
      if (value.state === "approved" || value.state === "published") {
        if (value.review.status !== "reviewed") {
          context.addIssue({
            code: "custom",
            path: ["review", "status"],
            message: "批准或发布内容必须完成审核",
            params: { issueCode: "LOCALE_REVIEW_REQUIRED" },
          });
        }
      }

      if (value.state === "published") {
        if (!value.bodyFile) {
          context.addIssue({
            code: "custom",
            path: ["bodyFile"],
            message: "发布内容必须有对应语言的 Markdown 正文",
            params: { issueCode: "LOCALE_BODY_REQUIRED" },
          });
        }

        if (!value.publishedAt) {
          context.addIssue({
            code: "custom",
            path: ["publishedAt"],
            message: "发布内容必须记录发布时间",
            params: { issueCode: "LOCALE_PUBLISHED_AT_REQUIRED" },
          });
        }

        if (
          value.translationOrigin === "machine-assisted" &&
          !value.humanVerifiedBy
        ) {
          context.addIssue({
            code: "custom",
            path: ["humanVerifiedBy"],
            message: "机器辅助内容发布前必须记录人工复核人",
            params: { issueCode: "TRANSLATION_HUMAN_REVIEW_REQUIRED" },
          });
        }
      }
    });
}

export type Reference = z.infer<typeof referenceSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type License = z.infer<typeof licenseSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Author = z.infer<typeof authorSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type MissingLocale = z.infer<typeof missingLocaleSchema>;
