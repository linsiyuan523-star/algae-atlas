import { SINGLE_USER_DIRECT_OPERATOR_ID } from "./constants";
import type { Locale } from "./constants";
import type { Eligibility, ValidationIssue } from "./issues";
import { validateMarkdown } from "./markdown";
import type { Author, Media } from "./models";
import {
  contentTypeRegistry,
  type ReferenceRule,
} from "./registry";
import type { ContentRecord } from "./schemas";
import { parseAuthor, parseMedia, parseRecord } from "./validation";

export type UrlClaim = {
  recordId: string;
  locale: Locale;
  path: string;
};

export type RepositorySnapshot = {
  records: readonly unknown[];
  authors?: readonly unknown[];
  media?: readonly unknown[];
  markdown?: Readonly<Record<string, string>>;
  recordPaths?: Readonly<Record<string, string>>;
  urlClaims?: readonly UrlClaim[];
};

export type ResolvedReferences = {
  records: Readonly<Record<string, ContentRecord>>;
  authors: Readonly<Record<string, Author>>;
  media: Readonly<Record<string, Media>>;
  markdown?: Readonly<Record<string, string>>;
};

export function markdownKey(record: ContentRecord, locale: Locale): string {
  return `${record.type}/${record.id}/${locale}.md`;
}

function validationIssue(
  code: string,
  path: string,
  message: string,
  remedy: string,
  details: { recordId?: string; locale?: Locale } = {},
): ValidationIssue {
  return {
    code,
    severity: "error",
    ...details,
    path,
    message,
    remedy,
  };
}

function prefixIssue(
  issue: ValidationIssue,
  prefix: string,
  recordId?: string,
): ValidationIssue {
  return {
    ...issue,
    ...(recordId && !issue.recordId ? { recordId } : {}),
    path: issue.path === "$" ? prefix : `${prefix}.${issue.path}`,
  };
}

function normalizeUrlPath(value: string): string | undefined {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("..")) {
    return undefined;
  }
  const collapsed = value.replace(/\/{2,}/g, "/");
  return (collapsed.length > 1 ? collapsed.replace(/\/$/, "") : collapsed).toLowerCase();
}

