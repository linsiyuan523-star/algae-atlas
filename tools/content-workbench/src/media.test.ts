import { describe, expect, test } from "vitest";
import {
  appendBodyImage,
  attachImageReference,
  imagePublicationIssues,
  recordMediaIds,
} from "./media";
import type { StagedImage } from "./media";

function stagedImage(overrides: Partial<StagedImage> = {}): StagedImage {
  return {
    formatVersion: 1,
    draftId: "11111111-1111-4111-8111-111111111111",
    id: "22222222-2222-4222-8222-222222222222",
    originalName: "fictional-cover.png",
    stagedName: "22222222-2222-4222-8222-222222222222.png",
    targetPath:
      "public/images/uploads/2026/07/22222222-2222-4222-8222-222222222222.png",
    mimeType: "image/png",
    bytes: 1024,
    width: 640,
    height: 480,
    sha256: "a".repeat(64),
    uploadedAt: "2026-07-24T08:00:00Z",
    purpose: "cover",
    metadata: {
      creatorOrProvider: "",
      sourceUrl: "",
      licenseIdentifier: "",
      licenseName: "",
      licenseUrl: "",
      attribution: "",
      usageScope: "internal-only",
      rightsStatus: "pending",
      identificationStatus: "not-applicable",
      identifiablePeople: false,
      consentState: "not-applicable",
      consentReference: "",
      altZh: "",
      altEn: "",
      captionZh: "",
      captionEn: "",
    },
    ...overrides,
  };
}

function licensedImage(overrides: Partial<StagedImage> = {}): StagedImage {
  const image = stagedImage(overrides);
  return {
    ...image,
    metadata: {
      ...image.metadata,
      creatorOrProvider: "Fictional provider",
      licenseIdentifier: "permission-granted",
      licenseName: "Fictional permission",
      attribution: "Fictional provider",
      usageScope: "public-site",
      rightsStatus: "approved",
      altZh: "虚构藻类图片",
    },
  };
}

describe("image publication metadata", () => {
  test("blocks a publication candidate until license and attribution are complete", () => {
    const issues = imagePublicationIssues(stagedImage(), "zh");

    expect(issues).toContain("图片许可、许可名称和署名必须完整。");
    expect(issues).toContain("图片权利状态和使用范围尚不允许公开发布。");
    expect(issues).toContain("必须填写中文替代文字。");
  });

  test("keeps English alt optional until the English publication candidate", () => {
    const image = licensedImage();

    expect(imagePublicationIssues(image, "zh")).toEqual([]);
    expect(imagePublicationIssues(image, "en")).toContain(
      "英文发布候选必须填写英文替代文字。",
    );
    image.metadata.altEn = "Fictional algae image";
    expect(imagePublicationIssues(image, "en")).toEqual([]);
  });

  test("requires a non-sensitive consent reference for identifiable people", () => {
    const image = licensedImage();
    image.metadata.identifiablePeople = true;
    image.metadata.consentState = "pending";

    expect(imagePublicationIssues(image, "zh")).toContain(
      "可识别人物照片必须确认同意并填写非敏感授权引用。",
    );
    image.metadata.consentState = "confirmed";
    image.metadata.consentReference = "fictional-consent-register-7";
    expect(imagePublicationIssues(image, "zh")).toEqual([]);
  });
});

describe("draft media references", () => {
  test("attaches cover, gallery, and portrait roles to schema fields", () => {
    const teamNews = attachImageReference(
      { type: "team-news", media: [], shared: { galleryMediaIds: [] } },
      licensedImage(),
    );
    expect(recordMediaIds(teamNews)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(teamNews.shared).toMatchObject({
      coverMediaId: "22222222-2222-4222-8222-222222222222",
    });

    const gallery = attachImageReference(
      teamNews,
      licensedImage({
        id: "33333333-3333-4333-8333-333333333333",
        purpose: "gallery",
      }),
    );
    expect(gallery.shared).toMatchObject({
      galleryMediaIds: ["33333333-3333-4333-8333-333333333333"],
    });

    const member = attachImageReference(
      { type: "team-member", media: [], shared: {} },
      licensedImage({ purpose: "portrait" }),
    );
    expect(member.shared).toMatchObject({
      portraitMediaId: "22222222-2222-4222-8222-222222222222",
    });
  });

  test("inserts a body reference only after Chinese alt is available", () => {
    expect(appendBodyImage("## 正文\n", stagedImage())).toBe("## 正文\n");
    expect(appendBodyImage("## 正文\n", licensedImage())).toBe(
      "## 正文\n\n![虚构藻类图片](media:22222222-2222-4222-8222-222222222222)\n",
    );
  });
});
