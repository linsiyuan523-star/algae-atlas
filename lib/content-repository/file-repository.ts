import { loadContentRepository } from "./file-loader";
import { createLegacyContentSource } from "./legacy-source";
import { createRecordContentSource } from "./record-source";
import { createPublicContentRepository } from "./repository";
import type {
  CollectionSourceSelection,
  ContentRepositoryMode,
  PublicContentRepository,
} from "./types";

export async function createFileBackedContentRepository(
  repositoryRoot: string,
  selection: CollectionSourceSelection,
  mode?: ContentRepositoryMode,
): Promise<PublicContentRepository> {
  const loaded = await loadContentRepository(repositoryRoot);
  return createPublicContentRepository({
    selection,
    mode,
    legacySource: createLegacyContentSource(),
    recordSource: createRecordContentSource(loaded),
  });
}
