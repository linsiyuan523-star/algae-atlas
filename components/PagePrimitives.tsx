/* eslint-disable @next/next/no-img-element -- Local credited images must render in both vinext and Next.js. */
import type { ReactNode } from "react";
import type { Locale } from "@/lib/site-data";

export function localPath(locale: Locale, path = "") {
  return `/${locale}${path ? `/${path}` : ""}`;
}

export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <div>
        <h2>{title}</h2>
        {intro ? <p>{intro}</p> : null}
      </div>
    </div>
  );
}

export function PageHero({
  locale,
  eyebrow,
  title,
  intro,
  image,
  imageAlt,
  imageCaption,
  children,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  intro: string;
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`page-hero${image ? " has-image" : ""}`}>
      <div className="page-hero-inner">
        <p className="eyebrow light">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        {children}
      </div>
      {image ? (
        <figure>
          <img src={image} alt={imageAlt ?? ""} />
          <figcaption>
            {imageCaption ??
              (locale === "zh"
                ? "页面影像，来源与使用说明见图片署名"
                : "Page imagery; see credits for source and use information")}
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state" role="status">
      <span aria-hidden="true">○</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </div>
  );
}
