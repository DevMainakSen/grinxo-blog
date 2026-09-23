import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Blog, BlogSocialSharing, SocialShareDm, SocialSharePost, SocialShareStory, SocialShareTimeline } from '../../types/blog';
import { SOCIAL_TARGETS, SOCIAL_TARGET_RATIO, getShareContent, targetParts, type SocialTarget } from '../../utils/socialShare';
import ImagePicker from './ImagePicker';
import SocialSharePreview from './SocialSharePreview';

interface SocialSharingSectionProps {
  blog: Blog;
  onChange: (socialSharing: BlogSocialSharing) => void;
}

const SHORT_LABELS: Record<SocialTarget, string> = {
  'instagram:story': 'IG Story',
  'instagram:post': 'IG Post',
  'instagram:dm': 'IG DM',
  'facebook:story': 'FB Story',
  'facebook:timeline': 'FB Timeline',
};

const DM_EXAMPLE_TEMPLATE = ['I found this on GrinXO and thought you might like it!', '{{title}}', '{{url}}'].join('\n\n');

export default function SocialSharingSection({ blog, onChange }: SocialSharingSectionProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SocialTarget>('instagram:story');
  const ss = blog.socialSharing ?? {};
  const { platform, mode } = targetParts(active);
  // The IG DM config lives under `directMessage`, while its share mode is `dm`.
  const modeKey = platform === 'instagram' && mode === 'dm' ? 'directMessage' : mode;
  const platformCfg = (ss[platform] ?? {}) as Record<string, Record<string, unknown>>;
  const cur = platformCfg[modeKey] ?? {};
  const resolved = useMemo(() => getShareContent(blog, active), [blog, active]);
  const hashtags = (cur.hashtags as string[] | undefined) ?? [];

  function updateTarget(partial: Partial<SocialShareStory | SocialSharePost | SocialShareTimeline | SocialShareDm>) {
    onChange({
      ...ss,
      [platform]: { ...(ss[platform] ?? {}), [modeKey]: { ...cur, ...partial } },
    });
  }

  function setHashtags(value: string) {
    const list = value.split(',').map((h) => h.trim()).filter(Boolean);
    updateTarget({ hashtags: list });
  }

  function moveTab(e: KeyboardEvent<HTMLButtonElement>, current: SocialTarget) {
    const i = SOCIAL_TARGETS.indexOf(current);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % SOCIAL_TARGETS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + SOCIAL_TARGETS.length) % SOCIAL_TARGETS.length;
    else if (e.key !== 'Home' && e.key !== 'End') return;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = SOCIAL_TARGETS.length - 1;
    e.preventDefault();
    const t = SOCIAL_TARGETS[next];
    setActive(t);
    document.getElementById(`social-tab-${t}`)?.focus();
  }

  const customImage = Boolean(cur.image);
  const imageFallbackHint = customImage ? 'Custom image' : `Using default: ${resolved.imageSource}`;
  const showSecondaryFallback = customImage && resolved.image !== cur.image;

  return (
    <section className="editor-card seo-section social-section">
      <button
        type="button"
        className="seo-section__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="seo-section__toggle-left">
          <h2 className="editor-card__title">Social Sharing</h2>
          <span className="seo-section__toggle-hint">
            Instagram &amp; Facebook share content and live previews
          </span>
        </div>
        <span className="seo-section__toggle-icon" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="seo-section__body">
          <p className="field__hint">
            These settings customize the image, text and hashtags used when this article is
            shared on Instagram or Facebook. Left empty, each field falls back to your SEO/OG
            values automatically — the preview always shows what will actually be shared.
            Hashtags are stored separately from the text and are never guessed from your
            keywords or tags.
          </p>

          {/* ── Destination tabs ── */}
          <div className="social-tabs" role="tablist" aria-label="Social sharing destinations">
            {SOCIAL_TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`social-tab-${t}`}
                aria-selected={t === active}
                aria-controls={`social-panel-${t}`}
                tabIndex={t === active ? 0 : -1}
                className={`social-tabs__tab${t === active ? ' social-tabs__tab--active' : ''}`}
                onClick={() => setActive(t)}
                onKeyDown={(e) => moveTab(e, t)}
              >
                {SHORT_LABELS[t]}
              </button>
            ))}
          </div>

          <div
            id={`social-panel-${active}`}
            role="tabpanel"
            aria-labelledby={`social-tab-${active}`}
            className="social-section__panel"
          >
            <div className="social-section__grid">
              <div className="social-section__fields">
                {/* ── Image ── */}
                {mode !== 'dm' && (
                  <div className="field">
                    <ImagePicker
                      label={
                        mode === 'story' ? 'Story Image' : mode === 'post' ? 'Post Image' : 'Share Image'
                      }
                      folder="banners"
                      value={cur.image as string | undefined}
                      onChange={(url) => updateTarget({ image: url ?? '' })}
                    />
                    <p className="field__hint">
                      Recommended ratio: {SOCIAL_TARGET_RATIO[active]}.
                    </p>
                    <p className={`social-fallback${showSecondaryFallback ? ' social-fallback--note' : ''}`}>
                      {imageFallbackHint}
                      {showSecondaryFallback && ` — preview usually shows: ${resolved.imageSource}`}
                    </p>
                  </div>
                )}

                {/* ── Story fields ── */}
                {mode === 'story' && (
                  <>
                    {platform === 'instagram' && (
                      <div className="field">
                        <label className="field__label" htmlFor="ss-story-title">Story Title</label>
                        <input
                          id="ss-story-title"
                          className="field__input"
                          value={cur.title as string ?? ''}
                          onChange={(e) => updateTarget({ title: e.target.value })}
                          placeholder={blog.title}
                        />
                        <p className="field__hint">Small headline shown on the story; leave empty to use the blog title.</p>
                      </div>
                    )}
                    <div className="field">
                      <label className="field__label" htmlFor={`ss-story-text-${platform}`}>Story Text</label>
                      <textarea
                        id={`ss-story-text-${platform}`}
                        className="field__textarea"
                        rows={4}
                        value={cur.text as string ?? ''}
                        onChange={(e) => updateTarget({ text: e.target.value })}
                        placeholder={`${blog.title}\n${blog.excerpt}`}
                      />
                      <Counter value={cur.text as string ?? ''} limit={800} note="Story text is kept short for readability." />
                      <p className="field__hint">Leave empty to use the blog title + excerpt.</p>
                    </div>
                    <HashtagsField value={hashtags} onChange={setHashtags} />
                  </>
                )}

                {/* ── Instagram post fields ── */}
                {mode === 'post' && (
                  <>
                    <div className="field">
                      <label className="field__label" htmlFor="ss-post-caption">Post Caption</label>
                      <textarea
                        id="ss-post-caption"
                        className="field__textarea"
                        rows={4}
                        value={cur.caption as string ?? ''}
                        onChange={(e) => updateTarget({ caption: e.target.value })}
                        placeholder={blog.excerpt || blog.title}
                      />
                      <Counter value={cur.caption as string ?? ''} limit={2200} note="Instagram captions are truncated at 2,200 characters." />
                      <p className="field__hint">Leave empty to use the blog excerpt.</p>
                    </div>
                    <HashtagsField value={hashtags} onChange={setHashtags} label="Post Hashtags" />
                    <p className="field__hint">Hashtags are appended to the caption automatically.</p>
                  </>
                )}

                {/* ── Instagram DM fields ── */}
                {mode === 'dm' && (
                  <>
                    <div className="field">
                      <label className="field__label" htmlFor="ss-dm-text">Direct Message</label>
                      <textarea
                        id="ss-dm-text"
                        className="field__textarea"
                        rows={6}
                        value={cur.text as string ?? ''}
                        onChange={(e) => updateTarget({ text: e.target.value })}
                        placeholder={DM_EXAMPLE_TEMPLATE}
                      />
                      <Counter value={cur.text as string ?? ''} limit={1000} note="Instagram DMs are capped at 1,000 characters." />
                      <p className="field__hint">
                        Supports <code>{'{{title}}'}</code>, <code>{'{{url}}'}</code> and{' '}
                        <code>{'{{excerpt}}'}</code> placeholders. Leave empty for the default message.
                      </p>
                    </div>
                    <p className="field__hint">
                      Instagram DMs have no image — only the message and link are shared.
                    </p>
                  </>
                )}

                {/* ── Facebook timeline fields ── */}
                {mode === 'timeline' && (
                  <>
                    <div className="field">
                      <label className="field__label" htmlFor="ss-tl-title">Card Title</label>
                      <input
                        id="ss-tl-title"
                        className="field__input"
                        value={cur.title as string ?? ''}
                        onChange={(e) => updateTarget({ title: e.target.value })}
                        placeholder={resolved.title || ''}
                      />
                      <Counter value={cur.title as string ?? ''} limit={300} note="Link titles are typically truncated around 300 characters." />
                      <p className="field__hint">Leave empty to use the OG title.</p>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="ss-tl-desc">Card Description</label>
                      <textarea
                        id="ss-tl-desc"
                        className="field__textarea"
                        rows={2}
                        value={cur.description as string ?? ''}
                        onChange={(e) => updateTarget({ description: e.target.value })}
                        placeholder={resolved.description || ''}
                      />
                      <Counter value={cur.description as string ?? ''} limit={300} note="Link descriptions are typically truncated around 300 characters." />
                      <p className="field__hint">Leave empty to use the OG description.</p>
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor="ss-tl-text">Post Text</label>
                      <textarea
                        id="ss-tl-text"
                        className="field__textarea"
                        rows={3}
                        value={cur.text as string ?? ''}
                        onChange={(e) => updateTarget({ text: e.target.value })}
                        placeholder={blog.excerpt || blog.title}
                      />
                      <Counter value={cur.text as string ?? ''} limit={1000} note="Kept concise for a share message." />
                      <p className="field__hint">
                        Your message when sharing. Leave empty to use the blog excerpt.
                      </p>
                    </div>
                    <HashtagsField value={hashtags} onChange={setHashtags} label="Post Hashtags" />
                  </>
                )}
              </div>

              {/* ── Live preview ── */}
              <div className="social-section__preview-col">
                <SocialSharePreview target={active} content={resolved} />
                <p className="field__hint">
                  Preview reflects your live (unsaved) values. Sharing appends UTM tags to{' '}
                  <code>{displayHost(resolved.url)}</code>.
                </p>
                {mode === 'timeline' && !hashtags.length && (
                  <p className="field__hint">
                    Post text and hashtags are never added to the preview card — Facebook only
                    reads the Card Title, Card Description and Share Image from the link.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Counter({ value, limit, note }: { value: string; limit: number; note: string }) {
  const over = value.length > limit;
  return (
    <span className={`field__charcount${over ? ' field__charcount--warn' : ''}`}>
      {value.length} / {limit}
      {over && <span className="field__charcount-msg"> — {note}</span>}
    </span>
  );
}

function HashtagsField({
  value,
  onChange,
  label = 'Hashtags',
}: {
  value: string[];
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="ss-hashtags">Hashtags</label>
      <input
        id="ss-hashtags"
        className="field__input"
        value={value.join(', ')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. birthday, firstbirthday"
      />
      <p className="field__charcount">
        {value.length} tag{value.length === 1 ? '' : 's'} — stored separately and appended to the{' '}
        {label === 'Post Hashtags' ? 'caption' : 'text'} when sharing.
      </p>
    </div>
  );
}

function displayHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}