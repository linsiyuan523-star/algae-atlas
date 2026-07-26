import type { CollectionSourceSelection } from "./types";
import { createFileBackedContentRepository } from "./file-repository";
import { createLegacyContentSource } from "./legacy-source";
import {
  createCollectionSourceSelection,
  createPublicContentRepository,
} from "./repository";

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

export function resolveContentRepositorySource(
  configuredSource = process.env.CONTENT_REPOSITORY_SOURCE,
): "legacy" | "records" {
  if (!configuredSource || configuredSource === "legacy") return "legacy";
  if (configuredSource === "records") return "records";
  throw new Error(
    `Invalid CONTENT_REPOSITORY_SOURCE value "${configuredSource}". Expected "records" or "legacy".`,
  );
}

const contentRepositorySource = resolveContentRepositorySource();

export const websiteContentRepository =
  contentRepositorySource === "records"
    ? await createFileBackedContentRepository(
        process.cwd(),
        createCollectionSourceSelection("records"),
      )
    : createPublicContentRepository({
        selection: collectionSourceSelection,
        legacySource,
      });
