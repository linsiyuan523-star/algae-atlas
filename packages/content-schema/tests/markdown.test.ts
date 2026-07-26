import assert from "node:assert/strict";
import test from "node:test";

import { validateMarkdown } from "../src/index";
import { validMarkdownFixture } from "../fixtures/index";

test("安全 Markdown profile 通过", () => {
  assert.deepEqual(validateMarkdown(validMarkdownFixture), []);
  assert.deepEqual(validateMarkdown("## Data\n\nData: collected offline."), []);
});

const unsafeMarkdownCases: Array<[string, string, string]> = [
  ["raw HTML", "<script>alert(1)</script>", "MARKDOWN_RAW_HTML_FORBIDDEN"],
  ["javascript URL", "[x](java&#x73;cript:alert(1))", "MARKDOWN_UNSAFE_URL"],
  ["data URL", "![x](data:text/html;base64,QQ==)", "MARKDOWN_UNSAFE_URL"],
  ["raw image path", "![x](../secret.jpg)", "MARKDOWN_MEDIA_REFERENCE_INVALID"],
  ["MDX import", 'import x from "./secret"', "MARKDOWN_EXECUTABLE_SYNTAX_FORBIDDEN"],
  ["level-one heading", "# Title", "MARKDOWN_HEADING_LEVEL_INVALID"],
];

for (const [name, markdown, code] of unsafeMarkdownCases) {
  test(`${name} 被拒绝`, () => {
    const issues = validateMarkdown(markdown, {
      path: "fixture.md",
      recordId: "fictional-markdown-fixture",
      locale: "zh",
    });
    assert.ok(issues.some((issue) => issue.code === code), JSON.stringify(issues));
    assert.ok(issues.every((issue) => issue.path === "fixture.md"));
  });
}

test("图片仅允许稳定 media ID", () => {
  assert.deepEqual(validateMarkdown("![替代文本](media:fictional-cover-image)"), []);
});
