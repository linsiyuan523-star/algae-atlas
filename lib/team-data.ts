import type { LocalizedText } from "@/lib/site-data";

export type ResearchArea = {
  id: "microalgae" | "macroalgae";
  title: LocalizedText;
  summary: LocalizedText;
  bullets: LocalizedText[];
  image: string;
  imageStatus: LocalizedText;
};

export type ResearchTopic = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
};

export type TeamMember = {
  id: string;
  name: LocalizedText;
  role: LocalizedText;
  bio: LocalizedText;
  image?: string;
};

export type OutputItem = {
  id: string;
  category: "publications" | "patents" | "projects" | "student-research";
  title: LocalizedText;
  year?: string;
  citation?: LocalizedText;
  href?: string;
};

export type TutorialEntry = {
  id: string;
  name: LocalizedText;
  purpose: LocalizedText;
  applicableExperiments: LocalizedText[];
  preCheck: LocalizedText[];
  sopSteps: LocalizedText[];
  commonParameters: LocalizedText[];
  dataExport: LocalizedText[];
  cleaningAndShutdown: LocalizedText[];
  commonErrors: LocalizedText[];
  safety: LocalizedText[];
  administration: LocalizedText[];
  updated: LocalizedText;
};

export type BeginnerGuide = {
  id: string;
  title: LocalizedText;
  category: "safety" | "basics" | "records";
  status: LocalizedText;
};

export type NewsEntry = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  date: string;
  category: LocalizedText;
  image?: string;
  body: LocalizedText;
  caption?: LocalizedText;
  pinned?: boolean;
};

export const researchAreas: ResearchArea[] = [
  {
    id: "microalgae",
    title: { zh: "微藻研究", en: "Microalgae Research" },
    summary: {
      zh: "关注微藻种质、培养调控、营养代谢、活性物质与水产养殖应用。",
      en: "Research interests spanning microalgal germplasm, cultivation control, metabolism, bioactive compounds, and aquaculture applications.",
    },
    bullets: [
      { zh: "种质资源与藻株筛选", en: "Germplasm resources and strain screening" },
      { zh: "营养需求与培养调控", en: "Nutrition and cultivation regulation" },
      { zh: "光、氮、碳及环境因子响应", en: "Responses to light, nitrogen, carbon, and environmental factors" },
      { zh: "异养、混养与高密度培养", en: "Heterotrophic, mixotrophic, and high-density cultivation" },
      { zh: "类胡萝卜素、脂质、蛋白质及活性物质", en: "Carotenoids, lipids, proteins, and bioactive compounds" },
      { zh: "生物饵料与水产养殖应用", en: "Live feed and aquaculture applications" },
      { zh: "自动化培养与在线监测", en: "Automated cultivation and online monitoring" },
    ],
    image: "/images/cultures.jpg",
    imageStatus: { zh: "临时开放许可科学影像", en: "Temporary openly licensed science image" },
  },
  {
    id: "macroalgae",
    title: { zh: "大型海藻研究", en: "Macroalgae Research" },
    summary: {
      zh: "关注大型海藻种质、生理生态、养殖、资源利用与近岸生态应用。",
      en: "Research interests spanning macroalgal germplasm, physiology, cultivation, resource use, and coastal ecological applications.",
    },
    bullets: [
      { zh: "大型海藻种质资源", en: "Macroalgal germplasm resources" },
      { zh: "生理与生态响应", en: "Physiological and ecological responses" },
      { zh: "育种与养殖技术", en: "Breeding and cultivation technologies" },
      { zh: "功能成分与高值利用", en: "Functional components and valorization" },
      { zh: "食品、饲料与生物材料应用", en: "Food, feed, and biomaterial applications" },
      { zh: "生态修复与近岸生态", en: "Ecological restoration and coastal ecology" },
    ],
    image: "/images/bloom.jpg",
    imageStatus: { zh: "临时公有领域科学影像", en: "Temporary public-domain science image" },
  },
];

export const researchTopics: ResearchTopic[] = [
  {
    id: "high-density-cultivation",
    title: { zh: "微藻高密度培养与营养调控", en: "High-Density Microalgal Cultivation" },
    summary: {
      zh: "研究培养方式与环境条件如何共同影响微藻生长状态和过程稳定性。",
      en: "Exploring how cultivation modes and environmental conditions shape microalgal growth and process stability.",
    },
  },
  {
    id: "bioactive-valorization",
    title: { zh: "藻类活性物质诱导与高值化利用", en: "Bioactive Compounds and Valorization" },
    summary: {
      zh: "关注藻类色素、脂质、蛋白质及其他活性成分的形成、分析与利用路径。",
      en: "Studying the formation, analysis, and potential use of algal pigments, lipids, proteins, and other bioactive compounds.",
    },
  },
  {
    id: "aquaculture-live-feed",
    title: { zh: "水产养殖用活体微藻", en: "Live Microalgae for Aquaculture" },
    summary: {
      zh: "关注适用藻种、培养质量与稳定供应在水产养殖生物饵料中的作用。",
      en: "Examining suitable strains, culture quality, and reliable supply for live-feed applications in aquaculture.",
    },
  },
  {
    id: "macroalgal-ecology",
    title: { zh: "大型海藻资源与生态应用", en: "Macroalgal Resources and Ecological Applications" },
    summary: {
      zh: "研究大型海藻资源特征、利用方式及其与近岸生态环境之间的联系。",
      en: "Investigating macroalgal resources, potential uses, and relationships with coastal ecosystems.",
    },
  },
];

