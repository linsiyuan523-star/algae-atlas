/* eslint-disable @next/next/no-img-element -- Future credited team images must render in vinext and Next.js. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Arrow, EmptyState, localPath, PageHero, SectionHeading } from "@/components/PagePrimitives";
import {
  liveFeedEntries,
  liveFeedGuides,
  liveFeedResearchTopics,
  liveFeedReviewWarning,
  type LiveFeedEntry,
  type LiveFeedGuide,
} from "@/lib/live-feeds-data";
import { imageCredits, text, type Locale, type LocalizedText } from "@/lib/site-data";

function FeedGroupCard({ entry, locale, index }: { entry: LiveFeedEntry; locale: Locale; index: number }) {
  return (
    <article className="live-feed-group-card">
      <Link className="live-feed-group-visual" href={localPath(locale, `live-feeds/${entry.id}`)}>
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div aria-hidden="true"><i /><i /><i /></div>
        <small>{locale === "zh" ? "类群图像待团队提供" : "Team image pending"}</small>
      </Link>
      <div className="live-feed-group-body">
        <p className="taxonomic-group">{entry.scientificGroup}</p>
        <h2><Link href={localPath(locale, `live-feeds/${entry.id}`)}>{text(entry.name, locale)}</Link></h2>
        <p>{text(entry.overview, locale)}</p>
        <Link className="text-link" href={localPath(locale, `live-feeds/${entry.id}`)}>
          {locale === "zh" ? "查看类群介绍" : "View group profile"} <Arrow />
        </Link>
      </div>
    </article>
  );
}

function RelationshipChain({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const items = locale === "zh"
    ? ["微藻培养", "轮虫 / 桡足类 / 枝角类培养", "水产苗种或实验研究应用"]
    : ["Microalgae", "Rotifers / Copepods / Cladocerans", "Aquaculture Larvae and Research Applications"];

  return (
    <figure className={`live-feed-chain${compact ? " is-compact" : ""}`}>
      <ol>
        {items.map((item, index) => (
          <li key={item}>
            <span>{item}</span>
            {index < items.length - 1 ? <b aria-hidden="true">→</b> : null}
          </li>
        ))}
      </ol>
      <figcaption>
        {locale === "zh"
          ? "该图为典型研究与培养关系示意；具体饵料组合和应用对象因物种、发育阶段及培养条件而异。"
          : "This diagram illustrates a typical research and culture relationship. Diet combinations and applications vary with species, developmental stage, and culture conditions."}
      </figcaption>
      {!compact ? (
        <div className="live-feed-chain-links">
          <Link href={localPath(locale, "research/microalgae")}>{locale === "zh" ? "了解微藻研究" : "Explore microalgae research"} <Arrow /></Link>
          <Link href={localPath(locale, "algae")}>{locale === "zh" ? "查看藻类图鉴" : "View the Algae Atlas"} <Arrow /></Link>
          <Link href="#guides">{locale === "zh" ? "进入培养教程" : "Go to culture guides"} <Arrow /></Link>
        </div>
      ) : null}
    </figure>
  );
}

function GuideCard({ guide, locale }: { guide: LiveFeedGuide; locale: Locale }) {
  const reviewed = guide.contentStatus === "reviewed";
  const reviewLabel = reviewed
    ? (locale === "zh" ? "已审核" : "REVIEWED")
    : (locale === "zh" ? "整理中 / 待审核" : "DRAFT / REVIEW PENDING");

  return (
    <article className="live-feed-guide-card">
      <div>
        <p className="eyebrow">{reviewLabel}</p>
        <h3>{text(guide.name, locale)}</h3>
        <p>{text(guide.purpose, locale)}</p>
      </div>
      <p className="status-line">
        {reviewed
          ? (guide.lastReviewed
              ? (locale === "zh" ? `最后审核：${guide.lastReviewed}` : `Last reviewed: ${guide.lastReviewed}`)
              : (locale === "zh" ? "已完成审核，审核日期待补充。" : "Reviewed; review date pending."))
          : text(liveFeedReviewWarning, locale)}
      </p>
    </article>
  );
}

function LocalizedList({ items, locale }: { items: LocalizedText[]; locale: Locale }) {
  return (
    <ul className="prose-list">
      {items.map((item) => <li key={item.en}>{text(item, locale)}</li>)}
    </ul>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="live-feed-detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function LiveFeedsPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={locale === "zh" ? "生物饵料与浮游动物研究" : "LIVE FEEDS & ZOOPLANKTON RESEARCH"}
        title={locale === "zh" ? "从微藻培养到水产苗种饵料" : "From Microalgae Culture to Aquaculture Live Feeds"}
        intro={locale === "zh"
          ? "团队围绕轮虫、桡足类、枝角类等浮游动物的培养、营养调控与水产养殖应用开展研究，并关注微藻饵料、培养环境和稳定供应之间的关系。"
          : "Our work examines the culture, nutritional regulation, and aquaculture applications of rotifers, copepods, cladocerans, and their microalgal food sources."}
      />

      <section className="section-shell content-section live-feed-groups-section">
        <SectionHeading
          eyebrow={`01 / ${locale === "zh" ? "主要类群" : "CORE GROUPS"}`}
          title={locale === "zh" ? "三类浮游动物研究对象" : "Three zooplankton groups"}
          intro={locale === "zh" ? "以下内容是类群层面的研究与教学入口，不代表所有成员具有相同生态或培养需求。" : "These group-level research and learning entries do not imply that all members share the same ecology or culture needs."}
        />
        <div className="live-feed-group-grid">
          {liveFeedEntries.map((entry, index) => <FeedGroupCard entry={entry} locale={locale} index={index} key={entry.id} />)}
        </div>
      </section>

      <section className="live-feed-relationship-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow="02 / MICROALGAE → ZOOPLANKTON → APPLICATION"
            title={locale === "zh" ? "微藻与浮游动物培养的连接" : "Connecting microalgae and zooplankton culture"}
            intro={locale === "zh" ? "该关系链用于组织研究问题，不是适用于所有物种的固定食物链。" : "This relationship organizes research questions; it is not a fixed food chain shared by every species."}
          />
          <RelationshipChain locale={locale} />
        </div>
      </section>

      <section className="dark-section live-feed-topics-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`03 / ${locale === "zh" ? "研究议题" : "RESEARCH TOPICS"}`}
            title={locale === "zh" ? "围绕培养、营养与应用提出问题" : "Questions across culture, nutrition, and application"}
            intro={locale === "zh" ? "以下内容表示团队关注的研究议题，不代表已经完成或证实的成果。" : "These are research topics of interest, not claims of completed or confirmed results."}
          />
          <div className="live-feed-topic-grid">
            {liveFeedResearchTopics.map((topic, index) => (
              <article key={topic.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{text(topic.title, locale)}</h3>
                <p>{text(topic.summary, locale)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell content-section live-feed-guides-section" id="guides">
        <SectionHeading
          eyebrow={`04 / ${locale === "zh" ? "培养教程" : "CULTURE GUIDES"}`}
          title={locale === "zh" ? "本科生培养学习入口" : "Culture-learning entry points for undergraduates"}
          intro={locale === "zh" ? "科普介绍与实验室正式 SOP 分开维护；当前仅建立教程结构。" : "Learning introductions are maintained separately from laboratory SOPs; only the guide structure is available now."}
        />
        <div className="notice-box live-feed-review-notice" role="note">
          <strong>{locale === "zh" ? "实验室审核提示" : "Laboratory review notice"}</strong>
          <p>{text(liveFeedReviewWarning, locale)}</p>
        </div>
        <div className="live-feed-guide-grid">
          {liveFeedGuides.map((guide) => <GuideCard guide={guide} locale={locale} key={guide.id} />)}
        </div>
      </section>
    </>
  );
}

export function LiveFeedDetail({ locale, entry }: { locale: Locale; entry: LiveFeedEntry }) {
  const relatedGuides = liveFeedGuides.filter((guide) => entry.relatedGuideIds.includes(guide.id));
  const imageCredit = entry.imageCreditId ? imageCredits.find((credit) => credit.id === entry.imageCreditId) : undefined;
  const canPublishImage = Boolean(entry.image && imageCredit);
  const statusLabel = entry.contentStatus === "reviewed"
    ? (locale === "zh" ? "已审核" : "Reviewed")
    : (locale === "zh" ? "整理中，待实验室审核" : "Draft, laboratory review pending");

  return (
    <article className="detail-page live-feed-detail-page">
      <header className="detail-hero live-feed-detail-hero section-shell">
        <div className="detail-title">
          <Link className="back-link" href={localPath(locale, "live-feeds")}>← {locale === "zh" ? "返回生物饵料" : "Back to Live Feeds"}</Link>
          <p className="eyebrow">{locale === "zh" ? "浮游动物类群" : "ZOOPLANKTON GROUP"}</p>
          <h1>{text(entry.name, locale)}</h1>
          <p className="detail-taxonomic-group">{entry.scientificGroup}</p>
          <p className="detail-summary">{text(entry.overview, locale)}</p>
        </div>
        <figure className="live-feed-detail-visual">
          {canPublishImage ? <img src={entry.image} alt={text(entry.imageAlt, locale)} /> : (
            <div className="live-feed-neutral-placeholder">
              <span aria-hidden="true"><i /><i /><i /><i /></span>
              <strong>{locale === "zh" ? "类群科学影像待团队提供" : "Team scientific image pending"}</strong>
              <small>{text(entry.imageAlt, locale)}</small>
            </div>
          )}
          <figcaption>
            {canPublishImage && imageCredit ? (
              imageCredit.href ? (
                <a href={imageCredit.href} rel="noreferrer">{imageCredit.file} · {imageCredit.credit} · {imageCredit.license}</a>
              ) : `${imageCredit.file} · ${imageCredit.credit} · ${imageCredit.license}`
            ) : (locale === "zh"
              ? "当前未使用来源不明或可能误导鉴定的临时物种图片"
              : "No uncredited or potentially misleading temporary species image is used")}
          </figcaption>
        </figure>
      </header>

      <div className="section-shell detail-content live-feed-detail-content">
        <aside>
          <div><span>{locale === "zh" ? "较高分类单元" : "Higher taxon"}</span><strong className="taxonomic-group">{entry.scientificGroup}</strong></div>
          <div><span>{locale === "zh" ? "栖息环境" : "Environment"}</span><strong>{text(entry.environment, locale)}</strong></div>
          <div><span>{locale === "zh" ? "内容状态" : "Content status"}</span><strong>{statusLabel}</strong></div>
          <div><span>{locale === "zh" ? "图片状态" : "Image status"}</span><strong>{text(entry.imageAlt, locale)}</strong></div>
        </aside>

        <div className="prose live-feed-detail-prose">
          <DetailSection title={locale === "zh" ? "基本认识" : "Overview"}>
            <p className="lead">{text(entry.overview, locale)}</p>
          </DetailSection>
          <DetailSection title={locale === "zh" ? "形态与生活史" : "Morphology and Life History"}>
            <p>{text(entry.morphology, locale)}</p>
            <p>{text(entry.lifeHistory, locale)}</p>
          </DetailSection>
          <DetailSection title={locale === "zh" ? "栖息环境" : "Environment"}>
            <p>{text(entry.environment, locale)}</p>
          </DetailSection>
          <DetailSection title={locale === "zh" ? "摄食特点与生态作用" : "Feeding Traits and Ecological Role"}>
            <p>{text(entry.feedingTraits, locale)}</p>
            <p>{text(entry.ecologicalRole, locale)}</p>
          </DetailSection>
          <DetailSection title={locale === "zh" ? "培养关注因素" : "Culture Factors"}>
            <LocalizedList items={entry.cultureFactors} locale={locale} />
          </DetailSection>
          <DetailSection title={locale === "zh" ? "水产养殖与研究应用" : "Aquaculture and Research Applications"}>
            <LocalizedList items={entry.applications} locale={locale} />
          </DetailSection>
          <DetailSection title={locale === "zh" ? "团队研究关注点" : "Team Research Interests"}>
            <LocalizedList items={entry.researchFocus} locale={locale} />
          </DetailSection>
          <DetailSection title={locale === "zh" ? "常见误区与应用边界" : "Common Misconceptions and Boundaries"}>
            <LocalizedList items={entry.limitations} locale={locale} />
          </DetailSection>

          {entry.contentStatus === "draft" ? (
            <div className="notice-box" role="note">
              <strong>{locale === "zh" ? "内容审核状态" : "Review status"}</strong>
              <p>{text(liveFeedReviewWarning, locale)}</p>
            </div>
          ) : null}

          <DetailSection title={locale === "zh" ? "相关教程" : "Related Guides"}>
            <div className="live-feed-related-guides">
              {relatedGuides.map((guide) => <GuideCard guide={guide} locale={locale} key={guide.id} />)}
            </div>
          </DetailSection>

          <DetailSection title={locale === "zh" ? "相关团队成果" : "Related Team Outputs"}>
            <EmptyState
              title={locale === "zh" ? "暂无经核实的相关团队成果" : "No verified related team outputs yet"}
              body={locale === "zh" ? "待团队提供并核实真实论文、项目或实验结果后再公开。" : "Nothing is published here until genuine papers, projects, or experimental results are supplied and verified by the team."}
            />
          </DetailSection>
        </div>
      </div>
    </article>
  );
}
