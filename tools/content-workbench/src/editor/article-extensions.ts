import { mergeAttributes, Node } from "@tiptap/core";
import type {
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
} from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { isSafeArticleLink, isValidMediaId } from "./article-markdown";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaPlaceholder: {
      insertMediaPlaceholder: (attributes: {
        mediaId: string;
        alt: string;
      }) => ReturnType;
    };
  }
}

type ImageMarkdownToken = MarkdownToken & {
  href?: string;
  text?: string;
};

const SafeBold = Bold.extend({
  markdownOptions: {},
});

const SafeItalic = Italic.extend({
  markdownOptions: {},
});

const SafeLink = Link.extend({
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const content = helpers.parseInline(token.tokens ?? []);
    const href = typeof token.href === "string" ? token.href : "";
    return isSafeArticleLink(href)
      ? helpers.applyMark("link", content, { href })
      : content;
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    const text = helpers.renderChildren(node);
    const href = typeof node.attrs?.href === "string" ? node.attrs.href : "";
    return isSafeArticleLink(href) ? `[${text}](${escapeLinkTarget(href)})` : text;
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  openOnClick: false,
  isAllowedUri: (url) => isSafeArticleLink(url),
  HTMLAttributes: {
    rel: "noopener noreferrer",
    target: "_blank",
  },
});

const SafeSubscript = Subscript.extend({
  excludes: "superscript",
  markdownTokenName: "subscript",
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark(
      "subscript",
      helpers.parseInline(token.tokens ?? []),
    );
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return `~${helpers.renderChildren(node)}~`;
  },
  markdownTokenizer: inlineDelimitedTokenizer("subscript", "~"),
});

const SafeSuperscript = Superscript.extend({
  excludes: "subscript",
  markdownTokenName: "superscript",
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark(
      "superscript",
      helpers.parseInline(token.tokens ?? []),
    );
  },
  renderMarkdown(node, helpers: MarkdownRendererHelpers) {
    return `^${helpers.renderChildren(node)}^`;
  },
  markdownTokenizer: inlineDelimitedTokenizer("superscript", "^"),
});

export const MediaPlaceholder = Node.create({
  name: "mediaPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: { default: "" },
      alt: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-media-placeholder]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const mediaId = element.dataset.mediaId ?? "";
          return isValidMediaId(mediaId)
            ? { mediaId, alt: element.dataset.mediaAlt ?? "" }
            : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const mediaId = String(node.attrs.mediaId ?? "");
    const alt = String(node.attrs.alt ?? "");
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-media-placeholder": "true",
        "data-media-id": mediaId,
        "data-media-alt": alt,
        class: "article-media-placeholder",
        contenteditable: "false",
      }),
      alt ? `图片：${alt}` : `图片：${mediaId}`,
    ];
  },

  markdownTokenName: "image",

  parseMarkdown(token: ImageMarkdownToken, helpers: MarkdownParseHelpers) {
    const href = token.href ?? "";
    const mediaId = href.startsWith("media:") ? href.slice("media:".length) : "";
    if (!isValidMediaId(mediaId)) {
      return helpers.createTextNode(token.text ?? "");
    }
    return helpers.createNode("mediaPlaceholder", {
      mediaId,
      alt: token.text ?? "",
    });
  },

  renderMarkdown(node) {
    const mediaId = String(node.attrs?.mediaId ?? "");
    if (!isValidMediaId(mediaId)) {
      return "";
    }
    const alt = escapeImageAlt(String(node.attrs?.alt ?? ""));
    return `![${alt}](media:${mediaId})`;
  },

  addCommands() {
    return {
      insertMediaPlaceholder:
        (attributes) =>
        ({ commands }) =>
          isValidMediaId(attributes.mediaId) &&
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    };
  },
});

export function createArticleExtensions() {
  return [
    StarterKit.configure({
      bold: false,
      code: false,
      codeBlock: false,
      heading: { levels: [2, 3, 4, 5, 6] },
      horizontalRule: false,
      italic: false,
      link: false,
      strike: false,
      underline: false,
    }),
    SafeBold,
    SafeItalic,
    SafeLink,
    SafeSubscript,
    SafeSuperscript,
    TableKit.configure({
      table: { resizable: false },
      tableCell: {},
      tableHeader: {},
      tableRow: {},
    }),
    MediaPlaceholder,
    Markdown.configure({
      indentation: { style: "space", size: 2 },
      markedOptions: { gfm: true },
    }),
  ];
}

function inlineDelimitedTokenizer(name: string, delimiter: "~" | "^") {
  const escaped = delimiter === "^" ? "\\^" : "~";
  const matcher = new RegExp(
    `^${escaped}([^\\s${escaped}](?:[^${escaped}\\n]*?[^\\s${escaped}])?)${escaped}`,
  );
  return {
    name,
    level: "inline" as const,
    start: (source: string) => source.indexOf(delimiter),
    tokenize(
      source: string,
      _tokens: MarkdownToken[],
      lexer: { inlineTokens: (value: string) => MarkdownToken[] },
    ) {
      const match = matcher.exec(source);
      if (!match) {
        return undefined;
      }
      const text = match[1];
      return {
        type: name,
        raw: match[0],
        text,
        tokens: lexer.inlineTokens(text),
      };
    },
  };
}

function escapeLinkTarget(value: string): string {
  return value.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function escapeImageAlt(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/[\r\n]+/g, " ")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
