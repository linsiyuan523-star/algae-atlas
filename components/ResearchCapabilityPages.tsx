import Link from "next/link";
import { ContentReviewPanel } from "@/components/ContentReviewPanel";
import { Arrow, EmptyState, localPath, PageHero, SectionHeading } from "@/components/PagePrimitives";
import {
  getResearchCapability,
  type ResearchCapability,
} from "@/lib/research-capabilities-data";
import { text, type Locale, type LocalizedText } from "@/lib/site-data";

function LocalizedList({ items, locale }: { items: LocalizedText[]; locale: Locale }) {
  return (
    <ul className="prose-list">
      {items.map((item) => <li key={item.en}>{text(item, locale)}</li>)}
    </ul>
  );
}

export function ResearchCapabilityPanel({
  locale,
  capability,
}: {
  locale: Locale;
  capability: ResearchCapability;
}) {
  const scopeStatus = capability.contentStatus === "confirmed"
    ? (locale === "zh" ? "公开范围已确认" : "Public scope confirmed")
    : capability.contentStatus === "partially-confirmed"
      ? (locale === "zh" ? "部分公开范围已确认" : "Public scope partially confirmed")
      : (locale === "zh" ? "公开范围待团队确认" : "Public scope pending team confirmation");

  return (
    <section className="research-capability-panel" aria-labelledby={`${capability.id}-capability-title`}>
      <header className="research-capability-header">
        <div>
          <p className="eyebrow">RESEARCH SCOPE</p>
          <h2 id={`${capability.id}-capability-title`}>{text(capability.title, locale)}</h2>
        </div>
        <span className="research-capability-status">{scopeStatus}</span>
      </header>

      <div className="research-capability-grid">
        <article>
          <h3>{locale === "zh" ? "研究对象" : "Research Objects"}</h3>
          <LocalizedList items={capability.researchObjects} locale={locale} />
        </article>
        <article>
          <h3>{locale === "zh" ? "关注问题与典型科学问题" : "Questions of Interest and Typical Research Questions"}</h3>
          <LocalizedList items={capability.typicalQuestions} locale={locale} />
        </article>
        <article>
          <h3>{locale === "zh" ? "常用研究方法" : "Methods and Measurements"}</h3>
          <LocalizedList items={capability.methodsAndMeasurements} locale={locale} />
        </article>
        <article>
          <h3>{locale === "zh" ? "可讨论的资源与条件" : "Resources and Conditions to Discuss"}</h3>
          <LocalizedList items={capability.availableResources} locale={locale} />
        </article>
      </div>

      <div className="research-capability-links">
        <strong>{locale === "zh" ? "可讨论的合作方向" : "Potential Collaboration Areas"}</strong>
        {capability.collaborationLinks.map((route) => (
          <Link className="text-link" href={localPath(locale, route)} key={route}>
            {locale === "zh" ? "前往相关合作说明" : "View the related collaboration scope"} <Arrow />
          </Link>
        ))}
      </div>

      <ContentReviewPanel review={capability.review} locale={locale} compact />
    </section>
  );
}

