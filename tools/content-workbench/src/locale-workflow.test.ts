import { createRecordDraftDefaults } from "@algae-atlas/content-schema";
import { describe, expect, test } from "vitest";
import {
  applyLocaleWorkflow,
  createEnglishWorkflow,
  ensureEnglishLocale,
  inspectLocaleWorkflow,
  markLocaleContentEdited,
  parkEnglishLocale,
  requestLocaleState,
  restoreEnglishLocale,
  validateLocaleWorkflow,
} from "./locale-workflow";

const now = "2026-07-24T09:00:00+08:00";

describe("independent locale workflow", () => {
  test("starts with missing English and enables an unreviewed draft", () => {
    const initial = createRecordDraftDefaults("science-article", "fictional-article", now);
    expect(localeRecord(initial, "en").state).toBe("missing");

    const enabled = ensureEnglishLocale(initial, now);
    expect(localeRecord(enabled, "en")).toMatchObject({
      state: "draft",
      title: "",
      summary: "",
      translationOrigin: "human-translated",
      review: { status: "draft", reviewerIds: [] },
    });
    expect(inspectLocaleWorkflow(enabled, "en", now)).toMatchObject({
      state: "draft",
      reviewStatus: "draft",
      translationOrigin: "human-translated",
    });
  });

  test("parks English without deleting it and restores reviewed content for review", () => {
    const enabled = ensureEnglishLocale(
      createRecordDraftDefaults("science-article", "fictional-article", now),
      now,
    );
    const english = localeRecord(enabled, "en");
    english.state = "published";
    english.title = "Fictional English title";
    english.summary = "Fictional English summary";
    english.review = {
      status: "reviewed",
      updatedAt: "2026-07-24",
      reviewedAt: "2026-07-24",
      version: "1.0",
      reviewerIds: ["fictional-reviewer"],
      references: [],
    };

    const parked = parkEnglishLocale(enabled);
    expect(localeRecord(parked.recordDraft, "en")).toEqual({ state: "missing" });
    expect(parked.parkedEnglishLocale?.locale).toMatchObject({
      state: "published",
      title: "Fictional English title",
    });

    const restored = restoreEnglishLocale(
      parked.recordDraft,
      parked.parkedEnglishLocale,
      now,
    );
    expect(localeRecord(restored, "en")).toMatchObject({
      state: "internal-review",
      title: "Fictional English title",
      review: { status: "internal-review" },
    });
  });

  test("moves Chinese to review without creating an English locale", () => {
    const initial = createRecordDraftDefaults("science-article", "fictional-article", now);
    const chinese = inspectLocaleWorkflow(initial, "zh", now);
    if (!chinese) {
      throw new Error("Chinese workflow must exist");
    }
    const updated = applyLocaleWorkflow(
      initial,
      "zh",
      { ...chinese, state: "internal-review", reviewStatus: "internal-review" },
      now,
    );
    expect(localeRecord(updated, "zh")).toMatchObject({
      state: "internal-review",
      review: { status: "internal-review" },
    });
    expect(localeRecord(updated, "en")).toEqual({ state: "missing" });
  });

  test("never treats machine-assisted English as reviewed automatically", () => {
    const machineAssisted = {
      ...createEnglishWorkflow(now),
      state: "published" as const,
      translationOrigin: "machine-assisted" as const,
      reviewStatus: "reviewed" as const,
      reviewedAt: "2026-07-24",
      reviewerIds: "fictional-reviewer",
      publishedAt: now,
    };
    expect(validateLocaleWorkflow(machineAssisted)).toMatchObject({
      humanVerifiedBy: "机器辅助英文发布前必须记录人工复核人。",
    });
    expect(
      validateLocaleWorkflow({
        ...machineAssisted,
        humanVerifiedBy: "fictional-reviewer",
      }),
    ).toEqual({});
  });

  test("returns approved or published content to review after an edit", () => {
    const approved = {
      ...createEnglishWorkflow(now),
      state: "approved" as const,
      reviewStatus: "reviewed" as const,
      reviewedAt: "2026-07-24",
      reviewerIds: "fictional-reviewer",
    };
    expect(markLocaleContentEdited(approved, now)).toMatchObject({
      state: "internal-review",
      reviewStatus: "internal-review",
      reviewedAt: "",
    });
  });

  test("enforces sequential state transitions and reviewer evidence", () => {
    const draft = createEnglishWorkflow(now);
    expect(requestLocaleState("en", draft, "published").allowed).toBe(false);
    expect(requestLocaleState("en", draft, "internal-review").allowed).toBe(true);

    const reviewed = {
      ...draft,
      state: "internal-review" as const,
      reviewStatus: "reviewed" as const,
      reviewedAt: "2026-07-24",
      reviewerIds: "fictional-reviewer",
    };
    expect(requestLocaleState("en", reviewed, "approved").allowed).toBe(true);
  });
});

function localeRecord(record: Record<string, unknown>, locale: "zh" | "en") {
  const locales = record.locales as Record<string, unknown>;
  return locales[locale] as Record<string, unknown>;
}
