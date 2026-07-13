import type { LocalizedText } from "@/lib/site-data";

export type ReviewStatus = "draft" | "internal-review" | "reviewed";

export type ReferenceItem = {
  title: LocalizedText;
  href?: string;
  note?: LocalizedText;
};

export type ContentReview = {
  status: ReviewStatus;
  author?: string;
  reviewer?: string;
  updatedAt: string;
  reviewedAt?: string;
  version?: string;
  references?: ReferenceItem[];
};

export const reviewStatusLabels: Record<ReviewStatus, LocalizedText> = {
  draft: { zh: "草稿", en: "Draft" },
  "internal-review": { zh: "内部审核中", en: "Internal review" },
  reviewed: { zh: "已审核", en: "Reviewed" },
};

export function createContentReview(status: ReviewStatus, updatedAt: string): ContentReview {
  return { status, updatedAt };
}
