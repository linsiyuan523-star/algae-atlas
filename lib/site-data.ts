export type Locale = "zh" | "en";

export type LocalizedText = {
  zh: string;
  en: string;
};

export type AlgaeEntry = {
  id: string;
  name: LocalizedText;
  latin: string;
  category: "freshwater" | "marine" | "extreme";
  categoryLabel: LocalizedText;
  summary: LocalizedText;
  habitat: LocalizedText;
  focus: LocalizedText;
  image: string;
};

export type FeatureEntry = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  note: LocalizedText;
  image: string;
};

export type ArticleEntry = FeatureEntry & {
  date: string;
  readTime: LocalizedText;
};

export const site = {
  name: { zh: "广东海洋大学藻类团队", en: "Algae Research Team" },
  institution: { zh: "广东海洋大学", en: "Guangdong Ocean University" },
  featureName: { zh: "藻境 · Algae Atlas", en: "Algae Atlas" },
  kicker: { zh: "立足南海 · 探索藻类科学", en: "ALGAE SCIENCE · SOUTH CHINA SEA" },
  description: {
    zh: "聚焦微藻与大型海藻研究、学生科研训练及藻类科学传播。",
    en: "Research on microalgae, macroalgae, student training, and public communication of algal science.",
  },
};

export const navigation = [
  { href: "", label: { zh: "首页", en: "Home" } },
  { href: "team", label: { zh: "团队概况", en: "Team" } },
  { href: "research", label: { zh: "研究方向", en: "Research" } },
  { href: "outputs", label: { zh: "科研成果", en: "Outputs" } },
  { href: "tutorials", label: { zh: "仪器教程", en: "Tutorials" } },
  { href: "algae", label: { zh: "藻类图鉴", en: "Algae Atlas" } },
  { href: "news", label: { zh: "动态与联系", en: "News & Contact" } },
] as const;

export const algae: AlgaeEntry[] = [
  {
    id: "chlorella-vulgaris",
    name: { zh: "小球藻", en: "Chlorella" },
    latin: "Chlorella vulgaris",
    category: "freshwater",
    categoryLabel: { zh: "淡水微藻", en: "Freshwater microalga" },
    summary: {
      zh: "一种细胞微小、形态近球形的单细胞绿藻，常用于光合作用与培养过程研究。",
      en: "A small, nearly spherical unicellular green microalga widely studied in photosynthesis and cultivation research.",
    },
    habitat: { zh: "淡水及潮湿环境", en: "Freshwater and moist environments" },
    focus: { zh: "培养过程 · 光合作用", en: "Cultivation · Photosynthesis" },
    image: "/images/diatoms.jpg",
  },
  {
    id: "spirulina",
    name: { zh: "螺旋藻", en: "Spirulina" },
    latin: "Limnospira / Arthrospira",
    category: "extreme",
    categoryLabel: { zh: "嗜碱蓝细菌", en: "Alkaline cyanobacterium" },
    summary: {
      zh: "通常所称的“螺旋藻”属于丝状蓝细菌，常与微藻一同讨论，可在偏碱性水体中生长。",
      en: "Spirulina commonly refers to filamentous cyanobacteria discussed alongside microalgae and able to grow in alkaline waters.",
    },
    habitat: { zh: "偏碱性湖泊与培养系统", en: "Alkaline lakes and culture systems" },
    focus: { zh: "规模培养 · 光合生物质", en: "Scaled culture · Biomass" },
    image: "/images/cultures.jpg",
  },
  {
    id: "haematococcus-pluvialis",
    name: { zh: "雨生红球藻", en: "Haematococcus" },
    latin: "Haematococcus pluvialis",
    category: "freshwater",
    categoryLabel: { zh: "淡水绿藻", en: "Freshwater green alga" },
    summary: {
      zh: "一种会随生命周期和环境压力呈现明显形态与颜色变化的单细胞绿藻。",
      en: "A unicellular green alga whose form and color change across its life cycle and under environmental stress.",
    },
    habitat: { zh: "临时性淡水水体", en: "Temporary freshwater habitats" },
    focus: { zh: "色素积累 · 胁迫响应", en: "Pigments · Stress response" },
    image: "/images/cultures.jpg",
  },
  {
    id: "nannochloropsis",
    name: { zh: "微拟球藻", en: "Nannochloropsis" },
    latin: "Nannochloropsis spp.",
    category: "marine",
    categoryLabel: { zh: "海洋微藻", en: "Marine microalga" },
    summary: {
      zh: "一类体型很小的海水或半咸水微藻，是水产饵料与海洋生物技术研究的常见对象。",
      en: "A group of tiny marine or brackish microalgae commonly studied in aquaculture feed and marine biotechnology.",
    },
    habitat: { zh: "海水与半咸水", en: "Marine and brackish waters" },
    focus: { zh: "水产饵料 · 脂质代谢", en: "Aquaculture · Lipid metabolism" },
    image: "/images/diatoms.jpg",
  },
  {
    id: "phaeodactylum-tricornutum",
    name: { zh: "三角褐指藻", en: "Phaeodactylum" },
    latin: "Phaeodactylum tricornutum",
    category: "marine",
    categoryLabel: { zh: "模式硅藻", en: "Model diatom" },
    summary: {
      zh: "一种能够呈现多种细胞形态的模式硅藻，帮助研究者理解光合作用与环境适应。",
      en: "A model diatom with several cell forms, used to explore photosynthesis and environmental adaptation.",
    },
    habitat: { zh: "近岸海域与培养系统", en: "Coastal waters and culture systems" },
    focus: { zh: "模式生物 · 细胞代谢", en: "Model organism · Metabolism" },
    image: "/images/diatoms.jpg",
  },
  {
    id: "ulva-lactuca",
    name: { zh: "石莼", en: "Sea lettuce" },
    latin: "Ulva lactuca",
    category: "marine",
    categoryLabel: { zh: "大型绿藻", en: "Green macroalga" },
    summary: {
      zh: "具有薄片状藻体的沿海绿藻，是近岸生态系统的初级生产者，也为小型生物提供栖息空间。",
      en: "A sheet-like coastal green alga that acts as a primary producer and provides habitat for small organisms.",
    },
    habitat: { zh: "潮间带与沿海浅水", en: "Intertidal and shallow coastal waters" },
    focus: { zh: "海岸生态 · 大型藻类", en: "Coastal ecology · Macroalgae" },
    image: "/images/bloom.jpg",
  },
];

