import type { Blog } from '../../types/blog';

interface SeoHealthProps {
  blog: Blog;
}

interface Check {
  label: string;
  ok: boolean;
}

export default function SeoHealth({ blog }: SeoHealthProps) {
  const seo = blog.seo;
  const checks: Check[] = [
    { label: 'SEO title', ok: Boolean(seo?.seoTitle || blog.title) },
    { label: 'Meta description', ok: Boolean(seo?.metaDescription || blog.excerpt) },
    { label: 'Focus keyword', ok: Boolean(seo?.focusKeyword) },
    { label: 'Canonical URL', ok: Boolean(seo?.canonicalUrl || blog.slug) },
    { label: 'Featured image', ok: Boolean(blog.featuredImage) },
    { label: 'Internal links', ok: (blog.content || '').includes('/blog/') },
  ];

  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="seo-health">
      <div className="seo-health__header">
        <h4 className="seo-health__title">SEO Health</h4>
        <span className={`seo-health__score ${passed === checks.length ? 'seo-health__score--good' : ''}`}>
          {passed} / {checks.length}
        </span>
      </div>
      <ul className="seo-health__list">
        {checks.map((c) => (
          <li key={c.label} className={`seo-health__item ${c.ok ? 'seo-health__item--ok' : 'seo-health__item--warn'}`}>
            <span className="seo-health__icon" aria-hidden="true">{c.ok ? '✓' : '⚠'}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