const bloomProcess: Array<{ title: LocalizedText; summary: LocalizedText }> = [
  {
    title: { zh: "任务设计", en: "Study Design" },
    summary: {
      zh: "先明确研究问题、观察范围、时间安排、样品去向和合规要求。",
      en: "Define the research question, observation scope, timing, sample destination, and compliance requirements.",
    },
  },
  {
    title: { zh: "采样站位与时间记录", en: "Station and Time Records" },
    summary: {
      zh: "记录可核查的站位、日期、时间和环境背景；敏感站位是否公开须另行确认。",
      en: "Record auditable location, date, time, and environmental context; publication of sensitive stations requires separate agreement.",
    },
  },
  {
    title: { zh: "水样和浮游植物采集", en: "Water and Phytoplankton Sampling" },
    summary: {
      zh: "按经批准的项目方案采集并记录样品类型，不在公开页面提供固定剂量或操作参数。",
      en: "Collect and document sample types under an approved project plan; this public page does not provide fixed quantities or operating parameters.",
    },
  },
  {
    title: { zh: "现场环境参数", en: "Field Environmental Context" },
    summary: {
      zh: "根据任务、设备和现场条件记录水色、天气、水文及可用的基础环境信息。",
      en: "Record water colour, weather, hydrographic context, and available basic environmental information according to the task, equipment, and field conditions.",
    },
  },
  {
    title: { zh: "样品编号与交接", en: "Sample Identification and Handover" },
    summary: {
      zh: "保持样品编号、现场记录、交接人员、时间和保存状态之间的一致关系。",
      en: "Maintain consistent links among sample identifiers, field records, handover personnel, timing, and storage condition.",
    },
  },
  {
    title: { zh: "显微观察和类群记录", en: "Microscopy and Group Records" },
    summary: {
      zh: "在样品质量和分类依据允许的范围内记录形态、优势类群和待复核对象。",
      en: "Record morphology, dominant groups, and subjects requiring verification within the limits of sample quality and taxonomic evidence.",
    },
  },
  {
    title: { zh: "环境与群落数据分析", en: "Environmental and Community Data Analysis" },
    summary: {
      zh: "先核查记录完整性，再探索环境背景、群落组成与时间变化之间的关系。",
      en: "Check record completeness before exploring relationships among environmental context, community composition, and temporal change.",
    },
  },
];

const fieldRecords: LocalizedText[] = [
  { zh: "任务名称、采样目的、日期、时间和记录人员", en: "Task name, sampling purpose, date, time, and recorder" },
  { zh: "站位编号、可公开的空间信息与水深背景", en: "Station identifier, publishable spatial information, and water-depth context" },
  { zh: "天气、潮汐或水动力背景，以及异常水色、泡沫或漂浮物观察", en: "Weather, tidal or hydrodynamic context, and observations of unusual water colour, foam, or floating material" },
  { zh: "在设备和方案允许时记录温度、盐度、pH、溶解氧、透明度或浊度等指标", en: "Temperature, salinity, pH, dissolved oxygen, transparency, or turbidity when supported by equipment and the approved plan" },
  { zh: "样品编号、样品类型、交接时间、保存状态和后续用途", en: "Sample identifier, sample type, handover time, storage condition, and intended follow-up" },
  { zh: "站位、图片、数据和未发表信息是否允许公开", en: "Whether stations, images, data, and unpublished information may be made public" },
];

const laboratoryAnalysis: LocalizedText[] = [
  { zh: "核对样品编号、现场记录、交接信息和样品状态", en: "Verify sample identifiers, field records, handover information, and sample condition" },
  { zh: "在分类依据允许时开展显微形态观察、较高类群记录及待复核对象标记", en: "Conduct microscopic morphology observations, higher-group records, and flags for verification when taxonomic evidence permits" },
  { zh: "在采样和计数方法支持时整理浮游植物数量、优势类群或群落组成记录", en: "Organize phytoplankton abundance, dominant-group, or community-composition records when supported by sampling and counting methods" },
  { zh: "对可比较的环境记录和群落数据进行质量检查、可视化及探索性分析", en: "Perform quality checks, visualization, and exploratory analysis for comparable environmental and community records" },
  { zh: "已有样品的培养或后续实验须先评估鉴定、生物安全、样品完整性和实验条件", en: "Culture or follow-up experiments with existing samples require prior assessment of identification, biosafety, sample integrity, and experimental conditions" },
];

