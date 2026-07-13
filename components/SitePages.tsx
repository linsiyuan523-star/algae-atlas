/* eslint-disable @next/next/no-img-element -- The same local, credited images must render in vinext and Next.js. */
import Link from "next/link";
import { ContentReviewPanel } from "@/components/ContentReviewPanel";
import { Arrow, EmptyState, localPath, PageHero, SectionHeading } from "@/components/PagePrimitives";
import { ResearchCapabilityPanel } from "@/components/ResearchCapabilityPages";
import { collaborationApprovalNotice, collaborationAreas, collaborationPreparationItems } from "@/lib/collaboration-data";
import { liveFeedEntries } from "@/lib/live-feeds-data";
import { getResearchCapability } from "@/lib/research-capabilities-data";
import {
  algae,
  applications,
  articles,
  imageCredits,
  projects,
  site,
  text,
  type AlgaeEntry,
  type ArticleEntry,
  type FeatureEntry,
  type Locale,
} from "@/lib/site-data";
import {
  beginnerGuides,
  news,
  outputCategories,
  outputs,
  researchAreas,
  researchTopics,
  trainingPrinciples,
  tutorials,
  type ResearchArea,
  type TutorialEntry,
} from "@/lib/team-data";

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

function ResearchAreaCard({ area, locale }: { area: ResearchArea; locale: Locale }) {
  return (
    <article className="research-area-card">
      <figure>
        <img src={area.image} alt="" loading="lazy" />
        <figcaption>{text(area.imageStatus, locale)}</figcaption>
      </figure>
      <div>
        <p className="eyebrow">{area.id === "microalgae" ? "MICRO" : "MACRO"}</p>
        <h3>{text(area.title, locale)}</h3>
        <p>{text(area.summary, locale)}</p>
        <ul className="check-list">
          {area.bullets.map((item) => (
            <li key={item.en}>{text(item, locale)}</li>
          ))}
        </ul>
        <Link className="text-link" href={localPath(locale, `research/${area.id}`)}>
          {locale === "zh" ? "了解研究方向" : "Explore this area"} <Arrow />
        </Link>
      </div>
    </article>
  );
}

function TutorialCard({ entry, locale }: { entry: TutorialEntry; locale: Locale }) {
  return (
    <article className="tutorial-card">
      <span className="tutorial-symbol" aria-hidden="true">⌁</span>
      <div>
        <p className="eyebrow">INSTRUMENT GUIDE</p>
        <h3>{text(entry.name, locale)}</h3>
        <p>{text(entry.purpose, locale)}</p>
        <p className="status-line">
          {locale === "zh" ? "详细流程等待实验室审核后发布。" : "Detailed procedures will be published after laboratory review."}
        </p>
        <Link className="text-link" href={localPath(locale, `tutorials/${entry.id}`)}>
          {locale === "zh" ? "查看教程结构" : "View tutorial structure"} <Arrow />
        </Link>
      </div>
    </article>
  );
}

