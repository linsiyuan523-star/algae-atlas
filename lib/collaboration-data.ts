import { createContentReview, type ContentReview } from "@/lib/content-review";
import type { LocalizedText } from "@/lib/site-data";

export type { ContentReview, ReferenceItem } from "@/lib/content-review";

export type CollaborationStatus =
  | "open-for-discussion"
  | "case-by-case"
  | "internal-only";

export type CollaborationArea = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  suitableFor: LocalizedText[];
  possibleTopics: LocalizedText[];
  partnerShouldProvide: LocalizedText[];
  teamMayContribute: LocalizedText[];
  relatedResearchIds: string[];
  relatedRoutes: string[];
  status: CollaborationStatus;
  caveat: LocalizedText;
  review: ContentReview;
};

export type CollaborationProcessStep = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  details?: LocalizedText[];
};

export type CollaborationBoundary = {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  details?: LocalizedText[];
};

const lt = (zh: string, en: string): LocalizedText => ({ zh, en });

const draftReview = (): ContentReview => ({
  ...createContentReview("draft", "2026-07-12"),
  version: "0.1",
});

export const collaborationAreas: CollaborationArea[] = [
  {
    id: "microalgae",
    title: lt("微藻培养、藻株筛选与培养调控", "Microalgal Cultivation and Strain Evaluation"),
    summary: lt(
      "围绕来源明确的藻株，讨论培养状态、条件比较、过程记录和基础指标评价。",
      "Discuss culture condition comparisons, process records, and basic evaluation for strains with documented provenance.",
    ),
    suitableFor: [
      lt("高校与科研院所", "Universities and research institutes"),
      lt("水产苗种或生物饵料相关单位", "Organizations working with aquaculture larvae or live feeds"),
      lt("需要开展藻株比较或培养条件研究的合作方", "Partners studying strain comparisons or cultivation conditions"),
    ],
    possibleTopics: [
      lt("藻株培养状态评价", "Assessment of algal culture condition"),
      lt("培养基和营养条件比较", "Comparison of media and nutrient conditions"),
      lt("光照、温度、盐度、碳源和氮源调控", "Regulation of light, temperature, salinity, carbon sources, and nitrogen sources"),
      lt("自养、混养或异养培养研究", "Autotrophic, mixotrophic, or heterotrophic cultivation research"),
      lt("微藻高密度培养与过程监测研究", "Research on high-density microalgal culture and process monitoring"),
      lt("生长、色素、光合活性和基础生化指标分析", "Analysis of growth, pigments, photosynthetic activity, and basic biochemical indicators"),
    ],
    partnerShouldProvide: [
      lt("藻种或样品来源", "Source of the strain or sample"),
      lt("物种鉴定情况", "Current identification status"),
      lt("研究目的", "Research objective"),
      lt("已有培养条件", "Existing culture conditions"),
      lt("计划比较的因素", "Factors proposed for comparison"),
      lt("期望时间范围", "Expected time frame"),
      lt("样品是否允许转移或共享", "Whether the sample may be transferred or shared"),
    ],
    teamMayContribute: [
      lt("可进一步讨论研究问题", "Further discussion of the research question may be possible"),
      lt("可根据具体条件评估实验方案可行性", "Experimental feasibility may be assessed against the specific conditions"),
      lt("可讨论培养条件和实验分组设计", "Culture conditions and experimental grouping may be discussed"),
      lt("可根据现有条件评估基础培养与指标检测", "Basic culture work and measurements may be assessed against available conditions"),
      lt("可共同讨论数据记录结构", "A data-recording structure may be discussed jointly"),
      lt("可在获得有效数据后讨论结果解释与后续问题", "Interpretation and follow-up questions may be discussed once valid data are available"),
    ],
    relatedResearchIds: ["microalgae"],
    relatedRoutes: ["research/microalgae", "algae"],
    status: "open-for-discussion",
    caveat: lt(
      "是否能够开展具体藻株培养，取决于藻种来源、生物安全、培养条件、设备占用和团队内部安排。",
      "Whether a particular strain can be cultured depends on provenance, biosafety, culture requirements, equipment availability, and internal scheduling.",
    ),
    review: draftReview(),
  },
  {
    id: "live-feeds",
    title: lt("生物饵料、浮游动物与水产苗种应用", "Live Feeds, Zooplankton and Aquaculture Applications"),
    summary: lt(
      "讨论轮虫、桡足类和枝角类培养、微藻饵料及其与水产苗种研究的衔接。",
      "Discuss rotifer, copepod, and cladoceran culture, microalgal diets, and links to aquaculture larvae research.",
    ),
    suitableFor: [
      lt("苗种繁育单位", "Aquaculture hatcheries"),
      lt("水产养殖企业", "Aquaculture organizations"),
      lt("高校和科研机构", "Universities and research institutes"),
      lt("从事轮虫、桡足类或枝角类研究的团队", "Teams studying rotifers, copepods, or cladocerans"),
    ],
    possibleTopics: [
      lt("轮虫、桡足类和枝角类培养研究", "Culture research on rotifers, copepods, and cladocerans"),
      lt("微藻饵料组合比较", "Comparison of microalgal diet combinations"),
      lt("营养强化与营养品质评价", "Nutritional enrichment and quality assessment"),
      lt("培养密度、繁殖和种群动态", "Culture density, reproduction, and population dynamics"),
      lt("水质和微生物状态观察", "Observation of water quality and microbial conditions"),
      lt("特定苗种摄食适配性研究", "Diet-suitability research for defined aquaculture larvae"),
      lt("生物饵料培养过程记录和质量评价", "Live-feed culture records and quality assessment"),
    ],
    partnerShouldProvide: [
      lt("培养对象的物种或较高类群", "Species or higher taxonomic group of the culture organism"),
      lt("来源和鉴定信息", "Provenance and identification information"),
      lt("水体类型", "Water type"),
      lt("目标苗种", "Target aquaculture larvae or juveniles"),
      lt("当前培养问题", "Current culture problem"),
      lt("已有投喂方案", "Existing feeding approach"),
      lt("评价目标", "Evaluation objective"),
    ],
    teamMayContribute: [
      lt("可进一步讨论培养问题及其记录方式", "Culture questions and recording methods may be discussed further"),
      lt("可根据研究对象讨论饵料选择", "Diet choices may be discussed for the defined organism"),
      lt("可讨论实验分组和记录框架", "Experimental grouping and recording frameworks may be discussed"),
      lt("可评估微藻与浮游动物联合培养研究的可行性", "The feasibility of combined microalgae and zooplankton culture research may be assessed"),
      lt("可根据检测条件讨论营养和生长相关指标", "Nutrition- and growth-related indicators may be discussed according to measurement capacity"),
      lt("可共同设计培养异常情况记录框架", "A culture-anomaly recording framework may be designed jointly"),
    ],
    relatedResearchIds: ["live-feeds", "microalgae"],
    relatedRoutes: ["live-feeds", "research/microalgae"],
    status: "open-for-discussion",
    caveat: lt(
      "具体培养和应用评价需结合对象、发育阶段、现有场地和检测条件确认；本页不承诺规模化生产、苗种成活率、特定饵料优势或标准生产工艺。",
      "Specific culture and application assessments depend on the organism, developmental stage, facilities, and measurement conditions. This page does not promise scaled production, larval survival, superiority of a particular diet, or a standard production protocol.",
    ),
    review: draftReview(),
  },
  {
    id: "algal-blooms",
    title: lt("近岸藻华、赤潮采样与浮游植物调查", "Coastal Algal Blooms, Red-Tide Sampling and Phytoplankton Surveys"),
    summary: lt(
      "围绕有明确任务和站位背景的近岸采样、现场记录、显微观察与群落数据研究展开讨论。",
      "Discuss coastal sampling, field records, microscopy, and community data for projects with defined objectives and site context.",
    ),
    suitableFor: [
      lt("海洋与水产科研机构", "Marine and fisheries research institutes"),
      lt("近岸养殖单位", "Coastal aquaculture organizations"),
      lt("海洋环境相关团队", "Teams working on marine environments"),
      lt("开展浮游植物调查和赤潮研究的合作方", "Partners conducting phytoplankton surveys and red-tide research"),
    ],
    possibleTopics: [
      lt("近岸水样和浮游植物样品采集", "Collection of coastal water and phytoplankton samples"),
      lt("赤潮或异常水色现场记录", "Field records of red tides or unusual water coloration"),
      lt("采样站位和环境背景记录", "Sampling-site and environmental context records"),
      lt("浮游植物显微观察", "Microscopic observation of phytoplankton"),
      lt("优势类群和潜在赤潮生物调查", "Surveys of dominant groups and potential red-tide organisms"),
      lt("环境参数与群落变化关系分析", "Analysis of relationships between environmental variables and community change"),
      lt("连续采样和时间序列设计", "Repeated sampling and time-series design"),
      lt("已有赤潮样品的后续培养或实验研究", "Follow-up culture or experimental research using existing red-tide samples"),
    ],
    partnerShouldProvide: [
      lt("采样海域、目的和时间范围", "Sampling area, objective, and time frame"),
      lt("是否已有站位", "Whether sampling sites have been defined"),
      lt("是否有船只和采样条件", "Whether vessel access and sampling conditions are available"),
      lt("需要检测或观察的指标", "Measurements or observations of interest"),
      lt("样品保存和运输条件", "Sample storage and transport conditions"),
      lt("数据是否允许公开", "Whether data may be made public"),
      lt("是否涉及未发表数据或敏感站位", "Whether unpublished data or sensitive sites are involved"),
    ],
    teamMayContribute: [
      lt("可讨论采样设计、站位和时间安排", "Sampling design, sites, and timing may be discussed"),
      lt("可共同设计现场记录表、样品编号和交接框架", "Field records, sample identifiers, and handover frameworks may be designed jointly"),
      lt("可根据样品状态评估显微观察与基础分类工作", "Microscopy and basic classification may be assessed according to sample condition"),
      lt("可讨论浮游植物数量和群落记录方式", "Phytoplankton abundance and community records may be discussed"),
      lt("可根据数据质量讨论环境与生物数据的联合分析", "Combined environmental and biological analyses may be discussed according to data quality"),
      lt("经双方确认后，可讨论采样结果用于科研和教学展示的范围", "The research and teaching use of sampling records may be discussed after both parties confirm the public scope"),
    ],
    relatedResearchIds: ["algal-blooms"],
    relatedRoutes: ["research/algal-blooms", "algae"],
    status: "case-by-case",
    caveat: lt(
      "本栏目展示科研与教学合作方向，不构成官方赤潮预警、水产品安全结论、海洋灾害预报或公众健康建议。赤潮、藻华与有害藻华是相关但并不完全等同的概念；相关信息应以主管部门正式发布为准。",
      "This section outlines research and teaching collaboration. It is not an official red-tide alert, seafood-safety conclusion, marine-hazard forecast, or public-health advice. Red tide, algal bloom, and harmful algal bloom are related but not equivalent terms; refer to formal notices from the relevant authorities.",
    ),
    review: draftReview(),
  },
  {
    id: "macroalgae",
    title: lt("大型海藻资源、养殖与近岸生态研究", "Macroalgal Resources, Cultivation and Coastal Ecology"),
    summary: lt(
      "讨论大型海藻资源、生理生态、培养及其与近岸环境关系的基础研究问题。",
      "Discuss foundational questions about macroalgal resources, physiology, culture, and coastal ecological relationships.",
    ),
    suitableFor: [
      lt("高校与海洋科研机构", "Universities and marine research institutes"),
      lt("开展大型海藻资源、养殖或近岸生态研究的单位", "Organizations studying macroalgal resources, cultivation, or coastal ecology"),
      lt("能够说明样品来源、研究场景和科学问题的合作方", "Partners able to document sample provenance, research context, and scientific questions"),
    ],
    possibleTopics: [
      lt("大型海藻种质和资源调查", "Macroalgal germplasm and resource surveys"),
      lt("海藻生理生态", "Macroalgal physiology and ecology"),
      lt("海藻繁育和培养", "Macroalgal propagation and cultivation"),
      lt("环境因子响应", "Responses to environmental factors"),
      lt("功能成分与资源利用", "Functional components and resource utilization"),
      lt("海藻食品、饲料和材料相关基础研究", "Foundational research related to macroalgal food, feed, and materials"),
      lt("大型海藻与近岸环境关系", "Relationships between macroalgae and coastal environments"),
      lt("海藻养殖和生态修复相关研究", "Research related to macroalgal farming and ecological restoration"),
    ],
    partnerShouldProvide: [
      lt("样品或材料来源及鉴定状态", "Sample or material provenance and identification status"),
      lt("采集、培养或应用场景", "Collection, culture, or application context"),
      lt("研究目标和待回答的问题", "Research objective and questions"),
      lt("现有环境、培养或分析数据", "Existing environmental, culture, or analytical data"),
      lt("样品转移、保存和公开要求", "Requirements for sample transfer, storage, and disclosure"),
      lt("计划周期和可用资源", "Proposed time frame and available resources"),
    ],
    teamMayContribute: [
      lt("可根据实际条件讨论研究问题和样品评价路径", "Research questions and sample-evaluation approaches may be discussed according to actual conditions"),
      lt("可评估资源调查、培养或环境响应研究的可行性", "The feasibility of resource surveys, cultivation, or environmental-response research may be assessed"),
      lt("可讨论实验记录、样品管理和基础数据分析", "Experimental records, sample management, and basic data analysis may be discussed"),
      lt("可根据现有人员、仪器和周期讨论后续研究安排", "Further research arrangements may be discussed in light of available personnel, instruments, and time"),
    ],
    relatedResearchIds: ["macroalgae"],
    relatedRoutes: ["research/macroalgae", "algae"],
    status: "case-by-case",
    caveat: lt(
      "任何参与内容均需根据实际条件评估。本页不表示团队已经具备全部加工、育种、养殖或工程开发能力。",
      "Any participation must be assessed against actual conditions. This page does not imply that the team has every processing, breeding, farming, or engineering capability.",
    ),
    review: draftReview(),
  },
  {
    id: "aquaculture",
    title: lt("水产养殖投喂试验与应用评价", "Aquaculture Feeding Trials and Application Evaluation"),
    summary: lt(
      "在动物来源、场地、周期、检测与合规条件明确后，讨论投喂试验和应用评价的研究设计。",
      "Discuss feeding-trial and application-evaluation designs once animal provenance, facilities, timing, measurements, and compliance are defined.",
    ),
    suitableFor: [
      lt("水产养殖科研与教学单位", "Aquaculture research and teaching organizations"),
      lt("具备合规动物来源和试验条件的合作方", "Partners with compliant animal sources and trial conditions"),
      lt("需要讨论微藻或生物饵料应用评价的团队", "Teams considering evaluation of microalgae or live feeds"),
    ],
    possibleTopics: [
      lt("微藻或生物饵料投喂评价", "Feeding evaluation of microalgae or live feeds"),
      lt("水产动物生长和摄食观察", "Observation of aquaculture animal growth and feeding"),
      lt("不同处理组的实验设计", "Experimental design for treatment groups"),
      lt("基础生理和生化指标", "Basic physiological and biochemical indicators"),
      lt("样品采集和保存", "Sample collection and storage"),
      lt("生长数据和时间序列分析", "Growth data and time-series analysis"),
      lt("组织、酶活、营养组成或转录组研究的实验设计讨论", "Discussion of experimental design for tissue, enzyme activity, nutritional composition, or transcriptomic research"),
    ],
    partnerShouldProvide: [
      lt("动物种类、发育阶段、来源和健康背景", "Animal group, developmental stage, provenance, and health background"),
      lt("研究问题、对照思路和评价目标", "Research question, control rationale, and evaluation objective"),
      lt("现有投喂与养殖条件", "Existing feeding and rearing conditions"),
      lt("场地、周期、样本量设想和检测条件", "Facilities, time frame, proposed sample scope, and measurement conditions"),
      lt("伦理、管理和样品流转要求", "Ethics, management, and sample-transfer requirements"),
      lt("数据、知识产权和公开范围要求", "Data, intellectual-property, and disclosure requirements"),
    ],
    teamMayContribute: [
      lt("可讨论研究问题、处理组和记录结构", "Research questions, treatment groups, and recording structures may be discussed"),
      lt("可根据实际场地和动物条件评估试验可行性", "Trial feasibility may be assessed against actual facilities and animal conditions"),
      lt("可讨论采样节点、基础指标和数据分析计划", "Sampling points, basic indicators, and data-analysis plans may be discussed"),
      lt("可在合规要求明确后讨论样品和数据责任", "Sample and data responsibilities may be discussed after compliance requirements are clear"),
    ],
    relatedResearchIds: ["live-feeds", "microalgae"],
    relatedRoutes: ["live-feeds", "research/microalgae"],
    status: "case-by-case",
    caveat: lt(
      "具体动物试验须符合实验室、学校及相关伦理和管理要求。是否开展取决于场地、动物来源、周期和检测条件；本页不承诺任何处理效果。",
      "Animal trials must meet laboratory, university, ethics, and management requirements. Whether work proceeds depends on facilities, animal provenance, timing, and measurement conditions; no treatment outcome is promised here.",
    ),
    review: draftReview(),
  },
  {
    id: "automation-training",
    title: lt("培养自动化、实验教学与学生科研训练", "Culture Automation, Laboratory Training and Student Research"),
    summary: lt(
      "区分科研合作、教学交流、学生训练和工程开发，讨论监测原型、实验记录与学习活动。",
      "Distinguish research, teaching exchange, student training, and engineering development while discussing monitoring prototypes, records, and learning activities.",
    ),
    suitableFor: [
      lt("高校实验教学与学生科研团队", "University laboratory teaching and student research teams"),
      lt("需要改进培养过程记录和基础监测的实验室", "Laboratories improving culture records and basic monitoring"),
      lt("探索传感器与培养系统原型的合作方", "Partners exploring prototypes that connect sensors and culture systems"),
    ],
    possibleTopics: [
      lt("pH、温度、盐度、浊度等在线监测", "Online monitoring of pH, temperature, salinity, turbidity, and related variables"),
      lt("传感器与培养系统结合", "Integration of sensors with culture systems"),
      lt("定时补料和蠕动泵控制研究", "Research on timed feeding and peristaltic-pump control"),
      lt("实验数据连续采集", "Continuous experimental data collection"),
      lt("本科生科研项目与联合指导讨论", "Discussion of undergraduate research projects and joint mentoring"),
      lt("仪器使用培训材料和实验记录规范", "Instrument learning materials and laboratory record standards"),
      lt("数据命名、备份和基础分析", "Data naming, backup, and basic analysis"),
    ],
    partnerShouldProvide: [
      lt("活动属于科研、教学、学生训练还是工程开发", "Whether the activity is research, teaching, student training, or engineering development"),
      lt("培养对象、教学对象或使用场景", "Culture organism, learners, or use context"),
      lt("现有设备、传感器和数据接口情况", "Existing equipment, sensors, and data interfaces"),
      lt("希望记录或控制的变量", "Variables proposed for recording or control"),
      lt("原型边界、周期和验证目标", "Prototype scope, time frame, and validation objective"),
      lt("安全、数据和设备管理要求", "Safety, data, and equipment-management requirements"),
    ],
    teamMayContribute: [
      lt("可讨论监测需求、数据字段和记录规范", "Monitoring needs, data fields, and record standards may be discussed"),
      lt("可根据现有条件评估传感器与培养系统原型", "Sensor and culture-system prototypes may be assessed against available conditions"),
      lt("可讨论实验教学材料和学生科研任务结构", "Laboratory learning materials and student research structures may be discussed"),
      lt("可共同明确原型测试、版本记录和后续改进边界", "Prototype testing, version records, and the scope of later refinement may be defined jointly"),
    ],
    relatedResearchIds: ["microalgae", "live-feeds"],
    relatedRoutes: ["tutorials", "live-feeds"],
    status: "open-for-discussion",
    caveat: lt(
      "科研合作、教学交流、学生训练和工程开发需分别评估。简单原型不应被视为成熟工业控制系统。",
      "Research, teaching exchange, student training, and engineering development require separate assessment. A simple prototype should not be represented as a mature industrial control system.",
    ),
    review: draftReview(),
  },
];