const collaborationDirections: LocalizedText[] = [
  { zh: "近岸采样任务、站位与时间序列设计的前期讨论", en: "Early discussion of coastal sampling tasks, stations, and time-series design" },
  { zh: "现场记录表、样品编号和交接结构的共同梳理", en: "Joint development of field-record, sample-identification, and handover structures" },
  { zh: "浮游植物显微观察、基础类群记录和环境数据整理", en: "Phytoplankton microscopy, basic group records, and environmental-data organization" },
  { zh: "已有藻华样品的后续研究可行性评估；是否开展取决于样品、条件和合规要求", en: "Feasibility assessment for follow-up research on existing bloom samples, subject to samples, available conditions, and compliance requirements" },
];

export function AlgalBloomsPage({ locale }: { locale: Locale }) {
  const capability = getResearchCapability("algal-blooms");

  if (!capability) return null;

  return (
    <>
      <PageHero
        locale={locale}
        eyebrow={locale === "zh" ? "研究专题 · 非正式部门设置" : "RESEARCH FEATURE · NOT A FORMAL DEPARTMENT"}
        title={locale === "zh" ? "近岸藻华与赤潮监测" : "Coastal Algal Blooms and Red-Tide Monitoring"}
        intro={locale === "zh"
          ? "本专题用于说明近岸浮游植物观察、采样记录与研究问题，不代表团队新增正式部门，也不提供实时监测或预警服务。"
          : "This research feature describes coastal phytoplankton observations, sampling records, and research questions. It does not establish a new formal department or provide real-time monitoring or warning services."}
      />

      <section className="section-shell content-section algal-bloom-background">
        <SectionHeading
          eyebrow={`01 / ${locale === "zh" ? "研究背景" : "BACKGROUND"}`}
          title={locale === "zh" ? "先区分藻华、赤潮和有害藻华" : "Distinguishing algal blooms, red tides, and harmful algal blooms"}
          intro={locale === "zh"
            ? "近岸浮游植物群落会随水文、营养、天气和生物过程发生变化。异常增殖或水色变化需要结合现场记录、样品证据和后续分析理解。"
            : "Coastal phytoplankton communities vary with hydrography, nutrients, weather, and biological processes. Unusual proliferation or water-colour change requires interpretation using field records, sample evidence, and follow-up analysis."}
        />
        <div className="algal-bloom-definition-note" role="note">
          <p>{locale === "zh"
            ? "“藻华”是较宽泛的群落增殖现象；“赤潮”通常用于描述海洋中的特定藻华或水色异常事件；“有害藻华”强调潜在或实际生态、养殖或健康危害。三者范围不完全相同，不能相互替代，也不能仅凭水色判断事件性质。"
            : "An algal bloom is a broad community-proliferation phenomenon. Red tide commonly describes particular marine bloom or water-discolouration events. A harmful algal bloom is defined by potential or observed ecological, aquaculture, or health harm. These terms are not interchangeable, and event type cannot be determined from water colour alone."}</p>
        </div>
      </section>

      <div className="section-shell content-section algal-bloom-capability-section">
        <ResearchCapabilityPanel locale={locale} capability={capability} />
      </div>

      <section className="dark-section algal-bloom-process-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`03 / ${locale === "zh" ? "采样与研究流程" : "SAMPLING & RESEARCH WORKFLOW"}`}
            title={locale === "zh" ? "采样与研究流程：从任务设计到可核查的数据记录" : "Sampling and Research Workflow: From Study Design to Auditable Records"}
            intro={locale === "zh" ? "流程描述研究信息如何衔接，不是可直接执行的采样或固定操作规程。" : "This workflow shows how research information connects; it is not a directly executable sampling or preservation protocol."}
          />
          <ol className="algal-bloom-process-list">
            {bloomProcess.map((step, index) => (
              <li key={step.title.en}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{text(step.title, locale)}</h3><p>{text(step.summary, locale)}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-shell content-section algal-bloom-records-section">
        <SectionHeading
          eyebrow={`04 / ${locale === "zh" ? "记录与分析" : "RECORDS & ANALYSIS"}`}
          title={locale === "zh" ? "把现场背景与样品证据对应起来" : "Connecting field context with sample evidence"}
        />
        <div className="algal-bloom-records-grid">
          <article>
            <h3>{locale === "zh" ? "可记录的现场信息" : "Field Information to Record"}</h3>
            <LocalizedList items={fieldRecords} locale={locale} />
          </article>
          <article>
            <h3>{locale === "zh" ? "样品和实验室分析" : "Samples and Laboratory Analysis"}</h3>
            <LocalizedList items={laboratoryAnalysis} locale={locale} />
          </article>
        </div>
        <div className="notice-box algal-bloom-method-note" role="note">
          <strong>{locale === "zh" ? "方法边界" : "Method boundary"}</strong>
          <p>{locale === "zh"
            ? "保存方式、分析范围和后续培养须由具体项目方案及实验室审核确定。本页不发布固定液浓度、采样剂量、保存剂配方或危险操作。"
            : "Preservation, analytical scope, and follow-up culture must be defined by the project plan and laboratory review. This page does not publish fixative concentrations, sampling quantities, preservative recipes, or hazardous procedures."}</p>
        </div>
      </section>

      <section className="algal-bloom-connections-section">
        <div className="section-shell content-section">
          <SectionHeading
            eyebrow={`05 / ${locale === "zh" ? "关联与合作" : "CONNECTIONS"}`}
            title={locale === "zh" ? "连接图鉴、研究记录与潜在合作" : "Connecting the atlas, research records, and potential collaboration"}
          />
          <div className="algal-bloom-connection-grid">
            <article>
              <h3>{locale === "zh" ? "与藻类图鉴的关联" : "Connection with the Algae Atlas"}</h3>
              <p>{locale === "zh"
                ? "图鉴可帮助公众理解较高分类类群与形态观察入口，但不能替代事件样品的专业鉴定、定量分析或主管部门结论。"
                : "The atlas can introduce higher taxonomic groups and morphology observations, but it cannot replace expert sample identification, quantitative analysis, or conclusions from competent authorities."}</p>
              <Link className="text-link" href={localPath(locale, "algae")}>{locale === "zh" ? "查看藻类图鉴" : "View the Algae Atlas"} <Arrow /></Link>
            </article>
            <article>
              <h3>{locale === "zh" ? "潜在合作方向" : "Potential Collaboration Areas"}</h3>
              <LocalizedList items={collaborationDirections} locale={locale} />
              <Link className="text-link" href={`${localPath(locale, "collaboration")}#algal-blooms`}>{locale === "zh" ? "查看藻华合作说明" : "View the algal-bloom collaboration scope"} <Arrow /></Link>
            </article>
          </div>
        </div>
      </section>

      <section className="section-shell content-section algal-bloom-outputs-section">
        <SectionHeading
          eyebrow={`06 / ${locale === "zh" ? "项目和成果" : "PROJECTS & OUTPUTS"}`}
          title={locale === "zh" ? "仅展示经确认可公开的内容" : "Only confirmed public information is shown"}
        />
        <EmptyState
          title={locale === "zh" ? "赤潮项目资料待公开范围确认" : "Red-tide project information pending disclosure review"}
          body={locale === "zh" ? "采样项目、站位和结果将在确认可公开范围后展示。" : "Sampling projects, stations, and results will be displayed after their approved public scope has been confirmed."}
        />
      </section>

      <aside className="section-shell algal-bloom-disclaimer" role="note">
        <strong>{locale === "zh" ? "赤潮预警与结果边界" : "Red-tide warning and interpretation boundary"}</strong>
        <p>{locale === "zh"
          ? "本栏目展示科研与教学合作方向，不构成官方赤潮预警、水产品安全结论、海洋灾害预报或公众健康建议。相关信息应以主管部门正式发布为准。"
          : "This page presents directions for research and teaching collaboration. It does not constitute an official red-tide warning, seafood-safety conclusion, marine-hazard forecast, or public-health advice. Refer to formal releases from the competent authorities."}</p>
      </aside>
    </>
  );
}
