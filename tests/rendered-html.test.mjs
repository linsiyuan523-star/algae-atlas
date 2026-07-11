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
  assert.match(micro, /异养、混养与高密度培养/);
  assert.match(micro, /href="\/en\/research\/microalgae"/);
  assert.match(macro, /Macroalgal germplasm resources/);
  assert.match(outputs, /相关成果正在整理与核实，正式信息将在确认后更新。/);
  assert.match(tutorials, /第一次进入藻类实验室，从这里开始/);
  assert.match(tutorial, /详细流程等待实验室审核后发布。/);
  assert.match(tutorial, /不替代仪器说明书、实验室安全培训和现场指导/);
  assert.doesNotMatch(tutorial, /rpm|转\/分|nm|µL|mL\/min|具体型号/i);
  assert.match(news, /团队动态正在整理中。/);
  assert.match(about, /Algae Atlas/);
  assert.match(about, /NOAA Corps Collection/);
  assert.match(about, /U\.S\. Department of Energy/);
  assert.match(about, /CSIRO/);
  assert.match(about, /NASA GSFC/);
  assert.match(contact, /<dt>所属单位<\/dt><dd>广东海洋大学<\/dd>/);
  assert.match(contact, /团队公共邮箱/);
  assert.match(contact, /待补充/);
  assert.doesNotMatch(contact, /mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test("preserves the bilingual Algae Atlas, filters, details, and language paths", async () => {
  const [library, filtered, detail] = await Promise.all([
    html("/zh/algae"),
    html("/zh/algae?type=marine"),
    html("/zh/algae/chlorella-vulgaris"),
  ]);
  assert.match(library, /藻类图鉴：认识我们的研究对象/);
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
  for (const pathname of ["/zh/not-a-real-page", "/zh/research/not-real", "/zh/tutorials/not-real", "/zh/algae/not-real"]) {
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
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
