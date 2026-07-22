import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ContentRepositoryLoadError,
  loadContentRepository,
} from "../../lib/content-repository/file-loader";
import { createRecordContentSource } from "../../lib/content-repository/record-source";
import {
  createCollectionSourceSelection,
  createPublicContentRepository,
} from "../../lib/content-repository/repository";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/content-repository/", import.meta.url),
);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

async function withFixture(
  callback: (root: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "algae-content-loader-"));
  const root = path.join(temporaryRoot, "repo");
  await cp(fixtureRoot, root, { recursive: true });
  try {
    await callback(root);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function expectLoadError(
  root: string,
  issueCode: string,
): Promise<ContentRepositoryLoadError> {
  try {
    await loadContentRepository(root);
    assert.fail("loader should fail closed");
  } catch (error) {
    assert.ok(error instanceof ContentRepositoryLoadError);
    assert.ok(error.issues.some((issue) => issue.code === issueCode));
    assert.equal(error.message.includes(root), false, "diagnostics must not expose absolute paths");
    return error;
  }
}

test("文件读取器构建共享快照并按类型、语言、日期和标签查询", async () => {
  const loaded = await loadContentRepository(fixtureRoot);
  assert.equal(loaded.records.length, 2);
  assert.equal(loaded.authors.length, 1);
  assert.equal(loaded.media.length, 0);
  assert.deepEqual(Object.keys(loaded.markdown).sort(), [
    "science-article/fictional-bilingual-article/en.md",
    "science-article/fictional-bilingual-article/zh.md",
    "science-article/fictional-zh-only-article/zh.md",
  ]);

  const repository = createPublicContentRepository({
    selection: createCollectionSourceSelection("records"),
    recordSource: createRecordContentSource(loaded),
  });
  assert.deepEqual(
    repository.list("science-article", "zh").map((entry) => entry.id),
    ["fictional-zh-only-article", "fictional-bilingual-article"],
  );
  assert.deepEqual(
    repository.list("science-article", "en").map((entry) => entry.id),
    ["fictional-bilingual-article"],
  );
  assert.deepEqual(
    repository
      .list("science-article", "zh", { tags: ["bilingual"] })
      .map((entry) => entry.id),
    ["fictional-bilingual-article"],
  );
  assert.equal(
    repository.get("science-article", "fictional-zh-only-article", "en"),
    null,
  );
  assert.deepEqual(
    repository.availability("science-article", "fictional-zh-only-article"),
    {
      zh: true,
      en: false,
      fallbackSection: { zh: "/zh/insights", en: "/en/insights" },
    },
  );
});

test("正式 content 目录存在但不发布测试 fixture", async () => {
  const loaded = await loadContentRepository(repositoryRoot);
  assert.equal(loaded.records.length, 0);
  assert.equal(loaded.authors.length, 0);
  assert.equal(loaded.media.length, 0);
});

test("英文 missing 时出现 en.md 会失败且不回退", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(
        root,
        "content/records/science-article/fictional-zh-only-article/en.md",
      ),
      "## Unexpected English body\n",
      "utf8",
    );
    const error = await expectLoadError(root, "UNEXPECTED_ENGLISH_BODY");
    assert.match(error.message, /fictional-zh-only-article\/en\.md/);
  });
});

test("目录 ID 与 record.json 不一致时给出相对路径诊断", async () => {
  await withFixture(async (root) => {
    const recordPath = path.join(
      root,
      "content/records/science-article/fictional-zh-only-article/record.json",
    );
    const record = JSON.parse(await readFile(recordPath, "utf8")) as Record<
      string,
      unknown
    >;
    record.id = "mismatched-id";
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await expectLoadError(root, "RECORD_PATH_MISMATCH");
  });
});

test("BOM 与 CRLF 被拒绝，错误信息不包含主机绝对路径", async () => {
  await withFixture(async (root) => {
    const recordPath = path.join(
      root,
      "content/records/science-article/fictional-bilingual-article/record.json",
    );
    const source = await readFile(recordPath, "utf8");
    await writeFile(recordPath, `\ufeff${source.replaceAll("\n", "\r\n")}`, "utf8");
    const error = await expectLoadError(root, "CONTENT_UTF8_BOM_FORBIDDEN");
    assert.ok(
      error.issues.some((issue) => issue.code === "CONTENT_LINE_ENDING_INVALID"),
    );
  });
});
