import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function html(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, `${pathname} should render successfully`);
  return response.text();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function navigationMarkup(markup, navigationLabel) {
  const match = markup.match(
    new RegExp(`<nav\\b[^>]*aria-label="${escapeRegExp(navigationLabel)}"[^>]*>([\\s\\S]*?)<\\/nav>`, "i"),
  );
  assert.ok(match, `navigation labelled ${navigationLabel} should be rendered`);
  return match[1];
}

function assertNavigationLink(markup, navigationLabel, href, linkText) {
  const navigation = navigationMarkup(markup, navigationLabel);
  assert.match(navigation, new RegExp(`href="${escapeRegExp(href)}"`, "i"));
  assert.match(navigation, new RegExp(escapeRegExp(linkText), "i"));
}

function assertHtmlTag(markup, tagName, attributes) {
  const tags = markup.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  const matches = tags.some((tag) =>
    Object.entries(attributes).every(([name, value]) =>
      new RegExp(`\\b${escapeRegExp(name)}="${escapeRegExp(value)}"`, "i").test(tag),
    ),
  );
  assert.ok(matches, `<${tagName}> should contain ${JSON.stringify(attributes)}`);
}

function uniqueMatches(markup, pattern) {
  return [...new Set([...markup.matchAll(pattern)].map((match) => match[1]))];
}

function assertReviewInformation(markup, locale = "zh") {
  const labels = locale === "zh"
    ? ["内容状态", "最后更新", "实验室审核"]
    : ["Content status", "Last updated", "Laboratory review"];
  labels.forEach((label) => assert.match(markup, new RegExp(escapeRegExp(label), "i")));
}

async function sha256(relativeUrl) {
  const value = await readFile(new URL(relativeUrl, import.meta.url));
  return createHash("sha256").update(value).digest("hex");
}

