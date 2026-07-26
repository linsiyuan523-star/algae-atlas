import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Locale, Media } from "@algae-atlas/content-schema";
import { ImageOff, Languages } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createArticleExtensions } from "../editor/article-extensions";
import {
  isSafeArticleLink,
  prepareArticleMarkdown,
} from "../editor/article-markdown";

type PreviewWorkflowState =
  | "draft"
  | "internal-review"
  | "approved"
  | "published"
  | "archived";

type PreviewReviewStatus = "draft" | "internal-review" | "reviewed" | "rejected";

export type DetailPreviewLocale = {
  authorName?: string;
  title: string;
  summary: string;
  body: string;
  state: PreviewWorkflowState;
  reviewStatus: PreviewReviewStatus;
  timestamp: string;
  isPublished: boolean;
};

export type DetailPreviewValue = {
  contentType: { zh: string; en: string };
  authors: readonly string[];
  locales: {
    zh: DetailPreviewLocale;
    en: DetailPreviewLocale | null;
  };
};

export type DetailPreviewMedia = Media & {
  previewSource?: string;
};

type DetailPreviewProps = {
  value: DetailPreviewValue;
  media?: readonly DetailPreviewMedia[];
};

const copy = {
  zh: {
    preview: "详情页预览",
    language: "预览语言",
    author: "作者",
    noAuthor: "未填写作者",
    publishedAt: "发布时间",
    updatedAt: "更新时间",
    review: "审核状态",
    untitled: "未填写标题",
    noSummary: "摘要尚未填写。",
    noBody: "正文尚未填写。",
    unsafeBody: "正文包含不安全或不受支持的内容，无法预览。",
    missingTitle: "英文版本缺失",
    missingBody: "此内容尚未创建英文版本，不会生成英文详情页。",
    image: "图片",
    imageUnavailable: "图片文件尚不可用于预览",
    attribution: "署名",
    attributionMissing: "图片元数据缺失",
  },
  en: {
    preview: "Detail preview",
    language: "Preview language",
    author: "Author",
    noAuthor: "No author entered",
    publishedAt: "Published",
    updatedAt: "Updated",
    review: "Review status",
    untitled: "Untitled",
    noSummary: "No summary entered.",
    noBody: "No body content entered.",
    unsafeBody: "The body contains unsafe or unsupported content and cannot be previewed.",
    missingTitle: "English version missing",
    missingBody: "No English version exists, so an English detail page will not be generated.",
    image: "Image",
    imageUnavailable: "Image file is not available for preview",
    attribution: "Credit",
    attributionMissing: "Image metadata missing",
  },
} as const;

const stateLabels: Record<Locale, Record<PreviewWorkflowState, string>> = {
  zh: {
    draft: "草稿",
    "internal-review": "审核中",
    approved: "已批准",
    published: "已发布",
    archived: "已归档",
  },
  en: {
    draft: "Draft",
    "internal-review": "In review",
    approved: "Approved",
    published: "Published",
    archived: "Archived",
  },
};

const reviewLabels: Record<Locale, Record<PreviewReviewStatus, string>> = {
  zh: {
    draft: "草拟中",
    "internal-review": "内部审核",
    reviewed: "已审核",
    rejected: "已退回",
  },
  en: {
    draft: "Draft",
    "internal-review": "Internal review",
    reviewed: "Reviewed",
    rejected: "Returned",
  },
};

export function DetailPreview({ value, media = [] }: DetailPreviewProps) {
  const [locale, setLocale] = useState<Locale>("zh");
  const labels = copy[locale];
  const localized = value.locales[locale];

  return (
    <section className="detail-preview" aria-label="详情页预览">
      <header className="detail-preview-toolbar">
        <h4>{labels.preview}</h4>
        <div
          className="detail-preview-locale-switch"
          role="group"
          aria-label={labels.language}
        >
          <button
            type="button"
            aria-pressed={locale === "zh"}
            onClick={() => setLocale("zh")}
          >
            中文
          </button>
          <button
            type="button"
            aria-pressed={locale === "en"}
            onClick={() => setLocale("en")}
          >
            English
          </button>
        </div>
      </header>

      {localized ? (
        <PreviewArticle
          authors={value.authors}
          contentType={value.contentType[locale]}
          locale={locale}
          media={media}
          value={localized}
        />
      ) : (
        <div className="detail-preview-missing" role="status" lang="zh-CN">
          <Languages aria-hidden="true" size={28} strokeWidth={1.6} />
          <h1>{copy.zh.missingTitle}</h1>
          <p>{copy.zh.missingBody}</p>
          <p lang="en">{copy.en.missingBody}</p>
        </div>
      )}
    </section>
  );
}

