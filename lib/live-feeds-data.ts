import type { LocalizedText } from "@/lib/site-data";

export type LiveFeedCategory = "rotifer" | "copepod" | "cladoceran" | "other";
export type WaterEnvironment = "marine" | "freshwater" | "brackish";
export type ContentStatus = "draft" | "reviewed";

export type LiveFeedEntry = {
  id: string;
  name: LocalizedText;
  scientificGroup: string;
  category: LiveFeedCategory;
  environment: LocalizedText;
  environmentKinds: WaterEnvironment[];
  contentType: "group";
  overview: LocalizedText;
  morphology: LocalizedText;
  lifeHistory: LocalizedText;
  ecologicalRole: LocalizedText;
  feedingTraits: LocalizedText;
  researchFocus: LocalizedText[];
  cultureFactors: LocalizedText[];
  applications: LocalizedText[];
  limitations: LocalizedText[];
  relatedGuideIds: string[];
  image: string;
  imageAlt: LocalizedText;
  imageCreditId?: string;
  contentStatus: ContentStatus;
  lastReviewed?: string;
};

export type LiveFeedResearchTopic = {
  id: string;
  categories: LiveFeedCategory[];
  environmentKinds: WaterEnvironment[];
  contentType: "topic";
  contentStatus: ContentStatus;
  title: LocalizedText;
  summary: LocalizedText;
};

export type LiveFeedGuide = {
  id: string;
  name: LocalizedText;
  category: LiveFeedCategory | "cross-group";
  environmentKinds: WaterEnvironment[];
  contentType: "guide";
  purpose: LocalizedText;
  audience: LocalizedText;
  prerequisites: LocalizedText[];
  materials: LocalizedText[];
  procedure: LocalizedText[];
  dataRecords: LocalizedText[];
  commonAnomalies: LocalizedText[];
  safetyAndBiosecurity: LocalizedText[];
  contentStatus: ContentStatus;
  lastReviewed?: string;
};

export const liveFeedReviewWarning: LocalizedText = {
  zh: "详细参数与操作流程须经实验室审核后发布。本页面不能替代现场培训和正式实验方案。",
  en: "Detailed parameters and procedures will be published only after laboratory review. This page does not replace in-person training or an approved experimental protocol.",
};

