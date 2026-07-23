import { createRecordDraftDefaults } from "@algae-atlas/content-schema";
import { describe, expect, test } from "vitest";
import {
  contentTypeOptions,
  createSharedRecordDraft,
  inspectRecordDraft,
  updateSharedRecordDraft,
  validateDraftFields,
} from "./schema-drafts";

const now = "2026-07-23T08:00:00Z";

describe("shared schema draft adapter", () => {
  test("exposes all registered content types with bilingual labels", () => {
    expect(contentTypeOptions).toHaveLength(11);
    expect(contentTypeOptions[0]).toEqual({
      value: "team-news",
      labelZh: "团队动态",
      labelEn: "Team news",
    });
  });

  test("creates the canonical shared defaults and adds the Chinese title", () => {
    const result = createSharedRecordDraft(
      {
        contentType: "science-article",
        stableId: "fictional-article",
        titleZh: " 虚构文章 ",
      },
      now,
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const expected = createRecordDraftDefaults(
      "science-article",
      "fictional-article",
      now,
    );
    const locales = expected.locales as Record<string, Record<string, unknown>>;
    locales.zh.title = "虚构文章";
    expect(result.recordDraft).toEqual(expected);
  });

  test("returns field errors instead of throwing for invalid identity fields", () => {
    expect(
      validateDraftFields({
        contentType: "not-registered",
        stableId: "Bad ID",
        titleZh: " ",
      }),
    ).toEqual({
      contentType: "请选择有效的内容类型。",
      stableId: "必须使用小写英文、数字和单个连字符组成的稳定 ID",
      titleZh: "中文标题不能为空。",
    });
  });

  test("preserves same-type defaults but refuses an unsupported schema version", () => {
    const initial = createSharedRecordDraft(
      {
        contentType: "team-news",
        stableId: "fictional-news",
        titleZh: "初始标题",
      },
      now,
    );
    if (!initial.success) {
      throw new Error("test draft must be valid");
    }
    const shared = initial.recordDraft.shared as Record<string, unknown>;
    shared.pinned = true;

    const updated = updateSharedRecordDraft(
      initial.recordDraft,
      {
        contentType: "team-news",
        stableId: "fictional-news",
        titleZh: "更新标题",
      },
      "2026-07-23T09:00:00Z",
    );
    expect(updated.success).toBe(true);
    if (updated.success) {
      expect((updated.recordDraft.shared as Record<string, unknown>).pinned).toBe(true);
      expect(inspectRecordDraft(updated.recordDraft).fields.titleZh).toBe("更新标题");
    }

    const future = updateSharedRecordDraft(
      { ...initial.recordDraft, schemaVersion: 2 },
      inspectRecordDraft(initial.recordDraft).fields,
      now,
    );
    expect(future).toEqual({
      success: false,
      errors: { schemaVersion: "仅支持 Schema v1，不会覆盖其他版本。" },
    });
  });
});
