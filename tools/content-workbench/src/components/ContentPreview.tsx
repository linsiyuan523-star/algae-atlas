import type { Locale } from "@algae-atlas/content-schema";
import {
  CircleAlert,
  Eye,
  Files,
  Home,
  ImageOff,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";
import { isSafeArticleLink } from "../editor/article-markdown";
import { DetailPreview, safePreviewSource } from "./DetailPreview";
import type { DetailPreviewMedia, DetailPreviewValue } from "./DetailPreview";

export type PreviewSurface = "detail" | "section" | "home";
export type PreviewViewport = "desktop" | "mobile";

export type PreviewDiagnostic = {
  id: string;
  title: string;
  description: string;
  severity: "warning" | "error";
};

type ContentPreviewProps = {
  value: DetailPreviewValue;
  media?: readonly DetailPreviewMedia[];
};

const surfaceOptions: ReadonlyArray<{
  id: PreviewSurface;
  label: string;
  Icon: typeof Eye;
}> = [
  { id: "detail", label: "详情", Icon: Eye },
  { id: "section", label: "栏目卡片", Icon: Files },
  { id: "home", label: "首页推荐", Icon: Home },
];

export function ContentPreview({ value, media = [] }: ContentPreviewProps) {
  const [surface, setSurface] = useState<PreviewSurface>("detail");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const diagnostics = useMemo(
    () => collectPreviewDiagnostics(value, media, viewport),
    [media, value, viewport],
  );

  return (
    <section className="content-preview" aria-label="内容预览">
      <header className="content-preview-controls">
        <div className="content-preview-mode-control">
          <h4>发布预览</h4>
          <div className="content-preview-segmented" role="tablist" aria-label="预览类型">
            {surfaceOptions.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={surface === id}
                onClick={() => setSurface(id)}
              >
                <Icon aria-hidden="true" size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="content-preview-width-control" role="group" aria-label="预览宽度">
          <button
            type="button"
            aria-pressed={viewport === "desktop"}
            onClick={() => setViewport("desktop")}
          >
            <Monitor aria-hidden="true" size={16} />
            <span>桌面</span>
          </button>
          <button
            type="button"
            aria-pressed={viewport === "mobile"}
            onClick={() => setViewport("mobile")}
          >
            <Smartphone aria-hidden="true" size={16} />
            <span>手机</span>
          </button>
        </div>
      </header>

      <div className="content-preview-stage">
        <div
          className="content-preview-canvas"
          data-preview-viewport={viewport}
          data-testid="preview-canvas"
        >
          {surface === "detail" ? (
            <DetailPreview value={value} media={media} />
          ) : (
            <CardPreview
              value={value}
              media={media}
              surface={surface}
              viewport={viewport}
            />
          )}
        </div>
      </div>

      <PreviewDiagnostics diagnostics={diagnostics} />
    </section>
  );
}

function CardPreview({
  value,
  media,
  surface,
  viewport,
}: {
  value: DetailPreviewValue;
  media: readonly DetailPreviewMedia[];
  surface: Exclude<PreviewSurface, "detail">;
  viewport: PreviewViewport;
}) {
  const [locale, setLocale] = useState<Locale>("zh");
  const localized = value.locales[locale];
  const asset = media[0];
  const isHome = surface === "home";
  const title = localized?.title.trim() || (locale === "zh" ? "未填写标题" : "Untitled");
  const titleWrap = titleWouldWrap(title, viewport);
  const cardLabel = isHome ? "首页推荐卡片预览" : "栏目卡片预览";

  return (
    <section className={`card-preview card-preview-${surface}`} aria-label={cardLabel}>
      <header className="card-preview-toolbar">
        <h4>{isHome ? "首页推荐" : "栏目卡片"}</h4>
        <div className="card-preview-locale-switch" role="group" aria-label="预览语言">
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
        <article className="preview-card" data-title-wrap={titleWrap || undefined}>
          <CardImage asset={asset} locale={locale} title={title} />
          <div className="preview-card-copy">
            <div className="preview-card-kicker">
              <span>{value.contentType[locale]}</span>
              <span>{localized.isPublished ? (locale === "zh" ? "已发布" : "Published") : (locale === "zh" ? "草稿" : "Draft")}</span>
            </div>
            <h5>{title}</h5>
            {titleWrap ? <span className="preview-card-wrap-hint">标题换行</span> : null}
            <p>{localized.summary.trim() || (locale === "zh" ? "摘要尚未填写。" : "No summary entered.")}</p>
            <CardSource asset={asset} />
          </div>
        </article>
      ) : (
        <div className="card-preview-missing" role="status">
          <h5>英文版本缺失</h5>
          <p>No English version exists, so no English card is generated.</p>
        </div>
      )}
    </section>
  );
}

function CardImage({
  asset,
  locale,
  title,
}: {
  asset: DetailPreviewMedia | undefined;
  locale: Locale;
  title: string;
}) {
  const source = safePreviewSource(asset?.previewSource);
  const alt = asset?.alt[locale]?.trim() || title;

  if (source) {
    return (
      // Preview sources are limited to local public paths or raster data URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="preview-card-image" src={source} alt={alt} />
    );
  }

  const label = asset
    ? locale === "zh"
      ? "图片文件尚不可用于预览"
      : "Image file is not available for preview"
    : locale === "zh"
      ? "未设置图片"
      : "No image selected";
  return (
    <div className="preview-card-image-missing" role="img" aria-label={alt || label}>
      <ImageOff aria-hidden="true" size={26} strokeWidth={1.5} />
      <span>{label}</span>
    </div>
  );
}

