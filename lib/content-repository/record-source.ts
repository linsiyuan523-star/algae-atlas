import {
  CONTENT_TYPES,
  LOCALES,
  markdownKey,
  publicationEligibility,
  type ContentType,
  type ResolvedReferences,
} from "@algae-atlas/content-schema";

import type {
  LoadedContentRepository,
  PublicContentEntry,
  PublicContentSource,
  PublicLocaleContent,
} from "./types";

function recordValue(value: unknown): Readonly<Record<string, unknown>> {
  return value as Readonly<Record<string, unknown>>;
}

export function createRecordContentSource(
  loaded: LoadedContentRepository,
): PublicContentSource {
  const records = Object.fromEntries(loaded.records.map((record) => [record.id, record]));
  const authors = Object.fromEntries(loaded.authors.map((author) => [author.id, author]));
  const media = Object.fromEntries(loaded.media.map((item) => [item.id, item]));
  const resolved: ResolvedReferences = {
    records,
    authors,
    media,
    markdown: loaded.markdown,
  };
  const byType = new Map<ContentType, PublicContentEntry[]>(
    CONTENT_TYPES.map((type) => [type, []]),
  );

  for (const record of loaded.records) {
    const locales: Partial<Record<(typeof LOCALES)[number], PublicLocaleContent>> = {};
    for (const locale of LOCALES) {
      if (!publicationEligibility(record, locale, resolved).eligible) continue;
      const localized = record.locales[locale];
      if (localized.state === "missing") continue;
      locales[locale] = {
        locale,
        title: localized.title,
        summary: localized.summary,
        body: loaded.markdown[markdownKey(record, locale)],
        fields: recordValue(localized.fields),
        review: localized.review,
        publishedAt: localized.publishedAt,
        updatedAt: record.updatedAt,
      };
    }

    byType.get(record.type)?.push({
      id: record.id,
      type: record.type,
      source: "records",
      tags: record.tags,
      shared: recordValue(record.shared),
      locales,
      media,
      record,
    });
  }

  return {
    kind: "records",
    entries(type) {
      return byType.get(type) ?? [];
    },
  };
}

export function createEmptyContentSource(
  kind: PublicContentSource["kind"],
): PublicContentSource {
  return {
    kind,
    entries() {
      return [];
    },
  };
}
