import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

function assertNavigationLink(markup, navigationLabel, href, linkText) {
  const match = markup.match(
    new RegExp(`<nav\\b[^>]*aria-label="${escapeRegExp(navigationLabel)}"[^>]*>([\\s\\S]*?)<\\/nav>`, "i"),
  );
  assert.ok(match, `navigation labelled ${navigationLabel} should be rendered`);
  assert.match(match[1], new RegExp(`href="${escapeRegExp(href)}"`, "i"));
  assert.match(match[1], new RegExp(escapeRegExp(linkText), "i"));
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
  assert.match(zh, /叶绿素荧光仪/);
  assert.match(zh, /离心机/);
  assert.match(zh, /pH 与盐度测量仪/);
  assert.match(zh, /第一次进入藻类实验室，从这里开始/);
  assert.match(zh, /内容整理中，后续将由团队补充。/);
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

  assert.match(team, /成员信息将在完成内部确认后更新。/);
  assert.match(team, /科研训练理念/);
  assert.match(research, /微藻研究/);
  assert.match(research, /大型海藻研究/);
  assert.match(research, /\/images\/guandaofanyinqi\.jpg/);
  assert.match(micro, /异养、混养与高密度培养/);
  assert.match(micro, /href="\/en\/research\/microalgae"/);
  assert.match(macro, /Macroalgal germplasm resources/);
  assert.match(macro, /\/images\/tidai\.jpg/);
  assert.match(outputs, /相关成果正在整理与核实，正式信息将在确认后更新。/);
  assert.match(tutorials, /第一次进入藻类实验室，从这里开始/);
  assert.match(tutorial, /详细流程等待实验室审核后发布。/);
  assert.match(tutorial, /不替代仪器说明书、实验室安全培训和现场指导/);
  assert.doesNotMatch(tutorial, /rpm|转\/分|nm|µL|mL\/min|具体型号/i);
  assert.match(news, /团队动态正在整理中。/);
  assert.match(about, /Algae Atlas/);
  assert.match(about, /用户提供/);
  assert.match(about, /使用范围待确认/);
  assert.match(about, /CSIRO/);
  assert.doesNotMatch(about, /NOAA Corps Collection|U\.S\. Department of Energy|NASA GSFC/);
  assert.match(contact, /<dt>所属单位<\/dt><dd>广东海洋大学<\/dd>/);
  assert.match(contact, /团队公共邮箱/);
  assert.match(contact, /待补充/);
  assert.doesNotMatch(contact, /mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
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
  for (const pathname of ["/zh/not-a-real-page", "/zh/research/not-real", "/zh/tutorials/not-real", "/zh/algae/not-real", "/zh/live-feeds/not-real"]) {
    const response = await render(pathname);
    assert.equal(response.status, 404, `${pathname} should return 404`);
  }
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
