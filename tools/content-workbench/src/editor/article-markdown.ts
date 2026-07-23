import DOMPurify from "dompurify";
import {
  stableIdSchema,
  validateMarkdown,
} from "@algae-atlas/content-schema";
import type { ValidationIssue } from "@algae-atlas/content-schema";

const ALLOWED_PASTE_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
  "span",
] as const;

const BLOCK_SELECTOR = [
  "p",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "th",
  "td",
].join(",");

const FORBIDDEN_PASTE_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "svg",
  "math",
  "template",
  "meta",
  "link",
] as const;

export type PreparedArticleMarkdown = {
  markdown: string;
  issues: ValidationIssue[];
};

export function normalizePastedText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, " ")
    .split("\n")
    .map((line) => line.replace(/^[ \u00a0\u3000]+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function sanitizePastedHtml(value: string): string {
  const source = new DOMParser().parseFromString(value, "text/html");
  normalizeSemanticStyles(source);
  downgradeTopLevelHeadings(source);
  replacePastedImages(source);

  const sanitized = DOMPurify.sanitize(source.body.innerHTML, {
    ALLOWED_TAGS: [...ALLOWED_PASTE_TAGS],
    ALLOWED_ATTR: ["href", "data-media-placeholder", "data-media-id", "data-media-alt"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [...FORBIDDEN_PASTE_TAGS],
    KEEP_CONTENT: true,
  });
  const document = new DOMParser().parseFromString(String(sanitized), "text/html");

  for (const link of document.body.querySelectorAll("a")) {
    const href = link.getAttribute("href")?.trim() ?? "";
    if (!isSafeArticleLink(href)) {
      link.replaceWith(...Array.from(link.childNodes));
    } else {
      link.setAttribute("href", href);
    }
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    textNode.textContent = textNode.textContent?.replace(/\t+/g, " ") ?? "";
    textNode = walker.nextNode();
  }

  for (const block of document.body.querySelectorAll(BLOCK_SELECTOR)) {
    const firstText = firstTextDescendant(block);
    if (firstText) {
      firstText.textContent =
        firstText.textContent?.replace(/^[ \u00a0\u3000]+/, "") ?? "";
    }
  }

  collapseEmptyTopLevelBlocks(document.body);
  return document.body.innerHTML;
}

export function isSafeArticleLink(value: string): boolean {
  const original = value.trim();
  if (!original || /[\u0000-\u001f\u007f-\u009f\s]/u.test(original)) {
    return false;
  }

  const normalized = decodeProtocolText(original).normalize("NFKC");
  if (normalized.startsWith("https://")) {
    try {
      const parsed = new URL(original);
      return (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        Boolean(parsed.hostname)
      );
    } catch {
      return false;
    }
  }

  if (normalized.startsWith("/")) {
    return !normalized.startsWith("//") && !original.includes("\\");
  }

  return normalized.startsWith("#") && normalized.length > 1;
}

export function isValidMediaId(value: string): boolean {
  return stableIdSchema.safeParse(value).success;
}

export function prepareArticleMarkdown(value: string): PreparedArticleMarkdown {
  const normalized = value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const markdown = normalized ? `${normalized}\n` : "";
  const issues = validateMarkdown(markdown, {
    path: "locales.zh.bodyFile",
    locale: "zh",
  });

  if (markdown.includes("\t")) {
    issues.push({
      code: "MARKDOWN_TAB_FORBIDDEN",
      severity: "error",
      locale: "zh",
      path: "locales.zh.bodyFile",
      message: "中文正文不能包含 Tab 字符",
      remedy: "重新粘贴或删除 Tab，列表缩进由编辑器生成。",
    });
  }

  return { markdown, issues };
}

function decodeProtocolText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      decodeNumericEntity(hex, 16),
    )
    .replace(/&#([0-9]+);?/g, (_, decimal: string) =>
      decodeNumericEntity(decimal, 10),
    )
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "")
    .toLowerCase();
}

function decodeNumericEntity(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "\ufffd";
}

function normalizeSemanticStyles(document: Document) {
  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    const wrappers: string[] = [];
    const weight = element.style.fontWeight.toLowerCase();
    if (weight === "bold" || Number.parseInt(weight, 10) >= 600) {
      wrappers.push("strong");
    }
    if (element.style.fontStyle.toLowerCase() === "italic") {
      wrappers.push("em");
    }
    const verticalAlign = element.style.verticalAlign.toLowerCase();
    if (verticalAlign === "super") {
      wrappers.push("sup");
    } else if (verticalAlign === "sub") {
      wrappers.push("sub");
    }

    for (const tag of wrappers) {
      const wrapper = document.createElement(tag);
      wrapper.append(...Array.from(element.childNodes));
      element.append(wrapper);
    }
  }
}

function downgradeTopLevelHeadings(document: Document) {
  for (const heading of document.body.querySelectorAll("h1")) {
    const replacement = document.createElement("h2");
    replacement.append(...Array.from(heading.childNodes));
    heading.replaceWith(replacement);
  }
}

function replacePastedImages(document: Document) {
  for (const image of document.body.querySelectorAll("img")) {
    const source = image.getAttribute("src")?.trim() ?? "";
    const mediaId = source.startsWith("media:") ? source.slice("media:".length) : "";
    const alt = normalizePastedText(image.getAttribute("alt") ?? "").trim();

    if (isValidMediaId(mediaId)) {
      const placeholder = document.createElement("span");
      placeholder.dataset.mediaPlaceholder = "true";
      placeholder.dataset.mediaId = mediaId;
      placeholder.dataset.mediaAlt = alt;
      placeholder.textContent = alt ? `图片：${alt}` : `图片：${mediaId}`;
      image.replaceWith(placeholder);
    } else if (alt) {
      image.replaceWith(document.createTextNode(`[图片：${alt}]`));
    } else {
      image.remove();
    }
  }
}

function firstTextDescendant(element: Element): Text | null {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function collapseEmptyTopLevelBlocks(body: HTMLElement) {
  let previousWasEmpty = false;
  for (const child of Array.from(body.children)) {
    const isEmpty = !child.textContent?.replace(/[ \u3000\u00a0]/g, "").trim();
    if (isEmpty && previousWasEmpty) {
      child.remove();
      continue;
    }
    previousWasEmpty = isEmpty;
  }
}
