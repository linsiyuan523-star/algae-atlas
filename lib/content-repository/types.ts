import type {
  Author,
  ContentRecord,
  ContentType,
  Locale,
  Media,
  RepositorySnapshot,
  Review,
} from "@algae-atlas/content-schema";

export type ContentSourceKind = "legacy" | "records";

export type PublicLocaleContent = {
  locale: Locale;
  title: string;
  seoTitle?: string;
  summary: string;
  body?: string;
  fields: Readonly<Record<string, unknown>>;
  review?: Review;
  publishedAt?: string;
  updatedAt: string;
};

export type PublicContentEntry = {
  id: string;
  type: ContentType;
  source: ContentSourceKind;
  tags: readonly string[];
  shared: Readonly<Record<string, unknown>>;
  locales: Partial<Record<Locale, PublicLocaleContent>>;
  media: Readonly<Record<string, Media>>;
  record?: ContentRecord;
  legacyData?: unknown;
};

export type PublicRecord = PublicContentEntry & {
  locale: Locale;
  content: PublicLocaleContent;
};

export type ContentAvailability = {
  zh: boolean;
  en: boolean;
  fallbackSection: Record<Locale, string>;
};

export type PublicListFilter = {
  ids?: readonly string[];
  tags?: readonly string[];
};

export type PublicContentSource = {
  kind: ContentSourceKind;
  entries(type: ContentType): readonly PublicContentEntry[];
};

export type CollectionSourceSelection = Readonly<
  Record<ContentType, ContentSourceKind>
>;

export type PublicContentRepository = {
  entries(type: ContentType): readonly PublicContentEntry[];
  list(
    type: ContentType,
    locale: Locale,
    filter?: PublicListFilter,
  ): readonly PublicRecord[];
  get(type: ContentType, id: string, locale: Locale): PublicRecord | null;
  availability(type: ContentType, id: string): ContentAvailability | null;
  sourceKind(type: ContentType): ContentSourceKind;
};

export type LoadedContentRepository = {
  snapshot: RepositorySnapshot;
  records: readonly ContentRecord[];
  authors: readonly Author[];
  media: readonly Media[];
  markdown: Readonly<Record<string, string>>;
  recordPaths: Readonly<Record<string, string>>;
};
