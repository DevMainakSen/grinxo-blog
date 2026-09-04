import { useState } from 'react';
import type { Blog, BlogSeo } from '../../types/blog';
import ImagePicker from './ImagePicker';
import KeywordManager from './KeywordManager';
import SeoPreview from './SeoPreview';
import SeoHealth from './SeoHealth';

interface SeoSectionProps {
  blog: Blog;
  onChange: (seo: BlogSeo) => void;
}

export default function SeoSection({ blog, onChange }: SeoSectionProps) {
  const [open, setOpen] = useState(false);
  const seo = blog.seo ?? {};

  function update(partial: Partial<BlogSeo>) {
    onChange({ ...seo, ...partial });
  }

  const titleLen = (seo.seoTitle || blog.title || '').length;
  const descLen = (seo.metaDescription || '').length;

  return (
    <section className="editor-card seo-section">
      <button
        type="button"
        className="seo-section__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="seo-section__toggle-left">
          <h2 className="editor-card__title">SEO Settings</h2>
          <span className="seo-section__toggle-hint">
            Search appearance, keywords, social sharing
          </span>
        </div>
        <span className="seo-section__toggle-icon" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="seo-section__body">
          {/* ── Search Appearance ── */}
          <div className="seo-subsection">
            <h3 className="seo-subsection__title">Search Appearance</h3>

            <div className="field">
              <label className="field__label" htmlFor="seoTitle">SEO Title</label>
              <input
                id="seoTitle"
                className="field__input"
                value={seo.seoTitle ?? ''}
                onChange={(e) => update({ seoTitle: e.target.value })}
                placeholder={blog.title || 'Enter SEO title'}
              />
              <span className={`field__charcount ${titleLen > 60 ? 'field__charcount--warn' : ''}`}>
                {titleLen} / 60
                {titleLen > 60 && <span className="field__charcount-msg"> — May be too long for search results.</span>}
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="metaDesc">Meta Description</label>
              <textarea
                id="metaDesc"
                className="field__textarea"
                rows={3}
                value={seo.metaDescription ?? ''}
                onChange={(e) => update({ metaDescription: e.target.value })}
                placeholder={blog.excerpt || 'Enter meta description'}
              />
              <span className={`field__charcount ${descLen > 160 ? 'field__charcount--warn' : ''}`}>
                {descLen} / 160
                {descLen > 160 && <span className="field__charcount-msg"> — May be too long for search results.</span>}
              </span>
            </div>

            <SeoPreview
              seoTitle={seo.seoTitle ?? ''}
              metaDescription={seo.metaDescription ?? ''}
              slug={blog.slug}
              ogImage={seo.ogImage}
              ogTitle={seo.ogTitle}
              ogDescription={seo.ogDescription}
              featuredImage={blog.featuredImage}
            />
          </div>

          {/* ── Keywords ── */}
          <div className="seo-subsection">
            <h3 className="seo-subsection__title">Keywords</h3>
            <KeywordManager
              focusKeyword={seo.focusKeyword ?? ''}
              secondaryKeywords={seo.secondaryKeywords ?? []}
              onChange={update}
            />
          </div>

          {/* ── Social Sharing ── */}
          <div className="seo-subsection">
            <h3 className="seo-subsection__title">Social Sharing (Facebook &amp; WhatsApp)</h3>

            <div className="field">
              <label className="field__label" htmlFor="ogTitle">OG Title</label>
              <input
                id="ogTitle"
                className="field__input"
                value={seo.ogTitle ?? ''}
                onChange={(e) => update({ ogTitle: e.target.value })}
                placeholder={seo.seoTitle || blog.title || 'Fallback: SEO title → Blog title'}
              />
              <p className="field__hint">Leave empty to use the SEO title.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="ogDesc">OG Description</label>
              <textarea
                id="ogDesc"
                className="field__textarea"
                rows={2}
                value={seo.ogDescription ?? ''}
                onChange={(e) => update({ ogDescription: e.target.value })}
                placeholder={seo.metaDescription || blog.excerpt || 'Fallback: meta description → excerpt'}
              />
              <p className="field__hint">Leave empty to use the meta description.</p>
            </div>

            <ImagePicker
              label="OG Image"
              folder="banners"
              value={seo.ogImage}
              onChange={(url) => update({ ogImage: url ?? '' })}
              className="image-picker--og"
            />
          </div>

          {/* ── Canonical & Indexing ── */}
          <div className="seo-subsection">
            <h3 className="seo-subsection__title">Canonical &amp; Indexing</h3>

            <div className="field">
              <label className="field__label" htmlFor="canonicalUrl">Canonical URL</label>
              <input
                id="canonicalUrl"
                className="field__input"
                value={seo.canonicalUrl ?? ''}
                onChange={(e) => update({ canonicalUrl: e.target.value })}
                placeholder={`Auto-generated: /blog/${blog.slug}`}
              />
              <p className="field__hint">
                Use when this article is a copy or alternate version of another URL.
              </p>
            </div>

            <div className="field-row field-row--toggles">
              <label className="check">
                <input
                  type="checkbox"
                  checked={seo.robotsIndex !== false}
                  onChange={(e) => update({ robotsIndex: e.target.checked })}
                />
                <span>Allow search engines to index this page</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={seo.robotsFollow !== false}
                  onChange={(e) => update({ robotsFollow: e.target.checked })}
                />
                <span>Allow search engines to follow links</span>
              </label>
            </div>
          </div>

          {/* ── SEO Health ── */}
          <div className="seo-subsection">
            <SeoHealth blog={blog} />
          </div>
        </div>
      )}
    </section>
  );
}
