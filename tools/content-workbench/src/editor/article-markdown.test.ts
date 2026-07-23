import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, test } from "vitest";
import { createArticleExtensions } from "./article-extensions";
import {
  isSafeArticleLink,
  normalizePastedText,
  prepareArticleMarkdown,
  sanitizePastedHtml,
} from "./article-markdown";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("article paste cleanup", () => {
  test("removes paragraph indentation, tabs, BOM, CRLF and excessive blank lines", () => {
    expect(
      normalizePastedText(
        "\uFEFF　 段落一\r\n\t段落二\r\n\r\n\r\n\r\n\u00a0段落三\t内容",
      ),
    ).toBe("段落一\n段落二\n\n段落三 内容");
  });

  test("keeps semantic content while stripping Word styles and active HTML", () => {
    const cleaned = sanitizePastedHtml(`
      <style>.payload { display: block }</style>
      <h1 style="color:red">　正文标题</h1>
      <p class="MsoNormal" style="font-weight: 700" onclick="alert(1)">
       　段落 <span style="font-style: italic">Ulva lactuca</span>
        <script>alert(2)</script>
        <a href="javascript:alert(3)">危险链接</a>
        <a href="https://example.invalid/source" target="_self">安全链接</a>
      </p>
      <iframe src="https://example.invalid/embed"></iframe>
      <object data="https://example.invalid/object"></object>
      <embed src="https://example.invalid/embed">
      <form><input name="payload"></form>
      <svg onload="alert(4)"></svg>
      <img src="data:text/html,payload" alt="远程图片">
      <img src="media:fictional-image" alt="显微图">
    `);

    expect(cleaned).toContain("<h2>正文标题</h2>");
    expect(cleaned).toContain("<strong>");
    expect(cleaned).toContain("<em>Ulva lactuca</em>");
    expect(cleaned).toContain('<a href="https://example.invalid/source">安全链接</a>');
    expect(cleaned).toContain("[图片：远程图片]");
    expect(cleaned).toContain('data-media-id="fictional-image"');
    expect(cleaned).not.toMatch(
      /script|iframe|object|embed|form|svg|on(?:click|load)|javascript:|data:text|style=|class=/i,
    );
  });
});

describe("article link policy", () => {
  test.each([
    "https://example.invalid/source",
    "/zh/research/fictional-item",
    "#methods",
  ])("accepts %s", (value) => {
    expect(isSafeArticleLink(value)).toBe(true);
  });

  test.each([
    "http://example.invalid",
    "javascript:alert(1)",
    "java&#x73;cript&colon;alert(1)",
    "data:text/html,payload",
    "file:///C:/secret.txt",
    "//example.invalid/path",
    "\\\\server\\share",
    "https://user:password@example.invalid",
    "https://example.invalid/with space",
    "ｊａｖａｓｃｒｉｐｔ：alert(1)",
    "java&#x110000;script:alert(1)",
  ])("rejects %s", (value) => {
    expect(isSafeArticleLink(value)).toBe(false);
  });
});

describe("safe Markdown serialization", () => {
  test("round-trips every supported article structure deterministically", () => {
    const source = [
      "## 形态观察",
      "",
      "正文包含 **加粗**、*Ulva lactuca*、H~2~O 和 m^2^。",
      "",
      "- 项目一",
      "- 项目二",
      "",
      "> 引用内容",
      "",
      "[安全来源](https://example.invalid/source)",
      "",
      "| 名称 | 数值 |",
      "| --- | --- |",
      "| 盐度 | 30 |",
      "",
      "![显微图](media:fictional-image)",
      "",
    ].join("\n");
    const first = createEditor(source);
    const serialized = prepareArticleMarkdown(first.getMarkdown());

    expect(serialized.issues).toEqual([]);
    expect(serialized.markdown).toContain("## 形态观察\n");
    expect(serialized.markdown).toContain("*Ulva lactuca*");
    expect(serialized.markdown).toContain("H~2~O");
    expect(serialized.markdown).toContain("m^2^");
    expect(serialized.markdown).toMatch(/\| 名称\s+\| 数值\s+\|/);
    expect(serialized.markdown).toContain("![显微图](media:fictional-image)");
    expect(serialized.markdown).not.toMatch(/<\/?[a-z][^>]*>/i);

    const second = createEditor(serialized.markdown);
    expect(prepareArticleMarkdown(second.getMarkdown())).toEqual(serialized);
  });

  test("drops unsafe image and link targets during parsing", () => {
    const editor = createEditor(
      "[危险](javascript:alert(1)) ![远程](https://example.invalid/image.png)",
    );
    const output = prepareArticleMarkdown(editor.getMarkdown());

    expect(output.issues).toEqual([]);
    expect(output.markdown).toContain("危险");
    expect(output.markdown).toContain("远程");
    expect(output.markdown).not.toMatch(/javascript:|https:\/\/example\.invalid\/image/i);
  });

  test("reports executable Markdown that cannot be safely serialized", () => {
    const result = prepareArticleMarkdown(
      "# 一级标题\n\n<script>alert(1)</script>\n\n${payload}\n",
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "MARKDOWN_HEADING_LEVEL_INVALID",
        "MARKDOWN_RAW_HTML_FORBIDDEN",
        "MARKDOWN_EXECUTABLE_SYNTAX_FORBIDDEN",
      ]),
    );
  });
});

function createEditor(markdown: string): Editor {
  const editor = new Editor({
    extensions: createArticleExtensions(),
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}