export const collaborationPreparationItems: LocalizedText[] = [
  lt("合作单位和联系人", "Organization and contact person"),
  lt("研究对象或样品类型", "Research organism or sample type"),
  lt("物种或类群名称", "Species or taxonomic-group name"),
  lt("样品来源及鉴定状态", "Sample provenance and identification status"),
  lt("当前面临的问题", "Current problem"),
  lt("希望回答的科学问题", "Scientific question to be addressed"),
  lt("计划开展的实验或采样", "Proposed experiment or sampling activity"),
  lt("已有数据和初步结果", "Existing data and preliminary findings"),
  lt("时间安排", "Proposed schedule"),
  lt("经费或资源情况", "Funding or resource context"),
  lt("数据公开和知识产权要求", "Data-disclosure and intellectual-property requirements"),
  lt("是否涉及活体、野外样品、敏感站位或未发表数据", "Whether live organisms, field samples, sensitive sites, or unpublished data are involved"),
];

export const collaborationPreparationNotice: LocalizedText = lt(
  "本页仅提供初次沟通的信息清单，不设置联系表单，也不要求上传隐私、保密或其他敏感文件。",
  "This page provides an initial-discussion checklist only. It does not include a contact form or request private, confidential, or other sensitive file uploads.",
);

export const collaborationProcess: CollaborationProcessStep[] = [
  {
    id: "question",
    title: lt("提出研究问题", "Define the Research Question"),
    summary: lt("合作方说明研究对象、目标和当前问题。", "The prospective partner describes the organism, objective, and current problem."),
  },
  {
    id: "initial-information",
    title: lt("初步资料沟通", "Initial Information Discussion"),
    summary: lt("双方了解已有数据、样品、设备、周期和预期结果。", "Both sides review existing data, samples, equipment, timing, and expected outputs."),
  },
  {
    id: "feasibility",
    title: lt("条件与可行性评估", "Conditions and Feasibility Assessment"),
    summary: lt(
      "团队根据人员、仪器、样品条件、实验周期和合规要求判断是否适合进一步开展。",
      "The team considers personnel, instruments, sample conditions, timing, and compliance before deciding whether further discussion is appropriate.",
    ),
  },
  {
    id: "arrangements",
    title: lt("明确分工和审批要求", "Define Responsibilities and Approvals"),
    summary: lt("如具备条件，再进一步明确合作安排。", "If conditions are suitable, the collaboration arrangements can be defined further."),
    details: [
      lt("实验方案", "Experimental plan"),
      lt("样品和数据责任", "Sample and data responsibilities"),
      lt("工作分工", "Division of work"),
      lt("经费安排", "Funding arrangements"),
      lt("知识产权", "Intellectual property"),
      lt("论文署名", "Authorship"),
      lt("结果公开", "Disclosure of results"),
      lt("学校审批", "University approval"),
    ],
  },
  {
    id: "execution-records",
    title: lt("开展研究并形成记录", "Conduct Research and Maintain Records"),
    summary: lt(
      "合作正式开始后，保留样品、实验、数据和版本记录。",
      "After approved work begins, maintain sample, experiment, data, and version records.",
    ),
  },
];

