# GrinXO Blog CMS — SEO Implementation

This document describes the SEO capabilities added to the GrinXO Blog CMS prototype. It
covers the SEO data model, keyword management, internal/external linking, public metadata,
structured data, sitemap/robots behavior, and backlink-friendly architecture.

## SEO Fields (per blog)

Each blog carries an optional nested `seo` object persisted in `server/data/blogs.json`:

| Field | Type | Description |
|-------|------|-------------|
| `seoTitle` | `string?` | Title shown in search results. |
| `metaDescription` | `string?` | Description shown in search results. |
| `focusKeyword` | `string?` | The single primary keyword this article targets. |
| `secondaryKeywords` | `string[]` | Additional related keywords (editorial only). |
| `canonicalUrl` | `string?` | Canonical URL override. |
| `ogTitle` | `string?` | Open Graph title. |
| `ogDescription` | `string?` | Open Graph description. |
| `ogImage` | `string?` | Open Graph image. |
| `robotsIndex` | `boolean?` | Allow indexing (default `true`). |
| `robotsFollow` | `boolean?` | Allow following links (default `true`). |

## Metadata Fallback Hierarchy

Deterministic fallbacks are used when a more specific field is absent:

| Target | Fallback chain |
|--------|----------------|
| SEO Title | `seoTitle` → `blog.title` |
| Meta Description | `metaDescription` → `blog.excerpt` |
| OG Title | `ogTitle` → `seoTitle` → `blog.title` |
| OG Description | `ogDescription` → `metaDescription` → `blog.excerpt` |
| OG Image | `ogImage` → `featuredImage` |
| Canonical | `canonicalUrl` → generated `/blog/{slug}` URL |

## Admin UX

### New Blog / Edit Blog SEO section

Both pages share the same `BlogEditor`, so a single **SEO Settings** accordion appears in
both, organized into subsections:

- **Search Appearance** — SEO title, meta description, Google search preview.
- **Keywords** — focus keyword + add/remove secondary keywords (deduped, lowercased).
- **Social Sharing** — Open Graph title, description, image (with fallback hints) + social
  preview. Shares to WhatsApp, Instagram, and Facebook.
- **Canonical & Indexing** — canonical URL, "index" and "follow" robots toggles.
- **SEO Health** — checklist of recommended fields (not a ranking score).

Character counters warn (never hard-block) at 60 (title) and 160 (description).

### Dashboard SEO column

The admin blog table shows `✓ Optimized` when SEO title, meta description, and focus keyword
are all set; `⚠ Needs attention` otherwise. This reflects configured metadata, not rankings.

## Keyword Management

- **Focus keyword**: one primary phrase.
- **Secondary keywords**: an arbitrary list, editable/removable.
- Duplicates and the focus keyword itself are rejected.
- Keywords are editorial guidance only; the system never injects keywords into article
  content.

## Internal Linking

The existing rich-text link menu already supported selecting another blog article via a
searchable `BlogSelector`. It remains and now:

- Generates stable `/blog/{slug}` relative URLs automatically (no manual URL copying).
- Internal links are kept relative and followable.

## External Link Attributes

When inserting an external link the admin can choose a relationship:

- **Follow** (default) — no `rel` directive beyond `noopener noreferrer`.
- **No follow** — `rel="nofollow"`.
- **Sponsored** — `rel="nofollow sponsored"` (for paid/partnered links).
- **UGC** — `rel="nofollow ugc"` (for user-generated content).

External links default to opening in a new tab with `target="_blank"` and
`rel="noopener noreferrer"`. The server-side sanitizer preserves semantic `rel` values while
always re-asserting `noopener noreferrer`, and strips any unsafe scheme.

## Public Metadata (Article Page)

Published article pages render (via `react-helmet-async`, see `src/pages/BlogArticle.tsx`):

- `<title>`
- `<meta name="description">`
- `<link rel="canonical">`
- `<meta name="robots">`
- `<meta name="author">`
- Open Graph: `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name`
- JSON-LD Article schema and BreadcrumbList schema

Twitter/X card metadata is intentionally not emitted, and Twitter is not offered as a share
destination — sharing is via the WhatsApp, Instagram, and Facebook buttons in the article
actions.

The project runs React 19, where `react-helmet-async` 3.x acts as a passthrough and the
native `<title>`/`<meta>`/`<link>`/`<script>` elements are hoisted to `<head>` by React
itself (no tag deduplication). To keep a single authoritative title and description per
page:

- `index.html` has **no** static `<title>` or `<meta name="description">`; each top-level
  page provides its own (see `BlogHome.tsx` and `BlogArticle.tsx`). This avoids duplicate
  title/description tags that hurt SEO.
