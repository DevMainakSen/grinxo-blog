import type { Blog } from '../types/blog';

const DEFAULT_SITE_URL = 'http://localhost:5173';

/** Public site base URL, configurable via VITE_PUBLIC_SITE_URL. */
export function getSiteBaseUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  if (env && env.trim()) return env.trim().replace(/\/+$/, '');
  // Fall back to the current origin when possible.
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_SITE_URL;
}

/** SEO title fallback: seoTitle → blog.title */
export function resolveSeoTitle(blog: Blog): string {
  return blog.seo?.seoTitle || blog.title;
}

/** Meta description fallback: metaDescription → excerpt */
export function resolveMetaDescription(blog: Blog): string {
  return blog.seo?.metaDescription || blog.excerpt || '';
}

/** OG title fallback: ogTitle → seoTitle → blog.title */
export function resolveOgTitle(blog: Blog): string {
  return blog.seo?.ogTitle || blog.seo?.seoTitle || blog.title;
}

/** OG description fallback: ogDescription → metaDescription → excerpt */
export function resolveOgDescription(blog: Blog): string {
  return blog.seo?.ogDescription || blog.seo?.metaDescription || blog.excerpt || '';
}

/** OG image fallback: ogImage → featuredImage */
export function resolveOgImage(blog: Blog): string {
  return blog.seo?.ogImage || blog.featuredImage || '';
}

/** Canonical URL fallback: canonicalUrl → generated public blog URL */
export function resolveCanonicalUrl(blog: Blog): string {
  return blog.seo?.canonicalUrl || `${getSiteBaseUrl()}/blog/${blog.slug}`;
}

/** Robots directive string for the page. */
export function resolveRobots(blog: Blog): string {
  const index = blog.seo?.robotsIndex !== false;
  const follow = blog.seo?.robotsFollow !== false;
  return `${index ? 'index' : 'noindex'}, ${follow ? 'follow' : 'nofollow'}`;
}
