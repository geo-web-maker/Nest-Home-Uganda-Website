import { Extension, type Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { htmlToText } from '../core/htmlToText';
import { sanitizeToString } from '../core/sanitize';
import { SafeHtml } from './SafeHtml';
import { useMailUi } from './MailUiKit';

type ToolbarProfile = 'full' | 'lite';
type FormatAction = { id: string; label: string; group: string; profile: ToolbarProfile[]; run: (editor: Editor) => void; active?: (editor: Editor) => boolean; disabled?: (editor: Editor) => boolean };

const ICON_PATHS: Record<string, string> = {
  bullet: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  number: 'M10 6h10M10 12h10M10 18h10M4 5l1.5-1v6M3.5 14.5c0-1 1-1.5 1.8-1.5s1.4.6 1.2 1.4c-.2.7-1.3 1.4-3 3h3.2',
  quote: 'M5 8h5v5c0 2-1 3-3 4M14 8h5v5c0 2-1 3-3 4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  table: 'M4 5h16v14H4zM4 11h16M4 15h16M10 5v14',
  rule: 'M3 12h18',
  clear: 'M5 5h14M12 5v8M5 19L19 9',
  row: 'M4 6h16v5H4zM12 14v6M9 17h6',
  column: 'M5 4h5v16H5zM14 12h6M17 9v6',
  'delete-table': 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  'align-left': 'M4 6h16M4 10h10M4 14h16M4 18h10',
  'align-center': 'M4 6h16M7 10h10M4 14h16M7 18h10',
  'align-right': 'M4 6h16M10 10h10M4 14h16M10 18h10',
  indent: 'M4 6h16M11 10h9M11 14h9M4 18h16M4 9l3 3-3 3',
  outdent: 'M4 6h16M11 10h9M11 14h9M4 18h16M7 9l-3 3 3 3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
};
const TEXT_GLYPHS: Record<string, string> = { bold: 'B', italic: 'I', underline: 'U', strike: 'S' };

function ToolIcon({ id }: { id: string }) {
  const glyph = TEXT_GLYPHS[id];
  if (glyph) return <span aria-hidden="true" className={`mr-glyph mr-glyph-${id}`}>{glyph}</span>;
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[id] ?? ''} /></svg>;
}

const SAFE_FONT_SIZES = new Set([10, 12, 14, 16, 18, 20, 24, 28, 32]);

const FontSize = Extension.create({
  name: 'mailFontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const match = /^([0-9]{1,2})px$/.exec(element.style.fontSize.trim());
            const size = match ? Number(match[1]) : 0;
            return SAFE_FONT_SIZES.has(size) ? `${size}px` : null;
          },
          renderHTML: (attributes: Record<string, unknown>) => {
            const match = /^([0-9]{1,2})px$/.exec(String(attributes.fontSize ?? ''));
            const size = match ? Number(match[1]) : 0;
            return SAFE_FONT_SIZES.has(size) ? { style: `font-size: ${size}px` } : {};
          },
        },
      },
    }];
  },
});

const ParagraphIndent = Extension.create({
  name: 'mailParagraphIndent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Math.min(8, Math.max(0, Math.round((parseFloat(element.style.marginLeft || '0') || 0) / 24))),
          renderHTML: (attributes: Record<string, unknown>) => {
            const level = Math.min(8, Math.max(0, Number(attributes.indent) || 0));
            return level ? { style: `margin-left: ${level * 24}px` } : {};
          },
        },
      },
    }];
  },
});

function clampTableHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return value;
  const doc = new DOMParser().parseFromString(value, 'text/html');
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    rows.slice(10).forEach((row) => row.remove());
    for (const row of Array.from(table.querySelectorAll('tr'))) {
      Array.from(row.children).slice(8).forEach((cell) => cell.remove());
    }
  }
  return Array.from(doc.body.childNodes).map((node) => new XMLSerializer().serializeToString(node)).join('');
}

function activeTableDimensions(editor: Editor): { rows: number; columns: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      let columns = 0;
      node.forEach((row) => { columns = Math.max(columns, row.childCount); });
      return { rows: node.childCount, columns };
    }
  }
  return null;
}

/** The colour input only accepts #rrggbb, so anything else falls back to the default swatch. */
function toHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

export type MailRichEditorProps = {
  value: string;
  onChange: (html: string, text: string) => void;
  profile?: ToolbarProfile;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  quotedHtml?: string | null;
  quoteInitiallyExpanded?: boolean;
  quoteLabel?: string;
  removeQuoteLabel?: string;
  onRemoveQuote?: () => void;
  onPasteImage?: (file: File) => Promise<string | null>;
  onPasteFiles?: (files: File[]) => void;
  maxInlineImageBytes?: number;
  onPasteImageBlocked?: (file: File) => void;
};

