import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { DetailPreview } from "./DetailPreview";
import type { DetailPreviewMedia, DetailPreviewValue } from "./DetailPreview";

const preview: DetailPreviewValue = {
  contentType: { zh: "科普文章", en: "Science article" },
  authors: ["fictional-author"],
  locales: {
    zh: {
      title: "虚构藻类观察",
      summary: "仅用于详情预览测试的虚构摘要。",
      body: [
        "## 形态观察",
        "",
        "正文包含 **重点内容** 和 [安全来源](https://example.invalid/source)。",
        "",
        "![虚构显微图](media:fictional-image)",
        "",
      ].join("\n"),
      state: "internal-review",
      reviewStatus: "internal-review",
      timestamp: "2026-07-24T08:30:00Z",
      isPublished: false,
    },
    en: {
      title: "Fictional algae observation",
      summary: "A fictional summary used only for preview testing.",
      body: [
        "## Morphology",
        "",
        "The body includes **key content**.",
        "",
        "![Fictional micrograph](media:fictional-image)",
        "",
      ].join("\n"),
      state: "published",
      reviewStatus: "reviewed",
      timestamp: "2026-07-24T09:00:00Z",
      isPublished: true,
    },
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
  alt: {
    zh: "虚构显微图",
    en: "Fictional micrograph",
  },
  caption: {
    zh: "仅用于测试的虚构显微图。",
    en: "A fictional micrograph used only for testing.",
  },
  relatedContentIds: [],
  legacy: false,
  previewSource: "/images/uploads/2026/07/fictional-image.webp",
};

test("renders localized detail metadata, safe body content, images, and attribution", async () => {
  const user = userEvent.setup();
  render(<DetailPreview value={preview} media={[media]} />);

  const article = screen.getByRole("article");
  expect(within(article).getByRole("heading", { name: "虚构藻类观察", level: 1 })).toBeVisible();
  expect(article).toHaveTextContent("仅用于详情预览测试的虚构摘要。");
  expect(article).toHaveTextContent("fictional-author");
  expect(article).toHaveTextContent("内部审核");
  expect(within(article).getByRole("heading", { name: "形态观察", level: 2 })).toBeVisible();
  expect(within(article).getByRole("link", { name: "安全来源" })).toHaveAttribute(
    "href",
    "https://example.invalid/source",
  );
  expect(within(article).getByRole("img", { name: "虚构显微图" })).toHaveAttribute(
    "src",
    "/images/uploads/2026/07/fictional-image.webp",
  );
  expect(article).toHaveTextContent("署名: Fictional microscopy group");

  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { name: "Fictional algae observation", level: 1 })).toBeVisible();
  expect(screen.getByText("Science article")).toBeVisible();
  expect(screen.getByText("Reviewed")).toBeVisible();
  expect(screen.getByRole("img", { name: "Fictional micrograph" })).toBeVisible();
  expect(screen.getByText("A fictional micrograph used only for testing.")).toBeVisible();
});

test("blocks unsafe Markdown and treats metadata as text", () => {
  const unsafe: DetailPreviewValue = {
    ...preview,
    locales: {
      ...preview.locales,
      zh: {
        ...preview.locales.zh,
        title: '<img src=x onerror="alert(1)">',
        body: '<script>alert("unsafe")</script>\n\n[危险](javascript:alert(1))\n',
      },
    },
  };
  const { container } = render(<DetailPreview value={unsafe} />);

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    '<img src=x onerror="alert(1)">',
  );
  expect(screen.getByRole("alert")).toHaveTextContent("无法预览");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link", { name: "危险" })).toBeNull();
});

test("shows an explicit missing state instead of an English detail page", async () => {
  const user = userEvent.setup();
  render(
    <DetailPreview
      value={{
        ...preview,
        locales: { ...preview.locales, en: null },
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "English" }));
  const missing = screen.getByRole("status");
  expect(missing).toHaveTextContent("英文版本缺失");
  expect(missing).toHaveTextContent("不会生成英文详情页");
  expect(screen.queryByRole("article")).toBeNull();
});
