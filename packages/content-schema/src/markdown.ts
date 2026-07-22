import type { Locale } from "./constants";
import type { ValidationIssue } from "./issues";
import { STABLE_ID_PATTERN } from "./models";

export const MARKDOWN_PROFILE_VERSION = 1 as const;
export const MAX_MARKDOWN_BYTES = 1_000_000;

function markdownIssue(
  code: string,
  path: string,
  message: string,
  remedy: string,
  recordId?: string,
  locale?: Locale,
): ValidationIssue {
  return {
    code,
    severity: "error",
    ...(recordId ? { recordId } : {}),
    ...(locale ? { locale } : {}),
    path,
    message,
    remedy,
  };
}

function decodeProtocolText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);?/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "")
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
    .toLowerCase();
}

function isSafeLink(destination: string): boolean {
  const normalized = decodeProtocolText(destination);
  return (
    normalized.startsWith("https://") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#")
  );
}

function isMediaReference(destination: string): boolean {
  return (
    destination.startsWith("media:") &&
    STABLE_ID_PATTERN.test(destination.slice("media:".length))
  );
}

export function validateMarkdown(
  markdown: string,
  options: { path?: string; recordId?: string; locale?: Locale } = {},
): ValidationIssue[] {
  const path = options.path ?? "markdown";
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, remedy: string) => {
    issues.push(
      markdownIssue(
        code,
        path,
        message,
        remedy,
        options.recordId,
        options.locale,
      ),
    );
  };

  if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) {
    add(
      "MARKDOWN_TOO_LARGE",
      "Markdown 正文超过允许大小",
      "拆分正文或移除不必要的嵌入内容。",
    );
  }

  if (/^\s*#\s+/m.test(markdown)) {
    add(
      "MARKDOWN_HEADING_LEVEL_INVALID",
      "正文标题必须从二级标题开始",
      "把一级标题改为二级或更低级标题。",
    );
  }

  if (/<\/?[a-z][^>]*>/i.test(markdown)) {
    add(
      "MARKDOWN_RAW_HTML_FORBIDDEN",
      "Markdown 正文不能包含原始 HTML",
      "改用允许的 Markdown 语法表达内容。",
    );
  }

  if (
    /^\s*(?:import|export)\s/m.test(markdown) ||
    /<\/?[A-Z][A-Za-z0-9]*(?:\s|\/?>)/.test(markdown) ||
    /\$\{[^}]*\}/.test(markdown)
  ) {
    add(
      "MARKDOWN_EXECUTABLE_SYNTAX_FORBIDDEN",
      "Markdown 正文不能包含 MDX、JSX、导入或模板执行语法",
      "删除可执行语法，仅保留静态 Markdown 内容。",
    );
  }

  const linkPattern = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const isImage = match[1] === "!";
    const destination = match[2];
    const normalizedDestination = decodeProtocolText(destination);
    const unsafeScheme = ["javascript:", "data:", "file:", "vbscript:"].some(
      (scheme) => normalizedDestination.startsWith(scheme),
    );
    if (unsafeScheme) {
      add(
        "MARKDOWN_UNSAFE_URL",
        "Markdown 包含不安全的 URL 协议",
        "外部链接仅使用 HTTPS；图片使用 media:稳定ID。",
      );
      continue;
    }
    if (isImage ? !isMediaReference(destination) : !isSafeLink(destination)) {
      add(
        isImage ? "MARKDOWN_MEDIA_REFERENCE_INVALID" : "MARKDOWN_LINK_INVALID",
        isImage
          ? "Markdown 图片必须使用 media:稳定ID 引用"
          : "Markdown 链接必须是 HTTPS、站内绝对路径或页内锚点",
        isImage
          ? "把图片目标改为 media:<media-id>。"
          : "把链接改为 HTTPS 或经过网站路由校验的站内路径。",
      );
    }
  }

  return issues;
}