export const liveFeedEntries: LiveFeedEntry[] = [
  {
    id: "rotifers",
    name: { zh: "轮虫", en: "Rotifers" },
    scientificGroup: "Rotifera",
    category: "rotifer",
    environment: {
      zh: "不同类群见于海水、半咸水或淡水环境，适应范围取决于具体分类单元与品系。",
      en: "Different groups occur in marine, brackish, or freshwater settings; tolerances depend on the taxon and strain.",
    },
    environmentKinds: [],
    contentType: "group",
    overview: {
      zh: "轮虫是水产苗种培育和实验研究中常见的生物饵料类群之一。其体型、繁殖与培养特征会因种类和品系而异。",
      en: "Rotifers are a commonly used live-feed group in some aquaculture larval-rearing and research settings. Body size, reproduction, and culture traits vary among taxa and strains.",
    },
    morphology: {
      zh: "许多轮虫具有前端纤毛冠和后端足等结构，但外形与运动方式在不同类群间存在差异。具体观察应结合可靠鉴定资料。",
      en: "Many rotifers have an anterior ciliated corona and a posterior foot, although form and movement differ among groups. Observations should be interpreted with reliable identification resources.",
    },
    lifeHistory: {
      zh: "不同类群的生活史并不相同；部分轮虫在一定环境下可进行孤雌生殖，并可能出现有性阶段。培养记录需要区分品系、发育阶段与观察条件。",
      en: "Life histories differ among groups. Some rotifers can reproduce parthenogenetically under certain conditions and may also enter sexual phases. Culture records should distinguish strain, life stage, and observation context.",
    },
    ecologicalRole: {
      zh: "轮虫可摄食微小颗粒并参与水体食物网和物质循环，但不同类群的生态功能和栖息方式并不相同。",
      en: "Rotifers can consume small particles and participate in aquatic food webs and material cycling, but ecological roles and habitat use vary among groups.",
    },
    feedingTraits: {
      zh: "可利用的食物可能包括适宜粒径的微藻、微生物或其他悬浮颗粒；实际食物选择取决于类群、品系、发育阶段和培养目标。",
      en: "Potential foods can include appropriately sized microalgae, microorganisms, or other suspended particles. Actual diets depend on the group, strain, life stage, and culture objective.",
    },
    researchFocus: [
      { zh: "培养过程管理与种群状态记录", en: "Culture management and population-state records" },
      { zh: "微藻饵料组合与营养强化研究", en: "Microalgal diet combinations and nutritional enrichment research" },
      { zh: "面向特定水产苗种的投喂应用评价", en: "Feeding-application evaluation for defined aquaculture larvae" },
    ],
    cultureFactors: [
      { zh: "培养对象的分类与品系信息", en: "Taxonomic and strain identity of the cultured material" },
      { zh: "饵料来源、颗粒特征与投喂记录", en: "Diet source, particle characteristics, and feeding records" },
      { zh: "水质、种群状态与污染迹象的连续观察", en: "Continual observation of water quality, population state, and contamination signs" },
    ],
    applications: [
      { zh: "特定水产苗种阶段的生物饵料研究", en: "Live-feed research for defined aquaculture larval stages" },
      { zh: "浮游动物培养与营养调控实验教学", en: "Laboratory training in zooplankton culture and nutritional regulation" },
      { zh: "种群动态和环境响应研究", en: "Population-dynamics and environmental-response research" },
    ],
    limitations: [
      { zh: "并非所有轮虫都适用于所有水产苗种，需结合摄食能力与发育阶段评价。", en: "Not every rotifer is suitable for every aquaculture larva; feeding ability and developmental stage must be evaluated." },
      { zh: "营养组成会受到饵料和强化过程影响，不能仅凭类群名称推断。", en: "Nutritional composition can be influenced by diet and enrichment and cannot be inferred from the group name alone." },
      { zh: "一种品系的培养经验不能直接作为其他品系的操作方案。", en: "Culture experience from one strain should not be treated as a protocol for another." },
    ],
    relatedGuideIds: ["rotifer-culture-basics", "zooplankton-counting", "culture-density-records"],
    image: "",
    imageAlt: { zh: "轮虫类群图像待团队提供", en: "Team-provided rotifer group image pending" },
    contentStatus: "draft",
  },
  {
    id: "copepods",
    name: { zh: "桡足类", en: "Copepods" },
    scientificGroup: "Copepoda",
    category: "copepod",
    environment: {
      zh: "海水、半咸水和淡水环境均有不同桡足类分布；培养环境应依据具体分类对象确定。",
      en: "Different copepod groups occur in marine, brackish, and freshwater environments; culture context must be defined for the taxon involved.",
    },
    environmentKinds: [],
    contentType: "group",
    overview: {
      zh: "桡足类包括哲水蚤、猛水蚤和剑水蚤等不同生态类型。其生活史、摄食方式和培养需求差异较大，不能采用单一方法概括。",
      en: "Copepods include calanoid, harpacticoid, cyclopoid, and other ecological types. Their life histories, feeding modes, and culture needs vary substantially and cannot be represented by one method.",
    },
    morphology: {
      zh: "桡足类通常具有分节的身体与附肢，形态会随分类类群和发育阶段变化；无节幼体、桡足幼体和成体应分别记录。",
      en: "Copepods generally have segmented bodies and appendages, with form changing across taxa and developmental stages. Nauplii, copepodites, and adults should be recorded separately.",
    },
    lifeHistory: {
      zh: "桡足类经历多个发育阶段，繁殖节律和世代时间因类群及环境而异。幼体持续供应需要建立分阶段观察与记录。",
      en: "Copepods pass through multiple developmental stages, and reproductive timing and generation length vary by group and environment. Sustained juvenile supply requires stage-specific observation and records.",
    },
    ecologicalRole: {
      zh: "桡足类在多种水域食物网中连接初级生产者、微型食物网与更高营养级，但不同类群承担的功能不同。",
      en: "In many aquatic food webs, copepods link primary producers and microbial pathways with higher trophic levels, although functions differ among groups.",
    },
    feedingTraits: {
      zh: "不同桡足类及其发育阶段可表现为植食、杂食、肉食或碎屑摄食等策略，饵料组合必须针对培养对象验证。",
      en: "Copepod taxa and life stages may be herbivorous, omnivorous, carnivorous, or detritivorous. Diet combinations must be evaluated for the culture organism concerned.",
    },
    researchFocus: [
      { zh: "培养密度、种群结构与繁殖记录", en: "Culture density, population structure, and reproduction records" },
      { zh: "微藻饵料组合与摄食关系", en: "Microalgal diet combinations and feeding relationships" },
      { zh: "无节幼体等目标阶段的稳定供应研究", en: "Research on reliable supply of target stages such as nauplii" },
    ],
    cultureFactors: [
      { zh: "培养类群、发育阶段和生活型的准确记录", en: "Accurate records of group, developmental stage, and life-history type" },
      { zh: "饵料组成、摄食变化与残饵观察", en: "Diet composition, feeding changes, and uneaten-food observations" },
      { zh: "水质、容器生态与微生物状态监测", en: "Monitoring of water quality, vessel ecology, and microbial condition" },
    ],
    applications: [
      { zh: "特定鱼、虾或其他水产苗种阶段的生物饵料评价", en: "Live-feed evaluation for defined fish, crustacean, or other aquaculture larval stages" },
      { zh: "浮游生态、营养传递与生活史研究", en: "Research on plankton ecology, nutrient transfer, and life history" },
      { zh: "培养管理与幼体识别实验教学", en: "Laboratory training in culture management and juvenile-stage recognition" },
    ],
    limitations: [
      { zh: "不能把全部桡足类都视为同一生态类型，也不能默认采用相同培养方法。", en: "Copepods cannot all be treated as one ecological type or assumed to share one culture method." },
      { zh: "不同发育阶段的粒径、行为和营养特征可能不同。", en: "Size, behaviour, and nutritional characteristics can differ among developmental stages." },
      { zh: "是否适合作为某类苗种饵料需要针对目标对象开展评价。", en: "Suitability as feed must be evaluated for the intended larval organism." },
    ],
    relatedGuideIds: ["copepod-culture-basics", "zooplankton-counting", "water-quality-observation"],
    image: "",
    imageAlt: { zh: "桡足类类群图像待团队提供", en: "Team-provided copepod group image pending" },
    contentStatus: "draft",
  },
  {
    id: "cladocerans",
    name: { zh: "枝角类", en: "Cladocerans" },
    scientificGroup: "Cladocera",
    category: "cladoceran",
    environment: {
      zh: "许多常见枝角类生活于淡水环境，亦有适应其他水体的类群；公开培养信息需对应到明确对象。",
      en: "Many familiar cladocerans inhabit freshwater, while other groups occur in different waters. Published culture information must refer to a clearly identified organism.",
    },
    environmentKinds: [],
    contentType: "group",
    overview: {
      zh: "枝角类是淡水浮游动物和实验培养中的重要类群，可用于水产营养、生态毒理或培养调控等研究。具体用途因分类对象与实验设计而异。",
      en: "Cladocerans are important in freshwater zooplankton communities and laboratory culture. They can support research in aquatic nutrition, ecotoxicology, or culture regulation, depending on the taxon and study design.",
    },
    morphology: {
      zh: "许多枝角类具有覆盖躯干的背甲、明显的复眼和用于运动或摄食的附肢，但不同类群的形态差异需要通过可靠资料辨认。",
      en: "Many cladocerans have a carapace covering the trunk, a conspicuous compound eye, and appendages involved in movement or feeding. Reliable resources are needed to distinguish group-level morphology.",
    },
    lifeHistory: {
      zh: "部分枝角类可出现孤雌生殖和有性阶段，并在特定环境下形成休眠结构；生活史响应不能在不同类群间简单套用。",
      en: "Some cladocerans alternate between parthenogenetic and sexual phases and may form resting structures under certain conditions. Life-history responses should not be generalized across groups.",
    },
    ecologicalRole: {
      zh: "许多枝角类摄食水体悬浮颗粒并参与浮游植物与更高营养级之间的能量传递，也可能影响群落结构。",
      en: "Many cladocerans consume suspended particles and transfer energy between phytoplankton and higher trophic levels, while also influencing community structure.",
    },
    feedingTraits: {
      zh: "许多枝角类能滤食适宜粒径的微藻和其他颗粒，但并非所有枝角类都具有相同摄食方式，食物条件应针对对象确认。",
      en: "Many cladocerans filter appropriately sized microalgae and other particles, but feeding modes are not identical across the group and food conditions must be organism-specific.",
    },
    researchFocus: [
      { zh: "培养状态、繁殖与种群动态观察", en: "Observation of culture condition, reproduction, and population dynamics" },
      { zh: "微藻食物条件与营养响应研究", en: "Research on microalgal food conditions and nutritional responses" },
      { zh: "水产营养、生态毒理或环境响应评价", en: "Evaluation in aquatic nutrition, ecotoxicology, or environmental response" },
    ],
    cultureFactors: [
      { zh: "培养对象、来源和生活史阶段记录", en: "Records of organism identity, source, and life-history stage" },
      { zh: "水质、食物条件与种群拥挤状态观察", en: "Observation of water quality, food conditions, and population crowding" },
      { zh: "繁殖变化、休眠结构与异常个体记录", en: "Records of reproductive change, resting structures, and atypical individuals" },
    ],
    applications: [
      { zh: "特定淡水水产动物苗种的饵料评价", en: "Feed evaluation for defined freshwater aquaculture larvae" },
      { zh: "水产营养与培养调控研究", en: "Aquatic-nutrition and culture-regulation research" },
      { zh: "生态毒理和水环境响应实验", en: "Ecotoxicology and aquatic environmental-response experiments" },
    ],
    limitations: [
      { zh: "不同枝角类对温度、水质、密度和食物条件的响应可能不同。", en: "Responses to temperature, water quality, density, and food conditions can differ among cladoceran groups." },
      { zh: "实验培养用途不等同于已验证的苗种投喂效果。", en: "Use in laboratory culture does not by itself demonstrate an effective larval-feeding application." },
      { zh: "未完成物种鉴定时不能用具体种名替代类群名称。", en: "A species name should not replace a group name when identification has not been confirmed." },
    ],
    relatedGuideIds: ["cladoceran-culture-basics", "zooplankton-counting", "sampling-preservation"],
    image: "",
    imageAlt: { zh: "枝角类类群图像待团队提供", en: "Team-provided cladoceran group image pending" },
    contentStatus: "draft",
  },
];

