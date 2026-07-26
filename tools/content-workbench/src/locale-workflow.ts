import {
  CONTENT_TYPES,
  REVIEW_STATUSES,
  TRANSLATION_ORIGINS,
  contentTypeRegistry,
  isIsoDate,
  isIsoTimestamp,
  stableIdSchema,
  stateAfterSubstantiveEdit,
  validateWorkflowTransition,
} from "@algae-atlas/content-schema";
import type {
  Locale,
  PresentWorkflowState,
  TranslationOrigin,
} from "@algae-atlas/content-schema";
import type { RecordDraft } from "./schema-drafts";

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type LocaleWorkflowInput = {
  state: PresentWorkflowState;
  translationOrigin: TranslationOrigin;
  reviewStatus: ReviewStatus;
  reviewUpdatedAt: string;
  reviewedAt: string;
  reviewVersion: string;
  reviewerIds: string;
  humanVerifiedBy: string;
  publishedAt: string;
};

export type LocaleWorkflowErrors = Partial<
  Record<keyof LocaleWorkflowInput, string>
>;

export type LocaleWorkflowValidationMode = "draft" | "publish";

export type ParkedEnglishLocale = {
  contentType: string;
  locale: Record<string, unknown>;
};

export function inspectLocaleWorkflow(
  recordDraft: unknown,
  locale: Locale,
  now: string,
): LocaleWorkflowInput | null {
  const record = asRecord(recordDraft);
  const locales = asRecord(record?.locales);
  const localized = asRecord(locales?.[locale]);
  if (!localized || localized.state === "missing") {
    return null;
  }

  const review = asRecord(localized.review);
  const reviewerIds = Array.isArray(review?.reviewerIds)
    ? review.reviewerIds.filter((value): value is string => typeof value === "string")
    : [];
  return {
    state: presentState(localized.state) ?? "draft",
    translationOrigin: translationOrigin(localized.translationOrigin),
    reviewStatus: reviewStatus(review?.status),
    reviewUpdatedAt: stringValue(review?.updatedAt) || datePart(now),
    reviewedAt: stringValue(review?.reviewedAt),
    reviewVersion: stringValue(review?.version) || "0.1",
    reviewerIds: reviewerIds.join("\n"),
    humanVerifiedBy: stringValue(localized.humanVerifiedBy),
    publishedAt: stringValue(localized.publishedAt),
  };
}

export function createEnglishWorkflow(now: string): LocaleWorkflowInput {
  return {
    state: "draft",
    translationOrigin: "human-translated",
    reviewStatus: "draft",
    reviewUpdatedAt: datePart(now),
    reviewedAt: "",
    reviewVersion: "0.1",
    reviewerIds: "",
    humanVerifiedBy: "",
    publishedAt: "",
  };
}

export function ensureEnglishLocale(
  recordDraft: RecordDraft,
  now: string,
): RecordDraft {
  const record = structuredClone(recordDraft);
  const locales = ensureRecord(record, "locales");
  const current = asRecord(locales.en);
  if (current && current.state !== "missing") {
    return record;
  }

  const type = contentType(stringValue(record.type));
  if (!type) {
    throw new Error("无法为未知内容类型创建英文版本。");
  }
  locales.en = {
    state: "draft",
    title: "",
    summary: "",
    fields: structuredClone(contentTypeRegistry[type].defaultValues.localized),
    translationOrigin: "human-translated",
    review: {
      status: "draft",
      updatedAt: datePart(now),
      version: "0.1",
      reviewerIds: [],
      references: [],
    },
  };
  return record;
}