function PreviewArticle({
  authors,
  contentType,
  locale,
  media,
  value,
}: {
  authors: readonly string[];
  contentType: string;
  locale: Locale;
  media: readonly DetailPreviewMedia[];
  value: DetailPreviewLocale;
}) {
  const labels = copy[locale];
  const timestampLabel = value.isPublished
    ? labels.publishedAt
    : labels.updatedAt;
  const authorLabel = value.authorName?.trim() ||
    (authors.length > 0
      ? authors.join(locale === "zh" ? "、" : ", ")
      : labels.noAuthor);

  return (
    <article
      className={`detail-preview-page detail-preview-page-${locale}`}
      lang={locale === "zh" ? "zh-CN" : "en"}
    >
      <header className="detail-preview-header">
        <div className="detail-preview-kicker">
          <span>{contentType}</span>
          <span className="detail-preview-state" data-state={value.state}>
            {stateLabels[locale][value.state]}
          </span>
        </div>
        <h1>{value.title.trim() || labels.untitled}</h1>
        <p className="detail-preview-summary">
          {value.summary.trim() || labels.noSummary}
        </p>
        <dl className="detail-preview-meta">
          <div>
            <dt>{labels.author}</dt>
            <dd>{authorLabel}</dd>
          </div>
          <div>
            <dt>{timestampLabel}</dt>
            <dd>
              <time dateTime={value.timestamp}>
                {formatPreviewTimestamp(value.timestamp, locale)}
              </time>
            </dd>
          </div>
          <div>
            <dt>{labels.review}</dt>
            <dd>{reviewLabels[locale][value.reviewStatus]}</dd>
          </div>
        </dl>
      </header>
      <PreviewMarkdown
        locale={locale}
        markdown={value.body}
        media={media}
      />
    </article>
  );
}

function PreviewMarkdown({
  locale,
  markdown,
  media,
}: {
  locale: Locale;
  markdown: string;
  media: readonly DetailPreviewMedia[];
}) {
  const parsed = useMemo(
    () => parsePreviewMarkdown(markdown, locale),
    [locale, markdown],
  );
  const mediaById = useMemo(
    () => new Map(media.map((item) => [item.id, item])),
    [media],
  );

  if (!markdown.trim()) {
    return <p className="detail-preview-empty">{copy[locale].noBody}</p>;
  }
  if (!parsed.document) {
    return (
      <p className="detail-preview-body-error" role="alert">
        {copy[locale].unsafeBody}
      </p>
    );
  }

  const context: RenderContext = { locale, mediaById };
  return (
    <div className="detail-preview-body">
      {renderChildren(parsed.document, context, "root")}
    </div>
  );
}

type RenderContext = {
  locale: Locale;
  mediaById: ReadonlyMap<string, DetailPreviewMedia>;
};

function parsePreviewMarkdown(markdown: string, locale: Locale) {
  const prepared = prepareArticleMarkdown(markdown, locale);
  if (prepared.issues.length > 0) {
    return { document: null };
  }

  const editor = new Editor({
    extensions: createArticleExtensions(),
    content: prepared.markdown,
    contentType: "markdown",
    editable: false,
  });
  try {
    return { document: editor.getJSON() };
  } finally {
    editor.destroy();
  }
}

function renderChildren(
  node: JSONContent,
  context: RenderContext,
  keyPrefix: string,
) {
  return (node.content ?? []).map((child, index) =>
    renderNode(child, context, `${keyPrefix}-${index}`),
  );
}

function renderNode(
  node: JSONContent,
  context: RenderContext,
  key: string,
): ReactNode {
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{renderChildren(node, context, key)}</Fragment>;
    case "paragraph":
      return renderParagraph(node, context, key);
    case "text":
      return <Fragment key={key}>{renderMarkedText(node)}</Fragment>;
    case "heading": {
      const level = safeHeadingLevel(node.attrs?.level);
      const Heading = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return <Heading key={key}>{renderChildren(node, context, key)}</Heading>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, context, key)}</ul>;
    case "orderedList":
      return <ol key={key}>{renderChildren(node, context, key)}</ol>;
    case "listItem":
      return <li key={key}>{renderChildren(node, context, key)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, context, key)}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "table":
      return (
        <div className="detail-preview-table-scroll" key={key}>
          <table><tbody>{renderChildren(node, context, key)}</tbody></table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{renderChildren(node, context, key)}</tr>;
    case "tableHeader":
      return <th key={key}>{renderChildren(node, context, key)}</th>;
    case "tableCell":
      return <td key={key}>{renderChildren(node, context, key)}</td>;
    case "mediaPlaceholder":
      return renderPreviewMedia(node, context, key);
    default:
      return <Fragment key={key}>{renderChildren(node, context, key)}</Fragment>;
  }
}