export function HomePage({ locale }: { locale: Locale }) {
  const collaborationTags: Record<string, string> = locale === "zh"
    ? {
        microalgae: "微藻培养",
        "live-feeds": "生物饵料",
        "algal-blooms": "赤潮与藻华",
        macroalgae: "大型海藻",
        aquaculture: "水产试验",
        "automation-training": "自动化与教学",
      }
    : {
        microalgae: "Microalgae",
        "live-feeds": "Live Feeds",
        "algal-blooms": "Red Tides & Blooms",
        macroalgae: "Macroalgae",
        aquaculture: "Aquaculture Studies",
        "automation-training": "Automation & Training",
      };

  return (
    <>
      <section className="hero">
        <div className="hero-noise" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow light">{text(site.kicker, locale)}</p>
            <h1>
              {locale === "zh" ? (
                <>立足南海，<br />探索<span>藻类科学与资源价值</span></>
              ) : (
                <>Exploring Algal Science<br />from the <span>South China Sea</span></>
              )}
            </h1>
            <p className="hero-intro">
              {locale === "zh"
                ? "广东海洋大学藻类团队围绕微藻培养调控、大型海藻资源利用、活性物质开发及水产养殖应用开展研究。"
                : "The Algae Research Team at Guangdong Ocean University studies microalgal cultivation, macroalgal resources, bioactive compounds, and aquaculture applications."}
            </p>
            <div className="button-row">
              <Link className="button primary" href={localPath(locale, "team")}>
                {locale === "zh" ? "认识团队" : "Meet the Team"} <Arrow />
              </Link>
              <Link className="button ghost" href={localPath(locale, "research")}>
                {locale === "zh" ? "研究方向" : "Research Areas"}
              </Link>
              <Link className="button ghost" href={localPath(locale, "tutorials")}>
                {locale === "zh" ? "仪器教程" : "Instrument Tutorials"}
              </Link>
            </div>
          </div>
          <figure className="hero-visual">
            <img src="/images/zhutu.png" alt={locale === "zh" ? "黑色背景上的多种藻类显微形态主题图" : "A microscopy-themed image of diverse algal forms on a dark background"} />
            <figcaption>
              <span>MICRO / ALGAE</span>
              <span>{text(site.institution, locale)}</span>
            </figcaption>
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
          </figure>
        </div>
        <div className="hero-index">
          <span>{locale === "zh" ? "团队 · 研究 · 教学" : "TEAM · RESEARCH · TRAINING"}</span>
          <span>{text(site.featureName, locale)}</span>
        </div>
      </section>

      <section className="statement section-shell">
        <p className="statement-index">01 / {locale === "zh" ? "团队简介" : "ABOUT THE TEAM"}</p>
        <div className="statement-copy">
          <h2>{locale === "zh" ? "从微观细胞到" : "From microscopic cells"}<br /><em>{locale === "zh" ? "大型海藻" : "to macroalgae"}</em></h2>
          <p>
            {locale === "zh"
              ? "广东海洋大学藻类团队围绕海洋藻类资源开发与利用开展研究，涵盖微藻培养与调控、藻类营养代谢、功能活性物质开发、大型海藻资源利用及水产养殖应用。团队注重基础研究、技术应用与学生科研训练相结合。"
              : "The Algae Research Team at Guangdong Ocean University studies the development and use of marine algal resources, including microalgal cultivation and regulation, algal nutrition and metabolism, bioactive compounds, macroalgal utilization, and aquaculture applications. The team connects fundamental research, applied inquiry, and student research training."}
          </p>
        </div>
      </section>

      <section className="section-shell content-section">
        <SectionHeading
          eyebrow={`02 / ${locale === "zh" ? "两大研究方向" : "TWO RESEARCH AREAS"}`}
          title={locale === "zh" ? "在微藻与大型海藻之间建立研究联系" : "Connecting microalgae and macroalgae research"}
          intro={locale === "zh" ? "以下内容描述团队关注的研究范围，不代表未经核实的成果声明。" : "These areas describe research interests and do not claim unverified outcomes."}
        />
        <div className="research-area-grid">
          {researchAreas.map((area) => <ResearchAreaCard key={area.id} area={area} locale={locale} />)}
        </div>
      </section>

      <section className="dark-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`03 / ${locale === "zh" ? "研究主题" : "RESEARCH TOPICS"}`}
            title={locale === "zh" ? "围绕培养、物质、养殖与生态提出问题" : "Questions spanning cultivation, compounds, aquaculture, and ecology"}
          />
          <div className="topic-grid">
            {researchTopics.map((topic, index) => (
              <article className={topic.route ? "is-linked" : undefined} key={topic.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{text(topic.title, locale)}</h3>
                <p>{text(topic.summary, locale)}</p>
                {topic.route ? <Link className="text-link" href={localPath(locale, topic.route)}>{locale === "zh" ? "进入研究专题" : "Open research feature"} <Arrow /></Link> : null}
              </article>
            ))}
          </div>
          <Link className="section-link light-link" href={localPath(locale, "research")}>
            {locale === "zh" ? "查看研究方向" : "Explore research"} <Arrow />
          </Link>
        </div>
      </section>

      <section className="live-feeds-home-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`04 / ${locale === "zh" ? "跨方向特色" : "CROSS-DIRECTION FEATURE"}`}
            title={locale === "zh" ? "连接微藻培养与水产苗种的生物饵料研究" : "Live Feed Research Connecting Microalgae and Aquaculture"}
            intro={locale === "zh" ? "作为连接微藻研究、水产养殖应用与浮游动物培养的特色板块，本栏目不改变团队现有的两大研究方向结构。" : "This feature connects microalgae research, aquaculture applications, and zooplankton culture without redefining the team’s two main research areas."}
          />
          <div className="live-feed-home-layout">
            <div className="live-feed-preview-grid">
              {liveFeedEntries.map((entry, index) => (
                <Link className="live-feed-preview-card" href={localPath(locale, `live-feeds/${entry.id}`)} key={entry.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p className="taxonomic-group">{entry.scientificGroup}</p>
                  <h3>{text(entry.name, locale)}</h3>
                  <p>{text(entry.overview, locale)}</p>
                  <strong>{locale === "zh" ? "查看类群介绍" : "View group profile"} <Arrow /></strong>
                </Link>
              ))}
            </div>
            <figure className="live-feed-relationship-preview">
              <p className="eyebrow">MICROALGAE → ZOOPLANKTON → APPLICATION</p>
              <ol>
                <li>{locale === "zh" ? "微藻培养" : "Microalgae"}</li>
                <li>{locale === "zh" ? "轮虫 / 桡足类 / 枝角类培养" : "Rotifers / Copepods / Cladocerans"}</li>
                <li>{locale === "zh" ? "水产苗种或实验研究应用" : "Aquaculture Larvae and Research Applications"}</li>
              </ol>
              <figcaption>{locale === "zh" ? "典型研究与培养关系示意；具体组合因物种、发育阶段及培养条件而异。" : "A typical research and culture relationship; combinations vary by species, life stage, and culture context."}</figcaption>
            </figure>
          </div>
          <div className="button-row live-feed-home-actions">
            <Link className="button dark" href={localPath(locale, "live-feeds")}>{locale === "zh" ? "探索生物饵料" : "Explore Live Feeds"} <Arrow /></Link>
            <Link className="button dark" href={`${localPath(locale, "live-feeds")}#guides`}>{locale === "zh" ? "查看培养教程" : "View Culture Guides"}</Link>
          </div>
        </div>
      </section>

      <section className="learning-resources-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`05 / ${locale === "zh" ? "教学与开放资源" : "TEACHING & OPEN RESOURCES"}`}
            title={locale === "zh" ? "实验教学与开放资源" : "Laboratory Teaching and Open Resources"}
            intro={locale === "zh" ? "将仪器认知、新生入门与藻类图鉴集中为清晰入口；具体流程仍须经实验室审核。" : "A focused entry to instrument literacy, beginner themes, and the Algae Atlas; specific procedures still require laboratory review."}
          />
          <div className="resource-preview-block">
            <div className="resource-preview-heading">
              <h3>{locale === "zh" ? "仪器教程" : "Instrument Guides"}</h3>
              <Link className="text-link" href={localPath(locale, "tutorials")}>{locale === "zh" ? "查看全部" : "View all"} <Arrow /></Link>
            </div>
            <div className="tutorial-grid tutorial-preview">
              {tutorials.slice(0, 3).map((entry) => <TutorialCard key={entry.id} entry={entry} locale={locale} />)}
            </div>
          </div>
          <div className="resource-preview-block">
            <div className="resource-preview-heading">
              <h3>{locale === "zh" ? "新生入门" : "Beginner Path"}</h3>
            </div>
            <div className="beginner-grid beginner-preview">
              {beginnerGuides.slice(0, 3).map((guide, index) => <article key={`home-${guide.id}`}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{guide.category.toUpperCase()}</small><h3>{text(guide.title, locale)}</h3><p>{text(guide.status, locale)}</p></div></article>)}
            </div>
          </div>
          <article className="resource-atlas-entry">
            <div><p className="eyebrow">ALGAE ATLAS</p><h3>{locale === "zh" ? "从研究对象进入藻类图鉴" : "Explore the Algae Atlas by research organism"}</h3><p>{locale === "zh" ? "连接代表性藻类的形态、环境背景、研究关注与公开内容边界。" : "Connect representative algae with morphology, environmental context, research interests, and public-content boundaries."}</p></div>
            <Link className="button dark" href={localPath(locale, "algae")}>{locale === "zh" ? "进入藻类图鉴" : "Open Algae Atlas"} <Arrow /></Link>
          </article>
        </div>
      </section>

      <section className="section-shell content-section compact-section">
        <SectionHeading
          eyebrow={`06 / ${locale === "zh" ? "动态与成果" : "NEWS & OUTPUTS"}`}
          title={locale === "zh" ? "公开信息以完成审核为前提" : "Public information follows content review"}
        />
        <div className="compact-publication-status">
          <Link href={localPath(locale, "outputs")}><strong>{locale === "zh" ? "科研成果" : "Research Outputs"}</strong><span>{locale === "zh" ? "经核实的论文、专利、项目和学生成果将在确认后更新。" : "Verified publications, patents, projects, and student outputs will be updated after confirmation."}</span><Arrow /></Link>
          <Link href={localPath(locale, "news")}><strong>{locale === "zh" ? "团队动态" : "Team News"}</strong><span>{locale === "zh" ? "采样、实验、会议和学生科研动态将在完成内容审核后发布。" : "Sampling, experiments, meetings, and student-research updates will be published after content review."}</span><Arrow /></Link>
        </div>
      </section>

      <section className="home-collaboration-section section-shell content-section">
        <SectionHeading
          eyebrow={`07 / ${locale === "zh" ? "合作方向" : "COLLABORATION"}`}
          title={locale === "zh" ? "从明确的问题开始合作" : "Collaboration Starts with a Clearly Defined Question"}
          intro={locale === "zh" ? "无论是微藻培养、生物饵料、近岸藻华调查、大型海藻研究，还是水产养殖试验和培养自动化，合作都应从明确研究对象、现有条件和预期问题开始。" : "Whether the topic is microalgal cultivation, live feeds, coastal bloom surveys, macroalgae, aquaculture studies, or culture automation, collaboration should begin with defined research objects, current conditions, and the questions to be assessed."}
        />
        <div className="collaboration-topic-tags" aria-label={locale === "zh" ? "六类合作方向" : "Six collaboration areas"}>
          {collaborationAreas.map((area) => <Link href={`${localPath(locale, "collaboration")}#${area.id}`} key={area.id}>{collaborationTags[area.id] ?? text(area.title, locale)}</Link>)}
        </div>
        <div className="button-row">
          <Link className="button dark" href={`${localPath(locale, "collaboration")}#areas`}>{locale === "zh" ? "查看合作方向" : "Explore Areas"} <Arrow /></Link>
          <Link className="button dark" href={`${localPath(locale, "collaboration")}#prepare`}>{locale === "zh" ? "准备合作信息" : "Prepare Enquiry"}</Link>
          <Link className="button dark" href={localPath(locale, "contact")}>{locale === "zh" ? "联系团队" : "Contact"}</Link>
        </div>
      </section>

      <section className="cta-panel section-shell">
        <div>
          <p className="eyebrow">08 / TRAINING & CONTACT</p>
          <h2>{locale === "zh" ? "加入科研训练，或与我们建立合作" : "Begin research training or connect for collaboration"}</h2>
        </div>
        <p>
          {locale === "zh"
            ? "欢迎对微藻、大型海藻、水产养殖和海洋生物技术感兴趣的本科生、研究生及合作伙伴进一步了解团队。"
            : "Undergraduate and graduate students, as well as potential collaborators interested in microalgae, macroalgae, aquaculture, and marine biotechnology, are welcome to learn more about the team."}
        </p>
        <div className="cta-actions">
          <Link className="button dark" href={localPath(locale, "team")}>{locale === "zh" ? "团队概况" : "Meet the Team"}</Link>
          <Link className="button dark" href={localPath(locale, "collaboration")}>{locale === "zh" ? "合作与联系" : "Collaboration & Contact"} <Arrow /></Link>
        </div>
      </section>
    </>
  );
}

export function TeamPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={locale === "zh" ? "团队概况" : "TEAM"}
        title={locale === "zh" ? "以藻类问题连接研究与学生成长" : "Connecting algal research with student development"}
        intro={locale === "zh" ? "广东海洋大学藻类团队关注海洋藻类资源、培养调控、活性物质与水产养殖应用，并将规范科研训练融入团队建设。" : "The Algae Research Team at Guangdong Ocean University studies marine algal resources, cultivation control, bioactive compounds, and aquaculture applications while integrating responsible student research training."}
        image="/images/cultures.jpg"
      />
      <section className="section-shell content-section about-grid">
        <div>
          <p className="eyebrow">POSITIONING</p>
          <h2>{locale === "zh" ? "研究定位" : "Research positioning"}</h2>
        </div>
        <div className="prose">
          <p className="lead">{locale === "zh" ? "从微藻细胞到大型海藻资源，团队以可验证的问题、规范记录和跨尺度理解组织研究与训练。" : "From microalgal cells to macroalgal resources, the team organizes research and training around verifiable questions, responsible records, and cross-scale understanding."}</p>
          <p>{locale === "zh" ? "除微藻与大型海藻研究外，团队还开展轮虫、桡足类和枝角类等浮游动物的培养与应用研究，关注微藻饵料、营养调控及水产苗种生物饵料供应。" : "In addition to microalgae and macroalgae, the team studies the culture and application of rotifers, copepods, cladocerans, and other zooplankton used as live feeds in aquaculture."}</p>
          <p>{locale === "zh" ? "网站当前只公开已确认的团队定位与内容结构。人员、平台和具体成果将在完成内部核实后更新。" : "This website currently publishes only confirmed positioning and content structure. People, facilities, and specific outputs will be added after internal verification."}</p>
        </div>
      </section>
      <section className="section-shell content-section">
        <SectionHeading eyebrow={locale === "zh" ? "研究方向" : "RESEARCH AREAS"} title={locale === "zh" ? "微藻研究与大型海藻研究" : "Microalgae and macroalgae research"} />
        <div className="research-area-grid compact-cards">
          {researchAreas.map((area) => <ResearchAreaCard key={area.id} area={area} locale={locale} />)}
        </div>
      </section>
      <section className="values-section">
        <div className="section-shell training-grid">
          <header>
            <p className="eyebrow">TRAINING</p>
            <h2>{locale === "zh" ? "科研训练理念" : "Training principles"}</h2>
          </header>
          <ul className="number-list">
            {trainingPrinciples.map((principle, index) => <li key={principle.en}><span>{String(index + 1).padStart(2, "0")}</span>{text(principle, locale)}</li>)}
          </ul>
        </div>
      </section>
      <section className="section-shell content-section team-public-status">
        <SectionHeading eyebrow="PUBLIC INFORMATION" title={locale === "zh" ? "成员与实验平台" : "Members and Laboratory Platform"} intro={locale === "zh" ? "人员和平台信息只在确认公开范围后展示。" : "People and platform information is shown only after its public scope is confirmed."} />
        <div className="compact-publication-status">
          <article><strong>{locale === "zh" ? "团队成员" : "Team Members"}</strong><span>{locale === "zh" ? "成员资料正在完成公开范围确认。" : "Member profiles are undergoing confirmation of their public scope."}</span></article>
          <article><strong>{locale === "zh" ? "实验平台" : "Laboratory Platform"}</strong><span>{locale === "zh" ? "实验室平台、设备和可公开使用范围仍待团队逐项确认。" : "Laboratory platforms, equipment, and publishable scopes remain subject to item-by-item team confirmation."}</span></article>
        </div>
      </section>
      <section className="cta-panel section-shell">
        <div><p className="eyebrow">TRAINING & COLLABORATION</p><h2>{locale === "zh" ? "科研训练与合作" : "Research training and collaboration"}</h2></div>
        <p>{locale === "zh" ? "欢迎感兴趣的学生与合作伙伴通过团队公共联系渠道进一步了解；具体机会以团队确认的信息为准。" : "Interested students and potential collaborators may use the team’s public contact channel to learn more; opportunities are subject to team confirmation."}</p>
        <Link className="button dark" href={localPath(locale, "contact")}>{locale === "zh" ? "查看联系信息" : "View contact details"} <Arrow /></Link>
      </section>
    </>
  );
}

