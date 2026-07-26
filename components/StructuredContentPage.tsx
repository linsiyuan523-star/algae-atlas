/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { createElement, Fragment, type ElementType, type ReactNode } from "react";

import { contentTypeRegistry } from "@algae-atlas/content-schema";

import type { PublicRecord } from "@/lib/content-repository/types";

const SAFE_LINK = /\[([^\]]+)\]\((https:\/\/[^)\s]+|\/[^)\s]*|#[^)\s]+)\)/g;

function inlineContent(source: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of source.matchAll(SAFE_LINK)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(source.slice(cursor, start));
    const [, label, href] = match;
    const key = `${keyPrefix}-link-${index}`;
    nodes.push(
      href.startsWith("https://") ? (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <Link key={key} href={href}>
          {label}
        </Link>
      ),
    );
    cursor = start + match[0].length;
    index += 1;
  }
  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes;
}

function tableCells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function markdownTable(lines: string[], key: string): ReactNode | null {
  if (
    lines.length < 2 ||
    !lines[0].includes("|") ||
    !tableCells(lines[1]).every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }
  const headers = tableCells(lines[0]);
  const rows = lines.slice(2).map(tableCells);
  return (
    <div className="table-wrap" key={key}>
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${key}-head-${index}`}>{inlineContent(header, `${key}-head-${index}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${key}-row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}-cell-${rowIndex}-${cellIndex}`}>
                  {inlineContent(cell, `${key}-cell-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function markdownBlock(
  block: string,
  index: number,
  record: PublicRecord,
): ReactNode {
  const key = `markdown-block-${index}`;
  const lines = block.split("\n");
  const heading = block.match(/^(#{2,6})\s+(.+)$/);
  if (heading) {
    const tag = `h${heading[1].length}` as ElementType;
    return createElement(tag, { key }, inlineContent(heading[2], key));
  }

  const media = block.match(/^!\[([^\]]*)\]\(media:([a-z0-9]+(?:-[a-z0-9]+)*)\)$/);
  if (media) {
    const item = record.media[media[2]];
    if (!item) return <Fragment key={key} />;
    const source = item.filePath.startsWith("public/")
      ? item.filePath.slice("public".length)
      : `/${item.filePath}`;
    return (
      <figure key={key}>
        <img src={source} alt={item.alt[record.locale] ?? media[1]} />
        {item.caption?.[record.locale] ? (
          <figcaption>{item.caption[record.locale]}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return (
      <ul key={key}>
        {lines.map((line, itemIndex) => (
          <li key={`${key}-${itemIndex}`}>
            {inlineContent(line.replace(/^[-*]\s+/, ""), `${key}-${itemIndex}`)}
          </li>
        ))}
      </ul>
    );
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return (
      <ol key={key}>
        {lines.map((line, itemIndex) => (
          <li key={`${key}-${itemIndex}`}>
            {inlineContent(line.replace(/^\d+\.\s+/, ""), `${key}-${itemIndex}`)}
          </li>
        ))}
      </ol>
    );
  }
  if (lines.every((line) => /^>\s?/.test(line))) {
    return (
      <blockquote key={key}>
        {inlineContent(lines.map((line) => line.replace(/^>\s?/, "")).join(" "), key)}
      </blockquote>
    );
  }

  const table = markdownTable(lines, key);
  if (table) return table;
  return <p key={key}>{inlineContent(lines.join(" "), key)}</p>;
}

export function StructuredContentPage({ record }: { record: PublicRecord }) {
  const definition = contentTypeRegistry[record.type];
  const sectionPath = definition.sectionPath.replace("[locale]", record.locale);
  const body = record.content.body?.trim() ?? "";
  const authorName =
    record.type === "team-news" &&
    typeof record.content.fields.authorName === "string"
      ? record.content.fields.authorName.trim()
      : "";
  return (
    <article className="article-page structured-content-page">
      <header className="article-header section-shell">
        <Link className="back-link" href={sectionPath}>
          ← {record.locale === "zh" ? "返回栏目" : "Back to section"}
        </Link>
        <p className="eyebrow">{definition.label[record.locale]}</p>
        <h1>{record.content.title}</h1>
        {authorName ? (
          <p className="article-byline">
            {record.locale === "zh" ? "作者" : "Author"}: {authorName}
          </p>
        ) : null}
        <p>{record.content.summary}</p>
      </header>
      <div className="article-body prose">
        <p className="lead">{record.content.summary}</p>
        {body
          ? body.split(/\n{2,}/).map((block, index) => markdownBlock(block, index, record))
          : null}
      </div>
    </article>
  );
}
