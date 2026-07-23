import { createSharedRecordDraft } from "../schema-drafts";
import {
  emptyTeamNewsFormValues,
  inspectTeamNewsForm,
  teamNewsFormSchema,
  validateTeamNewsRecordDraft,
} from "./team-news";
import { formFields } from "./form-engine";
import { expect, test } from "vitest";
import { teamNewsRecordSchema } from "@algae-atlas/content-schema";

function baseRecord() {
  const prepared = createSharedRecordDraft(
    {
      contentType: "team-news",
      stableId: "fictional-news",
      titleZh: "虚构团队动态",
    },
    "2026-07-23T08:00:00Z",
  );
  if (!prepared.success) {
    throw new Error("test draft must be valid");
  }
  return prepared.recordDraft;
}

const validValues = {
  ...emptyTeamNewsFormValues(),
  summaryZh: "仅用于表单往返测试的虚构摘要。",
  locationZh: "虚构会议室",
  participantDescription: "虚构参与者说明。",
  eventDate: "2026-07-23",
  endDate: "2026-07-24",
  category: "research",
  pinned: true,
  authorId: "fictional-author",
  sourceTitle: "虚构来源",
  sourceUrl: "https://example.invalid/team-news",
  disclosureStatus: "pending",
};

test("serializes the team-news pilot through the shared schema and round-trips form values", () => {
  const result = validateTeamNewsRecordDraft(baseRecord(), validValues);
  expect(result.success).toBe(true);
  if (!result.success) {
    return;
  }

  expect(teamNewsRecordSchema.safeParse(result.recordDraft).success).toBe(true);
  expect(result.recordDraft).toMatchObject({
    type: "team-news",
    authors: ["fictional-author"],
    shared: {
      eventDate: "2026-07-23",
      endDate: "2026-07-24",
      locationLabel: { zh: "虚构会议室" },
      category: "research",
      pinned: true,
      disclosureStatus: "pending",
      sources: [
        {
          id: "fictional-news-source",
          kind: "other",
          title: "虚构来源",
          href: "https://example.invalid/team-news",
          verificationStatus: "pending",
        },
      ],
    },
    locales: {
      zh: {
        summary: "仅用于表单往返测试的虚构摘要。",
        fields: { participantDescription: "虚构参与者说明。" },
      },
    },
  });
  expect(inspectTeamNewsForm(result.recordDraft)).toEqual({
    values: validValues,
    errors: {},
  });
});

test("maps generic and shared-schema failures back to pilot fields", () => {
  const result = validateTeamNewsRecordDraft(baseRecord(), {
    ...validValues,
    eventDate: "2026-07-25",
    endDate: "2026-07-24",
    category: "unknown",
    authorId: "Bad ID",
    sourceTitle: "",
    sourceUrl: "http://example.invalid/news",
    disclosureStatus: "",
  });

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }
  expect(result.errors).toMatchObject({
    endDate: "结束日期不能早于事件日期",
    category: "请选择有效的活动类型。",
    authorId: "负责作者稳定 ID格式无效，必须使用有效的稳定 ID。",
    sourceTitle: "填写来源链接时必须提供主要来源标题。",
    sourceUrl: "主要来源链接必须使用有效的 HTTPS URL。",
    disclosureStatus: "公开确认不能为空。",
  });
});

test("takes team-news enum values from the shared field registry", () => {
  const fields = formFields(teamNewsFormSchema);
  expect(fields.find((field) => field.id === "category")?.options?.map((option) => option.value)).toEqual([
    "research",
    "teaching",
    "fieldwork",
    "meeting",
    "student-research",
    "other",
  ]);
  expect(
    fields
      .find((field) => field.id === "disclosureStatus")
      ?.options?.map((option) => option.value),
  ).toEqual(["pending", "approved"]);
});

test("preserves a valid structured source that has no URL", () => {
  const record = baseRecord();
  const shared = record.shared as Record<string, unknown>;
  shared.sources = [
    {
      id: "fictional-identifier-source",
      kind: "article",
      title: "虚构标识符来源",
      identifier: { scheme: "doi", value: "10.0000/fictional" },
      verificationStatus: "pending",
    },
  ];
  const values = {
    ...validValues,
    sourceTitle: "虚构标识符来源",
    sourceUrl: "",
  };

  const result = validateTeamNewsRecordDraft(record, values);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.recordDraft).toMatchObject({
      shared: {
        sources: [
          {
            identifier: { scheme: "doi", value: "10.0000/fictional" },
            title: "虚构标识符来源",
          },
        ],
      },
    });
  }
});