export function ResearchPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} eyebrow={locale === "zh" ? "研究方向" : "RESEARCH"} title={locale === "zh" ? "从培养调控到资源与生态应用" : "From cultivation control to resource and ecological applications"} intro={locale === "zh" ? "围绕微藻与大型海藻建立可扩展的研究框架，页面描述研究关注范围，不宣称未经核实的成果。" : "An extensible framework spanning microalgae and macroalgae. These pages describe research interests without claiming unverified outcomes."} image="/images/guandaofanyinqi.jpg" />
      <section className="section-shell content-section">
        <div className="research-area-grid">
          {researchAreas.map((area) => <ResearchAreaCard key={area.id} area={area} locale={locale} />)}
        </div>
        <aside className="live-feeds-crosslink">
          <div>
            <p className="eyebrow">CROSS-DIRECTION FEATURE</p>
            <h2>{locale === "zh" ? "生物饵料与浮游动物研究" : "Live Feeds & Zooplankton Research"}</h2>
          </div>
          <p>{locale === "zh" ? "除微藻与大型海藻研究外，团队还开展轮虫、桡足类和枝角类等浮游动物的培养与应用研究，关注微藻饵料、营养调控及水产苗种生物饵料供应。" : "In addition to microalgae and macroalgae, the team studies the culture and application of rotifers, copepods, cladocerans, and other zooplankton used as live feeds in aquaculture."}</p>
          <Link className="text-link" href={localPath(locale, "live-feeds")}>{locale === "zh" ? "进入生物饵料栏目" : "Explore Live Feeds"} <Arrow /></Link>
        </aside>
        <aside className="live-feeds-crosslink algal-blooms-crosslink">
          <div>
            <p className="eyebrow">CROSS-DIRECTION RESEARCH FEATURE</p>
            <h2>{locale === "zh" ? "近岸藻华与赤潮监测" : "Coastal Algal Blooms and Red-Tide Monitoring"}</h2>
          </div>
          <p>{locale === "zh" ? "这是连接近岸观察、浮游植物记录与环境背景的研究专题，不构成第三个研究方向或独立部门。" : "This cross-direction feature connects coastal observation, phytoplankton records, and environmental context; it is not a third research area or a separate department."}</p>
          <Link className="text-link" href={localPath(locale, "research/algal-blooms")}>{locale === "zh" ? "进入藻华研究专题" : "Open the algal-bloom feature"} <Arrow /></Link>
        </aside>
      </section>
      <section className="dark-section">
        <div className="section-shell content-section">
          <SectionHeading eyebrow={locale === "zh" ? "重点主题" : "FOCUS TOPICS"} title={locale === "zh" ? "可持续扩展的研究专题" : "Research topics designed to grow"} />
          <div className="topic-grid">
            {researchTopics.map((topic, index) => <article className={topic.route ? "is-linked" : undefined} key={topic.id}><span>{String(index + 1).padStart(2, "0")}</span><h3>{text(topic.title, locale)}</h3><p>{text(topic.summary, locale)}</p>{topic.route ? <Link className="text-link" href={localPath(locale, topic.route)}>{locale === "zh" ? "进入研究专题" : "Open research feature"} <Arrow /></Link> : null}</article>)}
          </div>
        </div>
      </section>
    </>
  );
}