export const liveFeedResearchTopics: LiveFeedResearchTopic[] = [
  {
    id: "high-density-culture",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "浮游动物高密度培养", en: "High-Density Zooplankton Culture" },
    summary: { zh: "关注种群状态、培养稳定性与供应连续性的评价框架，不预设已达到的培养规模。", en: "Examines frameworks for population condition, culture stability, and continuity of supply without implying an achieved production scale." },
  },
  {
    id: "microalgal-diets",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "微藻饵料与饵料组合", en: "Microalgal Diets and Feed Combinations" },
    summary: { zh: "比较不同培养对象与阶段对微藻饵料和组合策略的响应。", en: "Compares how defined culture organisms and life stages respond to microalgal diets and diet combinations." },
  },
  {
    id: "nutritional-enrichment",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "营养强化与营养品质", en: "Nutritional Enrichment and Feed Quality" },
    summary: { zh: "研究饵料来源、强化过程和记录方式与营养品质之间的关系。", en: "Studies relationships among diet source, enrichment processes, record keeping, and nutritional quality." },
  },
  {
    id: "population-dynamics",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "繁殖、生长与种群动态", en: "Reproduction, Growth and Population Dynamics" },
    summary: { zh: "关注不同类群和发育阶段的繁殖、生长及种群变化。", en: "Focuses on reproduction, growth, and population change across groups and developmental stages." },
  },
  {
    id: "water-microbial-management",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "水质、环境与微生物管理", en: "Water Quality, Environment and Microbial Management" },
    summary: { zh: "建立水质、培养环境、微生物状态与异常迹象的观察和记录框架。", en: "Develops observation and record frameworks for water quality, culture conditions, microbial state, and signs of abnormality." },
  },
  {
    id: "larval-feeding-evaluation",
    categories: ["rotifer", "copepod", "cladoceran"],
    environmentKinds: [],
    contentType: "topic",
    contentStatus: "draft",
    title: { zh: "水产苗种投喂与应用评价", en: "Larval Feeding and Application Evaluation" },
    summary: { zh: "针对明确苗种对象和发育阶段评价摄食适配性与应用边界。", en: "Evaluates feeding compatibility and application boundaries for defined larvae and developmental stages." },
  },
];