export const trainingPrinciples: LocalizedText[] = [
  { zh: "从规范记录、样品处理和基础操作开始", en: "Begin with clear records, sample handling, and foundational practice" },
  { zh: "在安全培训和现场指导后使用仪器", en: "Use instruments only after safety training and on-site guidance" },
  { zh: "区分观察、假设、数据与结论", en: "Separate observation, hypothesis, data, and conclusion" },
  { zh: "重视可复现性、数据命名与备份", en: "Prioritize reproducibility, data naming, and backup" },
  { zh: "在真实问题中逐步建立科研能力", en: "Build research skills progressively through authentic questions" },
];

export const teamMembers: TeamMember[] = [];

export const outputCategories = [
  { id: "publications", label: { zh: "论文", en: "Publications" } },
  { id: "patents", label: { zh: "专利", en: "Patents" } },
  { id: "projects", label: { zh: "科研项目", en: "Research Projects" } },
  { id: "student-research", label: { zh: "学生科研", en: "Student Research" } },
] as const;

export const outputs: OutputItem[] = [];

const pendingReview = {
  zh: "详细流程等待实验室审核后发布。",
  en: "Detailed procedures will be published after laboratory review.",
};

export const tutorials: TutorialEntry[] = [
  {
    id: "spectrophotometer",
    name: { zh: "分光光度计", en: "Spectrophotometer" },
    purpose: { zh: "用于样品吸光度等基础光学测量。", en: "For basic optical measurements such as sample absorbance." },
  },
  {
    id: "microplate-reader",
    name: { zh: "酶标仪", en: "Microplate Reader" },
    purpose: { zh: "用于多孔板样品的光学信号读取。", en: "For reading optical signals from samples in microplates." },
  },
  {
    id: "fluorescence-microscope",
    name: { zh: "荧光显微镜", en: "Fluorescence Microscope" },
    purpose: { zh: "用于观察样品的显微形态与荧光信号。", en: "For observing microscopic morphology and fluorescence signals." },
  },
  {
    id: "chlorophyll-fluorometer",
    name: { zh: "叶绿素荧光仪", en: "Chlorophyll Fluorometer" },
    purpose: { zh: "用于叶绿素荧光相关测量。", en: "For measurements related to chlorophyll fluorescence." },
  },
  {
    id: "centrifuge",
    name: { zh: "离心机", en: "Centrifuge" },
    purpose: { zh: "用于在规定条件下分离或收集样品。", en: "For separating or collecting samples under approved conditions." },
  },
  {
    id: "ph-salinity-meters",
    name: { zh: "pH 与盐度测量仪", en: "pH and Salinity Meters" },
    purpose: { zh: "用于培养液或水样的基础环境指标测量。", en: "For basic environmental measurements of cultures or water samples." },
  },
].map((entry) => ({
  ...entry,
  applicableExperiments: [],
  preCheck: [],
  sopSteps: [],
  commonParameters: [],
  dataExport: [],
  cleaningAndShutdown: [],
  commonErrors: [],
  safety: [],
  administration: [],
  updated: pendingReview,
}));

export const beginnerGuides: BeginnerGuide[] = [
  { id: "lab-safety", title: { zh: "实验室安全", en: "Laboratory Safety" }, category: "safety", status: { zh: "整理中", en: "In preparation" } },
  { id: "microalgae-basics", title: { zh: "微藻培养基础", en: "Microalgae Cultivation Basics" }, category: "basics", status: { zh: "整理中", en: "In preparation" } },
  { id: "aseptic-basics", title: { zh: "无菌操作基础", en: "Aseptic Technique Basics" }, category: "safety", status: { zh: "整理中", en: "In preparation" } },
  { id: "medium-preparation", title: { zh: "培养基配制", en: "Culture Medium Preparation" }, category: "basics", status: { zh: "整理中", en: "In preparation" } },
  { id: "hemocytometer", title: { zh: "血球计数板使用基础", en: "Hemocytometer Basics" }, category: "basics", status: { zh: "整理中", en: "In preparation" } },
  { id: "lab-records", title: { zh: "实验记录规范", en: "Laboratory Record Standards" }, category: "records", status: { zh: "整理中", en: "In preparation" } },
  { id: "data-backup", title: { zh: "数据命名与备份", en: "Data Naming and Backup" }, category: "records", status: { zh: "整理中", en: "In preparation" } },
  { id: "instrument-booking", title: { zh: "仪器预约与使用登记", en: "Instrument Booking and Logs" }, category: "records", status: { zh: "整理中", en: "In preparation" } },
];

export const news: NewsEntry[] = [];
