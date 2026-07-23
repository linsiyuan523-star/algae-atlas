import {
  Bold,
  Columns3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Microscope,
  Quote,
  Redo2,
  Rows3,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table2,
  Trash2,
  Undo2,
  Unlink2,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createArticleExtensions } from "../editor/article-extensions";
import {
  isSafeArticleLink,
  isValidMediaId,
  normalizePastedText,
  prepareArticleMarkdown,
  sanitizePastedHtml,
} from "../editor/article-markdown";

type ArticleEditorProps = {
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (markdown: string, error?: string) => void;
};

type BlockStyle =
  | "paragraph"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6";

export function ArticleEditor({
  value,
  error,
  disabled = false,
  onChange,
}: ArticleEditorProps) {
  const onChangeRef = useRef(onChange);
  const [commandError, setCommandError] = useState<string>();
  const extensions = useMemo(() => createArticleExtensions(), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const reportUpdate = useCallback((activeEditor: Editor) => {
    const prepared = prepareArticleMarkdown(activeEditor.getMarkdown());
    const nextError = prepared.issues[0]?.message;
    setCommandError(undefined);
    onChangeRef.current(prepared.markdown, nextError);
  }, []);

  const editor = useEditor({
    immediatelyRender: true,
    extensions,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        "aria-label": "中文正文编辑区",
        "aria-multiline": "true",
        class: "article-editor-content",
        role: "textbox",
      },
      transformPastedHTML: sanitizePastedHtml,
      transformPastedText: normalizePastedText,
    },
    onUpdate: ({ editor: activeEditor }) => reportUpdate(activeEditor),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const incoming = prepareArticleMarkdown(value).markdown;
    const current = prepareArticleMarkdown(editor.getMarkdown()).markdown;
    if (incoming !== current) {
      editor.commands.setContent(incoming, {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  const blockStyle = activeBlockStyle(editor);
  const displayError = commandError ?? error;

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.view.dom.setAttribute("aria-invalid", String(Boolean(displayError)));
    if (displayError) {
      editor.view.dom.setAttribute("aria-describedby", "article-editor-error");
    } else {
      editor.view.dom.removeAttribute("aria-describedby");
    }
  }, [displayError, editor]);

  function setBlockStyle(style: BlockStyle) {
    if (!editor) {
      return;
    }
    const chain = editor.chain().focus();
    if (style === "paragraph") {
      chain.setParagraph().run();
      return;
    }
    const level = Number(style.slice(-1)) as 2 | 3 | 4 | 5 | 6;
    chain.setHeading({ level }).run();
  }

  function editLink() {
    if (!editor) {
      return;
    }
    const current = String(editor.getAttributes("link").href ?? "");
    const response = window.prompt("链接地址", current || "https://");
    if (response === null) {
      return;
    }
    const href = response.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!isSafeArticleLink(href)) {
      setCommandError("链接仅支持 HTTPS、站内绝对路径或页内锚点。");
      return;
    }
    setCommandError(undefined);
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  function insertMediaPlaceholder() {
    if (!editor) {
      return;
    }
    const mediaId = window.prompt("媒体稳定 ID", "")?.trim();
    if (mediaId === undefined) {
      return;
    }
    if (!isValidMediaId(mediaId)) {
      setCommandError("媒体 ID 必须由小写英文、数字和单个连字符组成。");
      return;
    }
    const alt = window.prompt("中文替代文本", "")?.trim();
    if (alt === undefined) {
      return;
    }
    if (!alt) {
      setCommandError("图片占位必须填写中文替代文本。");
      return;
    }
    setCommandError(undefined);
    editor
      .chain()
      .focus()
      .insertMediaPlaceholder({ mediaId, alt })
      .insertContent(" ")
      .run();
  }

  return (
    <section
      className={`article-editor-field${displayError ? " article-editor-invalid" : ""}`}
      aria-labelledby="article-editor-title"
    >
      <div className="article-editor-heading">
        <h4 id="article-editor-title">中文正文</h4>
      </div>

      <div className="article-editor-toolbar" role="toolbar" aria-label="正文格式">
        <label className="visually-hidden" htmlFor="article-block-style">
          段落格式
        </label>
        <select
          id="article-block-style"
          aria-label="段落格式"
          value={blockStyle}
          disabled={!editor || disabled}
          onChange={(event) => setBlockStyle(event.target.value as BlockStyle)}
        >
          <option value="paragraph">正文</option>
          <option value="heading-2">二级标题</option>
          <option value="heading-3">三级标题</option>
          <option value="heading-4">四级标题</option>
          <option value="heading-5">五级标题</option>
          <option value="heading-6">六级标题</option>
        </select>

        <ToolbarGroup label="文字格式">
          <ToolbarButton
            label="加粗"
            active={editor?.isActive("bold")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="斜体"
            active={editor?.isActive("italic")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="科学名称斜体"
            active={editor?.isActive("italic")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Microscope aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="下标"
            active={editor?.isActive("subscript")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleSubscript().run()}
          >
            <SubscriptIcon aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="上标"
            active={editor?.isActive("superscript")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleSuperscript().run()}
          >
            <SuperscriptIcon aria-hidden="true" size={17} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup label="段落结构">
          <ToolbarButton
            label="无序列表"
            active={editor?.isActive("bulletList")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="有序列表"
            active={editor?.isActive("orderedList")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="引用"
            active={editor?.isActive("blockquote")}
            disabled={!editor || disabled}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote aria-hidden="true" size={17} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup label="链接与图片">
          <ToolbarButton label="设置链接" disabled={!editor || disabled} onClick={editLink}>
            <Link2 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="移除链接"
            disabled={!editor || disabled || !editor.isActive("link")}
            onClick={() => editor?.chain().focus().unsetLink().run()}
          >
            <Unlink2 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="插入图片占位"
            disabled={!editor || disabled}
            onClick={insertMediaPlaceholder}
          >
            <ImagePlus aria-hidden="true" size={17} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup label="表格">
          <ToolbarButton
            label="插入表格"
            disabled={!editor || disabled}
            onClick={() =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            <Table2 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="增加一行"
            disabled={!editor || disabled || !editor.can().addRowAfter()}
            onClick={() => editor?.chain().focus().addRowAfter().run()}
          >
            <Rows3 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="增加一列"
            disabled={!editor || disabled || !editor.can().addColumnAfter()}
            onClick={() => editor?.chain().focus().addColumnAfter().run()}
          >
            <Columns3 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="删除表格"
            disabled={!editor || disabled || !editor.can().deleteTable()}
            onClick={() => editor?.chain().focus().deleteTable().run()}
          >
            <Trash2 aria-hidden="true" size={17} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup label="历史">
          <ToolbarButton
            label="撤销"
            disabled={!editor || disabled || !editor.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 aria-hidden="true" size={17} />
          </ToolbarButton>
          <ToolbarButton
            label="重做"
            disabled={!editor || disabled || !editor.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 aria-hidden="true" size={17} />
          </ToolbarButton>
        </ToolbarGroup>
      </div>

      <EditorContent editor={editor} />
      {displayError ? (
        <span className="field-error" id="article-editor-error" role="alert">
          {displayError}
        </span>
      ) : null}
    </section>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="article-toolbar-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="article-toolbar-button"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function activeBlockStyle(editor: Editor | null): BlockStyle {
  if (editor?.isActive("heading", { level: 2 })) {
    return "heading-2";
  }
  if (editor?.isActive("heading", { level: 3 })) {
    return "heading-3";
  }
  if (editor?.isActive("heading", { level: 4 })) {
    return "heading-4";
  }
  if (editor?.isActive("heading", { level: 5 })) {
    return "heading-5";
  }
  if (editor?.isActive("heading", { level: 6 })) {
    return "heading-6";
  }
  return "paragraph";
}