export function applyLocaleWorkflow(
  recordDraft: RecordDraft,
  locale: Locale,
  input: LocaleWorkflowInput,
  now: string,
): RecordDraft {
  let record = structuredClone(recordDraft);
  if (locale === "en") {
    record = ensureEnglishLocale(record, now);
  }
  const locales = ensureRecord(record, "locales");
  const localized = ensureRecord(locales, locale);
  const existingReview = asRecord(localized.review) ?? {};
  const reviewerIds = parseReviewerIds(input.reviewerIds);

  localized.state = input.state;
  localized.translationOrigin = input.translationOrigin;
  const review: Record<string, unknown> = {
    ...existingReview,
    status: input.reviewStatus,
    updatedAt: input.reviewUpdatedAt.trim(),
    version: input.reviewVersion.trim(),
    reviewerIds,
    references: Array.isArray(existingReview.references)
      ? existingReview.references
      : [],
  };
  if (input.reviewStatus === "reviewed" && input.reviewedAt.trim()) {
    review.reviewedAt = input.reviewedAt.trim();
  } else {
    delete review.reviewedAt;
  }
  localized.review = review;

  setOptionalString(localized, "humanVerifiedBy", input.humanVerifiedBy);
  setOptionalString(localized, "publishedAt", input.publishedAt);
  return record;
}

export function validateLocaleWorkflow(
  input: LocaleWorkflowInput,
  mode: LocaleWorkflowValidationMode = "publish",
): LocaleWorkflowErrors {
  const errors: LocaleWorkflowErrors = {};
  const requiresCompleteReview =
    mode === "publish" ||
    input.state === "approved" ||
    input.state === "published";
  const reviewUpdatedAt = input.reviewUpdatedAt.trim();
  const reviewVersion = input.reviewVersion.trim();

  if (
    (requiresCompleteReview && !isIsoDate(reviewUpdatedAt)) ||
    (reviewUpdatedAt && !isIsoDate(reviewUpdatedAt))
  ) {
    errors.reviewUpdatedAt = "审核更新时间必须是有效日期。";
  }
  if (
    (requiresCompleteReview && !/^\d+\.\d+$/.test(reviewVersion)) ||
    (reviewVersion && !/^\d+\.\d+$/.test(reviewVersion))
  ) {
    errors.reviewVersion = "审核版本必须使用 major.minor 格式。";
  }

  const reviewerIds = parseReviewerIds(input.reviewerIds);
  const invalidReviewer = reviewerIds.find(
    (reviewerId) => !stableIdSchema.safeParse(reviewerId).success,
  );
  if (invalidReviewer) {
    errors.reviewerIds = `审核人 ID 格式无效：${invalidReviewer}。`;
  }
  const reviewedAt = input.reviewedAt.trim();
  if (reviewedAt && !isIsoDate(reviewedAt)) {
    errors.reviewedAt = "已审核状态必须填写有效审核日期。";
  } else if (requiresCompleteReview && input.reviewStatus === "reviewed") {
    if (!reviewedAt) {
      errors.reviewedAt = "已审核状态必须填写有效审核日期。";
    } else if (
      isIsoDate(reviewUpdatedAt) &&
      reviewedAt < reviewUpdatedAt
    ) {
      errors.reviewedAt = "审核日期不能早于审核更新时间。";
    }
    if (reviewerIds.length === 0) {
      errors.reviewerIds = "已审核状态必须至少填写一位审核人。";
    }
  }
  if (
    (input.state === "approved" || input.state === "published") &&
    input.reviewStatus !== "reviewed"
  ) {
    errors.reviewStatus = "发布候选或已发布状态必须完成审核。";
  }
  if (input.state === "published" && !isIsoTimestamp(input.publishedAt.trim())) {
    errors.publishedAt = "已发布状态必须填写带时区的 ISO 8601 时间。";
  }
  if (
    input.humanVerifiedBy.trim() &&
    !stableIdSchema.safeParse(input.humanVerifiedBy.trim()).success
  ) {
    errors.humanVerifiedBy = "人工复核人必须使用有效的稳定 ID。";
  }
  if (
    input.state === "published" &&
    input.translationOrigin === "machine-assisted" &&
    !input.humanVerifiedBy.trim()
  ) {
    errors.humanVerifiedBy = "机器辅助英文发布前必须记录人工复核人。";
  }
  return errors;
}

