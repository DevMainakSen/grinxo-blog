import { useEffect, useRef, useState } from 'react';
import type { Blog } from '../../types/blog';
import { useEngagement } from '../../hooks/useEngagement';

interface BlogActionsProps {
  blog: Blog;
  variant?: 'hero' | 'icon';
}

/** Builds the canonical share URL from the article slug. */
function articleUrl(blog: Blog): string {
  const { origin, pathname } = window.location;
  // In dev the app runs under /blog; fall back gracefully to a slug path.
  const base = pathname.replace(/\/blog\/[^/]+$/, '').replace(/\/$/, '');
  return `${origin}${base}/blog/${blog.slug}`;
}

const SOCIALS = [
  {
    label: 'Facebook',
    icon: 'facebook',
    build: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    label: 'Twitter / X',
    icon: 'x',
    build: (url: string) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`,
  },
  {
    label: 'LinkedIn',
    icon: 'linkedin',
    build: (url: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
];

export default function BlogActions({ blog, variant = 'hero' }: BlogActionsProps) {
  const [engagement, actions] = useEngagement(blog);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const url = articleUrl(blog);

  // Close the share popover on outside click.
  useEffect(() => {
    if (!shareOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [shareOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const shareWrap = (
    <div className="blog-actions__share-wrap" ref={wrapRef}>
      {variant === 'hero' ? (
        <button
          type="button"
          className="blog-actions__hero-btn"
          onClick={() => setShareOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={shareOpen}
        >
          <span className="material-symbols-outlined" aria-hidden="true">share</span>
          <span>Share</span>
        </button>
      ) : (
        <button
          type="button"
          className="blog-actions__icon-btn"
          onClick={() => setShareOpen((o) => !o)}
          aria-label="Share this article"
          aria-haspopup="true"
          aria-expanded={shareOpen}
          title="Share"
        >
          <span className="material-symbols-outlined" aria-hidden="true">share</span>
        </button>
      )}
      {shareOpen && (
        <SharePopover
          url={url}
          onCopy={handleCopy}
          copied={copied}
          onNavigate={() => setShareOpen(false)}
        />
      )}
    </div>
  );

  if (variant === 'icon') {
    return (
      <div className="blog-actions blog-actions--icon" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`blog-actions__icon-btn${engagement.liked ? ' blog-actions__icon-btn--active' : ''}`}
          onClick={actions.toggleLike}
          aria-label={engagement.liked ? 'Unlike this article' : 'Like this article'}
          title="Like"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {engagement.liked ? 'favorite' : 'favorite_border'}
          </span>
          <span className="blog-actions__count">{engagement.likeCount}</span>
        </button>

        <button
          type="button"
          className={`blog-actions__icon-btn${engagement.saved ? ' blog-actions__icon-btn--active' : ''}`}
          onClick={actions.toggleBookmark}
          aria-label={engagement.saved ? 'Remove bookmark' : 'Bookmark this article'}
          title="Save"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {engagement.saved ? 'bookmark' : 'bookmark_border'}
          </span>
        </button>

        {shareWrap}
      </div>
    );
  }

  // Hero (article page) variant — labelled pill buttons.
  return (
    <div className="blog-actions blog-actions--hero">
      <button
        type="button"
        className={`blog-actions__hero-btn${engagement.liked ? ' blog-actions__hero-btn--active' : ''}`}
        onClick={actions.toggleLike}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {engagement.liked ? 'favorite' : 'favorite_border'}
        </span>
        <span>Like ({engagement.likeCount})</span>
      </button>

      <button
        type="button"
        className={`blog-actions__hero-btn${engagement.saved ? ' blog-actions__hero-btn--active' : ''}`}
        onClick={actions.toggleBookmark}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {engagement.saved ? 'bookmark' : 'bookmark_border'}
        </span>
        <span>{engagement.saved ? 'Saved' : 'Save'}</span>
      </button>

      {shareWrap}
    </div>
  );
}

function SharePopover({
  url,
  onCopy,
  copied,
  onNavigate,
}: {
  url: string;
  onCopy: () => void;
  copied: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="share-popover" role="menu" onClick={(e) => e.stopPropagation()}>
      <p className="share-popover__label">Share this article</p>
      <button type="button" className="share-popover__option" onClick={onCopy} role="menuitem">
        <span className="material-symbols-outlined" aria-hidden="true">
          {copied ? 'check' : 'link'}
        </span>
        <span>{copied ? 'Copied!' : 'Copy link'}</span>
      </button>
      {SOCIALS.map((s) => (
        <a
          key={s.label}
          className="share-popover__option"
          href={s.build(url)}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          onClick={onNavigate}
        >
          <span className={`share-popover__icon share-popover__icon--${s.icon}`} aria-hidden="true">
            {s.icon === 'facebook' && 'f'}
            {s.icon === 'x' && '𝕏'}
            {s.icon === 'linkedin' && 'in'}
          </span>
          <span>{s.label}</span>
        </a>
      ))}
    </div>
  );
}