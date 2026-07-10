import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("redirects the root route to the Chinese site", async () => {
  const response = await render("/");
  assert.ok([307, 308].includes(response.status));
  assert.match(response.headers.get("location") ?? "", /\/zh$/);
});

test("renders complete Chinese and English home pages", async () => {
  const [zhResponse, enResponse] = await Promise.all([render("/zh"), render("/en")]);
  assert.equal(zhResponse.status, 200);
  assert.equal(enResponse.status, 200);

  const [zh, en] = await Promise.all([zhResponse.text(), enResponse.text()]);
  assert.match(zh, /<html[^>]*lang="zh-CN"/i);
  assert.match(zh, /从一滴水/);
  assert.match(zh, /进入藻类图鉴/);
  assert.match(zh, /href="\/en"/);

  assert.match(en, /<html[^>]*lang="en"/i);
  assert.match(en, /A universe/);
  assert.match(en, /Explore the library/);
  assert.match(en, /href="\/zh"/);
  assert.doesNotMatch(`${zh}${en}`, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders a localized algae detail and rejects unknown pages", async () => {
  const detailResponse = await render("/zh/algae/chlorella-vulgaris");
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.text();
  assert.match(detail, /小球藻/);
  assert.match(detail, /Chlorella vulgaris/);
  assert.match(detail, /返回图鉴/);

  const missingResponse = await render("/zh/not-a-real-page");
  assert.equal(missingResponse.status, 404);
});

test("removes all disposable starter assets", async () => {
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /react-loading-skeleton|site-creator-vinext-starter/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