function CardSource({ asset }: { asset: DetailPreviewMedia | undefined }) {
  const rawSource = typeof asset?.sourceUrl === "string"
    ? asset.sourceUrl
    : asset?.license.href;
  const source = rawSource && isSafeArticleLink(rawSource) ? rawSource : null;
  if (!source) {
    return null;
  }
  return (
    <a className="preview-card-source" href={source} rel="noopener noreferrer" target="_blank">
      {source}
    </a>
  );
}

function PreviewDiagnostics({ diagnostics }: { diagnostics: readonly PreviewDiagnostic[] }) {
  return (
    <section className="preview-diagnostics" aria-labelledby="preview-diagnostics-title">
      <header>
        <h5 id="preview-diagnostics-title">布局诊断</h5>
        <span>{diagnostics.length}</span>
      </header>
      {diagnostics.length > 0 ? (
        <ul>
          {diagnostics.map((diagnostic) => (
            <li key={diagnostic.id} data-severity={diagnostic.severity}>
              <CircleAlert aria-hidden="true" size={16} />
              <div>
                <strong>{diagnostic.title}</strong>
                <span>{diagnostic.description}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>未发现预览风险。</p>
      )}
    </section>
  );
}

export function collectPreviewDiagnostics(
  value: DetailPreviewValue,
  media: readonly DetailPreviewMedia[],
  viewport: PreviewViewport,
): PreviewDiagnostic[] {
  const diagnostics: PreviewDiagnostic[] = [];
  const locales = (["zh", "en"] as const).filter(
    (locale) => value.locales[locale] !== null,
  );

  for (const locale of locales) {
    const localized = value.locales[locale];
    if (!localized) {
      continue;
    }
    const localeLabel = locale === "zh" ? "中文" : "英文";
    if (titleWouldWrap(localized.title, viewport)) {
      diagnostics.push({
        id: `title-wrap-${locale}`,
        title: "标题换行",
        description: `${localeLabel}标题在${viewport === "mobile" ? "手机" : "桌面"}卡片宽度下会换行。`,
        severity: "warning",
      });
    }
    if (hasEmptyParagraph(localized.body)) {
      diagnostics.push({
        id: `empty-paragraph-${locale}`,
        title: "空段落",
        description: `${localeLabel}正文包含连续空行，卡片与详情页应在发布前整理。`,
        severity: "warning",
      });
    }
  }

  const asset = media[0];
  if (!asset) {
    diagnostics.push({
      id: "missing-image",
      title: "缺少图片",
      description: "当前栏目卡片和首页推荐卡片将使用缺图占位。",
      severity: "error",
    });
  } else {
    for (const locale of locales) {
      if (!asset.alt[locale]?.trim()) {
        diagnostics.push({
          id: `missing-alt-${locale}`,
          title: "缺少替代文本",
          description: `${locale === "zh" ? "中文" : "英文"}卡片图片缺少替代文本。`,
          severity: "error",
        });
      }
    }
  }

  const text = [
    ...locales.flatMap((locale) => {
      const localized = value.locales[locale];
      return localized ? [localized.title, localized.summary, localized.body] : [];
    }),
    ...media.flatMap((item) => [
      item.sourceUrl ?? "",
      item.license.href ?? "",
      item.license.attribution,
    ]),
  ];
  const longestUrl = findLongestUrl(text);
  if (longestUrl && longestUrl.length > (viewport === "mobile" ? 42 : 76)) {
    diagnostics.push({
      id: "long-url",
      title: "超长 URL",
      description: "预览会在 URL 中断行，发布前应检查链接文本的可读性。",
      severity: "warning",
    });
  }

  const longestToken = findLongestToken(text);
  if (longestToken.length > (viewport === "mobile" ? 28 : 58)) {
    diagnostics.push({
      id: "horizontal-overflow",
      title: "横向溢出",
      description: "检测到长连续字符；预览已启用强制换行以避免横向溢出。",
      severity: "warning",
    });
  }

  return diagnostics;
}

function titleWouldWrap(title: string, viewport: PreviewViewport) {
  const threshold = viewport === "mobile" ? 22 : 52;
  return displayWidth(title.trim()) > threshold;
}

function displayWidth(value: string) {
  return Array.from(value).reduce(
    (width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1),
    0,
  );
}

function hasEmptyParagraph(markdown: string) {
  return /\n[ \t]*\n[ \t]*\n/.test(markdown);
}

function findLongestUrl(values: readonly string[]) {
  return values
    .flatMap((value) => value.match(/https?:\/\/[^\s<>()]+/g) ?? [])
    .reduce((longest, value) => value.length > longest.length ? value : longest, "");
}

function findLongestToken(values: readonly string[]) {
  return values
    .flatMap((value) => value.match(/\S+/g) ?? [])
    .reduce((longest, value) => value.length > longest.length ? value : longest, "");
}
