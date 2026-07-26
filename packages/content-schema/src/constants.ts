export const CONTENT_SCHEMA_VERSION = 1 as const;

export const CONTENT_TYPES = [
  "team-news",
  "research-output",
  "research-project",
  "learning-resource",
  "algae-profile",
  "live-feed-profile",
  "coastal-observation",
  "science-article",
  "team-member",
  "collaboration",
  "research-profile",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const PRESENT_WORKFLOW_STATES = [
  "draft",
  "internal-review",
  "approved",
  "published",
  "archived",
] as const;

export const ENGLISH_WORKFLOW_STATES = [
  "missing",
  ...PRESENT_WORKFLOW_STATES,
] as const;

export type PresentWorkflowState =
  (typeof PRESENT_WORKFLOW_STATES)[number];
export type EnglishWorkflowState =
  (typeof ENGLISH_WORKFLOW_STATES)[number];

export const TRANSLATION_ORIGINS = [
  "source-authored",
  "human-translated",
  "machine-assisted",
] as const;

export type TranslationOrigin = (typeof TRANSLATION_ORIGINS)[number];

export const REVIEW_STATUSES = [
  "draft",
  "internal-review",
  "reviewed",
] as const;

// Internal workbench automation is not a public article author. It may be
// recorded in legacy reviewer fields when direct publishing is enabled.
export const SINGLE_USER_DIRECT_OPERATOR_ID = "workbench-single-user" as const;

export const REFERENCE_KINDS = [
  "article",
  "dataset",
  "taxonomy",
  "policy",
  "manual",
  "other",
] as const;

export const REFERENCE_IDENTIFIER_SCHEMES = [
  "doi",
  "isbn",
  "url",
  "other",
] as const;

export const AUTHOR_KINDS = ["person", "team", "organization"] as const;
export const AUTHOR_STATUSES = ["active", "inactive"] as const;
export const PUBLIC_SCOPES = ["approved", "pending"] as const;

export const MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const MEDIA_CONSENT_STATES = [
  "not-applicable",
  "confirmed",
  "pending",
] as const;

export const MEDIA_RIGHTS_STATUSES = [
  "approved",
  "pending",
  "restricted",
] as const;

export const MEDIA_IDENTIFICATION_STATUSES = [
  "not-applicable",
  "unverified",
  "provisional",
  "verified",
] as const;

export const LICENSE_IDENTIFIERS = [
  "cc0-1.0",
  "cc-by-4.0",
  "cc-by-sa-4.0",
  "public-domain",
  "team-owned",
  "permission-granted",
  "other",
] as const;
