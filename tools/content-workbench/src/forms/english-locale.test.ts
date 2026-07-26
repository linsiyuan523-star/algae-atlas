import {
  CONTENT_TYPES,
  contentTypeRegistry,
  createRecordDraftDefaults,
} from "@algae-atlas/content-schema";
import { describe, expect, test } from "vitest";
import { ensureEnglishLocale } from "../locale-workflow";
import { getEnglishContentFormAdapter } from "./english-locale";

const now = "2026-07-24T09:00:00+08:00";

describe("English form adapters", () => {
  test.each(CONTENT_TYPES)("covers every localized field for %s", (contentType) => {
    const adapter = getEnglishContentFormAdapter(contentType);
    if (!adapter) {
      throw new Error(`missing English adapter for ${contentType}`);
    }
    const definition = contentTypeRegistry[contentType];
    const fieldIds = adapter.schema.sections.flatMap((section) =>
      section.fields.map((field) => field.id),
    );
    expect(fieldIds).toEqual([
      "titleEn",
      "summaryEn",
      ...definition.localizedFields.map((field) => field.key),
    ]);

    const values = adapter.emptyValues();
    values.titleEn = "Fictional English title";
    values.summaryEn = "Fictional English summary.";
    for (const field of definition.localizedFields) {
      values[field.key] =
        field.kind === "text-list"
          ? `Fictional ${field.key} one\nFictional ${field.key} two`
          : `Fictional ${field.key}`;
    }
    expect(adapter.validateValues(values)).toEqual({});

    const initial = ensureEnglishLocale(
      createRecordDraftDefaults(contentType, validId(contentType), now),
      now,
    );
    const applied = adapter.apply(initial, values, now);
    const locales = applied.locales as Record<string, unknown>;
    const english = locales.en as Record<string, unknown>;
    const fields = english.fields as Record<string, unknown>;
    expect(english).toMatchObject({
      state: "draft",
      title: "Fictional English title",
      summary: "Fictional English summary.",
    });
    for (const field of definition.localizedFields) {
      expect(fields[field.key]).toEqual(
        field.kind === "text-list"
          ? [`Fictional ${field.key} one`, `Fictional ${field.key} two`]
          : `Fictional ${field.key}`,
      );
    }
  });

  test("copies Chinese values as an unreviewed translation scaffold", () => {
    const adapter = getEnglishContentFormAdapter("science-article");
    if (!adapter) {
      throw new Error("science article adapter must exist");
    }
    expect(
      adapter.copyChineseValues("虚构标题", {
        summaryZh: "虚构摘要",
        topic: "虚构主题",
        targetAudienceLabel: "公众",
        categoryLabel: "",
      }),
    ).toEqual({
      titleEn: "虚构标题",
      summaryEn: "虚构摘要",
      topic: "虚构主题",
      targetAudienceLabel: "公众",
      categoryLabel: "",
    });
  });

  test("requires complete English fields before publication", () => {
    const adapter = getEnglishContentFormAdapter("science-article");
    if (!adapter) {
      throw new Error("science article adapter must exist");
    }
    expect(adapter.validateValues(adapter.emptyValues())).toMatchObject({
      titleEn: "英文标题不能为空。",
      summaryEn: "英文摘要不能为空。",
      topic: "Topic不能为空。",
      targetAudienceLabel: "Target audience label不能为空。",
    });
  });
});

function validId(contentType: string) {
  return contentType === "research-profile" ? "microalgae" : `fictional-${contentType}`;
}