export function ResearchDetail({ locale, area }: { locale: Locale; area: ResearchArea }) {
  const capability = getResearchCapability(area.id);

  return (
    <article className="detail-page">
      <div className="detail-hero section-shell">
        <div className="detail-title">
          <Link className="back-link" href={localPath(locale, "research")}>← {locale === "zh" ? "返回研究方向" : "Back to research"}</Link>
          <p className="eyebrow">{area.id === "microalgae" ? "MICROALGAE" : "MACROALGAE"}</p>
          <h1>{text(area.title, locale)}</h1>
          <p className="detail-summary">{text(area.summary, locale)}</p>
        </div>
        <figure><img src={area.image} alt="" /><figcaption>{text(area.imageStatus, locale)}</figcaption></figure>
      </div>
      <div className="detail-content section-shell">
        <aside>
          <div><span>{locale === "zh" ? "所属单位" : "Institution"}</span><strong>{text(site.institution, locale)}</strong></div>
          <div><span>{locale === "zh" ? "内容状态" : "Content status"}</span><strong>{locale === "zh" ? "研究范围说明" : "Research scope overview"}</strong></div>
        </aside>
        <div className="prose">
          <p className="lead">{text(area.summary, locale)}</p>
          <h2>{locale === "zh" ? "关注内容" : "Areas of interest"}</h2>
          <ul className="prose-list">{area.bullets.map((item) => <li key={item.en}>{text(item, locale)}</li>)}</ul>
          <div className="notice-box"><strong>{locale === "zh" ? "内容边界" : "Scope note"}</strong><p>{locale === "zh" ? "本页说明团队关注的研究范围，不包含尚未核实的项目、成果、数量或合作案例。" : "This page describes research interests and does not include unverified projects, outputs, quantities, or collaboration cases."}</p></div>
          {capability ? <ResearchCapabilityPanel locale={locale} capability={capability} /> : null}
          <div className="compact-publication-status research-output-status">
            <article><strong>{locale === "zh" ? "代表项目与成果" : "Representative Projects and Outputs"}</strong><span>{locale === "zh" ? "经核实的论文、专利、项目和学生成果将在确认后更新。" : "Verified publications, patents, projects, and student outputs will be updated after confirmation."}</span></article>
          </div>
        </div>
      </div>
    </article>
  );
}