- Every `<title>` child is a **single string** (e.g.
  `` `<title>{`${resolveSeoTitle(blog)} | GrinXO`}</title>` ``). React 19 silently ignores
  a `<title>` with more than one JSX child (e.g. `{expr} | GrinXO`), producing an empty
  title.

No duplicate title/canonical/OG tags are emitted across the app.

## Structured Data

Two JSON-LD blocks are emitted for published articles:

1. **Article** (`@type: Article`) — headline, description, image, dates, author (Person),
   publisher (Organization), mainEntityOfPage.
2. **BreadcrumbList** — reflects the visible Blog → Article navigation.

Untruthful data is not invented; author and dates come from the actual blog record.

## Sitemap & Robots

- **`/sitemap.xml`** — served by the Node backend. Includes only **published, indexable**
  blogs (excludes drafts, scheduled, deleted, and `robotsIndex === false`). The home blog
  listing is included. Excludes admin URLs.
- **`/robots.txt`** — allows `/blog`, disallows `/blog/admin`, `/api/`, `/uploads/`, and
  references the sitemap. Not used as a security mechanism.

Site base URL comes from `PUBLIC_SITE_URL` (env) or `http://localhost:{PORT}`. Frontend uses
`VITE_PUBLIC_SITE_URL` with a runtime fallback to the current origin.

## Publication Rules

- Draft and scheduled blogs are never exposed by public routes/APIs and never appear in the
  sitemap.
- Only published blogs render SEO metadata publicly.
- Draft/scheduled blogs provide no `robots` exposure via the SEO layer.

## Slug Changes & Backlink Preservation

Changing a **published** blog's slug automatically records a 301 redirect in
`server/data/redirects.json`:

```json
[{ "from": "/blog/old-slug", "to": "/blog/new-slug", "createdAt": "..." }]
```

Requests to the old path are 301-redirected to the new one (handled in `server/server.ts`).
This is a lightweight prototype mechanism; see Future Work.

## Security

- SEO fields are never rendered as raw HTML; they are only inserted into `<meta>`/`<title>`
  attributes and escaped JSON-LD.
- The existing rich-text HTML sanitizer continues to enforce an allow-list of tags/attrs,
  block unsafe schemes, and preserve semantic `rel` values.
- `PUBLIC_SITE_URL`/`VITE_PUBLIC_SITE_URL` are public values; no secrets are exposed.

## Files Changed

- `src/types/blog.ts`, `server/types/blog.ts` — added `BlogSeo` + `seo` on `Blog`/`BlogInput`.
- `server/types/redirect.ts` — new `SlugRedirect` type.
- `server/services/blogStorage.ts` — SEO persistence, redirects, sitemap entries, SEO
  fallback helpers, rel-preserving sanitizer.
- `server/controllers/blogs.ts` — SEO input normalization.
- `server/server.ts` — `/sitemap.xml`, `/robots.txt`, redirect middleware.
- `vite.config.ts` — dev proxy for robots/sitemap.
- `src/utils/blog.ts` — `seo` in normalize/payload.
- `src/utils/seo.ts` — new fallback resolvers + site base URL.
- `src/main.tsx` — wrapped in `HelmetProvider`.
- `src/pages/BlogArticle.tsx` — Helmet metadata + JSON-LD.
- `src/pages/admin/BlogDashboard.tsx` — SEO status column.
- `src/components/admin/BlogEditor.tsx` — integrates SEO section.
- `src/components/admin/SeoSection.tsx`, `SeoHealth.tsx`, `SeoPreview.tsx`,
  `KeywordManager.tsx` — new admin SEO UI.
- `src/components/admin/LinkMenu.tsx`, `RichTextEditor.tsx` — external link rel attributes.
- `src/admin.css` — SEO styles.
- `package.json` — added `react-helmet-async`.

## Implemented Now vs Future

**Implemented now:** SEO metadata model, keyword management, search/social previews, SEO
health indicator, internal linking, external link `rel` attributes, canonical URLs, robots
directives, public OG/JSON-LD metadata, sitemap.xml, robots.txt, published-slug 301
redirects, dashboard SEO status, WhatsApp/Instagram/Facebook share buttons.

**Future SEO integrations (deliberately not added; no backlink discovery or ranking
promises):** Google Search Console, keyword ranking tracking, backlink tracking, SEO
analytics, broken-link monitoring, content recommendations, competitor analysis, search
performance reporting. These would build on the existing model without rewriting it.

## Production Recommendations

- Set `PUBLIC_SITE_URL` (backend) and `VITE_PUBLIC_SITE_URL` (frontend build) to the real
  canonical domain in production.
- Redirect handling is file-based and per-instance; for a multi-instance/scale deployment
  move redirects and slug history to shared storage.
- Admin access has no authentication in this prototype; production should add real access
  control to admin routes/APIs (robots.txt is not security).
