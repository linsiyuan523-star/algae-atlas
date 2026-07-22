import type { Author, Media } from "./models";
import type { ContentRecord } from "./schemas";
import { parseAuthor, parseMedia, parseRecord } from "./validation";

const SET_LIKE_ARRAY_KEYS = new Set([
  "authors",
  "tags",
  "media",
  "relatedContentIds",
  "relatedProjectIds",
  "relatedOutputIds",
  "relatedResearchProfileIds",
  "relatedObservationIds",
  "relatedGuideIds",
  "relatedAlgaeIds",
  "relatedCollaborationIds",
  "participantAuthorIds",
  "partnerAuthorIds",
  "partnerOrganizationIds",
  "attachmentMediaIds",
  "mediaIds",
  "publicSampleIds",
  "taxonomicObservationIds",
]);

export class ContentSerializationError extends Error {
  readonly issues;

  constructor(issues: ReturnType<typeof parseRecord>["issues"]) {
    super("内容记录未通过校验，不能序列化");
    this.name = "ContentSerializationError";
    this.issues = issues;
  }
}

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalize(item));
    if (
      key &&
      SET_LIKE_ARRAY_KEYS.has(key) &&
      normalized.every((item) => typeof item === "string")
    ) {
      return [...(normalized as string[])].sort((left, right) =>
        left.localeCompare(right, "en"),
      );
    }
    return normalized;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        canonicalize(childValue, childKey),
      ]),
    );
  }

  return value;
}

function serializeValidated(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function serializeRecord(record: unknown): string {
  const parsed = parseRecord(record);
  if (!parsed.success) {
    throw new ContentSerializationError(parsed.issues);
  }
  return serializeValidated(parsed.data);
}

export function serializeAuthor(author: unknown): string {
  const parsed = parseAuthor(author);
  if (!parsed.success) {
    throw new ContentSerializationError(parsed.issues);
  }
  return serializeValidated(parsed.data satisfies Author);
}

export function serializeMedia(media: unknown): string {
  const parsed = parseMedia(media);
  if (!parsed.success) {
    throw new ContentSerializationError(parsed.issues);
  }
  return serializeValidated(parsed.data satisfies Media);
}

export function normalizeRecord(record: ContentRecord): ContentRecord {
  return JSON.parse(serializeRecord(record)) as ContentRecord;
}
