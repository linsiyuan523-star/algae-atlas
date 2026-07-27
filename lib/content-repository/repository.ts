import {
  CONTENT_TYPES,
  contentTypeRegistry,
  type ContentType,
  type Locale,
} from "@algae-atlas/content-schema";

import type {
  CollectionSourceSelection,
  ContentAvailability,
  ContentRepositoryMode,
  ContentSourceKind,
  PublicContentEntry,
  PublicContentRepository,
  PublicContentSource,
  PublicListFilter,
  PublicRecord,
} from "./types";

function dateSortValue(entry: PublicContentEntry, locale: Locale): string {
  const sharedDateKeys = [
    "eventDate",
    "publicationDate",
    "observationStartedAt",
    "startDate",
  ];
  for (const key of sharedDateKeys) {
    const value = entry.shared[key];
    if (typeof value === "string") return value;
  }
  return entry.locales[locale]?.publishedAt ?? entry.locales[locale]?.updatedAt ?? "";
}

function compareEntries(
  left: PublicContentEntry,
  right: PublicContentEntry,
  locale: Locale,
): number {
  if (left.type === "team-news") {
    const pinned = Number(Boolean(right.shared.pinned)) - Number(Boolean(left.shared.pinned));
    if (pinned !== 0) return pinned;
  }
  if (left.type === "team-member") {
    const leftOrder = typeof left.shared.displayOrder === "number" ? left.shared.displayOrder : 0;
    const rightOrder = typeof right.shared.displayOrder === "number" ? right.shared.displayOrder : 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  if (left.type === "research-profile") {
    const fixedIds = contentTypeRegistry["research-profile"].fixedIds;
    const fixedOrder = fixedIds.indexOf(left.id as (typeof fixedIds)[number]) -
      fixedIds.indexOf(right.id as (typeof fixedIds)[number]);
    if (fixedOrder !== 0) return fixedOrder;
  }

  const dateOrder = dateSortValue(right, locale).localeCompare(
    dateSortValue(left, locale),
    "en",
  );
  if (dateOrder !== 0) return dateOrder;
  const titleOrder = (left.locales[locale]?.title ?? left.id).localeCompare(
    right.locales[locale]?.title ?? right.id,
    locale === "zh" ? "zh-CN" : "en",
  );
  return titleOrder || left.id.localeCompare(right.id, "en");
}

function matchesFilter(entry: PublicContentEntry, filter?: PublicListFilter): boolean {
  if (filter?.ids && !filter.ids.includes(entry.id)) return false;
  if (filter?.tags && !filter.tags.every((tag) => entry.tags.includes(tag))) return false;
  return true;
}

function localizedRecord(
  entry: PublicContentEntry,
  locale: Locale,
): PublicRecord | null {
  const content = entry.locales[locale];
  return content ? { ...entry, locale, content } : null;
}

function fallbackSection(type: ContentType, locale: Locale): string {
  return contentTypeRegistry[type].sectionPath.replace("[locale]", locale);
}

export function createCollectionSourceSelection(
  source: ContentSourceKind,
): CollectionSourceSelection {
  return Object.fromEntries(
    CONTENT_TYPES.map((type) => [type, source]),
  ) as CollectionSourceSelection;
}

export function createPublicContentRepository(options: {
  selection: CollectionSourceSelection;
  mode?: ContentRepositoryMode;
  legacySource?: PublicContentSource;
  recordSource?: PublicContentSource;
}): PublicContentRepository {
  const sources = new Map<ContentSourceKind, PublicContentSource>();
  if (options.legacySource) sources.set("legacy", options.legacySource);
  if (options.recordSource) sources.set("records", options.recordSource);

  function sourceEntries(
    type: ContentType,
    kind: ContentSourceKind,
  ): readonly PublicContentEntry[] {
    const source = sources.get(kind);
    if (!source) {
      throw new Error(`Content type ${type} requires the unavailable ${kind} source.`);
    }
    return source.entries(type);
  }

  function selectedEntries(type: ContentType): readonly PublicContentEntry[] {
    const mode = options.mode ?? options.selection[type];
    if (mode !== "overlay") return sourceEntries(type, mode);

    const records = sourceEntries(type, "records").filter((entry) =>
      Boolean(entry.locales.zh || entry.locales.en),
    );
    const recordIds = new Set(records.map((entry) => entry.id));
    return [
      ...sourceEntries(type, "legacy").filter((entry) => !recordIds.has(entry.id)),
      ...records,
    ];
  }

  return {
    entries(type) {
      return selectedEntries(type);
    },
    list(type, locale, filter) {
      return selectedEntries(type)
        .filter((entry) => Boolean(entry.locales[locale]) && matchesFilter(entry, filter))
        .sort((left, right) => compareEntries(left, right, locale))
        .map((entry) => localizedRecord(entry, locale))
        .filter((entry): entry is PublicRecord => entry !== null);
    },
    get(type, id, locale) {
      const entry = selectedEntries(type)
        .find((candidate) => candidate.id === id);
      return entry ? localizedRecord(entry, locale) : null;
    },
    availability(type, id): ContentAvailability | null {
      const entry = selectedEntries(type)
        .find((candidate) => candidate.id === id);
      if (!entry) return null;
      return {
        zh: Boolean(entry.locales.zh),
        en: Boolean(entry.locales.en),
        fallbackSection: {
          zh: fallbackSection(type, "zh"),
          en: fallbackSection(type, "en"),
        },
      };
    },
    sourceKind(type) {
      return options.mode ?? options.selection[type];
    },
  };
}
