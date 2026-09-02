import { useState } from 'react';
import type { Blog } from '../../types/blog';
import BlogSelector from './BlogSelector';

interface LinkMenuProps {
  open: boolean;
  hasSelection: boolean;
  initialText: string;
  onClose: () => void;
  onInsert: (href: string, text?: string) => void;
}

type Step =
  | 'choose'
  | 'website'
  | 'external'
  | 'blog'
  | 'blog-text';

interface WebsiteForm {
  text: string;
  url: string;
}

interface ExternalForm {
  text: string;
  url: string;
}

// The path prefix for this blog's public article slugs.
const BLOG_PREFIX = '/blog/';

function safeHttpUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    // Prepend https:// if the user left the scheme off a bare host/domain.
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

export default function LinkMenu({ open, hasSelection, initialText, onClose, onInsert }: LinkMenuProps) {
  const [step, setStep] = useState<Step>('choose');
  const [website, setWebsite] = useState<WebsiteForm>({ text: initialText, url: '' });
  const [external, setExternal] = useState<ExternalForm>({ text: initialText, url: '' });
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);
  const [blogText, setBlogText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    onClose();
  }

  function handleInsert(href: string, text: string) {
    onInsert(href, text.length > 0 ? text : undefined);
    close();
  }

  // STEP: choose link type
  if (step === 'choose') {
    return (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="modal link-menu" role="dialog" aria-modal="true" aria-label="Insert link">
          <h3 className="modal__title">Insert Link</h3>
          <p className="modal__text">What do you want to link to?</p>
          <div className="link-menu__options">
            <button type="button" className="link-option" onClick={() => setStep('website')}>
              <span className="link-option__icon" aria-hidden="true">🌐</span>
              <span className="link-option__label">GrinXO Website</span>
            </button>
            <button type="button" className="link-option" onClick={() => setStep('blog')}>
              <span className="link-option__icon" aria-hidden="true">📄</span>
              <span className="link-option__label">Another Blog Article</span>
            </button>
            <button type="button" className="link-option" onClick={() => setStep('external')}>
              <span className="link-option__icon" aria-hidden="true">🔗</span>
              <span className="link-option__label">Any Website / Article on the Internet</span>
            </button>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: website link
  if (step === 'website') {
    const insertWeb = () => {
      const href = safeHttpUrl(website.url);
      if (!href) {
        setError('Enter a valid http:// or https:// URL.');
        return;
      }
      handleInsert(href, website.text);
    };
    return (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal link-menu" role="dialog" aria-modal="true" aria-label="Add website link">
          <h3 className="modal__title">Add Website Link</h3>
          <div className="field">
            <label className="field__label" htmlFor="ll-text">Link Text</label>
            <input
              id="ll-text"
              className="field__input"
              value={website.text}
              onChange={(e) => setWebsite((s) => ({ ...s, text: e.target.value }))}
              placeholder="Display text"
              readOnly={hasSelection}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="ll-url">URL</label>
            <input
              id="ll-url"
              className="field__input"
              value={website.url}
              onChange={(e) => {
                setWebsite((s) => ({ ...s, url: e.target.value }));
                setError(null);
              }}
              placeholder="https://grinxo.com/…"
              onKeyDown={(e) => { if (e.key === 'Enter') insertWeb(); }}
              autoFocus
            />
          </div>
          {error && <p className="field__hint field__hint--error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep('choose')}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={insertWeb}>
              Add Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: external link (any website / article anywhere)
  if (step === 'external') {
    const insertExternal = () => {
      const href = safeHttpUrl(external.url);
      if (!href) {
        setError('Enter a valid http:// or https:// URL.');
        return;
      }
      handleInsert(href, external.text);
    };
    return (
      <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal link-menu" role="dialog" aria-modal="true" aria-label="Add external link">
          <h3 className="modal__title">Add External Link</h3>
          <p className="modal__text">Link to any website or article on the internet.</p>
          <div className="field">
            <label className="field__label" htmlFor="el-text">Link Text</label>
            <input
              id="el-text"
              className="field__input"
              value={external.text}
              onChange={(e) => setExternal((s) => ({ ...s, text: e.target.value }))}
              placeholder="Display text"
              readOnly={hasSelection}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="el-url">URL</label>
            <input
              id="el-url"
              className="field__input"
              value={external.url}
              onChange={(e) => {
                setExternal((s) => ({ ...s, url: e.target.value }));
                setError(null);
              }}
              placeholder="https://example.com/article/…"
              onKeyDown={(e) => { if (e.key === 'Enter') insertExternal(); }}
              autoFocus
            />
          </div>
          {error && <p className="field__hint field__hint--error">{error}</p>}
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep('choose')}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={insertExternal}>
              Add Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: choose a blog article
  if (step === 'blog') {
    return (
      <BlogSelector
        onCancel={() => setStep('choose')}
        onSelect={(blog) => {
          setSelectedBlog(blog);
          if (hasSelection) {
            handleInsert(`${BLOG_PREFIX}${blog.slug}`, '');
          } else {
            setBlogText(blog.title);
            setStep('blog-text');
          }
        }}
      />
    );
  }

  // STEP: link text when nothing was selected
  const insertBlog = () => {
    if (!selectedBlog) {
      onClose();
      return;
    }
    handleInsert(`${BLOG_PREFIX}${selectedBlog.slug}`, blogText);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal link-menu" role="dialog" aria-modal="true" aria-label="Link to blog">
        <h3 className="modal__title">Link to Blog</h3>
        <p className="modal__text">
          Selected Article: <strong>{selectedBlog?.title}</strong>
        </p>
        <div className="field">
          <label className="field__label" htmlFor="bl-text">Link Text</label>
          <input
            id="bl-text"
            className="field__input"
            value={blogText}
            onChange={(e) => setBlogText(e.target.value)}
            placeholder="Display text"
            onKeyDown={(e) => { if (e.key === 'Enter') insertBlog(); }}
            autoFocus
          />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={insertBlog}>
            Insert Link
          </button>
        </div>
      </div>
    </div>
  );
}