export function requestLocaleState(
  locale: Locale,
  current: LocaleWorkflowInput,
  nextState: PresentWorkflowState,
) {
  const transition = validateWorkflowTransition({
    locale,
    from: current.state,
    to: nextState,
    reviewerEvidence:
      current.reviewStatus === "reviewed" &&
      Boolean(current.reviewedAt.trim()) &&
      parseReviewerIds(current.reviewerIds).length > 0,
  });
  return {
    allowed: transition.allowed,
    error: transition.issues[0]?.message,
  };
}

export function markLocaleContentEdited(
  input: LocaleWorkflowInput,
  now: string,
): LocaleWorkflowInput {
  const state = stateAfterSubstantiveEdit(input.state);
  const reviewWasInvalidated =
    state !== input.state || input.reviewStatus === "reviewed";
  return {
    ...input,
    state,
    reviewStatus: reviewWasInvalidated
      ? state === "draft"
        ? "draft"
        : "internal-review"
      : input.reviewStatus,
    reviewUpdatedAt: reviewWasInvalidated
      ? datePart(now)
      : input.reviewUpdatedAt,
    reviewedAt: reviewWasInvalidated ? "" : input.reviewedAt,
  };
}

export function parkEnglishLocale(
  recordDraft: RecordDraft,
): { recordDraft: RecordDraft; parkedEnglishLocale?: ParkedEnglishLocale } {
  const record = structuredClone(recordDraft);
  const locales = ensureRecord(record, "locales");
  const english = asRecord(locales.en);
  const type = stringValue(record.type);
  locales.en = { state: "missing" };
  return {
    recordDraft: record,
    ...(english && english.state !== "missing"
      ? {
          parkedEnglishLocale: {
            contentType: type,
            locale: structuredClone(english),
          },
        }
      : {}),
  };
}

export function restoreEnglishLocale(
  recordDraft: RecordDraft,
  parked: unknown,
  now: string,
): RecordDraft {
  const record = structuredClone(recordDraft);
  const parsed = inspectParkedEnglishLocale(parked);
  if (parsed && parsed.contentType === record.type) {
    const locales = ensureRecord(record, "locales");
    const locale = structuredClone(parsed.locale);
    const state = presentState(locale.state) ?? "draft";
    if (state === "approved" || state === "published") {
      locale.state = "internal-review";
      const review = ensureRecord(locale, "review");
      review.status = "internal-review";
      review.updatedAt = datePart(now);
      delete review.reviewedAt;
    }
    locales.en = locale;
    return record;
  }
  return ensureEnglishLocale(record, now);
}

export function inspectParkedEnglishLocale(
  value: unknown,
): ParkedEnglishLocale | null {
  const parked = asRecord(value);
  const locale = asRecord(parked?.locale);
  if (
    !parked ||
    typeof parked.contentType !== "string" ||
    !locale ||
    locale.state === "missing"
  ) {
    return null;
  }
  return { contentType: parked.contentType, locale };
}

export function setEnglishLocaleMissing(recordDraft: RecordDraft): RecordDraft {
  const record = structuredClone(recordDraft);
  ensureRecord(record, "locales").en = { state: "missing" };
  return record;
}

export function parseReviewerIds(value: string): string[] {
  return [...new Set(value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean))];
}

function contentType(value: string) {
  return (CONTENT_TYPES as readonly string[]).includes(value)
    ? (value as (typeof CONTENT_TYPES)[number])
    : null;
}

function presentState(value: unknown): PresentWorkflowState | null {
  return ["draft", "internal-review", "approved", "published", "archived"].includes(
    String(value),
  )
    ? (value as PresentWorkflowState)
    : null;
}

function translationOrigin(value: unknown): TranslationOrigin {
  return (TRANSLATION_ORIGINS as readonly unknown[]).includes(value)
    ? (value as TranslationOrigin)
    : "source-authored";
}

function reviewStatus(value: unknown): ReviewStatus {
  return (REVIEW_STATUSES as readonly unknown[]).includes(value)
    ? (value as ReviewStatus)
    : "draft";
}

function datePart(value: string) {
  return value.slice(0, 10);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