export function OutputsPage({ locale, category }: { locale: Locale; category?: string }) {
  const activeCategory = outputCategories.some((item) => item.id === category) ? category : "all";
  const visibleOutputs = activeCategory === "all" ? outputs : outputs.filter((item) => item.category === activeCategory);
  return (
    <>
      <PageHero locale={locale} eyebrow={locale === "zh" ? "科研成果" : "OUTPUTS"} title={locale === "zh" ? "只发布经过核实的科研信息" : "Research information, published after verification"} intro={locale === "zh" ? "论文、专利、科研项目与学生科研条目将由团队确认后更新。" : "Publications, patents, research projects, and student research will be added after team verification."} />
      <section className="section-shell content-section library-section">
        <nav className="filter-row" aria-label={locale === "zh" ? "成果分类" : "Output categories"}>
          <Link className={activeCategory === "all" ? "is-active" : undefined} href={localPath(locale, "outputs")}>{locale === "zh" ? "全部" : "All"}</Link>
          {outputCategories.map((item) => <Link key={item.id} className={activeCategory === item.id ? "is-active" : undefined} href={`${localPath(locale, "outputs")}?category=${item.id}`}>{text(item.label, locale)}</Link>)}
        </nav>
        {visibleOutputs.length === 0 ? <EmptyState title={locale === "zh" ? "科研成果待确认" : "Research outputs pending confirmation"} body={locale === "zh" ? "经核实的论文、专利、项目和学生成果将在确认后更新。" : "Verified publications, patents, projects, and student outputs will be updated after confirmation."} /> : null}
      </section>
    </>
  );
}

export function TutorialsPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} eyebrow={locale === "zh" ? "仪器教程" : "TUTORIALS"} title={locale === "zh" ? "面向本科生的实验学习入口" : "A laboratory learning entry point for undergraduates"} intro={locale === "zh" ? "教程用于课前准备与操作复习，不替代仪器说明书、实验室安全培训或现场指导。" : "Tutorials support preparation and review; they do not replace instrument manuals, laboratory safety training, or on-site instruction."} image="/images/cultures.jpg" />
      <section className="section-shell content-section">
        <SectionHeading eyebrow={locale === "zh" ? "仪器教程" : "INSTRUMENT GUIDES"} title={locale === "zh" ? "先理解用途，再学习经审核的流程" : "Understand the purpose before following reviewed procedures"} intro={locale === "zh" ? "当前仅发布教程结构与通用用途说明。" : "Only tutorial structure and general purpose statements are currently public."} />
        <div className="tutorial-grid">{tutorials.map((entry) => <TutorialCard key={entry.id} entry={entry} locale={locale} />)}</div>
      </section>
      <section className="beginner-section">
        <div className="section-shell content-section">
          <SectionHeading eyebrow={locale === "zh" ? "新生入门" : "BEGINNER PATH"} title={locale === "zh" ? "第一次进入藻类实验室，从这里开始" : "New to an algae laboratory? Start here."} intro={locale === "zh" ? "安全、基础操作与记录规范彼此相关，但与具体仪器教程分开维护。" : "Safety, foundational practice, and record standards are related but maintained separately from instrument tutorials."} />
          <div className="beginner-grid">
            {beginnerGuides.map((guide, index) => <article key={guide.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{guide.category.toUpperCase()}</small><h3>{text(guide.title, locale)}</h3><p>{text(guide.status, locale)}</p></div></article>)}
          </div>
        </div>
      </section>
    </>
  );
}

function PendingItems({ locale, items }: { locale: Locale; items: { zh: string; en: string }[] }) {
  if (items.length) return <ul className="prose-list">{items.map((item) => <li key={item.en}>{text(item, locale)}</li>)}</ul>;
  return <p className="pending-copy">{locale === "zh" ? "详细流程等待实验室审核后发布。" : "Detailed procedures will be published after laboratory review."}</p>;
}