export const applications: FeatureEntry[] = [
  {
    id: "cultivation",
    title: { zh: "微藻培养与过程观察", en: "Cultivation & Process Observation" },
    summary: {
      zh: "光照、温度、营养、气体交换与混合共同塑造培养状态。系统选择需要平衡控制程度、规模和维护条件。",
      en: "Light, temperature, nutrients, gas exchange, and mixing shape culture performance. System design balances control, scale, and maintenance.",
    },
    note: { zh: "从开放水池到封闭式光生物反应器", en: "From open ponds to closed photobioreactors" },
    image: "/images/photobioreactor.jpg",
  },
  {
    id: "water-observation",
    title: { zh: "水环境藻相观察", en: "Algae-Based Water Observation" },
    summary: {
      zh: "藻类群落会响应营养和环境变化，但水色或藻量不能单独判定水质，需要结合理化指标与长期记录。",
      en: "Algal communities respond to environmental change, but color or abundance alone cannot determine water quality without broader monitoring.",
    },
    note: { zh: "观察趋势，而非用单一现象下结论", en: "Read patterns, not single signals" },
    image: "/images/bloom.jpg",
  },
  {
    id: "aquaculture",
    title: { zh: "水产养殖基础饵料", en: "Live Microalgae for Aquaculture" },
    summary: {
      zh: "经过筛选和规范培养的微藻可作为部分水生幼体或浮游动物的食物来源，实际应用重视藻种、卫生与稳定供应。",
      en: "Selected and carefully cultured microalgae can feed aquatic larvae or zooplankton, with species choice, hygiene, and supply all critical.",
    },
    note: { zh: "藻种选择 · 培养卫生 · 营养状态", en: "Species · Hygiene · Nutrition" },
    image: "/images/cultures.jpg",
  },
  {
    id: "bioproducts",
    title: { zh: "藻类生物质与成分探索", en: "Biomass & Bioproduct Exploration" },
    summary: {
      zh: "蛋白质、脂质、色素和多糖带来多样研究方向，实际产品开发仍需进一步评估安全、工艺、法规与环境影响。",
      en: "Proteins, lipids, pigments, and polysaccharides open diverse research paths, while products require safety, process, and regulatory review.",
    },
    note: { zh: "从基础成分到负责任的应用评估", en: "From composition to responsible evaluation" },
    image: "/images/diatoms.jpg",
  },
];

