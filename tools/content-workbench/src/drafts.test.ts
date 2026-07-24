import { describe, expect, test } from "vitest";
import { inspectDraft, normalizeStoredDraft } from "./drafts";

const envelope = {
  draftId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-07-23T08:00:00Z",
  updatedAt: "2026-07-23T08:00:00Z",
};

describe("stored draft compatibility", () => {
  test("keeps legacy identity fields available for a shared-schema save", () => {
    const legacy = normalizeStoredDraft({
      ...envelope,
      formatVersion: 1,
      contentType: "team-news",
      stableId: "fictional-news",
      titleZh: "旧草稿",
    });

    expect(legacy.legacyFields).toEqual({
      contentType: "team-news",
      stableId: "fictional-news",
      titleZh: "旧草稿",
    });
    expect(inspectDraft(legacy)).toEqual({
      fields: legacy.legacyFields,
      errors: {},
    });
    expect(legacy.bodyEn).toBe("");
  });

  test("surfaces invalid record identity as field errors without throwing", () => {
    const current = normalizeStoredDraft({
      ...envelope,
      formatVersion: 4,
      bodyZh: "## 正文\n",
      bodyEn: "## English\n",
      parkedEnglishLocale: {
        contentType: "team-news",
        locale: { state: "draft", title: "English draft" },
      },
      recordDraft: {
        schemaVersion: 7,
        id: "Bad ID",
        type: "unknown",
        locales: { zh: { title: "" } },
      },
    });

    expect(inspectDraft(current).errors).toEqual({
      contentType: "请选择有效的内容类型。",
      stableId: "必须使用小写英文、数字和单个连字符组成的稳定 ID",
      titleZh: "中文标题不能为空。",
      schemaVersion: "仅支持 Schema v1。",
    });
    expect(current.bodyZh).toBe("## 正文\n");
    expect(current.bodyEn).toBe("## English\n");
    expect(current.parkedEnglishLocale).toMatchObject({
      contentType: "team-news",
    });
  });

  test("opens format-three drafts with their Chinese body and empty English", () => {
    const previous = normalizeStoredDraft({
      ...envelope,
      formatVersion: 3,
      bodyZh: "## 正文\n",
      recordDraft: {},
    });

    expect(previous.bodyZh).toBe("## 正文\n");
    expect(previous.bodyEn).toBe("");
  });

  test("opens format-two drafts with an empty Chinese body", () => {
    const previous = normalizeStoredDraft({
      ...envelope,
      formatVersion: 2,
      recordDraft: {},
    });

    expect(previous.bodyZh).toBe("");
    expect(previous.bodyEn).toBe("");
  });

  test("rejects unsupported envelope versions", () => {
    expect(() =>
      normalizeStoredDraft({
        ...envelope,
        formatVersion: 5,
        recordDraft: {},
      }),
    ).toThrow("草稿格式版本不受支持。");
  });
});
