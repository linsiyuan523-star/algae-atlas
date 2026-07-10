/* eslint-disable @next/next/no-img-element -- Local, licensed images are used directly for identical vinext and Vercel rendering. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import {
  algae,
  applications,
  articles,
  imageCredits,
  projects,
  site,
  text,
  type AlgaeEntry,
  type FeatureEntry,
  type Locale,
} from "@/lib/site-data";

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const routeMeta = {
  algae: {
    title: { zh: "藻类图鉴", en: "Algae Library" },
    description: {
      zh: "从栖息环境、形态特征与研究方向认识六种代表性藻类。",
      en: "Meet six representative algae through habitat, form, and research focus.",
    },
  },
  applications: {
    title: { zh: "技术与应用", en: "Technology & Applications" },
    description: {
      zh: "理解藻类培养、水环境观察、水产饵料和生物质研究的基本路径。",
      en: "Explore cultivation, water observation, aquaculture, and biomass research pathways.",
    },
  },
  projects: {
    title: { zh: "项目与观察", en: "Projects & Field Notes" },
    description: {
      zh: "三个透明、可复用的观察案例模板，展示如何记录而不夸大结论。",
      en: "Three transparent, reusable observation templates built around careful records.",
    },
  },
  insights: {
    title: { zh: "知识中心", en: "Insights" },
    description: {
      zh: "从基础概念出发，理解藻类、水色与光生物反应器。",
      en: "Clear introductions to algae, water color, and photobioreactors.",
    },
  },
  about: {
    title: { zh: "关于藻境", en: "About Algae Atlas" },
    description: {
      zh: "一个让藻类知识更清晰、可信和易于访问的双语展示平台。",
      en: "A bilingual platform making algae knowledge clearer, more credible, and easier to access.",
    },
  },
  contact: {
    title: { zh: "联系我们", en: "Contact" },
    description: {
      zh: "了解藻境预览版的联系与合作说明。",
      en: "Contact and collaboration notes for the Algae Atlas preview.",
    },
  },
  privacy: {
    title: { zh: "隐私说明", en: "Privacy" },
    description: {
      zh: "藻境预览版的数据与隐私说明。",
      en: "Data and privacy information for the Algae Atlas preview.",
    },
  },
} as const;

function validLocale(value: string): value is Locale {
  return value === "zh" || value === "en";
}

function localPath(locale: Locale, path = "") {
  return `/${locale}${path ? `/${path}` : ""}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug = [] } = await params;
  if (!validLocale(rawLocale)) return {};
  const locale = rawLocale;
  const section = slug[0] as keyof typeof routeMeta | undefined;
  let titleValue = locale === "zh" ? "探索藻类的微观世界" : "Explore the world of algae";
  let description = text(site.description, locale);

  if (section && section in routeMeta) {
    titleValue = text(routeMeta[section].title, locale);
    description = text(routeMeta[section].description, locale);
  }

  if (slug[1]) {
    const entry =
      algae.find((item) => item.id === slug[1]) ||
      applications.find((item) => item.id === slug[1]) ||
      projects.find((item) => item.id === slug[1]) ||
      articles.find((item) => item.id === slug[1]);
    if (entry) {
      titleValue = text("title" in entry ? entry.title : entry.name, locale);
      description = text(entry.summary, locale);
    }
  }

  const suffix = slug.length ? `/${slug.join("/")}` : "";
  const url = `/${locale}${suffix}`;
  return {
    title: titleValue,
    description,
    alternates: {
      canonical: url,
      languages: {
        "zh-CN": `/zh${suffix}`,
        en: `/en${suffix}`,
        "x-default": `/zh${suffix}`,
      },
    },
    openGraph: {
      title: titleValue,
      description,
      url,
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
  };
}

export function generateStaticParams() {
  const base = ["algae", "applications", "projects", "insights", "about", "contact", "privacy"];
  const detail = [
    ...algae.map((entry) => ["algae", entry.id]),
    ...applications.map((entry) => ["applications", entry.id]),
    ...projects.map((entry) => ["projects", entry.id]),
    ...articles.map((entry) => ["insights", entry.id]),
  ];

  return (["zh", "en"] as const).flatMap((locale) => [
    { locale, slug: undefined },
    ...base.map((section) => ({ locale, slug: [section] })),
    ...detail.map((slug) => ({ locale, slug })),
  ]);
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
}) {
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

function AlgaeCard({ entry, locale }: { entry: AlgaeEntry; locale: Locale }) {
  return (
    <article className="algae-card">
      <Link className="card-media" href={localPath(locale, `algae/${entry.id}`)}>
        <img src={entry.image} alt="" loading="lazy" />
        <span>{text(entry.categoryLabel, locale)}</span>
      </Link>
      <div className="card-body">
        <p className="latin-name">{entry.latin}</p>
        <h3>
          <Link href={localPath(locale, `algae/${entry.id}`)}>{text(entry.name, locale)}</Link>
        </h3>
        <p>{text(entry.summary, locale)}</p>
        <Link className="text-link" href={localPath(locale, `algae/${entry.id}`)}>
          {locale === "zh" ? "打开图鉴" : "Open profile"} <Arrow />
        </Link>
      </div>
    </article>
  );
}

function FeatureCard({
  entry,
  locale,
  section,
  index,
}: {
  entry: FeatureEntry;
  locale: Locale;
  section: "applications" | "projects";
  index: number;
}) {
  return (
    <article className="feature-card">
      <div className="feature-image">
        <img src={entry.image} alt="" loading="lazy" />
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="feature-copy">
        <p className="eyebrow">{text(entry.note, locale)}</p>
        <h3>{text(entry.title, locale)}</h3>
        <p>{text(entry.summary, locale)}</p>
        <Link className="text-link" href={localPath(locale, `${section}/${entry.id}`)}>
          {locale === "zh" ? "深入了解" : "Explore the topic"} <Arrow />
        </Link>
      </div>
    </article>
  );
}

function HomePage({ locale }: { locale: Locale }) {
  return (
    <>
      <section className="hero">
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow light">{text(site.kicker, locale)}</p>
            <h1>
              {locale === "zh" ? (
                <>
                  从一滴水，<br />
                  看见<span>生命的尺度</span>
                </>
              ) : (
                <>
                  A universe<br />
                  within <span>one drop</span>
                </>
              )}
            </h1>
            <p className="hero-intro">
              {locale === "zh"
                ? "藻类连接光、碳、水与生命。我们用清晰的双语内容，呈现它们的形态、培养方式与生态关系。"
                : "Algae connect light, carbon, water, and life. Explore their forms, cultivation, and ecological relationships through clear bilingual stories."}
            </p>
            <div className="button-row">
              <Link className="button primary" href={localPath(locale, "algae")}>
                {locale === "zh" ? "进入藻类图鉴" : "Explore the library"} <Arrow />
              </Link>
              <Link className="button ghost" href={localPath(locale, "about")}>
                {locale === "zh" ? "了解这个计划" : "About the project"}
              </Link>
            </div>
          </div>
          <figure className="hero-visual">
            <img src="/images/diatoms.jpg" alt={locale === "zh" ? "显微镜下形态多样的硅藻" : "Diverse diatoms under a microscope"} />
            <figcaption>
              <span>MICRO / 001</span>
              <span>{locale === "zh" ? "显微藻类形态" : "MICROALGAE MORPHOLOGY"}</span>
            </figcaption>
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
          </figure>
        </div>
        <div className="hero-index">
          <span>{locale === "zh" ? "向下探索" : "SCROLL TO EXPLORE"}</span>
          <span>01 — 06</span>
        </div>
      </section>

      <section className="statement section-shell">
        <p className="statement-index">01 / {locale === "zh" ? "认识藻类" : "MEET ALGAE"}</p>
        <div className="statement-copy">
          <h2>
            {locale === "zh" ? "微小，却塑造着" : "Microscopic life,"}
            <br />
            <em>{locale === "zh" ? "巨大的生态关系" : "planetary relationships"}</em>
          </h2>
          <p>
            {locale === "zh"
              ? "藻类不是一个单一的生物分类。它们跨越不同演化谱系，从单个细胞到大型海藻，以光合作用参与水域生态系统。"
              : "Algae are not one biological lineage. From single cells to seaweeds, they span evolutionary histories and participate in aquatic ecosystems through photosynthesis."}
          </p>
        </div>
      </section>

      <section className="section-shell content-section">
        <SectionHeading
          eyebrow={`02 / ${locale === "zh" ? "精选图鉴" : "FEATURED SPECIES"}`}
          title={locale === "zh" ? "从形态进入藻类世界" : "Enter the algae world through form"}
          intro={locale === "zh" ? "每一张卡片都是继续观察的入口。" : "Every profile is an invitation to look closer."}
        />
        <div className="algae-grid featured-grid">
          {algae.slice(0, 3).map((entry) => (
            <AlgaeCard key={entry.id} entry={entry} locale={locale} />
          ))}
        </div>
        <Link className="section-link" href={localPath(locale, "algae")}>
          {locale === "zh" ? "查看全部 6 个条目" : "View all 6 profiles"} <Arrow />
        </Link>
      </section>

      <section className="dark-section">
        <div className="section-shell">
          <SectionHeading
            eyebrow={`03 / ${locale === "zh" ? "技术路径" : "TECHNOLOGY PATHS"}`}
            title={locale === "zh" ? "从培养系统到生态观察" : "From cultivation to ecological observation"}
            intro={locale === "zh" ? "把复杂过程拆解为可理解的关键因素。" : "Complex processes, explained through the factors that shape them."}
          />
          <div className="application-preview">
            {applications.slice(0, 2).map((entry, index) => (
              <FeatureCard key={entry.id} entry={entry} locale={locale} section="applications" index={index} />
            ))}
          </div>
          <Link className="section-link light-link" href={localPath(locale, "applications")}>
            {locale === "zh" ? "浏览全部技术方向" : "Browse all technology paths"} <Arrow />
          </Link>
        </div>
      </section>

      <section className="image-break">
        <img src="/images/bloom.jpg" alt={locale === "zh" ? "卫星视角下的挪威海浮游植物藻华" : "A phytoplankton bloom in the Norwegian Sea seen from space"} loading="lazy" />
        <div className="image-break-copy">
          <p className="eyebrow light">04 / PLANETARY VIEW</p>
          <blockquote>
            {locale === "zh" ? "看见水色，也要理解水色背后的证据。" : "See the color of water—and ask what evidence lies beneath it."}
          </blockquote>
          <Link href={localPath(locale, "insights/why-water-turns-green")}>
            {locale === "zh" ? "水为什么会变绿？" : "Why does water turn green?"} <Arrow />
          </Link>
        </div>
      </section>

      <section className="section-shell content-section">
        <SectionHeading
          eyebrow={`05 / ${locale === "zh" ? "观察笔记" : "FIELD NOTES"}`}
          title={locale === "zh" ? "用连续记录代替快速结论" : "Trade quick conclusions for careful records"}
        />
        <div className="project-preview">
          {projects.map((entry, index) => (
            <article key={entry.id}>
              <span>0{index + 1}</span>
              <div>
                <p className="latin-name">{text(entry.note, locale)}</p>
                <h3>{text(entry.title, locale)}</h3>
                <p>{text(entry.summary, locale)}</p>
              </div>
              <Link href={localPath(locale, `projects/${entry.id}`)} aria-label={text(entry.title, locale)}>
                <Arrow />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-panel section-shell">
        <div>
          <p className="eyebrow">06 / OPEN KNOWLEDGE</p>
          <h2>{locale === "zh" ? "从好奇开始，继续探索。" : "Start with curiosity. Keep exploring."}</h2>
        </div>
        <p>
          {locale === "zh"
            ? "阅读面向公众的藻类基础知识，理解观察方法与技术边界。"
            : "Read public-facing introductions to algae, observation methods, and the limits of technology."}
        </p>
        <Link className="button dark" href={localPath(locale, "insights")}>
          {locale === "zh" ? "前往知识中心" : "Visit insights"} <Arrow />
        </Link>
      </section>
    </>
  );
}

function PageHero({
  locale,
  index,
  eyebrow,
  title,
  intro,
  image,
}: {
  locale: Locale;
  index: string;
  eyebrow: string;
  title: string;
  intro: string;
  image?: string;
}) {
  return (
    <section className={`page-hero${image ? " has-image" : ""}`}>
      <div className="page-hero-inner">
        <p className="eyebrow light">{index} / {eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      {image ? (
        <figure>
          <img src={image} alt="" />
          <figcaption>{locale === "zh" ? "影像用于科学传播与视觉说明" : "Imagery for scientific communication"}</figcaption>
        </figure>
      ) : null}
    </section>
  );
}

function AlgaeLibrary({ locale, typeFilter }: { locale: Locale; typeFilter?: string }) {
  const filters = [
    { value: "all", label: { zh: "全部", en: "All" } },
    { value: "freshwater", label: { zh: "淡水", en: "Freshwater" } },
    { value: "marine", label: { zh: "海洋", en: "Marine" } },
    { value: "extreme", label: { zh: "特殊环境", en: "Extreme habitats" } },
  ] as const;
  const activeFilter = filters.some((item) => item.value === typeFilter) ? typeFilter : "all";
  const entries = activeFilter === "all" ? algae : algae.filter((entry) => entry.category === activeFilter);

  return (
    <>
      <PageHero
        locale={locale}
        index="01"
        eyebrow={locale === "zh" ? "藻类图鉴" : "ALGAE LIBRARY"}
        title={locale === "zh" ? "六种藻类，六个观察入口" : "Six algae. Six ways to look closer."}
        intro={locale === "zh" ? "从淡水到海洋，从单细胞到大型海藻，建立一份清晰、可继续扩展的公众图鉴。" : "From freshwater cells to coastal seaweeds, a clear public library designed to grow over time."}
        image="/images/diatoms.jpg"
      />
      <section className="section-shell content-section library-section">
        <div className="filter-row" aria-label={locale === "zh" ? "按环境筛选" : "Filter by habitat"}>
          {filters.map((filter) => (
            <Link
              key={filter.value}
              className={activeFilter === filter.value ? "is-active" : undefined}
              href={filter.value === "all" ? localPath(locale, "algae") : `${localPath(locale, "algae")}?type=${filter.value}`}
              scroll={false}
            >
              {text(filter.label, locale)}
            </Link>
          ))}
          <span>{String(entries.length).padStart(2, "0")} {locale === "zh" ? "个条目" : "profiles"}</span>
        </div>
        <div className="algae-grid">
          {entries.map((entry) => (
            <AlgaeCard key={entry.id} entry={entry} locale={locale} />
          ))}
        </div>
      </section>
    </>
  );
}

function AlgaeDetail({ locale, entry }: { locale: Locale; entry: AlgaeEntry }) {
  return (
    <article className="detail-page">
      <div className="detail-hero section-shell">
        <div className="detail-title">
          <Link className="back-link" href={localPath(locale, "algae")}>← {locale === "zh" ? "返回图鉴" : "Back to library"}</Link>
          <p className="eyebrow">{text(entry.categoryLabel, locale)}</p>
          <h1>{text(entry.name, locale)}</h1>
          <p className="detail-latin">{entry.latin}</p>
        </div>
        <figure>
          <img src={entry.image} alt="" />
        </figure>
      </div>
      <div className="detail-content section-shell">
        <aside>
          <div><span>{locale === "zh" ? "环境" : "Habitat"}</span><strong>{text(entry.habitat, locale)}</strong></div>
          <div><span>{locale === "zh" ? "关注方向" : "Focus"}</span><strong>{text(entry.focus, locale)}</strong></div>
          <div><span>{locale === "zh" ? "资料状态" : "Status"}</span><strong>{locale === "zh" ? "公众基础条目" : "Public foundation profile"}</strong></div>
        </aside>
        <div className="prose">
          <p className="lead">{text(entry.summary, locale)}</p>
          <h2>{locale === "zh" ? "如何观察它" : "How to observe it"}</h2>
          <p>{locale === "zh" ? "先记录采样或培养环境，再观察颜色、整体形态和时间变化。可靠的物种确认通常还需要显微特征、规范培养记录，必要时结合分子方法。" : "Begin with the sampling or culture context, then record color, overall form, and change over time. Confident identification may also require microscopy, documented cultivation, or molecular methods."}</p>
          <h2>{locale === "zh" ? "为什么值得关注" : "Why it matters"}</h2>
          <p>{locale === "zh" ? `作为${text(entry.categoryLabel, locale)}，${text(entry.name, locale)}为理解${text(entry.focus, locale)}提供了一个具体入口。这里的内容用于科普，不替代实验设计、专业鉴定或产品评价。` : `As a ${text(entry.categoryLabel, locale).toLowerCase()}, ${text(entry.name, locale)} offers a concrete entry point into ${text(entry.focus, locale).toLowerCase()}. This public profile does not replace experimental design, expert identification, or product assessment.`}</p>
          <div className="notice-box">
            <strong>{locale === "zh" ? "阅读提示" : "Reading note"}</strong>
            <p>{locale === "zh" ? "藻类名称和分类会随研究进展而调整；正式研究请核对最新分类学资料。" : "Algal names and classifications evolve with research; formal work should check current taxonomic sources."}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function FeatureIndex({
  locale,
  section,
}: {
  locale: Locale;
  section: "applications" | "projects";
}) {
  const isApps = section === "applications";
  const entries = isApps ? applications : projects;
  return (
    <>
      <PageHero
        locale={locale}
        index={isApps ? "02" : "03"}
        eyebrow={locale === "zh" ? (isApps ? "技术与应用" : "项目与观察") : isApps ? "TECHNOLOGY & APPLICATIONS" : "PROJECTS & FIELD NOTES"}
        title={locale === "zh" ? (isApps ? "理解过程，才能选择技术" : "让记录先于结论") : isApps ? "Understand the process before choosing the tool" : "Let records come before conclusions"}
        intro={locale === "zh" ? (isApps ? "技术不是孤立的设备，而是环境、目标、尺度与维护共同构成的系统。" : "这些是透明的示例观察模板，不代表真实客户项目或商业成果。") : isApps ? "Technology is a system shaped by environment, purpose, scale, and care—not an isolated device." : "Transparent sample observation frameworks, not client work or commercial claims."}
        image={isApps ? "/images/photobioreactor.jpg" : "/images/cultures.jpg"}
      />
      <section className="section-shell content-section feature-list">
        {entries.map((entry, index) => (
          <FeatureCard key={entry.id} entry={entry} locale={locale} section={section} index={index} />
        ))}
      </section>
    </>
  );
}

function FeatureDetail({ locale, entry, section }: { locale: Locale; entry: FeatureEntry; section: "applications" | "projects" }) {
  const isApps = section === "applications";
  return (
    <article className="detail-page feature-detail">
      <div className="detail-hero section-shell">
        <div className="detail-title">
          <Link className="back-link" href={localPath(locale, section)}>← {locale === "zh" ? "返回列表" : "Back to overview"}</Link>
          <p className="eyebrow">{text(entry.note, locale)}</p>
          <h1>{text(entry.title, locale)}</h1>
          <p className="detail-summary">{text(entry.summary, locale)}</p>
        </div>
        <figure><img src={entry.image} alt="" /></figure>
      </div>
      <div className="detail-content section-shell">
        <aside>
          <div><span>{locale === "zh" ? "内容类型" : "Content type"}</span><strong>{locale === "zh" ? (isApps ? "技术路径说明" : "示例观察案例") : isApps ? "Technology pathway" : "Sample field note"}</strong></div>
          <div><span>{locale === "zh" ? "原则" : "Principle"}</span><strong>{locale === "zh" ? "明确边界，保留证据" : "State limits, retain evidence"}</strong></div>
        </aside>
        <div className="prose">
          <p className="lead">{text(entry.summary, locale)}</p>
          <h2>{locale === "zh" ? (isApps ? "关键变量" : "建议记录") : isApps ? "Key variables" : "What to record"}</h2>
          <p>{locale === "zh" ? (isApps ? "开始之前，需要明确对象、培养或观察目标、环境条件、可维护的尺度，以及如何判断过程是否稳定。单一指标很少能够完整说明系统状态。" : "固定观察位置和时间，记录天气、光照、水温或潮位等背景信息，并保留原始照片。连续记录比孤立的一次观察更能揭示变化。") : isApps ? "Start by defining the organism, purpose, environmental conditions, maintainable scale, and signs of process stability. A single metric rarely explains the full system." : "Keep observation position and timing consistent, record environmental context, and preserve original images. A series reveals more than an isolated observation."}</p>
          <h2>{locale === "zh" ? "如何负责任地解读" : "Responsible interpretation"}</h2>
          <p>{locale === "zh" ? "先描述看到了什么，再讨论可能原因，并区分观察、推测和验证结果。任何面向生产、健康或环境治理的决定，都需要进一步的专业评估。" : "Describe what is visible first, then discuss possible causes, clearly separating observation, hypothesis, and verified result. Production, health, or environmental decisions require further expert assessment."}</p>
          <div className="notice-box"><strong>{locale === "zh" ? "重要说明" : "Important note"}</strong><p>{locale === "zh" ? "当前页面为公开科普和结构演示，不构成工程方案、检测报告或商业承诺。" : "This public page is educational and demonstrative; it is not an engineering plan, test report, or commercial commitment."}</p></div>
        </div>
      </div>
    </article>
  );
}

function InsightsIndex({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} index="04" eyebrow={locale === "zh" ? "知识中心" : "INSIGHTS"} title={locale === "zh" ? "从问题出发，接近可靠理解" : "Start with questions. Move toward evidence."} intro={locale === "zh" ? "短篇、清晰、标明边界的藻类基础阅读。" : "Short, clear introductions to algae—with the limits made visible."} image="/images/bloom.jpg" />
      <section className="section-shell content-section article-list">
        {articles.map((entry, index) => (
          <article key={entry.id}>
            <Link className="article-image" href={localPath(locale, `insights/${entry.id}`)}><img src={entry.image} alt="" loading="lazy" /><span>0{index + 1}</span></Link>
            <div>
              <p className="eyebrow">{text(entry.note, locale)} · {text(entry.readTime, locale)}</p>
              <h2><Link href={localPath(locale, `insights/${entry.id}`)}>{text(entry.title, locale)}</Link></h2>
              <p>{text(entry.summary, locale)}</p>
              <Link className="text-link" href={localPath(locale, `insights/${entry.id}`)}>{locale === "zh" ? "阅读全文" : "Read article"} <Arrow /></Link>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function ArticleDetail({ locale, entry }: { locale: Locale; entry: (typeof articles)[number] }) {
  return (
    <article className="article-page">
      <header className="article-header section-shell">
        <Link className="back-link" href={localPath(locale, "insights")}>← {locale === "zh" ? "返回知识中心" : "Back to insights"}</Link>
        <p className="eyebrow">{text(entry.note, locale)} · {entry.date} · {text(entry.readTime, locale)}</p>
        <h1>{text(entry.title, locale)}</h1>
        <p>{text(entry.summary, locale)}</p>
      </header>
      <figure className="article-cover"><img src={entry.image} alt="" /></figure>
      <div className="article-body prose">
        <p className="lead">{text(entry.summary, locale)}</p>
        {entry.id === "what-are-algae" ? (
          <>
            <h2>{locale === "zh" ? "一个方便但宽泛的名称" : "A useful but broad name"}</h2>
            <p>{locale === "zh" ? "“藻类”把许多不同演化来源的光合生物放在了一起。它们可能是单细胞、群体，也可能形成肉眼可见的大型藻体。共同点通常是与水或潮湿环境密切相关，并通过光合作用获取能量。" : "The word “algae” groups photosynthetic organisms from very different evolutionary histories. They may be single cells, colonies, or large visible thalli, commonly tied to water or moist environments and using photosynthesis for energy."}</p>
            <h2>{locale === "zh" ? "蓝藻为什么是例外" : "Why cyanobacteria are different"}</h2>
            <p>{locale === "zh" ? "传统上称为“蓝藻”的生物实际上是蓝细菌。它们没有真核细胞的细胞核结构，因此与绿藻、硅藻等真核藻类存在根本差别。日常语境仍常把它们一起讨论，但科学表达应说明这一区别。" : "Organisms traditionally called blue-green algae are cyanobacteria. They lack the nucleus of eukaryotic cells and differ fundamentally from green algae or diatoms. Everyday discussion may group them together, but scientific communication should state the distinction."}</p>
          </>
        ) : entry.id === "why-water-turns-green" ? (
          <>
            <h2>{locale === "zh" ? "颜色只是线索" : "Color is a clue, not a conclusion"}</h2>
            <p>{locale === "zh" ? "水体中悬浮的微藻增多时，叶绿素等色素可能让水呈现绿色。但泥沙、溶解有机物、天空反射和拍摄角度也会显著改变我们看到的颜色。" : "When suspended microalgae increase, pigments such as chlorophyll may make water look green. Sediment, dissolved organic matter, sky reflection, and viewing angle can also change its apparent color."}</p>
            <h2>{locale === "zh" ? "把观察变成证据" : "Turning observation into evidence"}</h2>
            <p>{locale === "zh" ? "更可靠的方法是连续记录水色，同时测量透明度、温度、营养盐等指标，并通过显微观察了解主要生物。这样才能区分短期视觉变化和持续的生态趋势。" : "A stronger approach combines repeated color records with clarity, temperature, nutrient measurements, and microscopy. This helps distinguish a short-lived visual change from a sustained ecological pattern."}</p>
          </>
        ) : (
          <>
            <h2>{locale === "zh" ? "光、气体与培养液" : "Light, gases, and culture medium"}</h2>
            <p>{locale === "zh" ? "光生物反应器用透明培养空间让微藻获得光照，并通过混合和气体交换改善细胞接触光与无机碳的机会。不同几何结构会改变光程、流动和清洁方式。" : "A photobioreactor uses a transparent cultivation space to expose microalgae to light. Mixing and gas exchange influence how cells encounter light and inorganic carbon, while geometry changes light paths, flow, and cleaning."}</p>
            <h2>{locale === "zh" ? "封闭不等于没有挑战" : "Closed does not mean challenge-free"}</h2>
            <p>{locale === "zh" ? "封闭系统通常更便于控制外界交换，但也需要处理局部过热、表面附着、污染风险、供气和运行能耗。合适的系统取决于藻种、目标、规模与维护能力。" : "Closed systems can improve control over exchange with the environment, yet still face local heating, fouling, contamination, aeration, and energy demands. The right system depends on species, goals, scale, and maintenance capacity."}</p>
          </>
        )}
        <div className="notice-box"><strong>{locale === "zh" ? "本文边界" : "Scope note"}</strong><p>{locale === "zh" ? "本文用于公众科普，不替代水质检测、物种鉴定、工程设计或健康建议。" : "This article is for public education and does not replace water testing, species identification, engineering design, or health advice."}</p></div>
      </div>
    </article>
  );
}

function AboutPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} index="05" eyebrow={locale === "zh" ? "关于藻境" : "ABOUT ALGAE ATLAS"} title={locale === "zh" ? "让微小生命被清楚地看见" : "Make microscopic life clearly visible"} intro={locale === "zh" ? "藻境是一个处于预览阶段的双语内容平台：以公众理解为起点，以透明来源和克制表达为原则。" : "Algae Atlas is a bilingual content platform in preview, designed for public understanding with transparent sources and careful language."} image="/images/cultures.jpg" />
      <section className="section-shell content-section about-grid">
        <div><p className="eyebrow">01 / MISSION</p><h2>{locale === "zh" ? "从展示，走向理解" : "From display to understanding"}</h2></div>
        <div className="prose"><p className="lead">{locale === "zh" ? "我们希望把藻类的形态、培养与生态关系组织成易于进入、可以继续追问的内容。" : "We organize algae form, cultivation, and ecology into content that is easy to enter and open to further questions."}</p><p>{locale === "zh" ? "首版不设置商城、登录或复杂数据库。内容以结构化文件维护，让每一项资料都能独立更新、翻译和追踪来源。" : "The first release avoids commerce, accounts, and complex databases. Structured content keeps each profile easy to update, translate, and source."}</p></div>
      </section>
      <section className="values-section"><div className="section-shell"><article><span>01</span><h3>{locale === "zh" ? "清晰" : "Clarity"}</h3><p>{locale === "zh" ? "先解释概念，再呈现术语。" : "Explain the idea before presenting the term."}</p></article><article><span>02</span><h3>{locale === "zh" ? "透明" : "Transparency"}</h3><p>{locale === "zh" ? "标注示例、来源与表达边界。" : "Label examples, sources, and limits."}</p></article><article><span>03</span><h3>{locale === "zh" ? "可维护" : "Maintainability"}</h3><p>{locale === "zh" ? "内容与界面分离，便于长期更新。" : "Separate content from interface for long-term care."}</p></article></div></section>
      <section id="image-credits" className="section-shell content-section credits-section">
        <SectionHeading eyebrow="IMAGE CREDITS" title={locale === "zh" ? "图片来源与许可" : "Image sources & licenses"} intro={locale === "zh" ? "预览版使用公开授权科学影像，本地保存并进行展示裁切。" : "The preview uses openly licensed scientific imagery, saved locally and cropped for presentation."} />
        <div className="credits-list">{imageCredits.map((credit) => <a key={credit.file} href={credit.href} target="_blank" rel="noreferrer"><strong>{credit.file}</strong><span>{credit.credit}</span><em>{credit.license} ↗</em></a>)}</div>
      </section>
    </>
  );
}

function ContactPage({ locale }: { locale: Locale }) {
  return (
    <section className="contact-page">
      <div className="section-shell contact-grid">
        <div><p className="eyebrow light">06 / CONTACT</p><h1>{locale === "zh" ? "让下一次更新，来自真实的交流。" : "Let the next update begin with a real conversation."}</h1><p>{locale === "zh" ? "网站当前处于预览阶段，尚未启用公开联系表单，也不会收集访客个人信息。" : "The site is currently in preview. No public contact form is active, and no visitor personal data is collected."}</p></div>
        <div className="contact-card"><span>PREVIEW / 2026</span><h2>{locale === "zh" ? "正式发布前将补充" : "To be added before launch"}</h2><ul><li>{locale === "zh" ? "正式组织或个人名称" : "Verified organization or owner name"}</li><li>{locale === "zh" ? "可用的公开邮箱与社交账号" : "Public email and social accounts"}</li><li>{locale === "zh" ? "合作范围与回复时间说明" : "Collaboration scope and response times"}</li></ul><p>{locale === "zh" ? "这样可以避免向不存在的地址发送信息，也不在预览阶段制造虚假联系方式。" : "This avoids sending messages to an unverified address or presenting invented contact details."}</p></div>
      </div>
    </section>
  );
}

function PrivacyPage({ locale }: { locale: Locale }) {
  return (
    <section className="legal-page section-shell">
      <p className="eyebrow">PRIVACY / 2026-07-10</p>
      <h1>{locale === "zh" ? "隐私说明" : "Privacy notice"}</h1>
      <div className="prose"><p className="lead">{locale === "zh" ? "当前预览版不提供账户、评论、订阅或联系表单，因此不会主动收集访客提交的个人信息。" : "This preview has no accounts, comments, subscriptions, or contact form, so it does not actively collect visitor-submitted personal information."}</p><h2>{locale === "zh" ? "托管日志" : "Hosting logs"}</h2><p>{locale === "zh" ? "托管平台可能为安全与运行目的处理基础访问日志。正式发布前，如启用访问分析或联系功能，本页面将说明所用服务、数据范围和保留方式。" : "The hosting platform may process basic access logs for security and operation. If analytics or contact features are enabled, this notice will be updated with the services, data scope, and retention details."}</p><h2>{locale === "zh" ? "外部链接" : "External links"}</h2><p>{locale === "zh" ? "图片来源链接会前往 Wikimedia Commons 等外部网站；访问这些网站时适用其各自的隐私政策。" : "Image credit links lead to external sites such as Wikimedia Commons, which apply their own privacy policies."}</p></div>
    </section>
  );
}

export default async function LocalizedPage({ params, searchParams }: PageProps) {
  const [{ locale: rawLocale, slug = [] }, query] = await Promise.all([params, searchParams]);
  if (!validLocale(rawLocale)) notFound();
  const locale = rawLocale;
  const [section, id] = slug;
  let page: React.ReactNode;

  if (!section) page = <HomePage locale={locale} />;
  else if (section === "algae" && !id) page = <AlgaeLibrary locale={locale} typeFilter={typeof query.type === "string" ? query.type : undefined} />;
  else if (section === "algae" && id) {
    const entry = algae.find((item) => item.id === id);
    if (!entry) notFound();
    page = <AlgaeDetail locale={locale} entry={entry} />;
  } else if ((section === "applications" || section === "projects") && !id) page = <FeatureIndex locale={locale} section={section} />;
  else if ((section === "applications" || section === "projects") && id) {
    const entries = section === "applications" ? applications : projects;
    const entry = entries.find((item) => item.id === id);
    if (!entry) notFound();
    page = <FeatureDetail locale={locale} entry={entry} section={section} />;
  } else if (section === "insights" && !id) page = <InsightsIndex locale={locale} />;
  else if (section === "insights" && id) {
    const entry = articles.find((item) => item.id === id);
    if (!entry) notFound();
    page = <ArticleDetail locale={locale} entry={entry} />;
  } else if (section === "about" && !id) page = <AboutPage locale={locale} />;
  else if (section === "contact" && !id) page = <ContactPage locale={locale} />;
  else if (section === "privacy" && !id) page = <PrivacyPage locale={locale} />;
  else notFound();

  return <SiteShell locale={locale} pathParts={slug}>{page}</SiteShell>;
}
