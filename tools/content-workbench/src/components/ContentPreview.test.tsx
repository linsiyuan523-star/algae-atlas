import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ContentPreview, collectPreviewDiagnostics } from "./ContentPreview";
import type { DetailPreviewMedia, DetailPreviewValue } from "./DetailPreview";

const preview: DetailPreviewValue = {
  contentType: { zh: "科普文章", en: "Science article" },
  authors: ["fictional-author"],
  locales: {
    zh: {
      title: "虚构藻类观察",
      summary: "仅用于卡片预览测试的虚构摘要。",
      body: "第一段。\n\n第二段。\n",
      state: "draft",
      reviewStatus: "draft",
      timestamp: "2026-07-24T08:30:00Z",
      isPublished: false,
    },
    en: null,
  },
};

const media: DetailPreviewMedia = {
  schemaVersion: 1,
  id: "fictional-image",
  filePath: "public/images/uploads/2026/07/fictional-image.webp",
  sha256: "a".repeat(64),
  mimeType: "image/webp",
  bytes: 1024,
  width: 1200,
  height: 800,
  uploadedAt: "2026-07-24T08:00:00Z",
  creatorOrProvider: "Fictional microscopy group",
  license: {
    identifier: "team-owned",
    name: "Team-owned fictional test image",
    attribution: "Fictional microscopy group",
    usageScope: "public-site",
  },
  rightsStatus: "approved",
  identificationStatus: "not-applicable",
  identifiablePeople: false,
  consentState: "not-applicable",
  alt: { zh: "虚构显微图" },
  relatedContentIds: [],
  legacy: false,
};

test("switches card surfaces and desktop/mobile preview widths", async () => {
  const user = userEvent.setup();
  render(<ContentPreview value={preview} />);

  expect(screen.getByRole("heading", { name: "虚构藻类观察", level: 1 })).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "栏目卡片" }));
  expect(screen.getByLabelText("栏目卡片预览")).toBeVisible();
  expect(screen.getByRole("img", { name: "虚构藻类观察" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "手机" }));
  expect(screen.getByTestId("preview-canvas")).toHaveAttribute(
    "data-preview-viewport",
    "mobile",
  );

  await user.click(screen.getByRole("tab", { name: "首页推荐" }));
  expect(screen.getByLabelText("首页推荐卡片预览")).toBeVisible();
  expect(screen.getByText("缺少图片")).toBeVisible();
});

test("reports title wrapping, long URLs, empty paragraphs, missing alt text, and overflow", () => {
  const longUrl = `https://example.invalid/${"unbroken-path-".repeat(12)}`;
  const diagnostics = collectPreviewDiagnostics(
    {
      ...preview,
      locales: {
        ...preview.locales,
        zh: {
          ...preview.locales.zh,
          title: "这是用于验证手机栏目卡片标题换行提示的非常长的虚构藻类观察标题",
          body: `第一段。\n\n\n第二段。\n\n${longUrl}`,
        },
      },
    },
    [{ ...media, alt: { zh: "" }, sourceUrl: longUrl }],
    "mobile",
  );

  expect(diagnostics.map((diagnostic) => diagnostic.title)).toEqual(
    expect.arrayContaining([
      "标题换行",
      "空段落",
      "缺少替代文本",
      "超长 URL",
      "横向溢出",
    ]),
  );
});
