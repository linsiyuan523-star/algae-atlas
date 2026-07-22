import type { CollectionSourceSelection } from "./types";
import { createLegacyContentSource } from "./legacy-source";
import { createPublicContentRepository } from "./repository";

export const collectionSourceSelection = {
  "team-news": "legacy",
  "research-output": "legacy",
  "research-project": "legacy",
  "learning-resource": "legacy",
  "algae-profile": "legacy",
  "live-feed-profile": "legacy",
  "coastal-observation": "legacy",
  "science-article": "legacy",
  "team-member": "legacy",
  collaboration: "legacy",
  "research-profile": "legacy",
} as const satisfies CollectionSourceSelection;

const legacySource = createLegacyContentSource();

export const websiteContentRepository = createPublicContentRepository({
  selection: collectionSourceSelection,
  legacySource,
});
