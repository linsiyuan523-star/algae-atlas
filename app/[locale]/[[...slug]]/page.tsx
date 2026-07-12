import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/SiteShell";
import { LiveFeedDetail, LiveFeedsPage } from "@/components/LiveFeedsPages";
import {
  AboutPage,
  AlgaeDetail,
  AlgaeLibrary,
  ContactPage,
  HomePage,
  LegacyDetail,
  LegacyIndex,
  NewsPage,
  OutputsPage,
  PrivacyPage,
  ResearchDetail,
  ResearchPage,
  TeamPage,
  TutorialDetail,
  TutorialsPage,
} from "@/components/SitePages";
import { algae, applications, articles, projects, text, type Locale, type LocalizedText } from "@/lib/site-data";
import { liveFeedEntries } from "@/lib/live-feeds-data";
import { researchAreas, tutorials } from "@/lib/team-data";

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type RouteMeta = { title: LocalizedText; description: LocalizedText };

const homeMeta: RouteMeta = {
  title: {
    zh: "广东海洋大学藻类团队｜微藻、大型海藻与实验教学",
    en: "Algae Research Team | Guangdong Ocean University",
  },
  description: {
    zh: "广东海洋大学藻类团队围绕微藻培养调控、大型海藻资源利用、活性物质开发、水产养殖应用及本科生实验训练开展研究与教学。",
    en: "Research on microalgae, macroalgae, algal biotechnology, aquaculture applications, and undergraduate laboratory training at Guangdong Ocean University.",
  },
};

const routeMeta: Record<string, RouteMeta> = {
  team: {
    title: { zh: "团队概况｜广东海洋大学藻类团队", en: "Team | Algae Research Team" },
    description: { zh: "了解广东海洋大学藻类团队的研究定位、科研训练理念与信息更新状态。", en: "Learn about the team’s research positioning, training principles, and content status." },
  },
  research: {
    title: { zh: "研究方向｜微藻与大型海藻", en: "Research | Microalgae and Macroalgae" },
    description: { zh: "了解微藻培养调控、大型海藻资源、活性物质与水产养殖应用等研究方向。", en: "Explore research interests in microalgae, macroalgae, bioactive compounds, and aquaculture applications." },
  },
  "live-feeds": {
    title: { zh: "生物饵料与浮游动物｜广东海洋大学藻类团队", en: "Live Feeds & Zooplankton | Algae Research Team" },
    description: {
      zh: "介绍团队在轮虫、桡足类、枝角类、微藻饵料、浮游动物培养及水产苗种应用方面的研究与实验教学。",
      en: "Research and laboratory training on rotifers, copepods, cladocerans, microalgal diets, zooplankton culture, and aquaculture live-feed applications.",
    },
  },
  outputs: {
    title: { zh: "科研成果｜广东海洋大学藻类团队", en: "Outputs | Algae Research Team" },
    description: { zh: "论文、专利、科研项目与学生科研信息将在团队核实后更新。", en: "Publications, patents, research projects, and student research will be added after team verification." },
  },
  tutorials: {
    title: { zh: "仪器教程｜实验学习资源", en: "Tutorials | Laboratory Learning Resources" },
    description: { zh: "面向本科生的仪器认知和实验学习入口，具体流程经实验室审核后发布。", en: "Instrument literacy and laboratory learning resources for undergraduates, with procedures published after review." },
  },
  algae: {
    title: { zh: "藻类图鉴｜藻境 Algae Atlas", en: "Algae Atlas | Research Organisms" },
    description: { zh: "认识代表性微藻、大型海藻及其环境、形态与研究关注。", en: "Meet representative microalgae and macroalgae through habitat, form, and research interest." },
  },
  news: {
    title: { zh: "动态与联系｜广东海洋大学藻类团队", en: "News & Contact | Algae Research Team" },
    description: { zh: "团队动态将在内部确认后更新，并提供公共联系信息入口。", en: "Team-confirmed news and access to public contact information." },
  },
  contact: {
    title: { zh: "联系｜广东海洋大学藻类团队", en: "Contact | Algae Research Team" },
    description: { zh: "广东海洋大学藻类团队公共联系信息与更新状态。", en: "Public contact information and availability status for the Algae Research Team." },
  },
  about: {
    title: { zh: "关于网站｜广东海洋大学藻类团队", en: "About | Algae Research Team" },
    description: { zh: "了解团队网站、藻境公众图鉴、内容审核原则与图片来源。", en: "About the team website, public Algae Atlas, review principles, and image credits." },
  },
  privacy: {
    title: { zh: "隐私说明｜广东海洋大学藻类团队", en: "Privacy | Algae Research Team" },
    description: { zh: "网站基础访问数据、外部链接与敏感信息处理说明。", en: "Information about basic access data, external links, and handling of secrets." },
  },
  insights: {
    title: { zh: "科普与观察｜藻境 Algae Atlas", en: "Public Insights | Algae Atlas" },
    description: { zh: "面向公众的藻类基础阅读与示例观察框架。", en: "Public introductions to algae and sample observation frameworks." },
  },
  applications: {
    title: { zh: "公众背景资料｜藻类技术", en: "Public Background | Algal Technologies" },
    description: { zh: "面向公众的藻类培养与应用背景资料。", en: "Public background material on algal cultivation and applications." },
  },
  projects: {
    title: { zh: "示例观察框架｜藻境", en: "Sample Observation Frameworks | Algae Atlas" },
    description: { zh: "不代表团队项目或成果的公众示例观察框架。", en: "Public sample observation frameworks that are not team projects or outputs." },
  },
};

