import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import type { Editor } from '@tiptap/react';
import { FontSize } from './extensions/fontSize';
import LinkMenu, { type LinkRel } from './LinkMenu';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      FontSize,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        // Allow relative links (e.g. /blog/my-slug for internal article links).
        isAllowedUri: (url) => {
          const raw = url || '';
          if (raw.startsWith('/')) return !raw.startsWith('//') && !raw.includes('://');
          try {
            const parsed = new URL(raw);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rte-content',
        'aria-label': 'Rich text content',
      },
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuToken, setMenuToken] = useState(0);
  const htmlUpdating = useRef(false);
  const lastHtml = useRef(value);

  // Emit HTML changes to the parent without echoing back a re-render.
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const nextHtml = editor.getHTML();
      lastHtml.current = nextHtml;
      htmlUpdating.current = true;
      onChange(nextHtml);
      requestAnimationFrame(() => {
        htmlUpdating.current = false;
      });
    };
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, onChange]);

  // Sync external `value` changes (a parent reset/undo not driven by this
  // editor) into the editor. The editor is created with `content: value`, so
  // the initial mount is intentionally skipped by comparing against the ref.
  const priorValue = useRef(value);
  useEffect(() => {
    if (!editor || htmlUpdating.current) return;
    const prev = priorValue.current;
    priorValue.current = value;
    if (prev === value) return;
    if (value === lastHtml.current) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  // The selection (if any) is captured the moment the Link button is pressed,
  // because opening the modal moves focus away from the editor and collapses
  // its live selection.
  const pendingRange = useRef<{ from: number; to: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [initialText, setInitialText] = useState('');

  function handleInsert(href: string, text?: string, rel?: LinkRel) {
    if (!editor) return;

    // Build link attributes.
    let attrs: { href: string; target?: string; rel?: string };
    if (href.startsWith('/')) {
      // Internal relative links: keep them relative (follow, same context).
      attrs = { href };
    } else {
      // External links: open in a new secured tab by default.
      attrs = { href, target: '_blank', rel: 'noopener noreferrer' };
      if (rel && rel !== 'follow') {
        const relParts = rel === 'nofollow'
          ? ['nofollow']
          : rel === 'sponsored'
            ? ['nofollow', 'sponsored']
            : ['nofollow', 'ugc'];
        attrs = { href, target: '_blank', rel: ['noopener', 'noreferrer', ...relParts].join(' ') };
      }
    }

    const range = pendingRange.current;
    pendingRange.current = null;

    const hasRange = range !== null && range.from !== range.to;

    if (hasRange && range) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: range.from, to: range.to })
        .setLink(attrs)
        .run();
    } else if (text && text.length > 0) {
      // No text selected: insert the display text, then wrap it in the link.
      const anchor = range ? range.from : editor.state.selection.from;
      editor.chain().focus().insertContent([{ type: 'text', text }]).run();
      const from = anchor;
      const to = anchor + text.length;
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setLink(attrs)
        .run();
      editor.commands.setTextSelection({ from: to, to });
    } else {
      editor.chain().focus().setLink(attrs).run();
    }
    editor.commands.focus();
  }

  return (
    <div className="rte" data-testid="rich-text-editor">
      {editor && (
        <Toolbar
          editor={editor}
          onLinkClick={() => {
            const from = editor.state.selection.from;
            const to = editor.state.selection.to;
            pendingRange.current = { from, to };
            if (from !== to) {
              setHasSelection(true);
              const selected = editor.state.doc.textBetween(from, to, ' ');
              setInitialText(selected);
            } else {
              setHasSelection(false);
              setInitialText('');
            }
            setMenuToken((t) => t + 1);
            setMenuOpen(true);
          }}
        />
      )}
      <EditorContent editor={editor} />
      {editor && menuOpen && (
        <LinkMenu
          key={menuToken}
          open={menuOpen}
          hasSelection={hasSelection}
          initialText={initialText}
          onClose={() => {
            pendingRange.current = null;
            setMenuOpen(false);
          }}
          onInsert={(href, text) => handleInsert(href, text)}
        />
      )}
    </div>
  );
}

interface ToolbarProps {
  editor: Editor;
  onLinkClick: () => void;
}

