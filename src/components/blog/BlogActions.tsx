import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Blog } from '../../types/blog';
import { useEngagement } from '../../hooks/useEngagement';
import { resolveCanonicalUrl, resolveOgImage } from '../../utils/seo';
import {
  canShareFiles,
  downloadImage,
  getImageFile,
  isNativeShareSupported,
  nativeShare,
  openInNewTab,
} from '../../utils/share';

interface BlogActionsProps {
  blog: Blog;
  variant?: 'hero' | 'icon';
}

type BrandName = 'whatsapp' | 'instagram' | 'facebook';

type IgMode = 'story' | 'post' | 'dm';

/** Top level of the share popover, or a view inside the Instagram drill-down. */
type PopoverView = 'root' | 'ig' | IgMode;

/** Direct web destinations that still work (as app opens). */
const SHARE_OPTIONS: { label: string; icon: BrandName; build: (url: string) => string }[] = [
  {
    label: 'WhatsApp',
    icon: 'whatsapp',
    build: (url: string) => `https://wa.me/?text=${encodeURIComponent(url)}`,
  },
  {
    label: 'Facebook',
    icon: 'facebook',
    build: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
];

/** The three Instagram choices. Icons use the existing Material Symbols. */
const IG_OPTIONS: { mode: IgMode; label: string; description: string; icon: string }[] = [
  {
    mode: 'story',
    label: 'Share to Instagram Story',
    description: 'Add this article to your Story',
    icon: 'movie',
  },
  {
    mode: 'post',
    label: 'Share as Instagram Post',
    description: 'Create an Instagram feed post',
    icon: 'grid_on',
  },
  {
    mode: 'dm',
    label: 'Share via Instagram DM',
    description: 'Send this article in a direct message',
    icon: 'send',
  },
];

/** Honest copy for the per-mode fallback panels. */
const FALLBACK_COPY: Record<IgMode, { note: string }> = {
  story: {
    note: "Instagram doesn't let this website post to your Story directly. Download the image, then add it to your Story in the Instagram app.",
  },
  post: {
    note: "Instagram doesn't let this website publish a post directly. Download the image, then create the post in the Instagram app and paste the link into the caption.",
  },
  dm: {
    note: "Instagram can't open a new message thread from this website. Copy the link, open Instagram, and paste it into a direct message.",
  },
};

/** Shared popover sizing per view, so the flip/clamp logic can stay accurate. */
const VIEW_SPEC: Record<PopoverView, { width: number; height: number }> = {
  root: { width: 210, height: 232 },
  ig: { width: 300, height: 300 },
  story: { width: 300, height: 340 },
  post: { width: 300, height: 340 },
  dm: { width: 300, height: 300 },
};

export default function BlogActions({ blog, variant = 'hero' }: BlogActionsProps) {
  const [engagement, actions] = useEngagement(blog);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [view, setView] = useState<PopoverView>('root');
  const [igBusy, setIgBusy] = useState(false);
  const [igMessage, setIgMessage] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);

  // The public, shareable URL + assets. Draft/scheduled/inactive blogs never
  // reach this component — it only renders on public blog pages.
  const shareUrl = resolveCanonicalUrl(blog);
  const shareImage = resolveOgImage(blog);
  const shareText = [blog.title, blog.excerpt].filter(Boolean).join('\n\n');

  // Close the share popover on outside click (ignoring the press that opened it)
  // and on Escape. Nothing closes purely on hover, keeping the menu stable.
  useEffect(() => {
    if (!shareOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current || !popoverRef.current) return;
      if (e.target instanceof Node) {
        if (wrapRef.current.contains(e.target)) return;
        if (popoverRef.current.contains(e.target)) return;
      }
      // Ignore the same press that opened the menu, so the menu never
      // immediately closes/reopens (the "jitter" on hover/click).
      if (Date.now() - openedAt.current < 200) return;
      setShareOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [shareOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setIgMessage("Couldn't copy the link. Copy it manually from the address bar.");
    }
  };

  const openShare = (button: HTMLElement) => {
    openedAt.current = Date.now();
    setView('root');
    setIgMessage(null);
    setCopied(false);
    setAnchorRect(button.getBoundingClientRect());
    setShareOpen(true);
  };

  const closeShare = () => setShareOpen(false);
  const openIgMenu = () => {
    setIgMessage(null);
    setView('ig');
  };

  /**
   * Best supported path for the chosen mode. Returns true when the calling
   * code should show the honest fallback panel instead.
   */
  async function tryNativeShare(mode: IgMode): Promise<boolean> {
    try {
      if (mode === 'dm') {
        if (!isNativeShareSupported()) return true;
        const result = await nativeShare({ title: blog.title, text: shareText, url: shareUrl });
        if (result === 'shared') {
          setIgMessage(
            'Share sheet opened. If you picked Instagram, choose the conversation there.'
          );
          return false;
        }
        // Cancelled by the user — not an error.
        if (result === 'cancelled') return false;
        return true;
      }

      // Story + Post both hinge on handing an image to the native share sheet.
      if (!canShareFiles()) return true;
      if (!shareImage) {
        setIgMessage('This blog has no image to attach. Copy the link below instead.');
        return true;
      }
      const file = await getImageFile(shareImage, blog.slug || 'grinxo-blog');
      if (!file) {
        setIgMessage("Couldn't load the image for sharing. Copy the link below instead.");
        return true;
      }
      const result = await nativeShare({ files: [file], text: shareText });
      if (result === 'shared') {
        setIgMessage(
          mode === 'story'
            ? 'Share sheet opened. If you picked Instagram, choose Story there.'
            : 'Share sheet opened. If you picked Instagram, add a caption and post.'
        );
        return false;
      }
      if (result === 'cancelled') return false;
      return true;
    } catch {
      return true;
    }
  }

  const handlePickIg = async (mode: IgMode) => {
    setIgMessage(null);
    setIgBusy(true);
    const needFallback = await tryNativeShare(mode);
    setIgBusy(false);
    setView(needFallback ? mode : 'ig');
  };

  const handleDownloadImage = async () => {
    if (!shareImage) {
      setIgMessage('This blog has no image to download.');
      return;
    }
    setIgBusy(true);
    setIgMessage(null);
    const saved = await downloadImage(shareImage, blog.slug || 'grinxo-blog');
    setIgBusy(false);
    if (saved) {
      setIgMessage('Image downloaded. Upload it in the Instagram app.');
    } else {
      const opened = openInNewTab(shareImage);
      setIgMessage(
        opened
          ? "Download wasn't available — the image opened in a new tab. Long-press to save it."
          : "Couldn't download the image. Check your connection or save it from the blog."
      );
    }
  };

  const handleOpenInstagram = () => {
    const opened = openInNewTab('https://www.instagram.com/');
    if (!opened) {
      setIgMessage(
        "Your browser blocked the new tab. Allow pop-ups, or open instagram.com manually."
      );
    }
  };

  const renderShare = () => (
    <div className="blog-actions__share-wrap" ref={wrapRef}>
      {variant === 'hero' ? (
        <button
          type="button"
          className="blog-actions__hero-btn"
          onClick={(e) => openShare(e.currentTarget)}
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
          onClick={(e) => openShare(e.currentTarget)}
          aria-label="Share this article"
          aria-haspopup="true"
          aria-expanded={shareOpen}
          title="Share"
        >
          <span className="material-symbols-outlined" aria-hidden="true">share</span>
        </button>
      )}
      {shareOpen && anchorRect && (
        <SharePopover
          popoverRef={popoverRef}
          anchorRect={anchorRect}
          view={view}
          url={shareUrl}
          onCopy={handleCopy}
          copied={copied}
          onNavigate={closeShare}
          onOpenIg={openIgMenu}
          onBackToRoot={() => setView('root')}
          onBackToIg={() => setView('ig')}
          onPickIg={handlePickIg}
          hasImage={Boolean(shareImage)}
          igBusy={igBusy}
          igMessage={igMessage}
          onDownload={handleDownloadImage}
          onOpenInstagram={handleOpenInstagram}
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

        {renderShare()}
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

      {renderShare()}
    </div>
  );
}

function SharePopover({
  popoverRef,
  anchorRect,
  view,
  url,
  onCopy,
  copied,
  onNavigate,
  onOpenIg,
  onBackToRoot,
  onBackToIg,
  onPickIg,
  hasImage,
  igBusy,
  igMessage,
  onDownload,
  onOpenInstagram,
}: {
  popoverRef: React.RefObject<HTMLDivElement | null>;
  anchorRect: DOMRect;
  view: PopoverView;
  url: string;
  onCopy: () => void;
  copied: boolean;
  onNavigate: () => void;
  onOpenIg: () => void;
  onBackToRoot: () => void;
  onBackToIg: () => void;
  onPickIg: (mode: IgMode) => void;
  hasImage: boolean;
  igBusy: boolean;
  igMessage: string | null;
  onDownload: () => void;
  onOpenInstagram: () => void;
}) {
  const GAP = 8;
  const spec = VIEW_SPEC[view];
  const viewW = window.innerWidth;
  // Clamp horizontally so the menu never runs off the right edge.
  const left = Math.max(8, Math.min(anchorRect.left, viewW - spec.width - 12));
  let top = anchorRect.bottom + GAP;
  if (top + spec.height > window.innerHeight) {
    top = Math.max(8, anchorRect.top - spec.height - GAP);
  }

  const renderBackButton = (onClick: () => void, label: string) => (
    <button type="button" className="share-popover__back" onClick={onClick}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      <span>{label}</span>
    </button>
  );

  const renderStatus = () =>
    igBusy ? (
      <p className="share-popover__status" role="status">
        Opening the system share sheet…
      </p>
    ) : igMessage ? (
      <p className="share-popover__status" role="status">
        {igMessage}
      </p>
    ) : null;

  const menu = (
    <div
      ref={popoverRef}
      className="share-popover"
      style={{ position: 'fixed', left: Math.round(left), top: Math.round(top), width: spec.width }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {view === 'root' && (
        <>
          <p className="share-popover__label">Share this article</p>
          <button type="button" className="share-popover__option" onClick={onCopy} role="menuitem">
            <span className="material-symbols-outlined" aria-hidden="true">
              {copied ? 'check' : 'link'}
            </span>
            <span>{copied ? 'Copied!' : 'Copy link'}</span>
          </button>
          {/* WhatsApp / Facebook still navigate directly to the platform. */}
          {SHARE_OPTIONS.filter((s) => s.icon === 'whatsapp').map((s) => (
            <a
              key={s.label}
              className="share-popover__option"
              href={s.build(url)}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={onNavigate}
            >
              <BrandIcon name={s.icon} />
              <span>{s.label}</span>
            </a>
          ))}
          {/* Instagram opens a submenu instead of navigating, so the user
              can choose Story / Post / DM with honest, supported behavior. */}
          <button
            type="button"
            className="share-popover__option share-popover__option--with-chevron"
            role="menuitem"
            onClick={onOpenIg}
          >
            <BrandIcon name="instagram" />
            <span>Instagram</span>
            <span className="share-popover__chevron" aria-hidden="true">›</span>
          </button>
          {SHARE_OPTIONS.filter((s) => s.icon === 'facebook').map((s) => (
            <a
              key={s.label}
              className="share-popover__option"
              href={s.build(url)}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={onNavigate}
            >
              <BrandIcon name={s.icon} />
              <span>{s.label}</span>
            </a>
          ))}
        </>
      )}

      {view === 'ig' && (
        <>
          {renderBackButton(onBackToRoot, "Back to all options")}
          <p className="share-popover__title">
            <BrandIcon name="instagram" />
            <span>Share on Instagram</span>
          </p>
          {IG_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              className="share-popover__ig-option"
              role="menuitem"
              disabled={igBusy}
              onClick={() => onPickIg(opt.mode)}
            >
              <span className="share-popover__ig-option-icon">
                <span className="material-symbols-outlined" aria-hidden="true">
                  {opt.icon}
                </span>
              </span>
              <span className="share-popover__ig-option-body">
                <span className="share-popover__ig-option-label">{opt.label}</span>
                <span className="share-popover__ig-option-desc">{opt.description}</span>
              </span>
              <span className="share-popover__ig-option-chevron" aria-hidden="true">›</span>
            </button>
          ))}
          {renderStatus()}
        </>
      )}

      {view !== 'root' && view !== 'ig' && (
        <>
          {renderBackButton(onBackToIg, "Back to Instagram options")}
          <p className="share-popover__title">
            <BrandIcon name="instagram" />
            <span>{IG_OPTIONS.find((o) => o.mode === view)?.label}</span>
          </p>
          <p className="share-popover__note">{FALLBACK_COPY[view].note}</p>
          {hasImage && view !== 'dm' && (
            <button
              type="button"
              className="share-popover__option"
              role="menuitem"
              disabled={igBusy}
              onClick={onDownload}
            >
              <span className="material-symbols-outlined" aria-hidden="true">download</span>
              <span>{igBusy ? 'Downloading…' : 'Download image'}</span>
            </button>
          )}
          <button
            type="button"
            className="share-popover__option"
            role="menuitem"
            onClick={onCopy}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {copied ? 'check' : 'link'}
            </span>
            <span>{copied ? 'Blog link copied' : 'Copy blog link'}</span>
          </button>
          <a
            className="share-popover__option"
            href="https://www.instagram.com/"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={onOpenInstagram}
          >
            <BrandIcon name="instagram" />
            <span>Open Instagram</span>
          </a>
          {renderStatus()}
        </>
      )}
    </div>
  );

  // Portal to <body> so the menu escapes any ancestor `transform`/`overflow`
  // clipping (e.g. the feed card's hover translate + overflow hidden), which
  // is what made the menu jump/flicker on hover.
  return createPortal(menu, document.body);
}

function BrandIcon({ name }: { name: BrandName }) {
  if (name === 'facebook') {
    // Facebook 'f'
    return (
      <svg className="share-popover__icon share-popover__icon--facebook" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
        />
      </svg>
    );
  }
  if (name === 'whatsapp') {
    // WhatsApp: phone receiver + speech bubble
    return (
      <svg className="share-popover__icon share-popover__icon--whatsapp" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
        />
      </svg>
    );
  }
  // Instagram: rounded-square camera outline
  return (
    <svg className="share-popover__icon share-popover__icon--instagram" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"
      />
    </svg>
  );
}