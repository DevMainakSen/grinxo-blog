import { useEffect, useRef, useState } from 'react';
import type { Blog } from '../../types/blog';
import BlogArticleView from '../blog/BlogArticleView';

interface PreviewModalProps {
  blog: Blog;
  onClose: () => void;
}

type Viewport = 'desktop' | 'mobile';

/**
 * Client-side preview of the current editor state. Renders the shared public
 * article view inside a large, scrollable modal. It never saves, publishes,
 * schedules or otherwise persists anything.
 */
export default function PreviewModal({ blog, onClose }: PreviewModalProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the dialog opens.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent preview links from navigating away from the editor. Preview is a
  // static representation of unsaved content — no navigation, no data loss.
  function interceptLinks(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      e.preventDefault();
      if (anchor.href && !anchor.href.startsWith('#')) {
        // Optionally open in a new tab for absolute external links.
        if (anchor.hostname && anchor.hostname !== window.location.hostname) {
          window.open(anchor.href, '_blank', 'noopener,noreferrer');
        }
      }
    }
  }

  const unpublished =
    blog.status !== 'published' || !blog.publishedAt;

  return (
    <div
      className="modal-backdrop preview-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        aria-describedby="preview-desc"
      >
        <header className="preview-modal__header">
          <div className="preview-modal__heading">
            <h2 id="preview-title" className="preview-modal__title">
              Blog Preview
            </h2>
            <span id="preview-desc" className="preview-modal__subtitle">
              {blog.title || 'Untitled Blog'}
            </span>
            {unpublished && (
              <span className="preview-modal__badge">Preview — not published</span>
            )}
          </div>

          <div className="preview-modal__tools">
            <div
              className="preview-viewport"
              role="group"
              aria-label="Preview viewport width"
            >
              <button
                type="button"
                className={`preview-viewport__btn${viewport === 'desktop' ? ' is-active' : ''}`}
                onClick={() => setViewport('desktop')}
                aria-pressed={viewport === 'desktop'}
              >
                Desktop
              </button>
              <button
                type="button"
                className={`preview-viewport__btn${viewport === 'mobile' ? ' is-active' : ''}`}
                onClick={() => setViewport('mobile')}
                aria-pressed={viewport === 'mobile'}
              >
                Mobile
              </button>
            </div>

            <button
              ref={closeRef}
              type="button"
              className="preview-modal__close"
              onClick={onClose}
              aria-label="Close preview"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </header>

        <div
          className={
            viewport === 'mobile'
              ? 'preview-modal__body preview-modal__body--mobile'
              : 'preview-modal__body'
          }
          onClick={interceptLinks}
        >
          <div className="preview-modal__article">
            <BlogArticleView blog={blog} interactive={false} />
          </div>
        </div>

        <footer className="preview-modal__footer">
          <span className="preview-modal__footer-note">
            Preview shows the current unsaved editor state.
          </span>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
