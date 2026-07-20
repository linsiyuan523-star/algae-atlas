import { reviewStatusLabels, type ContentReview } from "@/lib/content-review";
import { text, type Locale } from "@/lib/site-data";

export function ContentReviewPanel({ locale, review, compact = false }: { locale: Locale; review: ContentReview; compact?: boolean }) {
  const reviewed = review.status === "reviewed";

  return (
    <dl className={`content-review${compact ? " is-compact" : ""}`} aria-label={locale === "zh" ? "内容审核信息" : "Content review information"}>
      <div>
        <dt>{locale === "zh" ? "内容状态" : "Content status"}</dt>
        <dd>{text(reviewStatusLabels[review.status], locale)}</dd>
      </div>
      <div>
        <dt>{locale === "zh" ? "最后更新" : "Last updated"}</dt>
        <dd>{review.updatedAt}</dd>
      </div>
      <div>
        <dt>{locale === "zh" ? "实验室审核" : "Laboratory review"}</dt>
        <dd>{reviewed ? (locale === "zh" ? "已完成实验室审核" : "Laboratory review completed") : (locale === "zh" ? "尚未完成实验室审核" : "Laboratory review not yet completed")}</dd>
      </div>
      {review.version ? <div><dt>{locale === "zh" ? "版本" : "Version"}</dt><dd>{review.version}</dd></div> : null}
    </dl>
  );
}