export function TutorialDetail({ locale, entry }: { locale: Locale; entry: TutorialEntry }) {
  const sections = [
    { title: { zh: "适用实验", en: "Applicable experiments" }, items: entry.applicableExperiments },
    { title: { zh: "使用前检查", en: "Pre-use checks" }, items: entry.preCheck },
    { title: { zh: "标准操作步骤", en: "Standard operating procedure" }, items: entry.sopSteps },
    { title: { zh: "常用参数", en: "Common parameters" }, items: entry.commonParameters },
    { title: { zh: "数据导出", en: "Data export" }, items: entry.dataExport },
    { title: { zh: "清洁与关机", en: "Cleaning and shutdown" }, items: entry.cleaningAndShutdown },
    { title: { zh: "常见错误", en: "Common errors" }, items: entry.commonErrors },
    { title: { zh: "安全事项", en: "Safety" }, items: entry.safety },
    { title: { zh: "预约与管理", en: "Booking and administration" }, items: entry.administration },
  ];
  return (
    <article className="detail-page tutorial-detail">
      <div className="detail-hero section-shell">
        <div className="detail-title">
          <Link className="back-link" href={localPath(locale, "tutorials")}>← {locale === "zh" ? "返回仪器教程" : "Back to tutorials"}</Link>
          <p className="eyebrow">INSTRUMENT GUIDE</p>
          <h1>{text(entry.name, locale)}</h1>
          <p className="detail-summary">{text(entry.purpose, locale)}</p>
        </div>
        <div className="tutorial-cover"><span aria-hidden="true">⌁</span><p>{locale === "zh" ? "实验室审核中" : "Laboratory review pending"}</p></div>
      </div>
      <div className="tutorial-content section-shell">
        <aside>
          <div><span>{locale === "zh" ? "用途" : "Purpose"}</span><strong>{text(entry.purpose, locale)}</strong></div>
          <div><span>{locale === "zh" ? "更新状态" : "Updated"}</span><strong>{text(entry.updated, locale)}</strong></div>
          <ContentReviewPanel locale={locale} review={entry.review} compact />
        </aside>
        <div className="tutorial-section-grid">
          {sections.map((section) => <section key={section.title.en}><h2>{text(section.title, locale)}</h2><PendingItems locale={locale} items={section.items} /></section>)}
        </div>
      </div>
      <div className="tutorial-disclaimer section-shell">
        <strong>{locale === "zh" ? "重要说明" : "Important disclaimer"}</strong>
        <p>{locale === "zh" ? "本教程仅用于辅助学习，不替代仪器说明书、实验室安全培训和现场指导。安全要求、具体参数与操作流程必须经实验室审核，并以现场管理要求为准。" : "This tutorial supports learning only. It does not replace the instrument manual, laboratory safety training, or on-site instruction. Safety requirements, parameters, and procedures must be reviewed by the laboratory and follow local management rules."}</p>
      </div>
    </article>
  );
}

export function AlgaeLibrary({ locale, typeFilter }: { locale: Locale; typeFilter?: string }) {
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
      <PageHero locale={locale} eyebrow="ALGAE ATLAS" title={locale === "zh" ? "藻类图鉴：认识我们的研究对象" : "Algae Atlas: Meet Our Research Organisms"} intro={locale === "zh" ? "从淡水到海洋，从微观细胞到大型海藻，以公开基础资料建立可持续维护的双语图鉴。" : "A maintainable bilingual atlas spanning freshwater and marine environments, microscopic cells, and macroalgae."} image="/images/zhutu.png" />
      <section className="section-shell content-section library-section">
        <nav className="filter-row" aria-label={locale === "zh" ? "按环境筛选" : "Filter by habitat"}>
          {filters.map((filter) => <Link key={filter.value} className={activeFilter === filter.value ? "is-active" : undefined} href={filter.value === "all" ? localPath(locale, "algae") : `${localPath(locale, "algae")}?type=${filter.value}`} scroll={false}>{text(filter.label, locale)}</Link>)}
        </nav>
        <div className="algae-grid">{entries.map((entry) => <AlgaeCard key={entry.id} entry={entry} locale={locale} />)}</div>
      </section>
    </>
  );
}

export function AlgaeDetail({ locale, entry }: { locale: Locale; entry: AlgaeEntry }) {
  return (
    <article className="detail-page">
      <div className="detail-hero section-shell">
        <div className="detail-title"><Link className="back-link" href={localPath(locale, "algae")}>← {locale === "zh" ? "返回图鉴" : "Back to atlas"}</Link><p className="eyebrow">{text(entry.categoryLabel, locale)}</p><h1>{text(entry.name, locale)}</h1><p className="detail-latin">{entry.latin}</p></div>
        <figure><img src={entry.image} alt="" /></figure>
      </div>
      <div className="detail-content section-shell">
        <aside><div><span>{locale === "zh" ? "环境" : "Habitat"}</span><strong>{text(entry.habitat, locale)}</strong></div><div><span>{locale === "zh" ? "关注方向" : "Focus"}</span><strong>{text(entry.focus, locale)}</strong></div><div><span>{locale === "zh" ? "资料状态" : "Status"}</span><strong>{locale === "zh" ? "公众基础条目" : "Public foundation profile"}</strong></div><ContentReviewPanel locale={locale} review={entry.review} compact /></aside>
        <div className="prose"><p className="lead">{text(entry.summary, locale)}</p><h2>{locale === "zh" ? "如何观察它" : "How to observe it"}</h2><p>{locale === "zh" ? "先记录采样或培养环境，再观察颜色、整体形态和时间变化。可靠的物种确认通常还需要显微特征、规范培养记录，必要时结合分子方法。" : "Begin with sampling or culture context, then record color, overall form, and change over time. Confident identification may also require microscopy, documented cultivation, or molecular methods."}</p><h2>{locale === "zh" ? "为什么值得关注" : "Why it matters"}</h2><p>{locale === "zh" ? `作为${text(entry.categoryLabel, locale)}，${text(entry.name, locale)}为理解${text(entry.focus, locale)}提供了一个具体入口。这里的内容用于科普，不替代实验设计、专业鉴定或产品评价。` : `As a ${text(entry.categoryLabel, locale).toLowerCase()}, ${text(entry.name, locale)} offers an entry point into ${text(entry.focus, locale).toLowerCase()}. This profile does not replace experimental design, expert identification, or product assessment.`}</p><div className="notice-box"><strong>{locale === "zh" ? "阅读提示" : "Reading note"}</strong><p>{locale === "zh" ? "藻类名称和分类会随研究进展而调整；正式研究请核对最新分类学资料。" : "Algal names and classifications evolve with research; formal work should check current taxonomic sources."}</p></div></div>
      </div>
    </article>
  );
}

