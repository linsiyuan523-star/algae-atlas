import { CONTENT_TYPES, type ContentType, type Locale } from "@algae-atlas/content-schema";

import { liveFeedEntries } from "@/lib/live-feeds-data";
import {
  algae,
  articles,
  projects,
  text,
  type LocalizedText,
} from "@/lib/site-data";
import { researchAreas, tutorials } from "@/lib/team-data";

import type {
  PublicContentEntry,
  PublicContentSource,
  PublicLocaleContent,
} from "./types";

const LEGACY_UPDATED_AT = "2026-07-12T00:00:00+08:00";

type LegacyEntryOptions = {
  id: string;
  type: ContentType;
  title: LocalizedText;
  summary: LocalizedText;
  seoTitle?: LocalizedText;
  shared?: Readonly<Record<string, unknown>>;
  legacyData: unknown;
  updatedAt?: string;
};

function localeContent(
  locale: Locale,
  options: LegacyEntryOptions,
): PublicLocaleContent {
  return {
    locale,
    title: text(options.title, locale),
    ...(options.seoTitle ? { seoTitle: text(options.seoTitle, locale) } : {}),
    summary: text(options.summary, locale),
    fields: {},
    updatedAt: options.updatedAt ?? LEGACY_UPDATED_AT,
  };
}

function legacyEntry(options: LegacyEntryOptions): PublicContentEntry {
  return {
    id: options.id,
    type: options.type,
    source: "legacy",
    tags: [],
    shared: options.shared ?? {},
    locales: {
      zh: localeContent("zh", options),
      en: localeContent("en", options),
    },
    media: {},
    legacyData: options.legacyData,
  };
}

export function createLegacyContentSource(): PublicContentSource {
  const byType = new Map<ContentType, PublicContentEntry[]>(
    CONTENT_TYPES.map((type) => [type, []]),
  );
  const add = (entry: PublicContentEntry) => byType.get(entry.type)?.push(entry);

  for (const area of researchAreas) {
    add(
      legacyEntry({
        id: area.id,
        type: "research-profile",
        title: area.title,
        summary: area.summary,
        shared: { routeKey: area.id },
        legacyData: area,
      }),
    );
  }
  add(
    legacyEntry({
      id: "algal-blooms",
      type: "research-profile",
      title: {
        zh: "近岸藻华与赤潮监测",
        en: "Coastal Algal Blooms and Red-Tide Monitoring",
      },
      summary: {
        zh: "了解近岸藻华与赤潮监测的研究问题、现场记录、样品分析、数据边界与潜在合作。",
        en: "Explore research questions, field records, sample analysis, data boundaries, and potential collaboration for coastal algal blooms and red-tide monitoring.",
      },
      shared: { routeKey: "algal-blooms" },
      legacyData: { kind: "algal-blooms" },
    }),
  );

  for (const entry of liveFeedEntries) {
    add(
      legacyEntry({
        id: entry.id,
        type: "live-feed-profile",
        title: entry.name,
        seoTitle: {
          zh: `${entry.name.zh}｜生物饵料与浮游动物`,
          en: `${entry.name.en} | Live Feeds & Zooplankton`,
        },
        summary: entry.overview,
        shared: { category: entry.category },
        legacyData: entry,
      }),
    );
  }

  for (const entry of tutorials) {
    add(
      legacyEntry({
        id: entry.id,
        type: "learning-resource",
        title: entry.name,
        summary: entry.purpose,
        legacyData: entry,
      }),
    );
  }

  for (const entry of algae) {
    add(
      legacyEntry({
        id: entry.id,
        type: "algae-profile",
        title: entry.name,
        summary: entry.summary,
        shared: {
          scientificName: entry.latin,
          profileCategory: entry.category,
        },
        legacyData: entry,
      }),
    );
  }

  for (const entry of [...articles, ...projects]) {
    const updatedAt = "date" in entry
      ? `${entry.date}T00:00:00+08:00`
      : LEGACY_UPDATED_AT;
    add(
      legacyEntry({
        id: entry.id,
        type: "science-article",
        title: entry.title,
        summary: entry.summary,
        shared: {
          ...("date" in entry ? { publicationDate: entry.date } : {}),
        },
        legacyData: entry,
        updatedAt,
      }),
    );
  }

  return {
    kind: "legacy",
    entries(type) {
      return byType.get(type) ?? [];
    },
  };
}