export const projects: FeatureEntry[] = [
  {
    id: "pond-seasons",
    title: { zh: "一池水的四季", en: "A Pond Through the Seasons" },
    summary: {
      zh: "用固定位置摄影结合天气、水温、透明度与水色记录，观察城市池塘随季节变化的长期趋势。",
      en: "Fixed-point photography and simple environmental notes reveal seasonal patterns in an urban pond over time.",
    },
    note: { zh: "示例观察案例 · 非商业项目", en: "Sample field note · Not a commercial project" },
    image: "/images/bloom.jpg",
  },
  {
    id: "light-and-color",
    title: { zh: "光照与培养液颜色", en: "Light & Culture Color" },
    summary: {
      zh: "以相同容器定期记录不同光照条件下培养液外观，形成科普时间序列，同时说明视觉观察的边界。",
      en: "Identical vessels are photographed under different light conditions to form an educational timeline with clear limits.",
    },
    note: { zh: "视觉记录不能替代规范实验", en: "Visual records do not replace controlled experiments" },
    image: "/images/cultures.jpg",
  },
  {
    id: "intertidal-green-belt",
    title: { zh: "潮间带绿色带", en: "The Intertidal Green Belt" },
    summary: {
      zh: "记录潮位、基质、藻体外观与伴生生物，帮助理解大型绿藻和潮间带环境之间的联系。",
      en: "Tides, substrate, seaweed form, and nearby organisms help reveal relationships within intertidal habitats.",
    },
    note: { zh: "现场识别只是物种确认的起点", en: "Field identification is a starting point" },
    image: "/images/bloom.jpg",
  },
];

export const articles: ArticleEntry[] = [
  {
    id: "what-are-algae",
    title: { zh: "藻类究竟是什么？", en: "What Exactly Are Algae?" },
    summary: {
      zh: "“藻类”不是单一生物分类，而是对多种生活在水中或潮湿环境、能够进行光合作用的生物的广义称呼。",
      en: "Algae are not a single biological lineage, but a broad term for many photosynthetic organisms living in water or moist environments.",
    },
    note: { zh: "基础概念", en: "Foundations" },
    image: "/images/diatoms.jpg",
    date: "2026-07-10",
    readTime: { zh: "4 分钟阅读", en: "4 min read" },
  },
  {
    id: "why-water-turns-green",
    title: { zh: "水为什么会变绿？", en: "Why Does Water Turn Green?" },
    summary: {
      zh: "悬浮藻类可能影响水色，但光线、泥沙、溶解物质和观察角度同样重要，不能只凭颜色下结论。",
      en: "Suspended algae can affect water color, but light, sediment, dissolved material, and viewing angle matter too.",
    },
    note: { zh: "水环境观察", en: "Water observation" },
    image: "/images/bloom.jpg",
    date: "2026-07-08",
    readTime: { zh: "5 分钟阅读", en: "5 min read" },
  },
  {
    id: "photobioreactor-basics",
    title: { zh: "光生物反应器如何工作？", en: "How Does a Photobioreactor Work?" },
    summary: {
      zh: "透明培养空间让光、气体与培养液以较可控的方式接触微藻，同时也带来光分布、温度与清洁等挑战。",
      en: "A transparent cultivation space brings light, gases, and culture medium together under controlled conditions, with practical tradeoffs.",
    },
    note: { zh: "培养系统", en: "Cultivation systems" },
    image: "/images/photobioreactor.jpg",
    date: "2026-07-03",
    readTime: { zh: "6 分钟阅读", en: "6 min read" },
  },
];

export const imageCredits = [
  {
    file: "Diatoms through the microscope",
    credit: "Prof. Gordon T. Taylor / NOAA Corps Collection",
    license: "Public Domain",
    href: "https://commons.wikimedia.org/wiki/File:Diatoms_through_the_microscope.jpg",
  },
  {
    file: "NREL algae photobioreactor",
    credit: "U.S. Department of Energy",
    license: "Public Domain",
    href: "https://commons.wikimedia.org/wiki/File:U.S._Department_of_Energy_-_Science_-_298_042_003_%289525866984%29.jpg",
  },
  {
    file: "Microalgal cultures",
    credit: "Tony Rees / CSIRO",
    license: "CC BY 3.0 · cropped for presentation",
    href: "https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_7234_microalgal_cultures.jpg",
  },
  {
    file: "Bloom in the Norwegian Sea",
    credit: "MODIS Rapid Response Team / NASA GSFC",
    license: "Public Domain",
    href: "https://commons.wikimedia.org/wiki/File:Bloom_in_the_Norwegian_Sea.jpg",
  },
];

export function text(value: LocalizedText, locale: Locale) {
  return value[locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === "zh" ? "en" : "zh";
}