export function NewsPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} eyebrow={locale === "zh" ? "团队动态" : "TEAM NEWS"} title={locale === "zh" ? "记录经过确认的团队动态" : "Team news, published after confirmation"} intro={locale === "zh" ? "本页将用于发布经团队确认的研究、教学与交流动态。现有科普观察内容不会作为团队事件呈现。" : "This page will publish team-confirmed research, teaching, and exchange updates. Existing public observation content is not presented as team activity."} />
      <section className="section-shell content-section">
        {news.length === 0 ? <EmptyState title={locale === "zh" ? "团队动态待审核" : "Team news pending review"} body={locale === "zh" ? "采样、实验、会议和学生科研动态将在完成内容审核后发布。" : "Sampling, experiments, meetings, and student-research updates will be published after content review."} /> : null}
      </section>
      <section className="cta-panel section-shell"><div><p className="eyebrow">CONTACT</p><h2>{locale === "zh" ? "了解联系与合作信息" : "Contact and collaboration information"}</h2></div><p>{locale === "zh" ? "公共邮箱、实验室地址和合作联系方式将在确认后公开。" : "The public email, laboratory address, and collaboration contact will be published after confirmation."}</p><Link className="button dark" href={localPath(locale, "contact")}>{locale === "zh" ? "联系页面" : "Contact page"} <Arrow /></Link></section>
    </>
  );
}

export function AboutPage({ locale }: { locale: Locale }) {
  return (
    <>
      <PageHero locale={locale} eyebrow={locale === "zh" ? "关于网站" : "ABOUT"} title={locale === "zh" ? "团队官方网站与藻境公众图鉴" : "The team website and public Algae Atlas"} intro={locale === "zh" ? "本网站用于介绍广东海洋大学藻类团队的研究方向、科研训练与经核实的信息，并保留藻境 · Algae Atlas 作为公众科学传播栏目。" : "This website presents verified information about the Algae Research Team at Guangdong Ocean University, its research interests, and student training, while retaining Algae Atlas as a public science feature."} />
      <section className="section-shell content-section about-grid">
        <div><p className="eyebrow">PURPOSE</p><h2>{locale === "zh" ? "公开、清晰、可维护" : "Public, clear, maintainable"}</h2></div>
        <div className="prose"><p className="lead">{locale === "zh" ? "网站把团队信息、研究方向、实验学习资源和藻类科普放在同一套双语结构中。" : "The website brings team information, research areas, laboratory learning resources, and public algal science into one bilingual structure."}</p><h2>{locale === "zh" ? "更新原则" : "Update principles"}</h2><p>{locale === "zh" ? "成员、成果、项目、联系方式和实验流程只在完成内部确认后发布。缺失信息明确标记为待补充或整理中，不使用推测内容填充。" : "Members, outputs, projects, contact details, and laboratory procedures are published only after internal confirmation. Missing information is marked as pending rather than filled with assumptions."}</p><h2>{locale === "zh" ? "教程说明" : "Tutorial note"}</h2><p>{locale === "zh" ? "仪器教程是面向本科生的辅助学习材料，不替代现场培训或厂家说明书。安全要求、具体参数和操作步骤必须经实验室审核。" : "Instrument tutorials are supporting materials for undergraduates. They do not replace on-site training or manufacturer manuals. Safety requirements, parameters, and procedures require laboratory review."}</p><h2>{locale === "zh" ? "藻类图鉴" : "Algae Atlas"}</h2><p>{locale === "zh" ? "藻境 · Algae Atlas 保留为团队网站中的公众科学栏目，用于介绍代表性藻类、观察方式与内容边界。" : "Algae Atlas remains a public science feature within the team website, introducing representative algae, observation approaches, and the limits of public information."}</p></div>
      </section>
      <section className="section-shell content-section" id="image-credits">
        <SectionHeading eyebrow="IMAGE CREDITS" title={locale === "zh" ? "图片来源与使用说明" : "Image sources and usage notes"} intro={locale === "zh" ? "网站当前同时使用用户提供素材与开放许可科学影像；待确认项目会明确标注。" : "The site currently uses both user-provided material and openly licensed science imagery; pending permissions are clearly marked."} />
        <div className="credits-list">
          {imageCredits.map((credit) => {
            const content = <><strong>{credit.file}</strong><span>{credit.credit}</span><em>{credit.license}</em></>;
            return credit.href ? <a key={credit.file} href={credit.href} target="_blank" rel="noreferrer">{content}</a> : <div className="credit-row" key={credit.file}>{content}</div>;
          })}
        </div>
      </section>
    </>
  );
}