export const collaborationApprovalNotice: LocalizedText = lt(
  "网站展示的合作方向不代表合作已经获得批准。具体合作须经团队负责人、相关单位及学校管理要求确认。",
  "The collaboration areas shown on this website do not indicate that a collaboration has been approved. Any specific arrangement remains subject to confirmation by the team lead, relevant organizations, and university management requirements.",
);

export const collaborationBoundaries: CollaborationBoundary[] = [
  {
    id: "information-integrity",
    title: lt("信息真实性", "Information Integrity"),
    summary: lt(
      "所有样品、物种、项目和已有结果应尽可能提供可核实信息。",
      "Samples, organisms, projects, and existing findings should be described with verifiable information wherever possible.",
    ),
  },
  {
    id: "biosafety",
    title: lt("生物安全", "Biosafety"),
    summary: lt(
      "活体藻种、浮游动物、野外样品和潜在有害生物的接收与培养需要提前评估。",
      "Receipt and culture of live algal strains, zooplankton, field samples, and potentially harmful organisms require prior assessment.",
    ),
  },
  {
    id: "data-management",
    title: lt("数据管理", "Data Management"),
    summary: lt("合作开始前应明确数据责任和公开边界。", "Data responsibilities and disclosure boundaries should be defined before work begins."),
    details: [
      lt("数据存储", "Data storage"),
      lt("原始数据归属", "Ownership of raw data"),
      lt("数据访问权限", "Data-access permissions"),
      lt("数据备份", "Data backup"),
      lt("数据公开范围", "Scope of data disclosure"),
    ],
  },
  {
    id: "authorship",
    title: lt("论文和署名", "Papers and Authorship"),
    summary: lt(
      "作者和署名不以提供样品、设备或经费自动决定，应依据实际学术贡献讨论。",
      "Authorship is not determined automatically by providing samples, equipment, or funding; it should be discussed according to actual scholarly contributions.",
    ),
  },
  {
    id: "intellectual-property",
    title: lt("知识产权", "Intellectual Property"),
    summary: lt(
      "涉及专利、未公开工艺、企业数据或保密内容时，应在开展工作前明确。",
      "Patent interests, unpublished processes, organizational data, and confidential content should be addressed before work begins.",
    ),
  },
  {
    id: "results",
    title: lt("结果边界", "Limits of Results"),
    summary: lt(
      "实验结果可能不支持原始假设，团队不承诺获得特定阳性结果。",
      "Experimental findings may not support the original hypothesis, and the team does not promise a particular positive outcome.",
    ),
  },
  {
    id: "public-disclosure",
    title: lt("对外发布", "Public Disclosure"),
    summary: lt(
      "项目名称、合作单位、采样站位、图片和结果是否能在网站公开，需要双方确认。",
      "Both sides must confirm whether project names, partner organizations, sampling sites, images, or findings may be published on the website.",
    ),
  },
];

export const collaborationPageReview: ContentReview = draftReview();