function valuesAtPath(record: ContentRecord, path: string): string[] {
  const segments = path.split(".");
  let current: unknown = record;

  for (const rawSegment of segments) {
    const isArray = rawSegment.endsWith("[]");
    const segment = isArray ? rawSegment.slice(0, -2) : rawSegment;
    if (!current || typeof current !== "object" || !(segment in current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[segment];
    if (isArray) {
      return Array.isArray(current)
        ? current.filter((value): value is string => typeof value === "string")
        : [];
    }
  }

  return typeof current === "string" ? [current] : [];
}

function rulesFor(record: ContentRecord): readonly ReferenceRule[] {
  return contentTypeRegistry[record.type].references;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function referencedIds(
  record: ContentRecord,
  target: ReferenceRule["target"],
): string[] {
  const fromRules = rulesFor(record)
    .filter((rule) => rule.target === target)
    .flatMap((rule) => valuesAtPath(record, rule.path));

  if (target === "media") {
    return unique([...record.media, ...fromRules]);
  }
  return unique(fromRules);
}

function localeReviewerIds(record: ContentRecord, locale: Locale): string[] {
  const localized = record.locales[locale];
  if (localized.state === "missing") {
    return [];
  }
  return unique([
    ...localized.review.reviewerIds,
    ...(localized.humanVerifiedBy ? [localized.humanVerifiedBy] : []),
  ]);
}

function publishedLocale(record: ContentRecord, locale: Locale) {
  const localized = record.locales[locale];
  return localized.state === "published" ? localized : undefined;
}

export function publicationEligibility(
  record: ContentRecord,
  locale: Locale,
  resolvedRefs: ResolvedReferences,
): Eligibility {
  const issues: ValidationIssue[] = [];
  const localized = record.locales[locale];

  if (localized.state === "missing") {
    issues.push(
      validationIssue(
        "LOCALE_MISSING",
        `locales.${locale}.state`,
        "该语言版本尚未创建",
        "先创建并审核该语言版本；不要自动发布机器翻译。",
        { recordId: record.id, locale },
      ),
    );
    return { eligible: false, issues };
  }

  if (localized.state !== "published") {
    issues.push(
      validationIssue(
        "LOCALE_NOT_PUBLISHED",
        `locales.${locale}.state`,
        "该语言版本不是 published 状态",
        "完成独立审核并显式进入 published 状态。",
        { recordId: record.id, locale },
      ),
    );
    return { eligible: false, issues };
  }

  for (const authorId of unique(referencedIds(record, "author"))) {
    const author = resolvedRefs.authors[authorId];
    if (!author) {
      issues.push(
        validationIssue(
          "AUTHOR_REFERENCE_MISSING",
          "authors",
          `找不到作者或审核主体 ${authorId}`,
          "新增经过批准的公开作者记录，或移除无效引用。",
          { recordId: record.id, locale },
        ),
      );
      continue;
    }
    if (author.publicScope !== "approved") {
      issues.push(
        validationIssue(
          "AUTHOR_PUBLIC_SCOPE_PENDING",
          "authors",
          `作者 ${authorId} 尚未批准公开范围`,
          "由授权来源确认公开范围后再发布。",
          { recordId: record.id, locale },
        ),
      );
    }
  }

  for (const reviewerId of unique(localeReviewerIds(record, locale))) {
    if (reviewerId === SINGLE_USER_DIRECT_OPERATOR_ID) {
      continue;
    }
    const reviewer = resolvedRefs.authors[reviewerId];
    if (!reviewer) {
      issues.push(
        validationIssue(
          "AUTHOR_REFERENCE_MISSING",
          `locales.${locale}.review.reviewerIds`,
          `找不到审核主体 ${reviewerId}`,
          "新增经过批准的公开作者记录，或移除无效引用。",
          { recordId: record.id, locale },
        ),
      );
      continue;
    }
    if (reviewer.publicScope !== "approved") {
      issues.push(
        validationIssue(
          "AUTHOR_PUBLIC_SCOPE_PENDING",
          `locales.${locale}.review.reviewerIds`,
          `审核主体 ${reviewerId} 尚未批准公开范围`,
          "由授权来源确认公开范围后再发布。",
          { recordId: record.id, locale },
        ),
      );
    }
  }

  for (const mediaId of referencedIds(record, "media")) {
    const media = resolvedRefs.media[mediaId];
    if (!media) {
      issues.push(
        validationIssue(
          "MEDIA_REFERENCE_MISSING",
          "media",
          `找不到图片记录 ${mediaId}`,
          "补齐图片目录记录，或移除无效图片引用。",
          { recordId: record.id, locale },
        ),
      );
      continue;
    }

    if (
      media.rightsStatus !== "approved" ||
      media.license.usageScope !== "public-site"
    ) {
      issues.push(
        validationIssue(
          "MEDIA_RIGHTS_NOT_PUBLIC",
          `media.${mediaId}.license`,
          `图片 ${mediaId} 的许可或使用范围不允许公开发布`,
          "确认公开许可、署名和使用范围后再发布。",
          { recordId: record.id, locale },
        ),
      );
    }

    if (
      media.identifiablePeople &&
      (media.consentState !== "confirmed" || !media.consentReference)
    ) {
      issues.push(
        validationIssue(
          "MEDIA_CONSENT_REQUIRED",
          `media.${mediaId}.consentState`,
          `图片 ${mediaId} 包含可识别人物但授权未确认`,
          "确认人物公开授权，并仅记录非敏感授权引用。",
          { recordId: record.id, locale },
        ),
      );
    }

    if (!media.alt[locale]) {
      issues.push(
        validationIssue(
          "MEDIA_ALT_REQUIRED",
          `media.${mediaId}.alt.${locale}`,
          `图片 ${mediaId} 缺少 ${locale} 替代文本`,
          "为每个发布语言补充准确的替代文本。",
          { recordId: record.id, locale },
        ),
      );
    }
  }

  for (const rule of rulesFor(record).filter((item) => item.target === "content")) {
    for (const contentId of valuesAtPath(record, rule.path)) {
      const target = resolvedRefs.records[contentId];
      if (!target) {
        issues.push(
          validationIssue(
            "CONTENT_REFERENCE_MISSING",
            rule.path.replace(/\[\]$/, ""),
            `找不到关联内容 ${contentId}`,
            "新增对应记录，或移除无效关联。",
            { recordId: record.id, locale },
          ),
        );
      } else if (
        rule.expectedContentTypes &&
        !rule.expectedContentTypes.includes(target.type)
      ) {
        issues.push(
          validationIssue(
            "CONTENT_REFERENCE_TYPE_MISMATCH",
            rule.path.replace(/\[\]$/, ""),
            `关联内容 ${contentId} 的类型 ${target.type} 不符合要求`,
            `仅引用这些类型：${rule.expectedContentTypes.join(", ")}。`,
            { recordId: record.id, locale },
          ),
        );
      }
    }
  }

  const body = resolvedRefs.markdown?.[markdownKey(record, locale)];
  if (body === undefined) {
    issues.push(
      validationIssue(
        "MARKDOWN_BODY_MISSING",
        `locales.${locale}.bodyFile`,
        "发布语言缺少对应 Markdown 正文",
        `添加 ${locale}.md，并保持文件名与语言状态一致。`,
        { recordId: record.id, locale },
      ),
    );
  } else {
    issues.push(
      ...validateMarkdown(body, {
        path: `markdown.${markdownKey(record, locale)}`,
        recordId: record.id,
        locale,
      }),
    );
  }

  return { eligible: issues.length === 0, issues };
}

function addDuplicates<T extends { id: string }>(
  values: readonly T[],
  namespace: string,
  issues: ValidationIssue[],
) {
  const seen = new Map<string, string>();
  for (const value of values) {
    const normalized = value.id.toLowerCase();
    const prior = seen.get(normalized);
    if (prior) {
      issues.push(
        validationIssue(
          "DUPLICATE_STABLE_ID",
          namespace,
          `稳定 ID 冲突：${prior} 与 ${value.id}`,
          "在该命名空间中保留唯一且大小写一致的稳定 ID。",
          namespace === "records" ? { recordId: value.id } : {},
        ),
      );
    } else {
      seen.set(normalized, value.id);
    }
  }
}

function deduplicateIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.recordId ?? ""}|${issue.locale ?? ""}|${issue.path}|${issue.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function validateRepository(
  snapshot: RepositorySnapshot,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const records: ContentRecord[] = [];
  const authors: Author[] = [];
  const media: Media[] = [];

  snapshot.records.forEach((input, index) => {
    const parsed = parseRecord(input);
    if (parsed.success) {
      records.push(parsed.data);
    } else {
      issues.push(
        ...parsed.issues.map((issue) => prefixIssue(issue, `records[${index}]`)),
      );
    }
  });

  (snapshot.authors ?? []).forEach((input, index) => {
    const parsed = parseAuthor(input);
    if (parsed.success) {
      authors.push(parsed.data);
    } else {
      issues.push(
        ...parsed.issues.map((issue) => prefixIssue(issue, `authors[${index}]`)),
      );
    }
  });

  (snapshot.media ?? []).forEach((input, index) => {
    const parsed = parseMedia(input);
    if (parsed.success) {
      media.push(parsed.data);
    } else {
      issues.push(
        ...parsed.issues.map((issue) => prefixIssue(issue, `media[${index}]`)),
      );
    }
  });

  addDuplicates(records, "records", issues);
  addDuplicates(authors, "authors", issues);
  addDuplicates(media, "media", issues);

  const mediaPaths = new Map<string, string>();
  for (const item of media) {
    const normalizedPath = item.filePath.toLowerCase();
    const prior = mediaPaths.get(normalizedPath);
    if (prior) {
      issues.push(
        validationIssue(
          "MEDIA_PATH_CONFLICT",
          "media.filePath",
          `图片 ${prior} 与 ${item.id} 使用同一路径 ${item.filePath}`,
          "为每个图片 ID 使用唯一文件路径；不得覆盖已有图片。",
        ),
      );
    } else {
      mediaPaths.set(normalizedPath, item.id);
    }
  }

  const recordIndex = Object.fromEntries(records.map((record) => [record.id, record]));
  const authorIndex = Object.fromEntries(authors.map((author) => [author.id, author]));
  const mediaIndex = Object.fromEntries(media.map((item) => [item.id, item]));
  const resolved: ResolvedReferences = {
    records: recordIndex,
    authors: authorIndex,
    media: mediaIndex,
    markdown: snapshot.markdown,
  };

  for (const record of records) {
    const expectedPath = `content/records/${record.type}/${record.id}/record.json`;
    const actualPath = snapshot.recordPaths?.[record.id];
    if (actualPath !== undefined && actualPath !== expectedPath) {
      issues.push(
        validationIssue(
          "RECORD_PATH_MISMATCH",
          "recordPaths",
          `记录路径 ${actualPath} 与 type/id 不一致`,
          `把记录放在 ${expectedPath}，并保持大小写完全一致。`,
          { recordId: record.id },
        ),
      );
    }

    for (const rule of rulesFor(record)) {
      for (const id of valuesAtPath(record, rule.path)) {
        if (rule.target === "author" && !authorIndex[id]) {
          issues.push(
            validationIssue(
              "AUTHOR_REFERENCE_MISSING",
              rule.path.replace(/\[\]$/, ""),
              `找不到作者 ${id}`,
              "新增公开作者记录，或移除无效引用。",
              { recordId: record.id },
            ),
          );
        }
        if (rule.target === "media" && !mediaIndex[id]) {
          issues.push(
            validationIssue(
              "MEDIA_REFERENCE_MISSING",
              rule.path.replace(/\[\]$/, ""),
              `找不到图片 ${id}`,
              "新增图片目录记录，或移除无效引用。",
              { recordId: record.id },
            ),
          );
        }
        if (rule.target === "content") {
          const target = recordIndex[id];
          if (!target) {
            issues.push(
              validationIssue(
                "CONTENT_REFERENCE_MISSING",
                rule.path.replace(/\[\]$/, ""),
                `找不到关联内容 ${id}`,
                "新增对应记录，或移除无效关联。",
                { recordId: record.id },
              ),
            );
          } else if (
            rule.expectedContentTypes &&
            !rule.expectedContentTypes.includes(target.type)
          ) {
            issues.push(
              validationIssue(
                "CONTENT_REFERENCE_TYPE_MISMATCH",
                rule.path.replace(/\[\]$/, ""),
                `关联内容 ${id} 的类型 ${target.type} 不符合要求`,
                `仅引用这些类型：${rule.expectedContentTypes.join(", ")}。`,
                { recordId: record.id },
              ),
            );
          }
        }
      }
    }

    for (const locale of ["zh", "en"] as const) {
      for (const reviewerId of localeReviewerIds(record, locale)) {
        if (reviewerId === SINGLE_USER_DIRECT_OPERATOR_ID) {
          continue;
        }
        if (!authorIndex[reviewerId]) {
          issues.push(
            validationIssue(
              "REVIEWER_REFERENCE_MISSING",
              `locales.${locale}.review.reviewerIds`,
              `找不到审核人 ${reviewerId}`,
              "使用已批准的公开作者 ID 记录审核人或人工复核人。",
              { recordId: record.id, locale },
            ),
          );
        }
      }
    }

    for (const mediaId of record.media) {
      if (!mediaIndex[mediaId]) {
        issues.push(
          validationIssue(
            "MEDIA_REFERENCE_MISSING",
            "media",
            `找不到图片 ${mediaId}`,
            "新增图片目录记录，或移除无效引用。",
            { recordId: record.id },
          ),
        );
      }
    }

    if (record.locales.en.state === "missing") {
      const unexpectedEnglishBody = snapshot.markdown?.[markdownKey(record, "en")];
      if (unexpectedEnglishBody !== undefined) {
        issues.push(
          validationIssue(
            "UNEXPECTED_ENGLISH_BODY",
            `markdown.${markdownKey(record, "en")}`,
            "英文状态为 missing 时不能存在 en.md",
            "删除未发布的英文正文文件，或把英文状态改为 draft 并补齐字段。",
            { recordId: record.id, locale: "en" },
          ),
        );
      }
    }

    for (const locale of ["zh", "en"] as const) {
      if (publishedLocale(record, locale)) {
        issues.push(...publicationEligibility(record, locale, resolved).issues);
      }
    }
  }

  const urlClaims: UrlClaim[] = [...(snapshot.urlClaims ?? [])];
  for (const record of records) {
    const routeFamily = contentTypeRegistry[record.type].routeFamily;
    for (const locale of ["zh", "en"] as const) {
      if (publishedLocale(record, locale)) {
        urlClaims.push({
          recordId: record.id,
          locale,
          path: routeFamily.replace("[locale]", locale).replace("[id]", record.id),
        });
      }
    }
  }

  const claimedPaths = new Map<string, UrlClaim>();
  for (const claim of urlClaims) {
    const normalized = normalizeUrlPath(claim.path);
    if (!normalized) {
      issues.push(
        validationIssue(
          "URL_PATH_INVALID",
          "urlClaims",
          `URL 路径无效：${claim.path}`,
          "使用以 / 开头、无遍历片段的站内路径。",
          { recordId: claim.recordId, locale: claim.locale },
        ),
      );
      continue;
    }
    const prior = claimedPaths.get(normalized);
    if (prior && (prior.recordId !== claim.recordId || prior.locale !== claim.locale)) {
      issues.push(
        validationIssue(
          "URL_CONFLICT",
          "urlClaims",
          `URL ${claim.path} 同时属于 ${prior.recordId} 和 ${claim.recordId}`,
          "为冲突记录保留唯一稳定 ID 或经代码审核调整路由注册。",
          { recordId: claim.recordId, locale: claim.locale },
        ),
      );
    } else {
      claimedPaths.set(normalized, claim);
    }
  }

  return deduplicateIssues(issues);
}