function renderParagraph(
  node: JSONContent,
  context: RenderContext,
  key: string,
) {
  const children = node.content ?? [];
  if (!children.some((child) => child.type === "mediaPlaceholder")) {
    return <p key={key}>{renderChildren(node, context, key)}</p>;
  }

  const output: ReactNode[] = [];
  let textNodes: JSONContent[] = [];
  const flushText = () => {
    if (textNodes.length === 0) {
      return;
    }
    const paragraphKey = `${key}-text-${output.length}`;
    output.push(
      <p key={paragraphKey}>
        {textNodes.map((child, index) =>
          renderNode(child, context, `${paragraphKey}-${index}`),
        )}
      </p>,
    );
    textNodes = [];
  };

  children.forEach((child, index) => {
    if (child.type === "mediaPlaceholder") {
      flushText();
      output.push(renderPreviewMedia(child, context, `${key}-media-${index}`));
    } else {
      textNodes.push(child);
    }
  });
  flushText();
  return <Fragment key={key}>{output}</Fragment>;
}

function renderMarkedText(node: JSONContent) {
  let rendered: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") {
      rendered = <strong>{rendered}</strong>;
    } else if (mark.type === "italic") {
      rendered = <em>{rendered}</em>;
    } else if (mark.type === "subscript") {
      rendered = <sub>{rendered}</sub>;
    } else if (mark.type === "superscript") {
      rendered = <sup>{rendered}</sup>;
    } else if (mark.type === "link") {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      if (isSafeArticleLink(href)) {
        rendered = (
          <a href={href} rel="noopener noreferrer" target="_blank">
            {rendered}
          </a>
        );
      }
    }
  }
  return rendered;
}

function renderPreviewMedia(
  node: JSONContent,
  context: RenderContext,
  key: string,
) {
  const mediaId = typeof node.attrs?.mediaId === "string" ? node.attrs.mediaId : "";
  const asset = context.mediaById.get(mediaId);
  const labels = copy[context.locale];
  const markdownAlt = typeof node.attrs?.alt === "string" ? node.attrs.alt.trim() : "";
  const alt = markdownAlt || asset?.alt[context.locale] || `${labels.image} ${mediaId}`;
  const caption = asset?.caption?.[context.locale]?.trim() || markdownAlt;
  const source = safePreviewSource(asset?.previewSource);
  const attribution =
    asset?.license.attribution.trim() ||
    asset?.creatorOrProvider.trim() ||
    labels.attributionMissing;

  return (
    <figure className="detail-preview-media" key={key} data-media-id={mediaId}>
      {source ? (
        // The Vite/Tauri preview renders repository-local files without a Next.js loader.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={alt} />
      ) : (
        <div className="detail-preview-media-missing" role="img" aria-label={alt}>
          <ImageOff aria-hidden="true" size={28} strokeWidth={1.5} />
          <span>{labels.imageUnavailable}</span>
          <code>{mediaId}</code>
        </div>
      )}
      <figcaption>
        {caption ? <span>{caption}</span> : null}
        <small>{labels.attribution}: {attribution}</small>
      </figcaption>
    </figure>
  );
}

export function safePreviewSource(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (/^data:image\/(?:jpeg|png|webp|avif);base64,[a-zA-Z0-9+/]+=*$/.test(value)) {
    return value;
  }

  if (!/^\/images\/[a-zA-Z0-9._/-]+$/.test(value)) {
    return null;
  }
  const segments = value.slice(1).split("/");
  return segments.some((segment) => !segment || segment === "." || segment === "..")
    ? null
    : value;
}

function safeHeadingLevel(value: unknown): 2 | 3 | 4 | 5 | 6 {
  return value === 3 || value === 4 || value === 5 || value === 6 ? value : 2;
}

function formatPreviewTimestamp(value: string, locale: Locale) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "-";
  }
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(parsed);
}
