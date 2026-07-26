import { parseMedia } from "@algae-atlas/content-schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ContentPreview } from "./components/ContentPreview";
import type {
  DetailPreviewMedia,
  DetailPreviewValue,
} from "./components/DetailPreview";
import { DRAFT_FORMAT_VERSION } from "./drafts";
import type { Draft } from "./drafts";
import {
  validateTeamNewsRecordDraft,
  type TeamNewsFormValues,
} from "./forms/team-news";
import { applyLocaleWorkflow } from "./locale-workflow";
import {
  appendBodyImage,
  attachImageReference,
  createMediaRecordCandidate,
  imagePublicationIssues,
  type ImageMetadataDraft,
  type StagedImage,
} from "./media";
import { createExportPlan } from "./repository";
import {
  createSharedRecordDraft,
  updateLocaleBodyReference,
} from "./schema-drafts";

const NOW = "2026-07-24T09:30:00+08:00";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const COVER_ID = "44444444-4444-4444-8444-444444444444";
const BODY_ID = "55555555-5555-4555-8555-555555555555";

const completeMetadata = (altZh: string): ImageMetadataDraft => ({
  creatorOrProvider: "Stage 8C acceptance author",
  sourceUrl: "",
  licenseIdentifier: "team-owned",
  licenseName: "Stage 8C offline acceptance fixture",
  licenseUrl: "",
  attribution: "Stage 8C acceptance author",
  usageScope: "public-site",
  rightsStatus: "approved",
  identificationStatus: "not-applicable",
  identifiablePeople: false,
  consentState: "not-applicable",
  consentReference: "",
  altZh,
  altEn: "",
  captionZh: `${altZh}，仅用于离线验收。`,
  captionEn: "",
});

function stagedImage(
  id: string,
  purpose: StagedImage["purpose"],
  altZh: string,
  withThumbnail = false,
): StagedImage {
  const targetPath = `public/images/uploads/2026/07/${id}.webp`;
  return {
    formatVersion: 2,
    draftId: DRAFT_ID,
    id,
    originalName: `${purpose}.png`,
    stagedName: `${id}.webp`,
    targetPath,
    mimeType: "image/webp",
    bytes: 4096,
    width: 1200,
    height: 800,
    sha256: "a".repeat(64),
    uploadedAt: NOW,
    purpose,
    metadata: completeMetadata(altZh),
    processing: {
      sourceSha256: "b".repeat(64),
      sourceMimeType: "image/png",
      sourceBytes: 8192,
      privacyMetadataRemoved: true,
      originalRetained: false,
      ...(withThumbnail
        ? {
            thumbnail: {
              stagedName: `${id}.thumbnail.webp`,
              targetPath: `public/images/uploads/2026/07/${id}.thumbnail.webp`,
              mimeType: "image/webp" as const,
              bytes: 1024,
              width: 640,
              height: 427,
              sha256: "c".repeat(64),
            },
          }
        : {}),
    },
  };
}

