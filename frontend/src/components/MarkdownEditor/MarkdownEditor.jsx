import "./MarkdownEditor.css";
import { useRef, useState } from "react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useI18n } from "../../i18n";

const TABLE_SNIPPET = {
  en: "| Col 1 | Col 2 | Col 3 |\n|------|------|------|\n| Data | Data | Data |",
  zh: "| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |",
};

const TOOLS = [
  { label: "B", title: { en: "Bold", zh: "加粗" }, wrap: ["**", "**"], placeholder: { en: "bold text", zh: "加粗文字" } },
  { label: "I", title: { en: "Italic", zh: "斜体" }, wrap: ["*", "*"], placeholder: { en: "italic text", zh: "斜体文字" } },
  { label: "`", title: { en: "Inline code", zh: "行内代码" }, wrap: ["`", "`"], placeholder: { en: "code", zh: "代码" } },
  { label: "```", title: { en: "Code block", zh: "代码块" }, block: true, placeholder: { en: "code block", zh: "代码块" } },
  { label: "H1", title: { en: "Heading 1", zh: "标题 1" }, prefix: "# ", placeholder: { en: "heading", zh: "标题" } },
  { label: "H2", title: { en: "Heading 2", zh: "标题 2" }, prefix: "## ", placeholder: { en: "heading", zh: "标题" } },
  { label: "H3", title: { en: "Heading 3", zh: "标题 3" }, prefix: "### ", placeholder: { en: "heading", zh: "标题" } },
  { label: "—", title: { en: "List item", zh: "列表项" }, prefix: "- ", placeholder: { en: "list item", zh: "列表项" } },
  { label: "🔗", title: { en: "Link", zh: "链接" }, wrap: ["[", "](https://url)"], placeholder: { en: "link text", zh: "链接文本" } },
  { label: "⊞T", title: { en: "Table", zh: "表格" }, snippet: TABLE_SNIPPET },
  { label: "$", title: { en: "Inline math", zh: "行内公式" }, wrap: ["$", "$"], placeholder: { en: "E=mc^2", zh: "E=mc^2" } },
  { label: "$$", title: { en: "Block math", zh: "公式块" }, snippet: { en: "$$\n\n$$", zh: "$$\n\n$$" } },
];

function insertMarkdown(textarea, tool, value, onChange) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);

  let newText, newStart, newEnd;

  if (tool.snippet) {
    newText = value.slice(0, start) + "\n" + tool.snippet + "\n" + value.slice(end);
    newStart = start + 1;
    newEnd = newStart + tool.snippet.length;
  } else if (tool.block) {
    const insert = selected || tool.placeholder;
    const snippet = "```\n" + insert + "\n```";
    newText = value.slice(0, start) + snippet + value.slice(end);
    newStart = start + 4;
    newEnd = newStart + insert.length;
  } else if (tool.prefix) {
    const insert = selected || tool.placeholder;
    const snippet = tool.prefix + insert;
    newText = value.slice(0, start) + snippet + value.slice(end);
    newStart = start + tool.prefix.length;
    newEnd = newStart + insert.length;
  } else {
    const [before, after] = tool.wrap;
    const insert = selected || tool.placeholder;
    const snippet = before + insert + after;
    newText = value.slice(0, start) + snippet + value.slice(end);
    newStart = start + before.length;
    newEnd = newStart + insert.length;
  }

  onChange(newText);

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(newStart, newEnd);
  });
}

export default function MarkdownEditor({ value, onChange, placeholder, minRows = 4, expandable = true, maxLength = null }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 16px font × 1.6 line-height = 25.6px per row, + 24px padding
  const rows = expanded ? 24 : minRows;
  const bodyHeight = rows * 25.6 + 24;
  const tools = useMemo(
    () =>
      TOOLS.map((tool) => ({
        ...tool,
        title: t(tool.title),
        placeholder: tool.placeholder ? t(tool.placeholder) : tool.placeholder,
        snippet: tool.snippet ? t(tool.snippet) : tool.snippet,
      })),
    [t],
  );

  function handleTool(tool) {
    if (!ref.current) return;
    insertMarkdown(ref.current, tool, value, onChange);
  }

  return (
    <div className="mde-wrap">
      <div
        className="mde-toolbar"
        role="toolbar"
        aria-label={t({ en: "Formatting tools", zh: "格式化工具" })}
      >
        {/* Edit / Preview tabs */}
        <button
          type="button"
          className={`mde-tab${!preview ? " is-active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); setPreview(false); }}
        >
          {t({ en: "Edit", zh: "编辑" })}
        </button>
        <button
          type="button"
          className={`mde-tab${preview ? " is-active" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); setPreview(true); }}
        >
          {t({ en: "Preview", zh: "预览" })}
        </button>

        {/* Divider + format tools: Edit mode only */}
        {!preview && (
          <>
            <span className="mde-sep" aria-hidden="true" />
            {tools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                className="mde-tool"
                title={tool.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleTool(tool);
                }}
              >
                {tool.label}
              </button>
            ))}
          </>
        )}

        {/* Expand / collapse toggle */}
        {expandable && (
          <button
            type="button"
            className={`mde-tool mde-expand-toggle${expanded ? " is-active" : ""}`}
            title={
              expanded ?
                t({ en: "Collapse editor", zh: "收起编辑器" })
              : t({ en: "Expand editor", zh: "展开编辑器" })
            }
            onMouseDown={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
          >
            {expanded ? "⊡" : "⊞"}
          </button>
        )}
      </div>

      {preview ? (
        <div
          className="mde-preview qd-markdown"
          style={{ minHeight: bodyHeight, overflowY: "auto" }}
        >
          {value
            ? <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{value}</ReactMarkdown>
            : <span className="mde-preview-empty">
                {t({ en: "Nothing to preview yet.", zh: "暂无可预览内容。" })}
              </span>
          }
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="mde-textarea"
        />
      )}
      {maxLength !== null && (
        <div className={`mde-counter${value.length > maxLength ? " is-over" : ""}`}>
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}