const pendingGuideFields = {
  prerequisites: [] as LocalizedText[],
  materials: [] as LocalizedText[],
  procedure: [] as LocalizedText[],
  dataRecords: [] as LocalizedText[],
  commonAnomalies: [] as LocalizedText[],
  safetyAndBiosecurity: [] as LocalizedText[],
  environmentKinds: [] as WaterEnvironment[],
  contentType: "guide" as const,
  contentStatus: "draft" as const,
};

export const liveFeedGuides: LiveFeedGuide[] = [
  { id: "rotifer-culture-basics", name: { zh: "轮虫培养基础", en: "Rotifer Culture Basics" }, category: "rotifer", purpose: { zh: "建立轮虫培养对象、观察内容和记录边界的入门框架。", en: "An introductory framework for defining rotifer culture organisms, observations, and record boundaries." }, audience: { zh: "完成实验室准入培训的本科生", en: "Undergraduates who have completed laboratory induction" }, ...pendingGuideFields },
  { id: "copepod-culture-basics", name: { zh: "桡足类培养基础", en: "Copepod Culture Basics" }, category: "copepod", purpose: { zh: "了解桡足类生活史阶段与培养记录的基本结构。", en: "Introduces the basic structure of copepod life-stage and culture records." }, audience: { zh: "完成实验室准入培训的本科生", en: "Undergraduates who have completed laboratory induction" }, ...pendingGuideFields },
  { id: "cladoceran-culture-basics", name: { zh: "枝角类培养基础", en: "Cladoceran Culture Basics" }, category: "cladoceran", purpose: { zh: "建立枝角类观察、培养状态和记录项目的入门框架。", en: "An introductory framework for cladoceran observation, culture condition, and records." }, audience: { zh: "完成实验室准入培训的本科生", en: "Undergraduates who have completed laboratory induction" }, ...pendingGuideFields },
  { id: "zooplankton-counting", name: { zh: "浮游动物计数", en: "Zooplankton Counting" }, category: "cross-group", purpose: { zh: "说明计数学习目标、原始记录和复核要求。", en: "Defines learning objectives, raw records, and review requirements for counting." }, audience: { zh: "需要开展计数训练的本科生", en: "Undergraduates beginning counting practice" }, ...pendingGuideFields },
  { id: "culture-density-records", name: { zh: "培养密度记录", en: "Culture Density Records" }, category: "cross-group", purpose: { zh: "建立不含预设参数的取样、记录与复核框架。", en: "Provides a sampling, recording, and review framework without preset parameters." }, audience: { zh: "参与培养记录的本科生", en: "Undergraduates contributing to culture records" }, ...pendingGuideFields },
  { id: "diet-feeding-records", name: { zh: "饵料投喂记录", en: "Diet and Feeding Records" }, category: "cross-group", purpose: { zh: "说明饵料身份、批次和观察信息的记录结构。", en: "Defines record fields for diet identity, batch information, and observations." }, audience: { zh: "参与培养记录的本科生", en: "Undergraduates contributing to culture records" }, ...pendingGuideFields },
  { id: "water-quality-observation", name: { zh: "水质与培养状态观察", en: "Water Quality and Culture-State Observation" }, category: "cross-group", purpose: { zh: "建立水质、培养状态与异常迹象的观察清单。", en: "Establishes an observation checklist for water quality, culture state, and signs of abnormality." }, audience: { zh: "参与日常观察的本科生", en: "Undergraduates participating in routine observations" }, ...pendingGuideFields },
  { id: "sampling-preservation", name: { zh: "样品采集与保存", en: "Sample Collection and Preservation" }, category: "cross-group", purpose: { zh: "说明采样身份、交接和保存记录应包含的项目。", en: "Defines identity, handover, and storage information to record during sampling." }, audience: { zh: "在指导下参与采样的本科生", en: "Undergraduates sampling under supervision" }, ...pendingGuideFields },
  { id: "contamination-anomaly-records", name: { zh: "污染和异常情况记录", en: "Contamination and Anomaly Records" }, category: "cross-group", purpose: { zh: "建立异常迹象、隔离处置和上报过程的记录框架。", en: "Provides a record framework for abnormal signs, isolation actions, and reporting." }, audience: { zh: "参与培养观察的本科生", en: "Undergraduates observing live-feed cultures" }, ...pendingGuideFields },
];
