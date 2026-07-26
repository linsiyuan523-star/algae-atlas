import { SINGLE_USER_DIRECT_OPERATOR_ID as SCHEMA_SINGLE_USER_DIRECT_OPERATOR_ID } from "@algae-atlas/content-schema";
import type { LocaleWorkflowInput } from "./locale-workflow";

export const APPLICATION_MODES = ["single-user-direct", "team-review"] as const;

export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export const DEFAULT_APPLICATION_MODE: ApplicationMode = "single-user-direct";

// The publish integration uses this schema-safe operator reference when legacy
// review metadata must be populated without exposing reviewer selection.
export const SINGLE_USER_DIRECT_OPERATOR_ID = SCHEMA_SINGLE_USER_DIRECT_OPERATOR_ID;

export function normalizeDirectPublishWorkflow(
  input: LocaleWorkflowInput,
  now = new Date(),
): LocaleWorkflowInput {
  const timestamp = now.toISOString();
  const reviewedAt = timestamp.slice(0, 10);
  return {
    ...input,
    state: "published",
    reviewStatus: "reviewed",
    reviewUpdatedAt: reviewedAt,
    reviewedAt,
    reviewVersion: /^\d+\.\d+$/.test(input.reviewVersion.trim())
      ? input.reviewVersion.trim()
      : "0.1",
    reviewerIds: SINGLE_USER_DIRECT_OPERATOR_ID,
    humanVerifiedBy:
      input.translationOrigin === "machine-assisted"
        ? SINGLE_USER_DIRECT_OPERATOR_ID
        : input.humanVerifiedBy,
    publishedAt: timestamp,
  };
}

export type ApplicationModeFeatures = {
  showLegacyNavigation: boolean;
  showReviewControls: boolean;
  showGitHubDraftPr: boolean;
};

const MODE_FEATURES: Record<ApplicationMode, ApplicationModeFeatures> = {
  "single-user-direct": {
    showLegacyNavigation: false,
    showReviewControls: false,
    showGitHubDraftPr: false,
  },
  "team-review": {
    showLegacyNavigation: true,
    showReviewControls: true,
    showGitHubDraftPr: true,
  },
};

export function applicationModeFeatures(
  mode: ApplicationMode,
): ApplicationModeFeatures {
  return MODE_FEATURES[mode];
}
