import type { ContentReview } from "@/lib/content-review";
import type { LocalizedText } from "@/lib/site-data";

export type { ContentReview, ReferenceItem } from "@/lib/content-review";

export type ResearchCapabilityId =
  | "microalgae"
  | "macroalgae"
  | "live-feeds"
  | "algal-blooms";

export type ResearchCapability = {
  id: ResearchCapabilityId;
  title: LocalizedText;
  researchObjects: LocalizedText[];
  typicalQuestions: LocalizedText[];
  methodsAndMeasurements: LocalizedText[];
  availableResources: LocalizedText[];
  collaborationLinks: string[];
  contentStatus: "confirmed" | "partially-confirmed" | "pending";
  review: ContentReview;
};

const draftReview = (version: string): ContentReview => ({
  status: "draft",
  updatedAt: "2026-07-12",
  version,
});

/**
 * These entries describe public research scopes, not guaranteed laboratory
 * capacity. Specific organisms, instruments, time, and compliance conditions
 * must be confirmed for each proposed activity.
 */
export const researchCapabilities: ResearchCapability[] = [
  {
    id: "microalgae",
    title: { zh: "微藻研究能力说明", en: "Microalgae Research Scope" },
    researchObjects: [
      {
        zh: "微藻藻株与培养样品；可公开的具体藻株名单仍待团队确认",
        en: "Microalgal strains and culture samples; the list of strains approved for public display remains to be confirmed",
      },
      {
        zh: "与微藻培养相关的水样、培养液和基础环境记录",
        en: "Water samples, culture media, and basic environmental records associated with microalgal cultivation",
      },
    ],
    typicalQuestions: [
      {
        zh: "不同培养条件如何影响藻株的生长状态与过程稳定性？",
        en: "How do different culture conditions relate to strain growth and process stability?",
      },
      {
        zh: "如何建立可比较的藻株筛选、培养记录与基础评价框架？",
        en: "How can comparable frameworks be built for strain screening, culture records, and basic evaluation?",
      },
      {
        zh: "微藻饵料特征如何与特定浮游动物或水产苗种研究问题衔接？",
        en: "How can microalgal diet characteristics be connected with defined zooplankton or aquaculture-larval research questions?",
      },
    ],
    methodsAndMeasurements: [
      {
        zh: "培养状态的连续观察、样品编号与时间序列记录",
        en: "Longitudinal observation of culture condition, sample identification, and time-series records",
      },
      {
        zh: "在条件确认后讨论光照、温度、盐度及营养条件等因素的比较设计",
        en: "Comparative designs for light, temperature, salinity, and nutritional conditions, subject to feasibility confirmation",
      },
      {
        zh: "根据研究目标和现有条件评估生长、色素、光合状态或基础生化指标的记录范围",
        en: "Assessment of suitable records for growth, pigments, photosynthetic condition, or basic biochemical indicators, depending on objectives and available conditions",
      },
    ],
    availableResources: [
      {
        zh: "网站现有研究框架可用于梳理研究对象、比较因素和记录字段",
        en: "The current public research framework can help define organisms, comparison factors, and record fields",
      },
      {
        zh: "具体藻株、仪器、培养空间、人员和时间安排须在开展前逐项确认",
        en: "Specific strains, instruments, culture space, personnel, and schedules require case-by-case confirmation before work begins",
      },
    ],
    collaborationLinks: ["collaboration#microalgae"],
    contentStatus: "pending",
    review: draftReview("0.1"),
  },
  {
    id: "macroalgae",
    title: { zh: "大型海藻研究能力说明", en: "Macroalgae Research Scope" },
    researchObjects: [
      {
        zh: "大型海藻材料与近岸生态样品；具体种质、来源和接收条件待逐项确认",
        en: "Macroalgal material and coastal ecological samples; germplasm, origin, and acceptance conditions require case-specific confirmation",
      },
      {
        zh: "与大型海藻生理、培养、资源利用和环境响应有关的观察记录",
        en: "Observational records concerning macroalgal physiology, cultivation, resource use, and environmental responses",
      },
    ],
    typicalQuestions: [
      {
        zh: "大型海藻材料在不同环境背景下呈现哪些生理和生态响应？",
        en: "What physiological and ecological responses are observed under different environmental contexts?",
      },
      {
        zh: "如何规范记录资源调查、培养或近岸生态研究中的样品背景？",
        en: "How should sample context be documented in resource surveys, cultivation, or coastal ecological studies?",
      },
      {
        zh: "资源利用相关问题需要哪些基础证据，以及哪些环节需要其他平台支持？",
        en: "What baseline evidence is needed for resource-use questions, and which stages may require support from other platforms?",
      },
    ],
    methodsAndMeasurements: [
      {
        zh: "样品来源、形态、环境背景和时间信息的规范记录",
        en: "Structured records of sample origin, morphology, environmental context, and timing",
      },
      {
        zh: "根据对象和条件评估培养观察、环境响应比较及基础样品分析",
        en: "Evaluation of culture observations, environmental-response comparisons, and basic sample analyses according to the organism and available conditions",
      },
      {
        zh: "资源与生态数据的整理、质量检查和问题导向分析",
        en: "Organization, quality checks, and question-led analysis of resource and ecological data",
      },
    ],
    availableResources: [
      {
        zh: "现有公开页面用于说明研究范围，不代表已确认全部育种、加工或工程条件",
        en: "Current public pages describe research scope and do not confirm comprehensive breeding, processing, or engineering capacity",
      },
      {
        zh: "材料接收、场地、检测和联合研究条件须根据具体任务评估",
        en: "Material acceptance, facilities, measurements, and joint-research conditions require task-specific assessment",
      },
    ],
    collaborationLinks: ["collaboration#macroalgae"],
    contentStatus: "pending",
    review: draftReview("0.1"),
  },
  {
    id: "live-feeds",
    title: { zh: "生物饵料研究能力说明", en: "Live Feeds Research Scope" },
    researchObjects: [
      {
        zh: "轮虫、桡足类和枝角类等较高分类类群；具体物种与品系须经鉴定和内部确认",
        en: "Higher taxonomic groups including rotifers, copepods, and cladocerans; species and strains require identification and internal confirmation",
      },
      {
        zh: "微藻饵料、培养水体和与特定水产苗种相关的观察对象",
        en: "Microalgal diets, culture water, and observational subjects associated with defined aquaculture larvae or juveniles",
      },
    ],
    typicalQuestions: [
      {
        zh: "培养环境与饵料条件如何关联浮游动物的种群状态和繁殖记录？",
        en: "How are culture environment and diet conditions associated with zooplankton population state and reproductive records?",
      },
      {
        zh: "不同微藻饵料组合如何在明确对象和评价指标下进行比较？",
        en: "How can microalgal diet combinations be compared for a defined organism and evaluation framework?",
      },
      {
        zh: "特定发育阶段与水产苗种之间的饵料适配问题应如何评估？",
        en: "How should live-feed suitability be evaluated between defined developmental stages and aquaculture larvae?",
      },
    ],
    methodsAndMeasurements: [
      {
        zh: "培养状态、类群或发育阶段、投喂和异常情况的连续记录",
        en: "Longitudinal records of culture condition, group or developmental stage, feeding, and anomalies",
      },
      {
        zh: "在鉴定、样品和人员条件允许时开展显微观察与基础计数记录",
        en: "Microscopy and basic counting records when identification, sample, and personnel conditions permit",
      },
      {
        zh: "根据研究问题讨论微藻饵料、培养环境与种群变化的比较设计",
        en: "Comparative designs connecting microalgal diets, culture environment, and population change, guided by a defined research question",
      },
    ],
    availableResources: [
      {
        zh: "现有轮虫、桡足类和枝角类页面可作为类群层级的问题与记录入口",
        en: "Current rotifer, copepod, and cladoceran pages provide group-level entry points for questions and records",
      },
      {
        zh: "活体材料、培养体系、评价对象和实验周期须在生物安全及内部安排确认后确定",
        en: "Live material, culture systems, evaluation organisms, and study periods depend on biosafety review and internal scheduling",
      },
    ],
    collaborationLinks: ["collaboration#live-feeds"],
    contentStatus: "pending",
    review: draftReview("0.1"),
  },
  {
    id: "algal-blooms",
    title: { zh: "近岸藻华研究能力说明", en: "Coastal Algal-Bloom Research Scope" },
    researchObjects: [
      {
        zh: "近岸水样、浮游植物群落及可核实的环境背景记录",
        en: "Coastal water samples, phytoplankton communities, and verifiable environmental-context records",
      },
      {
        zh: "异常水色、藻华或赤潮事件的现场观察信息；事件性质须依据证据判断",
        en: "Field observations of unusual water colour, algal blooms, or red-tide events; event characterization must be evidence-based",
      },
    ],
    typicalQuestions: [
      {
        zh: "浮游植物群落如何随站位、时间和环境背景变化？",
        en: "How do phytoplankton communities vary across locations, time, and environmental contexts?",
      },
      {
        zh: "异常水色或藻华记录中，哪些现场信息和样品证据有助于后续判断？",
        en: "Which field records and sample evidence support later interpretation of unusual water colour or bloom observations?",
      },
      {
        zh: "如何把现场环境记录、显微观察和群落数据组织成可核查的时间序列？",
        en: "How can field context, microscopy observations, and community records be organized into an auditable time series?",
      },
    ],
    methodsAndMeasurements: [
      {
        zh: "任务设计、站位与时间记录、样品编号和交接信息管理",
        en: "Study design, location and time records, sample identification, and chain-of-custody information management",
      },
      {
        zh: "在样品质量和分类条件允许时进行显微观察及较高分类层级记录",
        en: "Microscopy and higher-level taxonomic records when sample quality and identification conditions permit",
      },
      {
        zh: "现场环境记录与浮游植物群落数据的联合整理和探索性分析",
        en: "Integrated organization and exploratory analysis of field-environment records and phytoplankton community data",
      },
    ],
    availableResources: [
      {
        zh: "可使用统一的现场记录、样品编号与数据整理框架讨论研究设计",
        en: "A shared framework for field records, sample identification, and data organization can support study-design discussions",
      },
      {
        zh: "船只、站位、采样许可、现场仪器、样品接收和分析条件须由合作双方逐项确认",
        en: "Vessels, stations, permits, field instruments, sample acceptance, and analytical conditions require confirmation by all parties",
      },
    ],
    collaborationLinks: ["collaboration#algal-blooms"],
    contentStatus: "pending",
    review: draftReview("0.1"),
  },
];

export function getResearchCapability(id: ResearchCapabilityId) {
  return researchCapabilities.find((capability) => capability.id === id);
}