export function ContactPage({ locale }: { locale: Locale }) {
  const rows = locale === "zh" ? [["所属单位", "广东海洋大学"], ["团队公共邮箱", "待补充"], ["实验室地址", "待补充"], ["合作联系", "待补充"]] : [["Institution", "Guangdong Ocean University"], ["Public team email", "To be added"], ["Laboratory address", "To be added"], ["Collaboration contact", "To be added"]];
  return (
    <>
      <section className="contact-page">
        <div className="section-shell contact-grid">
          <div><p className="eyebrow light">CONTACT</p><h1>{locale === "zh" ? "与团队建立联系" : "Connect with the team"}</h1><p>{locale === "zh" ? "公共联系信息将在团队确认后发布。当前页面不会展示个人邮箱、未经核实的地址或代替正式确认的联系渠道。" : "Public contact information will be published after team confirmation. This page does not display personal email addresses, unverified locations, or unofficial contact channels."}</p><Link className="button ghost" href={localPath(locale, "collaboration")}>{locale === "zh" ? "查看合作方向" : "Explore Collaboration"} <Arrow /></Link></div>
          <div className="contact-card"><span>{locale === "zh" ? "公开联系信息" : "PUBLIC CONTACT DETAILS"}</span><h2>{locale === "zh" ? "信息状态" : "Information status"}</h2><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>{locale === "zh" ? "以上未公开字段将在完成内部确认后补充。" : "Unpublished fields will be added after internal confirmation."}</p></div>
        </div>
      </section>
      <section className="section-shell content-section contact-preparation">
        <SectionHeading eyebrow="ENQUIRY PREPARATION" title={locale === "zh" ? "合作咨询建议包含的信息" : "Information to Include in an Initial Enquiry"} intro={locale === "zh" ? "目前不设置在线表单，也不在网站收集或上传资料。请在公共联系渠道确认后，再根据需要准备以下非敏感信息。" : "There is currently no online form, file upload, or website data collection. Once a public contact channel is confirmed, prepare only the non-sensitive information that is relevant."} />
        <div className="contact-preparation-grid">
          <ul className="prose-list">
            {collaborationPreparationItems.map((item) => <li key={item.en}>{text(item, locale)}</li>)}
          </ul>
          <aside className="contact-note">
            <h3>{locale === "zh" ? "回复与审批说明" : "Response and Approval"}</h3>
            <p>{locale === "zh" ? "团队可在公共渠道和可用时间确认后评估是否适合继续沟通。未收到即时回复不代表拒绝或批准；研究对象、资源、周期、合规与学校管理要求均可能影响后续安排。" : "The team may assess whether further discussion is appropriate after a public channel and availability are confirmed. The absence of an immediate response does not indicate rejection or approval; organisms, resources, schedules, compliance, and university requirements may all affect next steps."}</p>
            <p>{text(collaborationApprovalNotice, locale)}</p>
            <Link className="text-link" href={`${localPath(locale, "collaboration")}#prepare`}>{locale === "zh" ? "查看完整合作准备说明" : "View the full preparation guidance"} <Arrow /></Link>
          </aside>
        </div>
      </section>
    </>
  );
}

export function PrivacyPage({ locale }: { locale: Locale }) {
  return <section className="section-shell legal-page"><p className="eyebrow">PRIVACY</p><h1>{locale === "zh" ? "隐私说明" : "Privacy notice"}</h1><div className="prose"><p className="lead">{locale === "zh" ? "当前网站不提供用户注册、在线留言或支付功能。" : "The current website does not provide registration, online messaging, or payment features."}</p><h2>{locale === "zh" ? "基础访问数据" : "Basic access data"}</h2><p>{locale === "zh" ? "托管平台可能为安全、稳定和基础统计处理必要的访问日志。网站不会在代码中保存密码、API 密钥或其他敏感信息。" : "The hosting platform may process access logs needed for security, reliability, and basic analytics. Passwords, API keys, and other secrets are not stored in source code."}</p><h2>{locale === "zh" ? "外部链接" : "External links"}</h2><p>{locale === "zh" ? "图片署名链接会打开第三方页面，其隐私规则由对应网站负责。" : "Image-credit links open third-party pages governed by their own privacy practices."}</p></div></section>;
}

type LegacySection = "applications" | "projects" | "insights";
type LegacyEntry = FeatureEntry | ArticleEntry;

function legacyEntries(section: LegacySection): LegacyEntry[] {
  if (section === "applications") return applications;
  if (section === "projects") return projects;
  return [...articles, ...projects];
}

export function LegacyIndex({ locale, section }: { locale: Locale; section: LegacySection }) {
  const entries = legacyEntries(section);
  const isInsights = section === "insights";
  return (
    <>
      <PageHero locale={locale} eyebrow={isInsights ? "PUBLIC INSIGHTS" : "ARCHIVED PUBLIC CONTENT"} title={locale === "zh" ? (isInsights ? "科普与观察" : "公众背景资料") : isInsights ? "Public insights and observations" : "Public background material"} intro={locale === "zh" ? "这些内容是科普文章或示例观察框架，不代表团队动态、科研项目或成果。" : "These are public articles or sample observation frameworks, not team news, research projects, or outputs."} image="/images/tidai.jpg" />
      <section className="section-shell content-section article-list">
        {entries.map((entry, index) => { const routeSection = isInsights ? "insights" : section; return <article key={`${section}-${entry.id}`}><Link className="article-image" href={localPath(locale, `${routeSection}/${entry.id}`)}><img src={entry.image} alt="" loading="lazy" /><span>{String(index + 1).padStart(2, "0")}</span></Link><div><p className="eyebrow">{text(entry.note, locale)}</p><h2><Link href={localPath(locale, `${routeSection}/${entry.id}`)}>{text(entry.title, locale)}</Link></h2><p>{text(entry.summary, locale)}</p><Link className="text-link" href={localPath(locale, `${routeSection}/${entry.id}`)}>{locale === "zh" ? "继续阅读" : "Continue reading"} <Arrow /></Link></div></article>; })}
      </section>
    </>
  );
}

export function LegacyDetail({ locale, entry }: { locale: Locale; entry: LegacyEntry }) {
  return (
    <article className="article-page"><header className="article-header section-shell"><Link className="back-link" href={localPath(locale, "insights")}>← {locale === "zh" ? "返回科普与观察" : "Back to public insights"}</Link><p className="eyebrow">{text(entry.note, locale)}</p><h1>{text(entry.title, locale)}</h1><p>{text(entry.summary, locale)}</p></header><figure className="article-cover"><img src={entry.image} alt="" /></figure><div className="article-body prose"><p className="lead">{text(entry.summary, locale)}</p><h2>{locale === "zh" ? "阅读边界" : "Scope note"}</h2><p>{locale === "zh" ? "本页是公开科普或示例观察内容，不是团队动态、正式科研项目、检测报告、工程方案或商业承诺。" : "This is public educational or sample observation content. It is not team news, a formal research project, a test report, an engineering plan, or a commercial commitment."}</p></div></article>
  );
}