function acceptanceDraft(images: readonly StagedImage[]): Draft {
  const created = createSharedRecordDraft(
    {
      contentType: "team-news",
      stableId: "stage-08c-team-news",
      titleZh: "Stage 8C 中文团队动态验收",
    },
    NOW,
  );
  if (!created.success) {
    throw new Error("acceptance draft defaults must be valid");
  }

  const values: TeamNewsFormValues = {
    summaryZh: "验证中文版、图片许可、响应式预览和离线仓库交接。",
    locationZh: "离线验收环境",
    participantDescription: "仅包含虚构验收数据。",
    eventDate: "2026-07-24",
    endDate: "",
    category: "research",
    pinned: false,
    authorName: "虚构验收作者",
    sourceTitle: "Stage 8C 本地验收记录",
    sourceUrl: "",
    disclosureStatus: "approved",
  };
  const prepared = validateTeamNewsRecordDraft(created.recordDraft, values);
  if (!prepared.success) {
    throw new Error("acceptance team-news fields must be valid");
  }

  let record = prepared.recordDraft;
  for (const image of images) {
    record = attachImageReference(record, image);
  }
  record = applyLocaleWorkflow(
    record,
    "zh",
    {
      state: "approved",
      translationOrigin: "source-authored",
      reviewStatus: "reviewed",
      reviewUpdatedAt: "2026-07-24",
      reviewedAt: "2026-07-24",
      reviewVersion: "1.0",
      reviewerIds: "stage-08c-reviewer",
      humanVerifiedBy: "",
      publishedAt: "",
    },
    NOW,
  );
  const body = appendBodyImage(
    "## 离线发布验收\n\n正文只包含虚构数据。\n",
    images[1],
  );
  record = updateLocaleBodyReference(record, "zh", body);

  return {
    formatVersion: DRAFT_FORMAT_VERSION,
    draftId: DRAFT_ID,
    recordDraft: record,
    bodyZh: body,
    bodyEn: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("completes the Stage 8C team-news candidate through responsive preview and export planning", async () => {
  const user = userEvent.setup();
  const images = [
    stagedImage(COVER_ID, "cover", "Stage 8C 中文封面验收图", true),
    stagedImage(BODY_ID, "body", "Stage 8C 中文正文验收图"),
  ] as const;
  const draft = acceptanceDraft(images);

  expect(images.flatMap((image) => imagePublicationIssues(image, "zh"))).toEqual([]);
  const plan = createExportPlan(draft, images, new Date(NOW));
  expect(plan.schema).toEqual({ valid: true, issues: [] });
  expect(plan.request.branchName).toBe("content/20260724-stage-08c-team-news");
  expect(plan.request.contentTargets).not.toContain(
    "content/records/team-news/stage-08c-team-news/en.md",
  );
  expect(plan.request.imageTargets).toHaveLength(3);

  const recordFile = plan.textFiles.find((file) => file.path.endsWith("/record.json"));
  const record = JSON.parse(recordFile?.contents ?? "null");
  expect(record.locales.en).toEqual({ state: "missing" });
  expect(record.shared.coverMediaId).toBe(COVER_ID);
  expect(record.media).toEqual([COVER_ID, BODY_ID]);
  expect(record.authors).toEqual([]);
  expect(record.locales.zh.fields.authorName).toBe("虚构验收作者");

  const previewMedia: DetailPreviewMedia[] = images.map((image) => {
    const parsed = parseMedia(createMediaRecordCandidate(image));
    if (!parsed.success) {
      throw new Error("acceptance media must satisfy the shared schema");
    }
    return parsed.data;
  });
  const preview: DetailPreviewValue = {
    contentType: { zh: "团队动态", en: "Team news" },
    authors: record.authors,
    locales: {
      zh: {
        title: record.locales.zh.title,
        summary: record.locales.zh.summary,
        body: draft.bodyZh,
        state: record.locales.zh.state,
        reviewStatus: record.locales.zh.review.status,
        timestamp: draft.updatedAt,
        isPublished: false,
      },
      en: null,
    },
  };

  render(<ContentPreview value={preview} media={previewMedia} />);
  expect(screen.getByRole("heading", { name: "Stage 8C 中文团队动态验收" })).toBeVisible();
  expect(screen.getByRole("img", { name: "Stage 8C 中文正文验收图" })).toBeVisible();
  expect(screen.getAllByText(/Stage 8C acceptance author/).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "手机" }));
  expect(screen.getByTestId("preview-canvas")).toHaveAttribute(
    "data-preview-viewport",
    "mobile",
  );
  await user.click(screen.getByRole("button", { name: "桌面" }));
  expect(screen.getByTestId("preview-canvas")).toHaveAttribute(
    "data-preview-viewport",
    "desktop",
  );
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "英文版本缺失" })).toBeVisible();
  expect(screen.getByText("此内容尚未创建英文版本，不会生成英文详情页。")).toBeVisible();
});