function Toolbar({ editor, onLinkClick }: ToolbarProps) {
  // Remember the text selection before a native color/highlight picker opens,
  // because the dialog steals focus and can collapse the editor's selection.
  const markRange = useRef<{ from: number; to: number } | null>(null);
  const groups: Array<{ key: string; open: (e: Editor) => boolean; title: string; label: string }[]> = [
    [
      { key: 'p', open: (e) => e.isActive('paragraph'), title: 'Paragraph', label: '¶' },
      { key: 'h1', open: (e) => e.isActive('heading', { level: 1 }), title: 'Heading 1', label: 'H1' },
      { key: 'h2', open: (e) => e.isActive('heading', { level: 2 }), title: 'Heading 2', label: 'H2' },
      { key: 'h3', open: (e) => e.isActive('heading', { level: 3 }), title: 'Heading 3', label: 'H3' },
    ],
    [
      { key: 'bold', open: (e) => e.isActive('bold'), title: 'Bold', label: 'B' },
      { key: 'italic', open: (e) => e.isActive('italic'), title: 'Italic', label: 'I' },
      { key: 'underline', open: (e) => e.isActive('underline'), title: 'Underline', label: 'U' },
      { key: 'strike', open: (e) => e.isActive('strike'), title: 'Strikethrough', label: 'S̶' },
    ],
  ];

  function applyBlock(tag: string) {
    if (tag === 'p') editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: Number(tag.slice(1)) as 1 | 2 | 3 }).run();
  }

  function applyInline(key: string) {
    const chain = editor.chain().focus();
    switch (key) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
    }
  }

  function captureMarkRange() {
    markRange.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
  }

  // Re-apply the captured selection (if the native picker collapsed it) and run
  // a mark command against that range, so the chosen color/highlight targets the
  // text the user actually selected.
  function applyColor(value: string) {
    const r = markRange.current;
    markRange.current = null;
    if (r && r.from !== r.to) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: r.from, to: r.to })
        .setColor(value)
        .run();
    } else {
      editor.chain().focus().setColor(value).run();
    }
  }

  function applyHighlight(value: string) {
    const r = markRange.current;
    markRange.current = null;
    if (value === '#000000' || value === 'transparent') {
      if (r && r.from !== r.to) {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: r.from, to: r.to })
          .unsetHighlight()
          .run();
      } else {
        editor.chain().focus().unsetHighlight().run();
      }
      return;
    }
    if (r && r.from !== r.to) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: r.from, to: r.to })
        .setHighlight({ color: value })
        .run();
    } else {
      editor.chain().focus().setHighlight({ color: value }).run();
    }
  }

  return (
    <div className="rte-toolbar" role="toolbar" aria-label="Formatting toolbar">
      <div className="rte-toolbar__group">
        {groups[0].map((b) => (
          <ToolbarButton
            key={b.key}
            title={b.title}
            label={b.label}
            active={editor.isActive(b.key === 'p' ? 'paragraph' : 'heading', b.key === 'p' ? undefined : { level: Number(b.key.slice(1)) })}
            onClick={() => applyBlock(b.key)}
          />
        ))}
      </div>

      <div className="rte-toolbar__group">
        {groups[1].map((b) => (
          <ToolbarButton key={b.key} title={b.title} label={b.label} active={b.open(editor)} onClick={() => applyInline(b.key)} />
        ))}
      </div>

      <div className="rte-toolbar__group">
        <label className="rte-toolbar__select" title="Font size">
          <select
            value={currentFontSize(editor)}
            onChange={(e) => setFontSize(editor, e.target.value)}
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rte-toolbar__group">
        <label className="rte-toolbar__color" title="Text color">
          <span className="rte-toolbar__color-swatch" style={{ background: currentColor(editor) }}>A</span>
          <input
            type="color"
            value={currentColor(editor)}
            onMouseDown={() => {
              // The native color dialog steals focus and can collapse the
              // editor's selection, so remember it before it opens.
              captureMarkRange();
            }}
            onChange={(e) => applyColor(e.target.value)}
          />
        </label>
        <label className="rte-toolbar__color" title="Highlight">
          <span className="rte-toolbar__color-swatch rte-toolbar__color-swatch--hl" style={{ background: currentHighlight(editor) }}>A</span>
          <input
            type="color"
            value={currentHighlight(editor)}
            onMouseDown={() => {
              captureMarkRange();
            }}
            onChange={(e) => applyHighlight(e.target.value)}
          />
        </label>
      </div>

      <div className="rte-toolbar__group">
        <ToolbarButton
          title="Bullet list"
          label="• List"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          title="Numbered list"
          label="1. List"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </div>

      <div className="rte-toolbar__group">
        <ToolbarButton
          title="Align left"
          label="⇤"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        />
        <ToolbarButton
          title="Center"
          label="⇔"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        />
        <ToolbarButton
          title="Align right"
          label="⇥"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        />
        <ToolbarButton
          title="Justify"
          label="↔"
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        />
      </div>

      <div className="rte-toolbar__group">
        <ToolbarButton
          title="Blockquote"
          label="❝"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          title="Insert link"
          label="🔗"
          active={editor.isActive('link')}
          onClick={onLinkClick}
        />
      </div>

      <div className="rte-toolbar__group rte-toolbar__group--right">
        <ToolbarButton
          title="Undo"
          label="↩"
          active={false}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          title="Redo"
          label="↪"
          active={false}
          onClick={() => editor.chain().focus().redo().run()}
        />
        <ToolbarButton
          title="Clear formatting"
          label="⌫"
          active={false}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  title,
  label,
  active,
  onClick,
}: {
  title: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rte-tool ${active ? 'rte-tool--active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px'];

function currentFontSize(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle') as { fontSize?: string } | undefined;
  return attrs?.fontSize ?? '16px';
}

function setFontSize(editor: Editor, size: string) {
  if (!size || size === '16px') {
    editor.chain().focus().unsetFontSize().run();
  } else {
    editor.chain().focus().setFontSize(size).run();
  }
}

function currentColor(editor: Editor): string {
  const attrs = editor.getAttributes('textStyle') as { color?: string } | undefined;
  return attrs?.color ?? '#1a1a1a';
}

function currentHighlight(editor: Editor): string {
  const attrs = editor.getAttributes('highlight') as { color?: string } | undefined;
  return attrs?.color ?? 'transparent';
}