test("redirects the root route to the Chinese site", async () => {
  const response = await render("/");
  assert.ok([307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/zh$/);
});

test("renders localized home pages with exact team positioning and SEO", async () => {
  const [zh, en] = await Promise.all([html("/zh"), html("/en")]);

  assert.match(zh, /<html[^>]*lang="zh-CN"/i);
  assert.match(zh, /广东海洋大学藻类团队/);
  assert.match(zh, /立足南海/);
  assert.match(zh, /探索.*藻类科学与资源价值/s);
  assert.match(zh, /微藻培养调控、大型海藻资源利用、活性物质开发及水产养殖应用/);
  assert.match(zh, /href="\/zh\/team"/);
  assert.match(zh, /href="\/zh\/research"/);
  assert.match(zh, /href="\/zh\/tutorials"/);
  assert.match(zh, /\/images\/zhutu\.png/);
  assert.match(zh, /<title>广东海洋大学藻类团队｜微藻、大型海藻与实验教学<\/title>/);
  assert.match(zh, /rel="canonical" href="https:\/\/sycszy\.icu\/zh"/i);
  assert.match(zh, /property="og:title" content="广东海洋大学藻类团队｜微藻、大型海藻与实验教学"/i);
  assert.match(zh, /广东海洋大学藻类团队围绕微藻培养调控、大型海藻资源利用、活性物质开发、水产养殖应用及本科生实验训练开展研究与教学。/);
  assert.match(zh, /hreflang="en"[^>]*href="https:\/\/sycszy\.icu\/en"|href="https:\/\/sycszy\.icu\/en"[^>]*hreflang="en"/i);

  assert.match(en, /<html[^>]*lang="en"/i);
  assert.match(en, /Algae Research Team/);
  assert.match(en, /Exploring Algal Science/);
  assert.match(en, /South China Sea/);
  assert.match(en, /Meet the Team/);
  assert.match(en, /<title>Algae Research Team \| Guangdong Ocean University<\/title>/);
  assert.match(en, /Research on microalgae, macroalgae, algal biotechnology, aquaculture applications, and undergraduate laboratory training at Guangdong Ocean University\./);
  assert.match(en, /href="\/zh"/);
});

test("renders the team, research, outputs, tutorial, news, about, and contact routes", async () => {
  const [team, research, micro, macro, outputs, tutorials, tutorial, news, about, contact] = await Promise.all([
    html("/zh/team"),
    html("/zh/research"),
    html("/zh/research/microalgae"),
    html("/en/research/macroalgae"),
    html("/zh/outputs"),
    html("/zh/tutorials"),
    html("/zh/tutorials/spectrophotometer"),
    html("/zh/news"),
    html("/zh/about"),
    html("/zh/contact"),
  ]);

  assert.match(team, /成员资料正在完成公开范围确认。/);
  assert.match(team, /科研训练理念/);
  assert.match(research, /微藻研究/);
  assert.match(research, /大型海藻研究/);
  assert.match(research, /\/images\/guandaofanyinqi\.jpg/);
  assert.match(micro, /异养、混养与高密度培养/);
  assert.match(micro, /href="\/en\/research\/microalgae"/);
  assert.match(macro, /Macroalgal germplasm resources/);
  assert.match(macro, /\/images\/tidai\.jpg/);
  assert.match(outputs, /经核实的论文、专利、项目和学生成果将在确认后更新。/);
  assert.match(tutorials, /第一次进入藻类实验室，从这里开始/);
  assert.match(tutorial, /详细流程等待实验室审核后发布。/);
  assert.match(tutorial, /不替代仪器说明书、实验室安全培训和现场指导/);
  assert.doesNotMatch(tutorial, /rpm|转\/分|nm|µL|mL\/min|具体型号/i);
  assertReviewInformation(tutorial);
  assert.match(news, /采样、实验、会议和学生科研动态将在完成内容审核后发布。/);
  assert.match(about, /Algae Atlas/);
  assert.match(about, /用户提供/);
  assert.match(about, /使用范围待确认/);
  assert.match(about, /CSIRO/);
  assert.doesNotMatch(about, /NOAA Corps Collection|U\.S\. Department of Energy|NASA GSFC/);
  assert.match(contact, /<dt>所属单位<\/dt><dd>广东海洋大学<\/dd>/);
  assert.match(contact, /团队公共邮箱/);
  assert.match(contact, /待补充/);
  assert.match(contact, /合作咨询建议包含的信息/);
  assert.match(contact, /href="\/zh\/collaboration"/);
  assert.match(contact, /回复(?:和|与)审批说明/);
  assert.doesNotMatch(contact, /<(?:form|input|textarea|select)\b/i);
  assert.doesNotMatch(contact, /mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test("renders the bilingual Collaboration page with six complete areas, preparation, process, and boundaries", async () => {
  const [zh, en] = await Promise.all([html("/zh/collaboration"), html("/en/collaboration")]);

  assert.match(zh, /合作与交流/);
  assert.match(zh, /让研究问题转化为可评估的合作方向/);
  assert.match(en, /Collaboration/);
  assert.match(en, /Turning Research Questions into Assessable Collaborations/);

  const areas = [
    ["微藻培养、藻株筛选与培养调控", "Microalgal Cultivation and Strain Evaluation"],
    ["生物饵料、浮游动物与水产苗种应用", "Live Feeds, Zooplankton and Aquaculture Applications"],
    ["近岸藻华、赤潮采样与浮游植物调查", "Coastal Algal Blooms, Red-Tide Sampling and Phytoplankton Surveys"],
    ["大型海藻资源、养殖与近岸生态研究", "Macroalgal Resources, Cultivation and Coastal Ecology"],
    ["水产养殖投喂试验与应用评价", "Aquaculture Feeding Trials and Application Evaluation"],
    ["培养自动化、实验教学与学生科研训练", "Culture Automation, Laboratory Training and Student Research"],
  ];
  areas.forEach(([zhTitle, enTitle]) => {
    assert.match(zh, new RegExp(escapeRegExp(zhTitle)));
    assert.match(en, new RegExp(escapeRegExp(enTitle)));
  });

  for (const label of ["适合的合作对象", "可讨论的问题", "合作方需要准备的信息", "团队可能参与的工作", "相关研究与学习页面"]) {
    const occurrences = zh.match(new RegExp(escapeRegExp(label), "g")) ?? [];
    assert.ok(occurrences.length >= 6, `every collaboration card should include ${label}`);
  }
  assert.ok((zh.match(/准备合作信息/g) ?? []).length >= 6, "every collaboration card should include a preparation action");
  assert.equal((zh.match(/data-status="(?:open-for-discussion|case-by-case|internal-only)"/g) ?? []).length, 6);
  assert.match(zh, /可进一步沟通/);
  assert.match(zh, /需按具体条件评估/);

  assert.match(zh, /为了让第一次沟通更有效，请先准备这些信息/);
  assert.match(en, /Information to Prepare Before an Initial Discussion/);
  assert.match(zh, /合作单位和联系人/);
  assert.match(zh, /是否涉及活体、野外样品、敏感站位或未发表数据/);
  assert.match(zh, /不设置联系表单/);
  assert.doesNotMatch(zh, /<(?:form|input|textarea|select)\b/i);

  const processSteps = ["提出研究问题", "初步资料沟通", "条件与可行性评估", "明确分工和审批要求", "开展研究并形成记录"];
  let previousProcessIndex = -1;
  processSteps.forEach((step) => {
    const currentIndex = zh.indexOf(step);
    assert.ok(currentIndex > previousProcessIndex, `${step} should appear in process order`);
    previousProcessIndex = currentIndex;
  });
  const boundaries = ["信息真实性", "生物安全", "数据管理", "论文和署名", "知识产权", "结果边界", "对外发布"];
  boundaries.forEach((boundary) => assert.match(zh, new RegExp(escapeRegExp(boundary))));
  assert.match(zh, /网站展示的合作方向不代表合作已经获得批准。具体合作须经团队负责人、相关单位及学校管理要求确认。/);

  for (const href of ["/zh/research/microalgae", "/zh/live-feeds", "/zh/research/algal-blooms", "/zh/research/macroalgae", "/zh/tutorials", "/zh/algae"]) {
    assert.match(zh, new RegExp(`href="${escapeRegExp(href)}"`));
  }
  assert.match(zh, /暂不公开未经双方确认的合作单位和项目。/);
  assertReviewInformation(zh);
  assertReviewInformation(en, "en");
});

test("renders the bilingual coastal algal-bloom research feature with nine required content areas", async () => {
  const [zh, en] = await Promise.all([
    html("/zh/research/algal-blooms"),
    html("/en/research/algal-blooms"),
  ]);

  assert.match(zh, /近岸藻华与赤潮监测/);
  assert.match(en, /Coastal Algal Blooms and Red-Tide Monitoring/);
  const requiredZhSections = [
    "研究背景",
    "研究对象",
    "关注问题与典型科学问题",
    "采样与研究流程",
    "可记录的现场信息",
    "样品和实验室分析",
    "与藻类图鉴的关联",
    "潜在合作方向",
    "项目和成果",
  ];
  requiredZhSections.forEach((label) => assert.match(zh, new RegExp(escapeRegExp(label))));

  const workflow = ["任务设计", "采样站位与时间记录", "水样和浮游植物采集", "现场环境参数", "样品编号与交接", "显微观察和类群记录", "环境与群落数据分析"];
  let previousWorkflowIndex = -1;
  workflow.forEach((step) => {
    const currentIndex = zh.indexOf(step);
    assert.ok(currentIndex > previousWorkflowIndex, `${step} should appear in workflow order`);
    previousWorkflowIndex = currentIndex;
  });
  assert.match(zh, /“藻华”[\s\S]{0,500}“赤潮”[\s\S]{0,500}“有害藻华”/);
  assert.match(en, /algal bloom[\s\S]{0,600}Red tide[\s\S]{0,600}harmful algal bloom/i);
  assert.match(zh, /三者范围不完全相同，不能相互替代/);
  assert.match(zh, /href="\/zh\/algae"/);
  assert.match(zh, /href="\/zh\/collaboration#algal-blooms"/);
  assert.match(zh, /采样项目、站位和结果将在确认可公开范围后展示。/);
  assert.match(zh, /本栏目展示科研与教学合作方向，不构成官方赤潮预警、水产品安全结论、海洋灾害预报或公众健康建议。相关信息应以主管部门正式发布为准。/);
  assert.match(en, /does not constitute an official red-tide warning, seafood-safety conclusion, marine-hazard forecast, or public-health advice/i);
  assertReviewInformation(zh);
  assertReviewInformation(en, "en");
});

test("uses seven desktop navigation items while retaining every operational entry on mobile", async () => {
  const [zh, en] = await Promise.all([html("/zh/collaboration"), html("/en/collaboration")]);
  const zhDesktop = navigationMarkup(zh, "主导航");
  const enDesktop = navigationMarkup(en, "Primary navigation");
  const zhMobile = navigationMarkup(zh, "手机导航");
  const enMobile = navigationMarkup(en, "Mobile navigation");

  const zhDesktopHrefs = uniqueMatches(zhDesktop, /href="([^"]+)"/g);
  const enDesktopHrefs = uniqueMatches(enDesktop, /href="([^"]+)"/g);
  assert.deepEqual(zhDesktopHrefs, [
    "/zh",
    "/zh/team",
    "/zh/research",
    "/zh/live-feeds",
    "/zh/collaboration",
    "/zh/tutorials",
    "/zh/algae",
  ]);
  assert.deepEqual(enDesktopHrefs, [
    "/en",
    "/en/team",
    "/en/research",
    "/en/live-feeds",
    "/en/collaboration",
    "/en/tutorials",
    "/en/algae",
  ]);
  assert.match(zhDesktop, /合作与联系/);
  assert.match(enDesktop, /Collaboration (?:&|&amp;) Contact/);

  for (const path of ["", "/team", "/research", "/live-feeds", "/collaboration", "/tutorials", "/algae", "/outputs", "/news", "/contact"]) {
    assert.match(zhMobile, new RegExp(`href="${escapeRegExp(`/zh${path}`)}"`));
    assert.match(enMobile, new RegExp(`href="${escapeRegExp(`/en${path}`)}"`));
  }
  assert.match(zh, /href="\/en\/collaboration"/);
  assert.match(en, /href="\/zh\/collaboration"/);
});

test("compresses the home page to three tutorials, three beginner topics, compact outputs, and one collaboration entry", async () => {
  const [zh, en] = await Promise.all([html("/zh"), html("/en")]);

  assert.match(zh, /近岸藻华与赤潮/);
  assert.match(zh, /href="\/zh\/research\/algal-blooms"/);
  assert.match(zh, /实验教学与开放资源/);
  assert.match(en, /Laboratory (?:Teaching|Learning) and Open Resources/i);
  assert.equal(uniqueMatches(zh, /href="\/zh\/tutorials\/([^"#?]+)"/g).length, 3);

  const beginnerTitles = ["实验室安全", "微藻培养基础", "无菌操作基础", "培养基配制", "血球计数板使用基础", "实验记录规范", "数据命名与备份", "仪器预约与使用登记"];
  assert.equal(beginnerTitles.filter((title) => zh.includes(title)).length, 3);
  assert.match(zh, /href="\/zh\/algae"/);

  assert.doesNotMatch(zh, /href="\/zh\/outputs\?category=/);
  assert.match(zh, /经核实的论文、专利、项目和学生成果将在确认后更新。/);
  assert.match(zh, /从明确的问题开始合作/);
  assert.match(en, /Collaboration Starts with a Clearly Defined Question/i);
  for (const label of ["微藻培养", "生物饵料", "赤潮与藻华", "大型海藻", "水产试验", "自动化与教学"]) {
    assert.match(zh, new RegExp(escapeRegExp(label)));
  }
  for (const action of ["查看合作方向", "准备合作信息", "联系团队"]) {
    assert.match(zh, new RegExp(escapeRegExp(action)));
  }
  assert.doesNotMatch(zh, /微藻培养、藻株筛选与培养调控/);

  const outputsIndex = zh.indexOf("经核实的论文、专利、项目和学生成果将在确认后更新。");
  const collaborationIndex = zh.indexOf("从明确的问题开始合作");
  assert.ok(outputsIndex >= 0 && collaborationIndex > outputsIndex, "the compact outputs/news status should precede the home collaboration entry");
});

test("uses distinct exact empty states without stacking large placeholders", async () => {
  const [team, outputs, news, collaboration, blooms] = await Promise.all([
    html("/zh/team"),
    html("/zh/outputs"),
    html("/zh/news"),
    html("/zh/collaboration"),
    html("/zh/research/algal-blooms"),
  ]);

  assert.match(team, /成员资料正在完成公开范围确认。/);
  assert.match(outputs, /经核实的论文、专利、项目和学生成果将在确认后更新。/);
  assert.match(news, /采样、实验、会议和学生科研动态将在完成内容审核后发布。/);
  assert.match(collaboration, /暂不公开未经双方确认的合作单位和项目。/);
  assert.match(blooms, /采样项目、站位和结果将在确认可公开范围后展示。/);

  for (const [name, page] of [["team", team], ["outputs", outputs], ["news", news], ["collaboration", collaboration], ["algal blooms", blooms]]) {
    const largeEmptyStates = (page.match(/class="[^"]*\bempty-state\b[^"]*"/g) ?? []).length;
    assert.ok(largeEmptyStates <= 1, `${name} should not stack multiple large empty states`);
  }
});

test("publishes one unified content-review model across scientific content types", async () => {
  const [algae, liveFeed, tutorial, collaboration, bloom, microalgae] = await Promise.all([
    html("/zh/algae/chlorella-vulgaris"),
    html("/zh/live-feeds/rotifers"),
    html("/zh/tutorials/spectrophotometer"),
    html("/zh/collaboration"),
    html("/zh/research/algal-blooms"),
    html("/zh/research/microalgae"),
  ]);
  for (const page of [algae, liveFeed, tutorial, collaboration, bloom, microalgae]) {
    assertReviewInformation(page);
    assert.match(page, /\b20\d{2}-\d{2}-\d{2}\b/);
  }

  const dataFiles = [
    "../lib/site-data.ts",
    "../lib/team-data.ts",
    "../lib/live-feeds-data.ts",
    "../lib/collaboration-data.ts",
    "../lib/research-capabilities-data.ts",
  ];
  const sources = await Promise.all(dataFiles.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.match(source, /\breview\s*:\s*(?:ContentReview|createContentReview|draftReview|\{)/);
    assert.doesNotMatch(source, /export type ContentReview\b/);
    assert.doesNotMatch(source, /\b(?:author|reviewer)\s*:\s*["'`][^"'`]+["'`]/);
  }
  const sharedReview = await readFile(new URL("../lib/content-review.ts", import.meta.url), "utf8");
  assert.match(sharedReview, /status:\s*ReviewStatus/);
  assert.match(sharedReview, /updatedAt:\s*string/);
  assert.match(sharedReview, /reviewedAt\?:\s*string/);
  assert.match(sharedReview, /references\?:\s*ReferenceItem\[\]/);
});

test("shows a common research-capability structure for microalgae, macroalgae, Live Feeds, and algal blooms", async () => {
  const pages = [
    [await html("/zh/research/microalgae"), "/zh/collaboration#microalgae"],
    [await html("/zh/research/macroalgae"), "/zh/collaboration#macroalgae"],
    [await html("/zh/live-feeds"), "/zh/collaboration#live-feeds"],
    [await html("/zh/research/algal-blooms"), "/zh/collaboration#algal-blooms"],
  ];
  const capabilityLabels = ["研究对象", "典型科学问题", "常用研究方法", "可讨论的资源与条件", "可讨论的合作方向"];
  for (const [page, collaborationHref] of pages) {
    capabilityLabels.forEach((label) => assert.match(page, new RegExp(escapeRegExp(label))));
    assert.match(page, new RegExp(`href="${escapeRegExp(collaborationHref)}"`));
    assertReviewInformation(page);
    assert.doesNotMatch(page, /https?:\/\/doi\.org\/|(?:doi|项目编号)\s*[:：]/i);
  }
  assert.match(pages[0][0], /代表项目与成果|项目和成果/);
  assert.match(pages[1][0], /代表项目与成果|项目和成果/);
});

test("renders the bilingual Live Feeds landing page and all three group details", async () => {
  const slugs = ["rotifers", "copepods", "cladocerans"];
  const [zh, en, ...details] = await Promise.all([
    html("/zh/live-feeds"),
    html("/en/live-feeds"),
    ...slugs.flatMap((slug) => [html(`/zh/live-feeds/${slug}`), html(`/en/live-feeds/${slug}`)]),
  ]);

  assert.match(zh, /生物饵料/);
  assert.match(zh, /从微藻培养到水产苗种饵料/);
  assert.match(en, /Live Feeds/);
  assert.match(en, /From Microalgae Culture to Aquaculture Live Feeds/);

  const expectedGroups = [
    ["轮虫", "Rotifers", "Rotifera"],
    ["桡足类", "Copepods", "Copepoda"],
    ["枝角类", "Cladocerans", "Cladocera"],
  ];
  expectedGroups.forEach(([zhName, enName, scientificGroup], index) => {
    const zhDetail = details[index * 2];
    const enDetail = details[index * 2 + 1];
    assert.match(zhDetail, new RegExp(zhName));
    assert.match(enDetail, new RegExp(enName));
    assert.match(zhDetail, new RegExp(scientificGroup));
    assert.match(enDetail, new RegExp(scientificGroup));
  });

  const zhLandingSections = [
    "微藻与浮游动物培养的连接",
    "浮游动物高密度培养",
    "微藻饵料与饵料组合",
    "营养强化与营养品质",
    "繁殖、生长与种群动态",
    "水质、环境与微生物管理",
    "水产苗种投喂与应用评价",
    "本科生培养学习入口",
    "详细参数与操作流程须经实验室审核后发布。本页面不能替代现场培训和正式实验方案。",
  ];
  const enLandingSections = [
    "Connecting microalgae and zooplankton culture",
    "High-Density Zooplankton Culture",
    "Microalgal Diets and Feed Combinations",
    "Nutritional Enrichment and Feed Quality",
    "Reproduction, Growth and Population Dynamics",
    "Water Quality, Environment and Microbial Management",
    "Larval Feeding and Application Evaluation",
    "Culture-learning entry points for undergraduates",
  ];
  zhLandingSections.forEach((label) => assert.match(zh, new RegExp(escapeRegExp(label))));
  enLandingSections.forEach((label) => assert.match(en, new RegExp(escapeRegExp(label))));
  assert.match(zh, /href="\/zh\/research\/microalgae"/);
  assert.match(zh, /href="\/zh\/algae"/);
  assert.match(zh, /href="#guides"/);

  const zhDetailSections = ["基本认识", "形态与生活史", "栖息环境", "摄食特点与生态作用", "培养关注因素", "水产养殖与研究应用", "团队研究关注点", "常见误区与应用边界", "相关教程", "相关团队成果"];
  const enDetailSections = ["Overview", "Morphology and Life History", "Environment", "Feeding Traits and Ecological Role", "Culture Factors", "Aquaculture and Research Applications", "Team Research Interests", "Common Misconceptions and Boundaries", "Related Guides", "Related Team Outputs"];
  for (const detail of [details[0], details[2], details[4]]) {
    zhDetailSections.forEach((label) => assert.match(detail, new RegExp(escapeRegExp(label))));
  }
  for (const detail of [details[1], details[3], details[5]]) {
    enDetailSections.forEach((label) => assert.match(detail, new RegExp(escapeRegExp(label))));
  }
});

test("integrates Live Feeds without weakening the two established algae research areas", async () => {
  const [zhHome, enHome, zhTeam, enTeam, zhResearch, enResearch] = await Promise.all([
    html("/zh"),
    html("/en"),
    html("/zh/team"),
    html("/en/team"),
    html("/zh/research"),
    html("/en/research"),
  ]);

  assert.match(zhHome, /连接微藻培养与水产苗种的生物饵料研究/);
  assert.match(zhHome, /探索生物饵料/);
  assert.match(zhHome, /查看培养教程/);
  assert.match(enHome, /Live Feed Research Connecting Microalgae and Aquaculture/);
  assert.match(enHome, /Explore Live Feeds/);

  const zhPositioning = "除微藻与大型海藻研究外，团队还开展轮虫、桡足类和枝角类等浮游动物的培养与应用研究，关注微藻饵料、营养调控及水产苗种生物饵料供应。";
  const enPositioning = "In addition to microalgae and macroalgae, the team studies the culture and application of rotifers, copepods, cladocerans, and other zooplankton used as live feeds in aquaculture.";
  assert.match(zhTeam, new RegExp(escapeRegExp(zhPositioning)));
  assert.match(zhResearch, new RegExp(escapeRegExp(zhPositioning)));
  assert.match(enTeam, new RegExp(escapeRegExp(enPositioning)));
  assert.match(enResearch, new RegExp(escapeRegExp(enPositioning)));

  assert.match(zhResearch, /微藻研究/);
  assert.match(zhResearch, /大型海藻研究/);
  assert.match(enResearch, /Microalgae Research/);
  assert.match(enResearch, /Macroalgae Research/);
});

test("includes Live Feeds in desktop and mobile navigation and preserves language paths", async () => {
  const [zh, en, zhDetail, enDetail] = await Promise.all([
    html("/zh/live-feeds"),
    html("/en/live-feeds"),
    html("/zh/live-feeds/rotifers"),
    html("/en/live-feeds/rotifers"),
  ]);

  assertNavigationLink(zh, "主导航", "/zh/live-feeds", "生物饵料");
  assertNavigationLink(zh, "手机导航", "/zh/live-feeds", "生物饵料");
  assertNavigationLink(en, "Primary navigation", "/en/live-feeds", "Live Feeds");
  assertNavigationLink(en, "Mobile navigation", "/en/live-feeds", "Live Feeds");
  assert.match(zhDetail, /href="\/en\/live-feeds\/rotifers"/);
  assert.match(enDetail, /href="\/zh\/live-feeds\/rotifers"/);
});

test("publishes correct Live Feeds metadata, canonical URLs, and language alternates", async () => {
  const [zh, en, zhDetail] = await Promise.all([
    html("/zh/live-feeds"),
    html("/en/live-feeds"),
    html("/zh/live-feeds/rotifers"),
  ]);

  assert.match(zh, /<title>生物饵料与浮游动物｜广东海洋大学藻类团队<\/title>/);
  assertHtmlTag(zh, "meta", {
    name: "description",
    content: "介绍团队在轮虫、桡足类、枝角类、微藻饵料、浮游动物培养及水产苗种应用方面的研究与实验教学。",
  });
  assert.match(en, /<title>Live Feeds (?:&|&amp;) Zooplankton \| Algae Research Team<\/title>/);
  assertHtmlTag(en, "meta", {
    name: "description",
    content: "Research and laboratory training on rotifers, copepods, cladocerans, microalgal diets, zooplankton culture, and aquaculture live-feed applications.",
  });

  for (const [markup, locale] of [[zh, "zh"], [en, "en"]]) {
    assertHtmlTag(markup, "link", { rel: "canonical", href: `https://sycszy.icu/${locale}/live-feeds` });
    assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "zh-CN", href: "https://sycszy.icu/zh/live-feeds" });
    assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "en", href: "https://sycszy.icu/en/live-feeds" });
    assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "x-default", href: "https://sycszy.icu/zh/live-feeds" });
  }

  assertHtmlTag(zhDetail, "link", { rel: "canonical", href: "https://sycszy.icu/zh/live-feeds/rotifers" });
  assertHtmlTag(zhDetail, "link", {
    rel: "alternate",
    hreflang: "en",
    href: "https://sycszy.icu/en/live-feeds/rotifers",
  });
  assert.doesNotMatch(zh, /<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+zhutu\.png/i);
});

test("publishes canonical and language alternates for every Live Feeds detail", async () => {
  for (const slug of ["rotifers", "copepods", "cladocerans"]) {
    for (const locale of ["zh", "en"]) {
      const markup = await html(`/${locale}/live-feeds/${slug}`);
      const suffix = `/live-feeds/${slug}`;
      assertHtmlTag(markup, "link", { rel: "canonical", href: `https://sycszy.icu/${locale}${suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "zh-CN", href: `https://sycszy.icu/zh${suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "en", href: `https://sycszy.icu/en${suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "x-default", href: `https://sycszy.icu/zh${suffix}` });
    }
  }
});

test("lists every bilingual Live Feeds route in the sitemap", async () => {
  const response = await render("/sitemap.xml");
  assert.equal(response.status, 200);
  const sitemap = await response.text();
  for (const locale of ["zh", "en"]) {
    for (const suffix of ["live-feeds", "live-feeds/rotifers", "live-feeds/copepods", "live-feeds/cladocerans"]) {
      assert.match(sitemap, new RegExp(escapeRegExp(`https://sycszy.icu/${locale}/${suffix}`)));
    }
  }
  assert.match(sitemap, /hreflang="x-default"/);
});

test("publishes canonical, language alternates, and sitemap entries for Collaboration and algal blooms", async () => {
  const routes = [
    { suffix: "/collaboration", zhTitle: "合作与交流", enTitle: "Collaboration" },
    { suffix: "/research/algal-blooms", zhTitle: "近岸藻华与赤潮监测", enTitle: "Coastal Algal Blooms and Red-Tide Monitoring" },
  ];

  for (const route of routes) {
    const [zh, en] = await Promise.all([html(`/zh${route.suffix}`), html(`/en${route.suffix}`)]);
    assert.match(zh, new RegExp(`<title>[^<]*${escapeRegExp(route.zhTitle)}[^<]*<\\/title>`));
    assert.match(en, new RegExp(`<title>[^<]*${escapeRegExp(route.enTitle)}[^<]*<\\/title>`, "i"));
    for (const [markup, locale] of [[zh, "zh"], [en, "en"]]) {
      assertHtmlTag(markup, "link", { rel: "canonical", href: `https://sycszy.icu/${locale}${route.suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "zh-CN", href: `https://sycszy.icu/zh${route.suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "en", href: `https://sycszy.icu/en${route.suffix}` });
      assertHtmlTag(markup, "link", { rel: "alternate", hreflang: "x-default", href: `https://sycszy.icu/zh${route.suffix}` });
    }
    assert.match(zh, new RegExp(`href="${escapeRegExp(`/en${route.suffix}`)}"`));
    assert.match(en, new RegExp(`href="${escapeRegExp(`/zh${route.suffix}`)}"`));
  }

  const response = await render("/sitemap.xml");
  assert.equal(response.status, 200);
  const sitemap = await response.text();
  for (const locale of ["zh", "en"]) {
    for (const route of routes) {
      assert.match(sitemap, new RegExp(escapeRegExp(`https://sycszy.icu/${locale}${route.suffix}`)));
    }
  }
  assert.match(sitemap, /hreflang="x-default"/);
});

test("keeps Live Feeds content free of invented parameters and team outputs", async () => {
  const paths = [
    "/zh/live-feeds",
    "/en/live-feeds",
    "/zh/live-feeds/rotifers",
    "/en/live-feeds/rotifers",
    "/zh/live-feeds/copepods",
    "/en/live-feeds/copepods",
    "/zh/live-feeds/cladocerans",
    "/en/live-feeds/cladocerans",
  ];
  const pages = await Promise.all(paths.map(html));
  const rendered = pages.join("\n");
  const liveFeedsDataSource = await readFile(new URL("../lib/live-feeds-data.ts", import.meta.url), "utf8");
  const publicAndPreparedContent = `${rendered}\n${liveFeedsDataSource}`;

  const inventedParameterPatterns = [
    /(?:培养密度|投喂量|盐度|温度|光周期|消毒剂浓度)\s*(?:[:：]|为|是)?\s*-?\d/i,
    /(?:culture density|feeding (?:amount|rate)|salinity|temperature|photoperiod|disinfectant concentration)\s*(?:[:：]|is|of)?\s*-?\d/i,
    /\b\d+(?:\.\d+)?\s*(?:individuals?|rotifers?|copepods?|cladocerans?)\s*\/\s*(?:mL|L)\b/i,
    /\b\d+(?:\.\d+)?\s*(?:mg|g|µg|μg|mL|µL|μL)\s*\/\s*(?:L|mL)\b/i,
    /\b\d+(?:\.\d+)?\s*(?:℃|°C|ppt|PSU|‰)(?![A-Za-z])/i,
    /\b\d+(?:\.\d+)?\s*(?::\s*\d+(?:\.\d+)?)?\s*(?:h|hr|hours?|小时)(?![A-Za-z])/i,
    /(?:消毒剂|漂白水|次氯酸钠|ethanol|bleach|hypochlorite).{0,20}\d+(?:\.\d+)?\s*%/i,
    /(?:氯霉素|青霉素|链霉素|四环素|chloramphenicol|penicillin|streptomycin|tetracycline)/i,
    /(?:最佳|标准)(?:培养|养殖)?条件\s*(?:[:：]|为|是)/i,
    /(?:optimal|best|standard) (?:culture |rearing )?conditions?\s*(?:[:：]|are|is)/i,
  ];
  inventedParameterPatterns.forEach((pattern) => assert.doesNotMatch(publicAndPreparedContent, pattern));
  assert.doesNotMatch(publicAndPreparedContent, /(?:显著|明显)(?:提高|提升).{0,30}(?:成活率|增重率|抗病力|营养品质)/i);
  assert.doesNotMatch(publicAndPreparedContent, /(?:significantly|proven to).{0,40}(?:survival|weight gain|disease resistance|nutritional quality)/i);
  assert.doesNotMatch(publicAndPreparedContent, /已(?:实现|达到)(?:产业化|规模化生产)|(?:achieved|established).{0,24}(?:industrial|commercial-scale|mass production)/i);
  assert.doesNotMatch(publicAndPreparedContent, /https?:\/\/doi\.org\/|(?:doi|项目编号|project (?:number|no\.?))\s*[:：]/i);

  for (const page of [pages[2], pages[4], pages[6]]) {
    assert.match(page, /相关团队成果[\s\S]{0,260}(?:暂无|尚无|待确认|待核实|未提供)/);
  }
  for (const page of [pages[3], pages[5], pages[7]]) {
    assert.match(page, /Related Team (?:Outputs|Results)[\s\S]{0,260}(?:no|none|not yet|pending)/i);
  }
});

test("keeps collaboration and algal-bloom content free of promises, hazardous parameters, and invented entities", async () => {
  const pages = await Promise.all([
    html("/zh/collaboration"),
    html("/en/collaboration"),
    html("/zh/research/algal-blooms"),
    html("/en/research/algal-blooms"),
    html("/zh/contact"),
  ]);
  const sources = await Promise.all([
    readFile(new URL("../lib/collaboration-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-capabilities-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/CollaborationPages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ResearchCapabilityPages.tsx", import.meta.url), "utf8"),
  ]);
  const content = [...pages, ...sources].join("\n");

  assert.doesNotMatch(content, /我们提供|我们保证|一站式服务|解决方案|显著提升|技术领先|成熟产业化|可直接承接|保证达到目标/);
  assert.doesNotMatch(content, /\bwe (?:provide|guarantee)\b|one-stop service|guaranteed (?:result|outcome)|significantly improve|industry-leading|mature industriali[sz]ation|ready to undertake/i);
  assert.doesNotMatch(content, /(?:固定液浓度|采样剂量|采样量|保存剂配方|危险操作)\s*(?:[:：]|为|是)?\s*\d/i);
  assert.doesNotMatch(content, /(?:fixative concentration|sampling (?:quantity|dose)|preservative recipe|hazardous procedure)\s*(?:[:：]|is|of)?\s*\d/i);
  assert.doesNotMatch(content, /(?:甲醛|福尔马林|鲁哥试剂|戊二醛|多聚甲醛|formaldehyde|formalin|Lugol(?:'s)?|glutaraldehyde|paraformaldehyde)/i);
  assert.doesNotMatch(content, /https?:\/\/doi\.org\/|(?:doi|项目编号|project (?:number|no\.?))\s*[:：]/i);
  assert.doesNotMatch(content, /mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(content, /Biological Feed/i);

  const teamData = await readFile(new URL("../lib/team-data.ts", import.meta.url), "utf8");
  assert.match(teamData, /export const teamMembers: TeamMember\[\] = \[\];/);
  assert.match(teamData, /export const outputs: OutputItem\[\] = \[\];/);
  assert.match(teamData, /export const news: NewsEntry\[\] = \[\];/);
  assert.match(pages[0], /暂不公开未经双方确认的合作单位和项目。/);
  assert.match(pages[2], /采样项目、站位和结果将在确认可公开范围后展示。/);
});

test("preserves the bilingual Algae Atlas, filters, details, and language paths", async () => {
  const [library, englishLibrary, filtered, detail] = await Promise.all([
    html("/zh/algae"),
    html("/en/algae"),
    html("/zh/algae?type=marine"),
    html("/zh/algae/chlorella-vulgaris"),
  ]);
  assert.match(library, /藻类图鉴：认识我们的研究对象/);
  assert.match(englishLibrary, /Algae Atlas: Meet Our Research Organisms/);
  assert.match(library, /Nannochloropsis spp\./);
  assert.match(filtered, /三角褐指藻/);
  assert.doesNotMatch(filtered, /Haematococcus pluvialis/);
  assert.match(detail, /小球藻/);
  assert.match(detail, /Chlorella vulgaris/);
  assert.match(detail, /返回图鉴/);
  assert.match(detail, /href="\/en\/algae\/chlorella-vulgaris"/);
});

test("keeps public observation content separate from team news", async () => {
  const [insights, observation] = await Promise.all([
    html("/zh/insights"),
    html("/zh/insights/pond-seasons"),
  ]);
  assert.match(insights, /科普与观察/);
  assert.match(insights, /不代表团队动态、科研项目或成果/);
  assert.match(observation, /不是团队动态、正式科研项目/);
});

test("returns 404 for unknown pages and unknown detail entries", async () => {
  for (const pathname of ["/zh/not-a-real-page", "/zh/research/not-real", "/zh/tutorials/not-real", "/zh/algae/not-real", "/zh/live-feeds/not-real", "/zh/collaboration/not-real"]) {
    const response = await render(pathname);
    assert.equal(response.status, 404, `${pathname} should return 404`);
  }
});

test("keeps the production domain, image binaries, and visible image credits unchanged", async () => {
  const layoutSource = await readFile(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");
  assert.match(layoutSource, /metadataBase:\s*new URL\("https:\/\/sycszy\.icu"\)/);

  const expectedImages = {
    "bloom.jpg": "cc9ef0b009ce2b69104b1e5b0ded048b1b2d7023d9e555064457202aa43aa093",
    "cultures.jpg": "ded6497801766aa2c5728c114e5d31a7331c0f2630a71ce24703c2337fdf1f12",
    "diatoms.jpg": "3028fe3ed4db37afc63f0289f0e70e3f7e9877b925c184b9206ae5ed6b6916bc",
    "guandaofanyinqi.jpg": "54b2026c297103ef9f840e71c37263223b4fd99ea86e934fb59ec41c0df307cd",
    "photobioreactor.jpg": "2e2ed58c355d6badcd14c293dfb28c6f7788e35c1c05277f0d1f0ccd9b075344",
    "tidai.jpg": "224c09bba0846a05830cd145868e283d3d4bb98d467f7e7dbaf8b8959f0f48ac",
    "zhutu.png": "410df6f9b127d1c100bc61a2995959885c5dd9f41e26a0bf1844b1d27abd68eb",
  };
  const imageNames = (await readdir(new URL("../public/images/", import.meta.url))).sort();
  assert.deepEqual(imageNames, Object.keys(expectedImages).sort());
  for (const [file, expectedHash] of Object.entries(expectedImages)) {
    assert.equal(await sha256(`../public/images/${file}`), expectedHash, `${file} should remain byte-for-byte unchanged`);
  }

  const siteData = await readFile(new URL("../lib/site-data.ts", import.meta.url), "utf8");
  const credits = siteData.slice(siteData.indexOf("export const imageCredits"), siteData.indexOf("export function text"));
  assert.equal((credits.match(/\bfile:\s*/g) ?? []).length, 4);
  for (const expectedCredit of [
    "藻类显微主题主图 / Algae microscopy feature image",
    "管道式反应器 / Tubular photobioreactor",
    "Tony Rees / CSIRO",
    "CC BY 3.0 · cropped for presentation",
    "校园猫替代图片 / Campus cat replacement image",
  ]) {
    assert.match(credits, new RegExp(escapeRegExp(expectedCredit)));
  }
  assert.equal((credits.match(/使用范围待确认 \/ Usage scope pending confirmation/g) ?? []).length, 3);
});

test("contains no starter content, preview-stage copy, or prohibited claims", async () => {
  const [zh, team, outputs, news] = await Promise.all([html("/zh"), html("/zh/team"), html("/zh/outputs"), html("/zh/news")]);
  const rendered = `${zh}${team}${outputs}${news}`;
  assert.doesNotMatch(rendered, /codex-preview|Your site is taking shape|react-loading-skeleton|正式联系方式将在发布前补充|官方认证|重点实验室|国家级团队/i);

  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const teamData = await readFile(new URL("../lib/team-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  assert.match(teamData, /export const teamMembers: TeamMember\[\] = \[\];/);
  assert.match(teamData, /export const outputs: OutputItem\[\] = \[\];/);
  assert.match(teamData, /export const news: NewsEntry\[\] = \[\];/);
  await access(new URL("../public/images/tidai.jpg", import.meta.url));
  await access(new URL("../public/images/zhutu.png", import.meta.url));
  await access(new URL("../public/images/guandaofanyinqi.jpg", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