function validLocale(value: string): value is Locale {
  return value === "zh" || value === "en";
}

function localized(value: string | LocalizedText, locale: Locale) {
  return typeof value === "string" ? value : text(value, locale);
}

function detailMeta(section: string | undefined, id: string | undefined, locale: Locale) {
  if (!section || !id) return null;
  if (section === "algae") {
    const entry = algae.find((item) => item.id === id);
    return entry ? { title: text(entry.name, locale), description: text(entry.summary, locale) } : null;
  }
  if (section === "research") {
    const entry = researchAreas.find((item) => item.id === id);
    return entry ? { title: text(entry.title, locale), description: text(entry.summary, locale) } : null;
  }
  if (section === "tutorials") {
    const entry = tutorials.find((item) => item.id === id);
    return entry ? { title: text(entry.name, locale), description: text(entry.purpose, locale) } : null;
  }
  if (section === "live-feeds") {
    const entry = liveFeedEntries.find((item) => item.id === id);
    return entry
      ? {
          title: {
            zh: `${entry.name.zh}｜生物饵料与浮游动物`,
            en: `${entry.name.en} | Live Feeds & Zooplankton`,
          },
          description: entry.overview,
        }
      : null;
  }
  const entry =
    articles.find((item) => item.id === id) ??
    projects.find((item) => item.id === id) ??
    applications.find((item) => item.id === id);
  return entry ? { title: text(entry.title, locale), description: text(entry.summary, locale) } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug = [] } = await params;
  if (!validLocale(rawLocale)) return {};
  const locale = rawLocale;
  const [section, id] = slug;
  const meta = detailMeta(section, id, locale) ?? (section ? routeMeta[section] : homeMeta) ?? homeMeta;
  const title = localized(meta.title, locale);
  const description = localized(meta.description, locale);
  const suffix = slug.length ? `/${slug.join("/")}` : "";
  const url = `/${locale}${suffix}`;
  const useAlgaeSocialImage = section !== "live-feeds";

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: { "zh-CN": `/zh${suffix}`, en: `/en${suffix}`, "x-default": `/zh${suffix}` },
    },
    openGraph: {
      type: "website",
      siteName: locale === "zh" ? "广东海洋大学藻类团队" : "Algae Research Team, Guangdong Ocean University",
      title,
      description,
      url,
      locale: locale === "zh" ? "zh_CN" : "en_US",
      ...(useAlgaeSocialImage
        ? { images: [{ url: "/images/zhutu.png", alt: locale === "zh" ? "多种藻类显微形态主题图" : "A microscopy-themed image of diverse algal forms" }] }
        : {}),
    },
    twitter: useAlgaeSocialImage
      ? { card: "summary_large_image", title, description, images: ["/images/zhutu.png"] }
      : { card: "summary", title, description },
  };
}

