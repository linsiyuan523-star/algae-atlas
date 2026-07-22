import { parseRecord, type ContentRecord } from "@algae-atlas/content-schema";

import { articles, imageCredits } from "../../lib/site-data";
import type {
  MigrationCandidate,
  MigrationFinding,
  SourceLocator,
} from "./types";

const ARTICLE_KINDS = {
  "what-are-algae": "foundation",
  "why-water-turns-green": "observation-guide",
  "photobioreactor-basics": "method-explainer",
} as const;

function finding(
  code: string,
  message: string,
  source: SourceLocator,
  field?: string,
): MigrationFinding {
  return {
    code,
    message,
    source,
    targetType: "science-article",
    targetPath: `content/records/science-article/${source.sourceId}/record.json`,
    ...(field ? { field } : {}),
  };
}

function readMinutes(value: { zh: string; en: string }): number {
  const zh = Number(value.zh.match(/\d+/)?.[0]);
  const en = Number(value.en.match(/\d+/)?.[0]);
  if (!Number.isInteger(zh) || zh <= 0 || zh !== en) {
    throw new Error(`阅读时长不一致：${value.zh} / ${value.en}`);
  }
  return zh;
}

export function buildScienceArticleCandidates(
  operationAt: string,
): MigrationCandidate[] {
  const reviewDate = operationAt.slice(0, 10);
  return articles.map((article) => {
    const source: SourceLocator = {
      sourcePath: "lib/site-data.ts",
      exportName: "articles",
      sourceId: article.id,
    };
    const localized = (locale: "zh" | "en") => ({
      state: "draft" as const,
      title: article.title[locale],
      summary: article.summary[locale],
      bodyFile: locale === "zh" ? ("zh.md" as const) : ("en.md" as const),
      fields: {
        topic: article.note[locale],
        targetAudienceLabel:
          locale === "zh" ? "公众读者" : "General readers",
        categoryLabel: article.note[locale],
        takeaways: [],
      },
      translationOrigin: "source-authored" as const,
      review: {
        status: "draft" as const,
        updatedAt: reviewDate,
        version: "0.1",
        reviewerIds: [],
        references: [],
      },
    });
    const raw = {
      schemaVersion: 1 as const,
      id: article.id,
      type: "science-article" as const,
      createdAt: operationAt,
      updatedAt: operationAt,
      authors: [],
      tags: [],
      media: [],
      shared: {
        articleKind:
          ARTICLE_KINDS[article.id as keyof typeof ARTICLE_KINDS],
        publicationDate: article.date,
        targetAudience: "general" as const,
        readingTimeMinutes: readMinutes(article.readTime),
        references: [],
        relatedContentIds: [],
      },
      locales: { zh: localized("zh"), en: localized("en") },
      legacy: {
        sourcePath: source.sourcePath,
        exportName: source.exportName,
        sourceId: article.id,
        migratedAt: operationAt,
      },
    };
    const parsed = parseRecord(raw);
    if (!parsed.success) {
      throw new Error(
        parsed.issues.map(({ code, path }) => `${code}:${path}`).join(", "),
      );
    }
    const creditId = article.image.split("/").at(-1)?.split(".")[0];
    const credit = imageCredits.find(({ id }) => id === creditId);
    return {
      source,
      record: parsed.data satisfies ContentRecord,
      markdown: {
        zh: `${article.summary.zh}\n`,
        en: `${article.summary.en}\n`,
      },
      missingFields: [
        finding(
          "AUTHOR_MISSING",
          "旧数据没有可核验作者 ID。",
          source,
          "authors",
        ),
        finding(
          "REVIEWER_MISSING",
          "旧数据没有可核验审核人 ID。",
          source,
          "locales.*.review.reviewerIds",
        ),
      ],
      manualReview: [
        finding(
          "AUTHOR_CONFIRMATION_REQUIRED",
          "发布前必须确认公开作者。",
          source,
        ),
        finding(
          "TRANSLATION_PROVENANCE_UNVERIFIED",
          "英文来源历史需要人工确认。",
          source,
        ),
        finding(
          "TARGET_AUDIENCE_DERIVED",
          "general 来源于现有公众科普栏目。",
          source,
        ),
        finding(
          "BODY_COMPLETENESS_REVIEW_REQUIRED",
          "候选正文只保留现有摘要。",
          source,
        ),
        finding(
          "PUBLICATION_REVIEW_REQUIRED",
          "候选保持 draft，不能切换来源。",
          source,
        ),
      ],
      missingImageAttribution: [
        finding(
          "IMAGE_USAGE_SCOPE_PENDING",
          credit
            ? `${article.image}: ${credit.credit}; ${credit.license}`
            : `${article.image}: 未找到图片署名记录`,
          source,
          "shared.coverMediaId",
        ),
      ],
    };
  });
}