export function MailRichEditor({
  value,
  onChange,
  profile = 'full',
  disabled = false,
  placeholder = 'Write your message…',
  label,
  quotedHtml,
  quoteInitiallyExpanded = true,
  quoteLabel = 'Original message',
  removeQuoteLabel = 'Remove quoted message',
  onRemoveQuote,
  onPasteImage,
  onPasteFiles,
  maxInlineImageBytes = 1024 * 1024,
  onPasteImageBlocked,
}: MailRichEditorProps) {
  const { kit, labels } = useMailUi();
  const ToolbarButton = kit.ToolbarButton;
  const Select = kit.Select;
  const TextField = kit.TextField;
  const ColorField = kit.ColorField;
  const Dialog = kit.Dialog;
  const UiButton = kit.Button;
  const editorId = useId().replace(/:/g, '');
  const [focusIndex, setFocusIndex] = useState(0);
  const [removeQuoteOpen, setRemoveQuoteOpen] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(quoteInitiallyExpanded);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableColumns, setTableColumns] = useState(3);
  const toolbarRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastValue = useRef(value);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const pasteHandlers = useRef({ onPasteImage, onPasteFiles, onPasteImageBlocked });
  const safeValue = useMemo(() => sanitizeToString(value || '<p></p>'), [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { pasteHandlers.current = { onPasteImage, onPasteFiles, onPasteImageBlocked }; }, [onPasteImage, onPasteFiles, onPasteImageBlocked]);
  const update = useCallback(({ editor }: { editor: Editor }) => {
    const html = sanitizeToString(editor.getHTML());
    lastValue.current = html;
    onChangeRef.current(html, htmlToText(html));
  }, []);

  const editor = useEditor({
    editable: !disabled,
    content: safeValue,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: false, underline: false }),
      TextStyle,
      FontSize,
      ParagraphIndent,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false, HTMLAttributes: { class: 'mr-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: true, allowBase64: false, HTMLAttributes: { class: 'mr-inline-image' } }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
        dir: 'auto',
        class: 'mr-editor-content',
        spellcheck: 'true',
      },
      transformPastedHTML: (html) => sanitizeToString(clampTableHtml(html)),
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.length) return false;
        event.preventDefault();
        const handlers = pasteHandlers.current;
        const images = files.filter((file) => file.type.startsWith('image/'));
        const ordinaryFiles = files.filter((file) => !file.type.startsWith('image/'));
        if (ordinaryFiles.length) handlers.onPasteFiles?.(ordinaryFiles);
        for (const file of images) {
          if (file.size > maxInlineImageBytes || !handlers.onPasteImage) {
            handlers.onPasteImageBlocked?.(file);
            handlers.onPasteFiles?.([file]);
            continue;
          }
          void handlers.onPasteImage(file).then((url) => {
            if (url) editorRef.current?.chain().focus().setImage({ src: url, alt: file.name }).run();
            else { handlers.onPasteImageBlocked?.(file); handlers.onPasteFiles?.([file]); }
          }).catch(() => { handlers.onPasteImageBlocked?.(file); handlers.onPasteFiles?.([file]); });
        }
        return true;
      },
    },
    onUpdate: update,
  }, [placeholder, label, maxInlineImageBytes]);
  editorRef.current = editor;

  // Keep controlled editor content in sync after render when switching drafts.
  useEffect(() => {
    if (!editor || (safeValue === lastValue.current && safeValue === editor.getHTML())) return;
    editor.commands.setContent(safeValue, { emitUpdate: false });
    lastValue.current = safeValue;
  }, [editor, safeValue]);

  useEffect(() => {
    if (editor && editor.isEditable !== !disabled) editor.setEditable(!disabled);
  }, [editor, disabled]);

  const allActions: FormatAction[] = editor ? [
    { id: 'bold', label: labels.bold, group: 'text', profile: ['full', 'lite'], run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
    { id: 'italic', label: labels.italic, group: 'text', profile: ['full', 'lite'], run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
    { id: 'underline', label: labels.underline, group: 'text', profile: ['full', 'lite'], run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive('underline') },
    { id: 'strike', label: labels.strikethrough, group: 'text', profile: ['full'], run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
    { id: 'bullet', label: labels.bulletedList, group: 'blocks', profile: ['full', 'lite'], run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
    { id: 'number', label: labels.numberedList, group: 'blocks', profile: ['full', 'lite'], run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
    { id: 'quote', label: labels.blockQuote, group: 'blocks', profile: ['full'], run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
    { id: 'link', label: labels.insertEditLink, group: 'insert', profile: ['full', 'lite'], run: (e) => { setLinkUrl(e.getAttributes('link').href || ''); setLinkOpen(true); } },
    { id: 'table', label: labels.insertTable, group: 'insert', profile: ['full'], run: () => setTableOpen(true) },
    { id: 'rule', label: labels.insertHorizontalRule, group: 'insert', profile: ['full'], run: (e) => e.chain().focus().setHorizontalRule().run() },
    { id: 'clear', label: labels.clearFormatting, group: 'text', profile: ['full'], run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
    { id: 'row', label: labels.addTableRow, group: 'table', profile: ['full'], disabled: (e) => { const size = activeTableDimensions(e); return !size || size.rows >= 10; }, run: (e) => e.chain().focus().addRowAfter().run() },
    { id: 'column', label: labels.addTableColumn, group: 'table', profile: ['full'], disabled: (e) => { const size = activeTableDimensions(e); return !size || size.columns >= 8; }, run: (e) => e.chain().focus().addColumnAfter().run() },
    { id: 'delete-table', label: labels.deleteTable, group: 'table', profile: ['full'], disabled: (e) => !activeTableDimensions(e), run: (e) => e.chain().focus().deleteTable().run() },
    { id: 'align-left', label: labels.alignLeft, group: 'align', profile: ['full'], run: (e) => e.chain().focus().setTextAlign('left').run(), active: (e) => e.isActive({ textAlign: 'left' }) },
    { id: 'align-center', label: labels.alignCenter, group: 'align', profile: ['full'], run: (e) => e.chain().focus().setTextAlign('center').run(), active: (e) => e.isActive({ textAlign: 'center' }) },
    { id: 'align-right', label: labels.alignRight, group: 'align', profile: ['full'], run: (e) => e.chain().focus().setTextAlign('right').run(), active: (e) => e.isActive({ textAlign: 'right' }) },
    { id: 'indent', label: labels.increaseIndent, group: 'align', profile: ['full'], run: (e) => { const current = Number(e.getAttributes(e.isActive('heading') ? 'heading' : 'paragraph').indent) || 0; e.chain().focus().updateAttributes(e.isActive('heading') ? 'heading' : 'paragraph', { indent: Math.min(8, current + 1) }).run(); } },
    { id: 'outdent', label: labels.decreaseIndent, group: 'align', profile: ['full'], run: (e) => { const current = Number(e.getAttributes(e.isActive('heading') ? 'heading' : 'paragraph').indent) || 0; e.chain().focus().updateAttributes(e.isActive('heading') ? 'heading' : 'paragraph', { indent: Math.max(0, current - 1) }).run(); } },
    { id: 'undo', label: labels.undo, group: 'history', profile: ['full', 'lite'], run: (e) => e.chain().focus().undo().run() },
    { id: 'redo', label: labels.redo, group: 'history', profile: ['full', 'lite'], run: (e) => e.chain().focus().redo().run() },
  ] : [];
  const inTable = Boolean(editor && activeTableDimensions(editor));
  const actions = allActions.filter((action) => action.profile.includes(profile) && (action.group !== 'table' || inTable));

  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!actions.length || !(event.target as HTMLElement).closest('button.mr-editor-tool')) return;
    let next: number;
    if (event.key === 'ArrowRight') next = (focusIndex + 1) % actions.length;
    else if (event.key === 'ArrowLeft') next = (focusIndex - 1 + actions.length) % actions.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = actions.length - 1;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    toolbarRefs.current[next]?.focus();
  };

  return <div className="mr-editor" data-profile={profile}>
    <div className="mr-editor-toolbar" role="toolbar" aria-label={labels.messageFormatting} aria-orientation="horizontal" onKeyDown={onToolbarKeyDown}>
      {actions.map((action, index) => <span key={action.id} title={action.label} data-group-start={index > 0 && actions[index - 1]?.group !== action.group ? 'true' : undefined} ref={(element) => { if (element) toolbarRefs.current[index] = element.querySelector('button'); }}>
        <ToolbarButton
          label={action.label}
          pressed={action.active ? action.active(editor!) : undefined}
          disabled={disabled || !editor || Boolean(action.disabled?.(editor))}
          tabIndex={index === focusIndex ? 0 : -1}
          onFocus={() => setFocusIndex(index)}
          onClick={() => { action.run(editor!); setFocusIndex(index); }}
        ><ToolIcon id={action.id} /></ToolbarButton>
      </span>)}
      <span className="mr-editor-sep" aria-hidden="true" />
      {profile === 'full' ? <div className="mr-editor-size">
        <Select label={labels.paragraphStyle} value={editor?.isActive('heading', { level: 1 }) ? '1' : editor?.isActive('heading', { level: 2 }) ? '2' : editor?.isActive('heading', { level: 3 }) ? '3' : editor?.isActive('heading', { level: 4 }) ? '4' : 'p'} options={[{ value: 'p', label: labels.paragraph }, ...[1, 2, 3, 4].map((level) => ({ value: String(level), label: [labels.heading1, labels.heading2, labels.heading3, labels.heading4][level - 1] ?? '' }))]} onChange={(value) => {
          if (value === 'p') editor?.chain().focus().setParagraph().run();
          else editor?.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 }).run();
        }} compact />
      </div> : null}
      <div className="mr-editor-size">
        <Select label={labels.fontSize} value={String(Math.min(32, Math.max(10, Number.parseInt(String(editor?.getAttributes('textStyle').fontSize || '14').replace('px', ''), 10) || 14)))} options={[10, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => ({ value: String(size), label: String(size) }))} onChange={(value) => editor?.chain().focus().setMark('textStyle', { fontSize: `${value}px` }).run()} compact />
      </div>
      <div className="mr-editor-colour"><ColorField variant="text" disabled={disabled || !editor} label={labels.textColour} value={toHex(editor?.getAttributes('textStyle').color, '#202124')} onChange={(value) => editor?.chain().focus().setColor(value).run()} /></div>
      <div className="mr-editor-colour"><ColorField variant="highlight" disabled={disabled || !editor} label={labels.highlight} value={toHex(editor?.getAttributes('highlight').color, '#fff29a')} onChange={(value) => editor?.chain().focus().setHighlight({ color: value }).run()} /></div>
    </div>
    <EditorContent editor={editor} />
    {linkOpen ? <Dialog
      id={`${editorId}-link`}
      title={labels.insertLinkTitle}
      closeLabel={labels.cancel}
      onClose={() => setLinkOpen(false)}
      className="mr-editor-confirm"
      actions={<div className="mr-editor-dialog-actions">
        <UiButton variant="primary" disabled={!/^(https?:\/\/|mailto:|tel:)/i.test(linkUrl.trim())} onClick={() => { editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.trim() }).run(); setLinkOpen(false); }}>{labels.applyLink}</UiButton>
        <UiButton variant="quiet" onClick={() => { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkOpen(false); }}>{labels.removeLink}</UiButton>
      </div>}
    >
      <TextField label={labels.webAddress} type="url" inputMode="url" value={linkUrl} onChange={setLinkUrl} />
      <p>{labels.allowedLinkHint}</p>
    </Dialog> : null}
    {tableOpen ? <Dialog
      id={`${editorId}-table`}
      title={labels.tableTitle}
      closeLabel={labels.cancel}
      onClose={() => setTableOpen(false)}
      className="mr-editor-confirm"
      actions={<div className="mr-editor-dialog-actions"><UiButton onClick={() => { editor?.chain().focus().insertTable({ rows: tableRows, cols: tableColumns, withHeaderRow: true }).run(); setTableOpen(false); }}>{labels.insertTable}</UiButton></div>}
    >
      <Select label={labels.rows} value={String(tableRows)} options={Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} onChange={(value) => setTableRows(Number(value))} />
      <Select label={labels.columns} value={String(tableColumns)} options={Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))} onChange={(value) => setTableColumns(Number(value))} />
    </Dialog> : null}
    {quotedHtml ? <section className="mr-editor-quote" aria-label={quoteLabel}>
      <div className="mr-editor-quote-heading"><strong>{quoteLabel}</strong>
        <UiButton variant="quiet" onClick={() => setQuoteExpanded((current) => !current)}>{quoteExpanded ? labels.hideQuotedMessage : labels.showQuotedMessage}</UiButton>
        {onRemoveQuote ? <UiButton variant="quiet" onClick={() => setRemoveQuoteOpen(true)}>{removeQuoteLabel}</UiButton> : null}
      </div>
      {quoteExpanded ? <SafeHtml html={quotedHtml} className="mr-quoted" /> : null}
    </section> : null}
    {removeQuoteOpen ? <Dialog
      id={`${editorId}-remove-quote`}
      title={labels.removeQuoteTitle}
      closeLabel={labels.keepQuote}
      onClose={() => setRemoveQuoteOpen(false)}
      urgent
      className="mr-editor-confirm"
      actions={<div className="mr-editor-dialog-actions"><UiButton onClick={() => { setRemoveQuoteOpen(false); onRemoveQuote?.(); }}>{labels.removeQuote}</UiButton></div>}
    >
      <p>{labels.removeQuoteHint}</p>
    </Dialog> : null}
  </div>;
}