export function generateStaticParams() {
  const base = ["team", "research", "live-feeds", "outputs", "tutorials", "algae", "news", "contact", "about", "privacy", "insights", "applications", "projects"];
  const details = [
    ...researchAreas.map((entry) => ["research", entry.id]),
    ...liveFeedEntries.map((entry) => ["live-feeds", entry.id]),
    ...tutorials.map((entry) => ["tutorials", entry.id]),
    ...algae.map((entry) => ["algae", entry.id]),
    ...articles.map((entry) => ["insights", entry.id]),
    ...projects.map((entry) => ["insights", entry.id]),
    ...projects.map((entry) => ["projects", entry.id]),
    ...applications.map((entry) => ["applications", entry.id]),
  ];
  return (["zh", "en"] as const).flatMap((locale) => [
    { locale, slug: undefined },
    ...base.map((section) => ({ locale, slug: [section] })),
    ...details.map((slug) => ({ locale, slug })),
  ]);
}

export default async function LocalizedPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale, slug = [] } = await params;
  const query = await searchParams;
  if (!validLocale(rawLocale) || slug.length > 2) notFound();
  const locale = rawLocale;
  const [section, id] = slug;
  let page: React.ReactNode;

  if (!section) page = <HomePage locale={locale} />;
  else if (section === "team" && !id) page = <TeamPage locale={locale} />;
  else if (section === "research" && !id) page = <ResearchPage locale={locale} />;
  else if (section === "research" && id) {
    const area = researchAreas.find((item) => item.id === id);
    if (!area) notFound();
    page = <ResearchDetail locale={locale} area={area} />;
  } else if (section === "live-feeds" && !id) page = <LiveFeedsPage locale={locale} />;
  else if (section === "live-feeds" && id) {
    const entry = liveFeedEntries.find((item) => item.id === id);
    if (!entry) notFound();
    page = <LiveFeedDetail locale={locale} entry={entry} />;
  } else if (section === "outputs" && !id) {
    page = <OutputsPage locale={locale} category={typeof query.category === "string" ? query.category : undefined} />;
  } else if (section === "tutorials" && !id) page = <TutorialsPage locale={locale} />;
  else if (section === "tutorials" && id) {
    const entry = tutorials.find((item) => item.id === id);
    if (!entry) notFound();
    page = <TutorialDetail locale={locale} entry={entry} />;
  } else if (section === "algae" && !id) {
    page = <AlgaeLibrary locale={locale} typeFilter={typeof query.type === "string" ? query.type : undefined} />;
  } else if (section === "algae" && id) {
    const entry = algae.find((item) => item.id === id);
    if (!entry) notFound();
    page = <AlgaeDetail locale={locale} entry={entry} />;
  } else if (section === "news" && !id) page = <NewsPage locale={locale} />;
  else if (section === "about" && !id) page = <AboutPage locale={locale} />;
  else if (section === "contact" && !id) page = <ContactPage locale={locale} />;
  else if (section === "privacy" && !id) page = <PrivacyPage locale={locale} />;
  else if ((section === "insights" || section === "applications" || section === "projects") && !id) {
    page = <LegacyIndex locale={locale} section={section} />;
  } else if ((section === "insights" || section === "applications" || section === "projects") && id) {
    const entries = section === "applications" ? applications : section === "projects" ? projects : [...articles, ...projects];
    const entry = entries.find((item) => item.id === id);
    if (!entry) notFound();
    page = <LegacyDetail locale={locale} entry={entry} />;
  } else notFound();

  return <SiteShell locale={locale} pathParts={slug}>{page}</SiteShell>;
}
