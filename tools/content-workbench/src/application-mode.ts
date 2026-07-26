export const APPLICATION_MODES = ["single-user-direct", "team-review"] as const;

export type ApplicationMode = (typeof APPLICATION_MODES)[number];

export const DEFAULT_APPLICATION_MODE: ApplicationMode = "single-user-direct";

// The publish integration uses this schema-safe operator reference when legacy
// review metadata must be populated without exposing reviewer selection.
export const SINGLE_USER_DIRECT_OPERATOR_ID = "workbench-single-user";

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
