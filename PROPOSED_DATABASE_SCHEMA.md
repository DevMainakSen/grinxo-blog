# Proposed Production-Ready Database Schema — GrinXO Blog

**Analysis-only deliverable.** This document proposes a database schema for the GrinXO Blog based strictly on the *actual, current implementation*. It does **not** modify any code, JSON data, package manifest, or configuration. No migrations, ORM models, or database are created. The only artifact is this report.

- **Date:** 2026-09-02
- **Evidence basis:** `src/`, `server/`, `scripts/`, `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, and live inspection of `server/data/blogs.json`, `server/data/seed.blogs.json`, `server/data/categories.json`, and `server/uploads/`.

Every recommendation is grounded in real files and routes. Where something is *proposed* rather than *observed*, it is explicitly labelled as such (observed / inferred / proposed / future).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Understanding](#2-project-understanding)
3. [Current Domain Model](#3-current-domain-model)
4. [Current JSON / Data Model](#4-current-json--data-model)
5. [Database Recommendation](#5-database-recommendation)
6. [Database Selection Comparison](#6-database-selection-comparison)
7. [Core Entities](#7-core-entities)
8. [Proposed Tables](#8-proposed-tables)
9. [Column Definitions](#9-column-definitions)
10. [Primary Key Strategy](#10-primary-key-strategy)
11. [Slug Strategy](#11-slug-strategy)
12. [Relationships](#12-relationships)
13. [Mermaid ER Diagram](#13-mermaid-er-diagram)
14. [Indexing Strategy](#14-indexing-strategy)
15. [Constraints](#15-constraints)
16. [Blog Lifecycle Model](#16-blog-lifecycle-model)
17. [Scheduling Model](#17-scheduling-model)
18. [Image Storage Strategy](#18-image-storage-strategy)
19. [Internal Blog Linking](#19-internal-blog-linking)
20. [Author Model](#20-author-model)
21. [Authentication / Admin Considerations](#21-authentication--admin-considerations)
22. [Normalization Strategy](#22-normalization-strategy)
23. [JSON → Database Mapping](#23-json--database-mapping)
24. [Migration Strategy](#24-migration-strategy)
25. [Migration Difficulty](#25-migration-difficulty)
26. [Repository / Data Access Considerations](#26-repository--data-access-considerations)
27. [API Impact](#27-api-impact)
28. [Query Patterns](#28-query-patterns)
29. [Transaction Requirements](#29-transaction-requirements)
30. [Concurrency Considerations](#30-concurrency-considerations)
31. [Performance Considerations](#31-performance-considerations)
32. [Security Considerations](#32-security-considerations)
33. [Data Integrity Considerations](#33-data-integrity-considerations)
34. [Core vs Optional Tables](#34-core-vs-optional-tables)
35. [Future Evolution](#35-future-evolution)
36. [Microservice Readiness](#36-microservice-readiness)
37. [Assumptions](#37-assumptions)
38. [Schema Trade-offs](#38-schema-trade-offs)
39. [Final Recommended Schema](#39-final-recommended-schema)
40. [Schema Scores](#40-schema-scores)
41. [Final Verdict](#41-final-verdict)

---

## 1. Executive Summary

GrinXO Blog is a single-server prototype (React frontend + Express backend `server/server.ts` + JSON-file persistence `server/data/blogs.json`). It models a small editorial domain: blogs with dynamic rich-text **sections**, a **draft → scheduled → published** lifecycle, banner/section **images**, free-text **category** and **tags**, and **author strings**. There is **no authentication**, **no user entity**, **no `createdAt`/`updatedAt`**, and no separate author/category/tag tables today — all validated by inspection (§4).

The recommended production database is **PostgreSQL**. It maps the existing JSON model cleanly onto a small set of relational tables while preserving the current API contract and frontend, so a JSON→DB migration is low-friction (§25).

**Recommended core tables (6):** `blogs`, `blog_sections`, `blog_images`, `categories`, `tags`, `blog_tags`. Plus one **production/optional** table: `admins` (future auth anchor).

**Most important schema decision:** preserve the existing **API contract and JSON shape** as the interface boundary, and only normalize data *below* that boundary. Concretely: keep `blogs.content` as the assembled, sanitized HTML `TEXT` (it is what the public page renders via `dangerouslySetInnerHTML`, `BlogArticle.tsx:131`), while also storing the structured `blog_sections` rows that produce it. This gives the frontend zero disruption plus a queryable, editable representation.

**Biggest migration consideration:** today `blog.content` is *derived* from `sections` (`buildContentHtml`, `blogStorage.ts:209`), but the write API also accepts a raw, unsanitized `content` (`controllers/blogs.ts:15`). Migration must reconcile these two sources of truth and decide who owns `content`. This schema treats `content` as a stored, app-sanitized column, with `blog_sections` as the canonical editable structure.

**Overall schema score: 8.2/10** — simple, high-integrity, easy to migrate, correctly sized (no CMS over-engineering).

---

## 2. Project Understanding

**What the app does:** a blog with a public reading surface and an admin authoring surface, sharing one dataset.

- **Public:** `BlogHome.tsx` (featured carousel, trending, latest, category sidebar, newsletter) and `BlogArticle.tsx` (renders rich HTML via `dangerouslySetInnerHTML`).
- **Admin:** `BlogDashboard.tsx` (status/category filter, search), `CreateBlog.tsx` / `EditBlog.tsx`, Tiptap editor `RichTextEditor.tsx`, section builder `SectionBuilder.tsx`, image pickers `ImagePicker.tsx`, schedule modal `SchedulePublishModal.tsx`.
- **Persistence:** `server/services/blogStorage.ts` keeps an in-memory cache and writes the whole dataset to `blogs.json` on every mutation (`persist`, blogStorage.ts:470).
- **Scheduling:** `server/services/scheduler.ts` — 30 s interval + startup recovery; publishes blogs whose `scheduledAt` is due.
- **Uploads:** files written to `server/uploads/{banners,sections}` (`imageStorage.ts`), referenced by URL path.

**Data flow (single server):** React → `src/services/blogApi.ts` (fetch) → Express routes → controllers → storage service → `blogs.json`; or → uploads service → `/uploads/...`.

---

## 3. Current Domain Model

Reverse-engineered entities that **genuinely exist**:

| Entity | Exists today? | Evidence | Notes |
|---|---|---|---|
| **Blog** | ✅ | `server/types/blog.ts:9`, `src/types/blog.ts:9`, `server/data/blogs.json` | Core entity; type is duplicated front/back |
| **BlogSection** | ✅ | `BlogSection` (types), `SectionBuilder.tsx`, `buildContentHtml` | Dynamic, orderable, rich text + optional image |
| **Image reference** | ⚠️ partial | `featuredImage`/`thumbnail`, `Section.image`, `saveImage`, `/uploads` | Only a URL string; no metadata table |
| **Author** | ⚠️ plain string | `author: string`, `authorAvatar?: string` on Blog | Not an entity |
| **Category** | ⚠️ string | `category: string` on Blog; `categories.json` written but never read | Free-string; no FK |
| **Tag** | ⚠️ free strings | `tags: string[]` on Blog; `related` logic in `blogService.ts` | No table; repeated values |
| **Admin / User** | ❌ | none | No auth (`AdminLayout.tsx:61`) |
| **BlogLinks** | ❌ as entity | stored *inside* rich text as `/blog/{slug}` | Textual; no FKs (`LinkMenu.tsx:31,214,230`) |
| **Publication metadata** | ⚠️ | `status`, `scheduledAt`, `publishedAt` | No `createdAt`/`updatedAt` (confirmed absent) |

---

## 4. Current JSON / Data Model

Inspected live from `server/data/blogs.json`. A runtime blog record:

| Field (runtime) | Type | Required? | Meaning | Notes |
|---|---|---|---|---|
| `id` | string | yes | `'1'` (seed) or `blog-<time36>-<rand>` | Generated `blogStorage.ts:326` |
| `title` | string | yes | article title | |
| `slug` | string | yes | URL segment `/blog/{slug}` | unique in practice, not DB-enforced |
| `excerpt` | string | no | card blurb | |
| `featuredImage` | string | yes (type) | banner URL | Unsplash URLs in seed; `/uploads/...` uploaded |
| `thumbnail` | string | no (alias) | duplicate of `featuredImage` | set equal by `toClient` (`controllers/blogs.ts:151`) |
| `author` | string | yes | author display name | seed e.g. `"Priya Sharma"` |
| `authorAvatar` | string | no | avatar URL | `i.pravatar.cc` in seed |
| `publishedAt` | string | yes | displayed/historical publish date | mixed formats (date-only in seed, full ISO after edits) |
| `readTime` | number | yes | minutes | **derived** (`estimateReadTime`, blogStorage.ts:416) |
| `category` | string | yes | single category name | free text, e.g. `"Party Themes"` |
| `tags` | string[] | no | free-form labels | ~50 distinct values across seed |
| `featured` | boolean | yes | carousel flag | |
| `trending` | boolean | no | trending flag | |
| `content` | string | yes | full HTML body | **derived** from `sections` or accepted raw via API |
| `status` | `draft\|scheduled\|published` | yes | lifecycle | all 15 seed blogs `published` |
| `scheduledAt` | string | no | ISO future instant | absent when published/draft |
| `sections` | object[] | yes | see below | |
| `sections[].id` | string | yes | e.g. `contacts`, `dinosaur-adventure`, `section-<time36>` | generated client-side |
| `sections[].heading` | string | no | heading rendered `<h2>` | |
| `sections[].content` | string | yes | rich editor HTML | e.g. `<p><strong><mark …>…</mark></strong></p>` |
| `sections[].image` | string | no | `/uploads/sections/...` or URL | via `ImagePicker` |
| `sections[].imageCaption` | string | no | caption under image | |

Observed **duplication / implicit coupling:**
- `thumbnail` duplicates `featuredImage`.
- `readTime` is derived (`estimateReadTime`).
- `content` (blog) is a *materialized* render of `sections` (`buildContentHtml`, blogStorage.ts:209) **but is also directly writable** — two sources of truth.
- `categories.json` is written (`blogStorage.ts:287-289`) but **never read** — categories are computed live from published blogs (`server/server.ts:36-41`, `blogStorage.ts:314`).

---

## 5. Database Recommendation

**Recommended: PostgreSQL.** Rationale for *this* project:
- The domain is small and well-defined: blogs → sections → images with a clear lifecycle and category/tag references — classic relational shape.
- The scheduling query (`status='scheduled' AND scheduled_at <= now()`) is trivial and index-backed.
- Referential integrity (slug uniqueness, valid status, orphan prevention) is exactly what Postgres constraints give natively.
- The architecture already has a clean data-access seam (`blogStorage.ts`) a Postgres adapter can slot behind with **no frontend/API change** (§26).
- Migration from JSON is low-risk: each JSON blog maps 1:1 to one `blogs` row plus `blog_sections` rows (§23).

---

## 6. Database Selection Comparison

| Criterion | **PostgreSQL (recommended)** | MongoDB |
|---|---|---|
| Blog structure | Fits; sections normalized | Fits (embedded document natural) |
| Dynamic sections | Two-table model simple & queryable | Embed in one doc, easy |
| Rich text | `TEXT` — same as current string | String field — same |
| Scheduling | `WHERE status='scheduled' AND scheduled_at<=now()` indexed | Fine, index on `scheduled_at` |
| Relationships | FK integrity for category/tag/images | Manual; no FKs by default |
| Transactions | Native (blog + sections atomic) | Multi-doc transactions (heavier) |
| Data integrity | Schema + constraints | Weaker; app-enforced |
| Query/admin/reporting | SQL, powerful | Aggregation framework |
| Migration from JSON | Direct, 1:1 mapping | Also direct (embedded) |
| Developer experience | SQL + typed accessors, well-known | Flexible, schemaless drift risk |
| Operational complexity | Managed RDS/Supabase easy | Managed cluster easy |

**Verdict:** PostgreSQL wins on **data integrity, transactions, referential integrity, and SQL querying** — all genuinely beneficial here (slug uniqueness, lifecycle, scheduling, orphan prevention). MongoDB's document fit is real but unnecessary; the current JSON is already a row-plus-children shape. **PostgreSQL is the single, clear recommendation.**

---

## 7. Core Entities

Only entities with a genuine reason to be separate tables:

| Table | Why it exists | Corresponding code | Required? |
|---|---|---|---|
| `blogs` | Every metastable blog attribute + lifecycle + assembled content | `Blog` type, `blogStorage.ts` CRUD/publish/schedule | ✅ core |
| `blog_sections` | Dynamic, orderable rich-text blocks the editor edits independently | `SectionBuilder.tsx`, `sections[]`, `buildContentHtml` | ✅ core |
| `blog_images` | Uniform metadata for banner + section images; future object-storage target | `imageStorage.ts`, `featuredImage`, `Section.image`, `/uploads` | ✅ core (metadata only) |
| `categories` | Controlled category list referenced by `blogs.category` | `categories` endpoint computed live | ⚠️ core-lite (currently free string) |
| `tags` + `blog_tags` | Free `tags[]` normalized to enable related/query | `Blog.tags`, `getRelatedBlogs` (blogService.ts) | ⚠️ core-lite (currently free strings) |
| `admins` | Future auth anchor for `published_by`/`updated_by` | none today | 🔮 future/production (§21) |

**Deliberately NOT separate tables:** `author` (kept as string on `blogs`, §20); `blog_links` (kept in rich text, §19); images as binary BLOB (metadata only, §18/§35); revision/history tables (§24/§25); slug-alias table (§11).

---

## 8. Proposed Tables

- **`blogs`** — article record: content ownership, lifecycle, metadata.
- **`blog_sections`** — ordered content blocks of a blog.
- **`blog_images`** — references + metadata for every image a blog uses (banner and section), enabling future object-storage and orphan cleanup.
- **`categories`** — controlled, de-dupable category list.
- **`tags`** / **`blog_tags`** — normalized tag taxonomy with a many-to-many join.
- **`admins`** (production/future) — authentication + attribution anchor.

---

## 9. Column Definitions

Legend: **PK** primary key · **FK** foreign key · **UQ** unique · **IDX** indexed · **CHK** check constraint.

### Table: `blogs`

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK**, IDX | Opaque internal id; replaces JSON `blog-...` |
| `legacy_external_id` | `VARCHAR(64)` | yes | NULL | UQ | Original JSON `id` (`'1'`, `blog-...`) — for old links/edit URLs (**proposed**) |
| `title` | `VARCHAR(255)` | no | — | | Article title |
| `slug` | `VARCHAR(255)` | no | — | **UQ**, IDX | Public URL segment |
| `excerpt` | `VARCHAR(500)` | yes | NULL | | Card blurb |
| `author_name` | `VARCHAR(120)` | no | — | IDX | Free-text author display name (§20) |
| `author_avatar_url` | `VARCHAR(512)` | yes | NULL | | Avatar URL (external or `/uploads/...`) |
| `category_id` | `UUID` | no | — | **FK→categories**, IDX | Normalized category (was `category` string) |
| `featured` | `BOOLEAN` | no | `false` | IDX | Carousel placement |
| `trending` | `BOOLEAN` | no | `false` | IDX | Trending placement |
| `status` | `VARCHAR(12)` | no | `'draft'` | IDX | **CHK** `IN ('draft','scheduled','published')` |
| `scheduled_at` | `TIMESTAMPTZ` | yes | NULL | IDX | Future instant for scheduled publish |
| `published_at` | `TIMESTAMPTZ` | yes | NULL | IDX | Set on publish; NULL while draft |
| `content` | `TEXT` | no | — | | App-sanitized, assembled HTML body (public render target) |
| `read_time_minutes` | `INTEGER` | no | `1` | | **CHK** `>= 0`; derived (`estimateReadTime`) |
| `is_seed` | `BOOLEAN` | no | `false` | | Marks bundled seed rows (migration diff aid) (**proposed**) |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | IDX | **proposed** — absent today, needed for listing/sort |
| `updated_at` | `TIMESTAMPTZ` | no | `now()` | | **proposed** — absent today |

> **`content` vs `blog_sections`:** `content` is the stored, server-sanitized HTML the public page renders (`BlogArticle.tsx:131`). `blog_sections` are the canonical editorial input that (re)builds it. Keeping both keeps the public render path untouched and editors get structured rows.
>
> `read_time_minutes` is derived (`estimateReadTime`, blogStorage.ts:416). Options: (a) store app-computed value, (b) generated column, (c) recompute on write. **Recommend (a)** to match current JSON and stay simple.

### Table: `blog_sections`

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK** | Internal section id |
| `blog_id` | `UUID` | no | — | **FK→blogs**, IDX | Owning blog |
| `position` | `INTEGER` | no | `0` | IDX (with blog_id) | 0-based ordering (mirrors `moveSection`, SectionBuilder.tsx:29) |
| `heading` | `VARCHAR(255)` | yes | NULL | | Rendered as `<h2>` |
| `content` | `TEXT` | no | `''` | | Rich-editor HTML |
| `image_id` | `UUID` | yes | NULL | **FK→blog_images** | Optional section image |
| `image_caption` | `VARCHAR(500)` | yes | NULL | | Caption under image |
| `the_legacy_id` | `VARCHAR(64)` | yes | NULL | | Original JSON section `id` (`dinosaur-adventure`, `section-...`) — informational (**proposed**) |

> **Why not use the frontend string `id` as PK?** The editor keys sections by that string (`SectionBuilder.tsx`), but it is regenerated client-side and not stable data. `the_legacy_id` preserves it for round-tripping without coupling DB identity to client-generated values.

### Table: `blog_images`

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK** | Image reference |
| `blog_id` | `UUID` | no | — | **FK→blogs** | Owning blog |
| `bucket` | `VARCHAR(32)` | no | — | | **CHK** `IN ('banner','section')` — mirrors upload folder |
| `storage_key` | `VARCHAR(512)` | no | — | UQ | Object-storage key (today `uploads/{folder}/{file}`) |
| `public_url` | `VARCHAR(512)` | no | — | | Served URL (today `/uploads/{folder}/{file}`) |
| `mime_type` | `VARCHAR(100)` | yes | NULL | | Content type |
| `byte_size` | `BIGINT` | yes | NULL | | File size |
| `alt_text` | `VARCHAR(500)` | yes | NULL | | Accessibility/SEO alt |
| `width` | `INTEGER` | yes | NULL | | Optional dimensions (**future**) |
| `height` | `INTEGER` | yes | NULL | | Optional dimensions (**future**) |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | | **proposed** |

> **Representation:** metadata + reference, **never binary BLOB** (§35). Files can move to S3/object storage; only `storage_key`/`public_url` resolution changes (§18, §41).

### Table: `categories`

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK** | |
| `name` | `VARCHAR(100)` | no | — | **UQ**, IDX | Unique category name |
| `slug` | `VARCHAR(120)` | no | — | UQ | URL-safe category slug (**future**) |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | | **proposed** |

> Today `category` is a free string; `/api/categories` derives counts from published blogs (`blogStorage.ts:314`). A `categories` table still expresses that endpoint as a join, while preventing typos/dups.

### Table: `tags`

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK** | |
| `name` | `VARCHAR(80)` | no | — | **UQ** | Unique tag label |
| `slug` | `VARCHAR(100)` | no | — | UQ | URL-safe (**future**) |
| `created_at` | `TIMESTAMPTZ` | no | `now()` | | **proposed** |

### Table: `blog_tags` (join)

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `blog_id` | `UUID` | no | — | **FK→blogs**, PK(part) | |
| `tag_id` | `UUID` | no | — | **FK→tags**, PK(part) | |
| `position` | `INTEGER` | no | `0` | | Preserves original array order |

> PK `(blog_id, tag_id)` prevents duplicate tags; `position` preserves `tags[]` ordering.

### Table: `admins` (production/future)

| Column | Type | Nullable | Default | Key | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | no | `gen_random_uuid()` | **PK** | |
| `email` | `VARCHAR(255)` | no | — | **UQ** | Login handle |
| `password_hash` | `VARCHAR(255)` | no | — | | bcrypt/argon2 (never plaintext) |
| `display_name` | `VARCHAR(120)` | no | — | | |
| `is_active` | `BOOLEAN` | no | `true` | | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | no | `now()` | | hygiene (never log `password_hash`, §32) |

> **NOT in the core schema.** Auth does not exist today (§21). This is the future anchor, listed as production/future only.

---

## 10. Primary Key Strategy

**Existing IDs:** seed `'1'`..`'15'` and `blog-<time36>-<rand>` (`blogStorage.ts:326`). The frontend uses `blog.id` as a React `key` and in edit URLs (`/blog/admin/blogs/{id}/edit`); the API uses `/api/blogs/{id}`.

**Recommendation: `UUID` (v4, `gen_random_uuid()`)** as the internal PK for new rows, **preserving each existing JSON `id` in `blogs.legacy_external_id`** so edit links and bookmarked IDs survive migration.

| Criterion | UUID | Auto-increment | Reuse current strings |
|---|---|---|---|
| Uniqueness across service boundaries | ✅ | ❌ | ⚠️ |
| URL exposure (not enumerable) | ✅ | ❌ (enumerable) | ⚠️ |
| DB index performance | fine | best | fine |
| Client re-keying on import | avoid | avoid | fragile |

**Decision:** UUID for integrity + future service isolation; auto-increment unnecessary; reusing `blog-...` invites collisions. `legacy_external_id` honors existing references → **no frontend change needed** (§27).

---

## 11. Slug Strategy

**Current:** slugs are title-derived (`slugify`, `src/utils/slug.ts`), validated non-empty (`controllers/blogs.ts:35`), public URL `/blog/{slug}` and internal-link target (`LinkMenu.tsx`). Editable in admin (`BlogEditor.tsx` slug field, `slugTouched`). Uniqueness **not** DB-enforced; `getBlogBySlug` returns first match (`blogStorage.ts:310`).

**Recommendation:**
- `blogs.slug` `VARCHAR(255)`, **`UNIQUE` on `lower(slug)`**, NOT NULL.
- Keep it **mutable with a uniqueness guard** (matches current editable behavior) — on conflict return 400 rather than silently overwrite.
- **Do NOT** add a slug-history/redirect table yet; the app has no redirect mapping requirement and internal links break on slug change regardless (§19). Add `blog_slug_aliases` **only** if slug changes + link persistence become a requirement.

---

## 12. Relationships

```
blogs 1─┐
         ├─ 1─n  blog_sections   (one blog has many ordered sections)
         ├─ 1─n  blog_images     (one blog has many images: banner + per-section)
         └─ n─1  categories      (one category has many blogs)
blogs ── n─n ── tags             (many-to-many via blog_tags)
admins ─(future)─ 1─n  blogs : created_by / updated_by / published_by
```

- **One-to-many:** `blogs → blog_sections` (owns), `blogs → blog_images` (owns), `categories → blogs` (blogs belong).
- **Many-to-many:** `blogs ↔ tags` via `blog_tags`.
- **One-to-one (informational):** `blogs.legacy_external_id` ↔ original JSON `id` (not a table).
- **Future:** `admins → blogs` for attribution columns (§21, §42).

Every relationship exists because the current UI already manipulates that data as separate elements (sections list, image URLs, category string, tags array).

---

## 13. Mermaid ER Diagram

```mermaid
erDiagram
    BLOGS {
        uuid id PK
        varchar legacy_external_id UQ
        varchar title
        varchar slug UQ
        varchar excerpt
        varchar author_name
        varchar author_avatar_url
        uuid category_id FK
        boolean featured
        boolean trending
        varchar status
        timestamptz scheduled_at
        timestamptz published_at
        text content
        integer read_time_minutes
        timestamptz created_at
        timestamptz updated_at
    }
    BLOG_SECTIONS {
        uuid id PK
        uuid blog_id FK
        integer position
        varchar heading
        text content
        uuid image_id FK
        varchar image_caption
    }
    BLOG_IMAGES {
        uuid id PK
        uuid blog_id FK
        varchar bucket
        varchar storage_key UQ
        varchar public_url
        varchar mime_type
        bigint byte_size
        varchar alt_text
        timestamptz created_at
    }
    CATEGORIES {
        uuid id PK
        varchar name UQ
        varchar slug UQ
        timestamptz created_at
    }
    TAGS {
        uuid id PK
        varchar name UQ
        varchar slug UQ
        timestamptz created_at
    }
    BLOG_TAGS {
        uuid blog_id PK,FK
        uuid tag_id PK,FK
        integer position
    }
    ADMINS {
        uuid id PK
        varchar email UQ
        varchar password_hash
        varchar display_name
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    BLOGS ||--o{ BLOG_SECTIONS : has
    BLOGS ||--o{ BLOG_IMAGES : uses
    BLOGS }o--|| CATEGORIES : belongs_to
    BLOGS }o--o{ BLOG_TAGS : tagged_as
    BLOG_TAGS }o--|| TAGS : references
    BLOG_SECTIONS o|--o| BLOG_IMAGES : uses
    (future) ADMINS ||--o{ BLOGS : audits
```

---

## 14. Indexing Strategy

Indexed columns (all justify to the endpoints/render paths that hit them):

| Table | Index | Purpose | Applies to |
|---|---|---|---|
| `blogs` | `(status, scheduled_at)` | scheduling sweep (`getDueScheduledBlogs`, blogStorage.ts:463) | scheduler |
| `blogs` | `(status, published_at DESC)` | published list ordering, `featured`/`trending` | BlogHome (latest/carousel/trending) |
| `blogs` | `(category_id, status, published_at DESC)` | category listing (`getBlogsByCategory`) | BlogHome sidebar, category filter |
| `blogs` | `upper(slug)` unique via `lower(slug)` | slug lookup | Article route |
| `blogs` | `lower(title)` (`pg_trgm` optional) | title search | admin search field |
| `blogs` | `created_at DESC`, `updated_at DESC` | admin sort by created/edited | admin dashboard |
| `blog_sections` | `(blog_id, position)` | fetch/order sections | editor + render |
| `blog_images` | `(blog_id)`, `(bucket, storage_key)` | resolve images; orphan cleanup | render + GC |
| `categories` | `(name)` | category endpoint | public + admin |
| `blog_tags` | `(tag_id)` | reverse lookups | related read (#28) |

**Rule:** index the columns the actual endpoints already iterate. No indexes on rarely-filtered columns (e.g., no separate `status` index where composite already covers it).

---

## 15. Constraints

Enforced in the DB (not just app code) to restore integrity JSON lacks:

- **`blogs.slug` UNIQUE** on `lower(slug)`, NOT NULL — prevents accidental duplicate public URLs (§11).
- **`blogs.status` CHECK** `status IN ('draft','scheduled','published')` — closes invalid states.
- **`blogs.read_time_minutes CHECK (read_time_minutes >= 0)`** — closes negative/NaN drift.
- **`blogs.featured` CHECK** `featured IN (true,false)` (BOOLEAN already enforces).
- **Referential:** `blog_sections.blog_id REFERENCES blogs ON DELETE CASCADE`; `blog_tags` FK + PK(blog_id, tag_id) prevents dup tags; `blog_sections.image_id REFERENCES blog_images`.
- **`blog_tags.position CHECK (position >= 0)`** with PK uniqueness — order integrity.
- **`blog_images.bucket CHECK (bucket IN ('banner','section'))`** — mirrors the physical folder split.
- **Domain default:** scheduler never double-publishes due to DB atomic transition (§17).

These would each individually be app-level bugs today (duplicate slug, invalid status); the DB makes them structurally impossible.

---

## 16. Blog Lifecycle Model

Applied lifecycle (from `blogStorage.ts` + `controllers/blogs.ts` + `scheduler.ts`):

| State | Entered via | Exit via | Notes |
|---|---|---|---|
| `draft` | create (no schedule) | publish / schedule | editable anytime |
| `scheduled` | create-with-schedule / `POST /:id/schedule` / `applySchedule` | scheduler auto-publish / cancel→draft | `scheduledAt` must be future (`normalizeScheduledAt`, blogStorage.ts:251) |
| `published` | publish (`applyPublish`) / scheduler fires | — | `publishedAt` set; public readable |

**DB mapping:** `status VARCHAR(12)` + CHECK. The object-graph in memory does the lifecycle; the DB enforces allowed values and drives transition queries.

**Migrate nuance:** today the allowed-transition guard is app logic (`applyPublish`/`applyDraft`). Keep that as the domain layer; the DB `CHECK` prevents invalid persisted values (defense in depth), not a substitute for workflow logic — appropriate for a small blog, no trigger-based state machine (avoids CMS over-engineering).

---

## 17. Scheduling Model

**Current:** `scheduler.ts` polls (30 s, `setInterval`, `unref`), recovers missed jobs on startup, calls `applyPublish` on blogs where `status==='scheduled' && due`. Single server, single node → on-process timer is correct. **No external scheduler needed.**

**DB representation (index-backed):**
```sql
SELECT * FROM blogs
 WHERE status = 'scheduled' AND scheduled_at <= now() AND published_at IS NULL
 ORDER BY scheduled_at;
```

**Concurrency correctness:** transition must be **atomic** to prevent double-publish from overlapping sweeps:
```sql
UPDATE blogs SET status='published', published_at=now()
 WHERE id = $1 AND status='scheduled' AND scheduled_at <= now()
 RETURNING *;   -- 0 rows => already claimed
```
This is the cleanest "at-most-once" without a separate scheduler/queue/Kafka (deliberately avoided). If future scale needs it, swap in a queue — not now (§36).

**Timezone note:** `scheduled_at`/`published_at` are `TIMESTAMPTZ` **UTC instants**. The UI insists on IST (`SchedulePublishModal.tsx:50`, `BlogDashboard.tsx:258` `Asia/Kolkata`, defaultDateTime mixes zone+localtime, `SchedulePublishModal.tsx:29-40`). Persist an *instant*; convert to a user timezone only at the edge. This eliminates the current zone/offset bug class.

---

## 18. Image Storage Strategy

**Current:** uploads write files to `server/uploads/{banners,sections}` (`imageStorage.ts`, `routes/uploads.ts`, 8 MB limit); the blog stores the served `/uploads/...` path as `featuredImage` (and its `thumbnail` alias) and `Section.image`. External URLs (Unsplash/pravatar in seed) also used.

**Recommendation — metadata-only, object-storage ready:**
- Store **metadata + a URL/`storage_key`** in `blog_images`, **not binary BLOBs** in PG.
- Add `blog_images.storage_key` (the object key) + `public_url` (currently `/uploads/{folder}/{file}`).
- Banner = bucket `'banner'`; section images = `bucket 'section'` + FK from `blog_sections.image_id`.
- `blogs.featuredImage` (banner reference) stays as the source of truth; keep `thumbnail` in the API as the *same* value (alias produced by `toClient`) rather than a stored dup — **fixes the duplication** observed in §4.

This means moving files to an object store (S3/Cloudflare R2/MinIO) later only changes how `public_url` is resolved — **the DB schema and API do not change**. Small, high-value, avoids the classic "blobs in the DB" anti-pattern.

---

## 19. Internal Blog Linking

**Current:** links to other posts are plain text `/blog/{slug}` embedded in the rich-text HTML, inserted by `LinkMenu.tsx` (BLOG_PREFIX `/blog/` at :31; inserts `/blog/{slug}` at :214/:230). There is **no link entity and no FK** — specifically verified.

**Recommendation:** **keep internal links embedded in rich text; do NOT add a `blog_links` table.**

Rationale:
- A link table would require parsing HTML on save (a parser the app does not have), syncing deletions, and a redirect/alias mechanism — all over-engineering for a blog that does not yet track inbound links.
- The current design already *works*; slug uniqueness (§11) makes `/blog/{slug}` targets stable and unambiguous.
- **Add a link-entity table only when** inbound-link analytics or broken-link detection becomes a requirement (then a background HTML parser can populate it; note slug changes would still need an alias strategy). This is the right-scoped, non-premature choice.

---

## 20. Author Model

**Current:** `author: string` + optional `authorAvatar?: string` are **columns on the blog**; no author entity. Values are display names (`"Priya Sharma"`, etc.). Confirmed no author table/route.

**Recommendation:** **keep author as columns** (`author_name`, `author_avatar_url`) on `blogs` for now.

Rationale:
- Today there is no author login, profile page, author-byline route, or per-author listing — author is a plain string label.
- A separate `authors` table would add joins with zero current payoff, and introduces the question of what an author even *is* (single admin persona today).
- **Promote to an `authors` table only when** per-author pages, bios, or multi-author publishing become real. (Until then, storing `author_name` on the blog and grouping is sufficient; `author_avatar_url` mirrors the string.)

---

## 21. Authentication / Admin Considerations

**Current:** **there is no authentication.** `AdminLayout.tsx:61` documents `// No authentication for now`. Any admin route is publicly reachable in the prototype.

**Recommendation:**
- **Out of scope for the core schema** — do not design a permission/role hierarchy (avoid CMS over-engineering).
- Production path (future): 
  - New `admins` table (§9) as the single identity anchor — email + bcrypt/argon2 `password_hash`, `is_active`.
  - Attribute changes with `created_by`/`updated_by`/`published_by` FK → `admins` on `blogs`.
  - Session/JWT handled at the API layer, **not in the schema**.
- Do **not** add roles/RBAC yet; a single-admin blog needs at most a boolean `is_active`.

---

## 22. Normalization Strategy

**What to normalize** (high payoff, low cost):

| Current (JSON) | Normalized to | Why it helps now |
|---|---|---|
| `category` free string | `categories` table + `blogs.category_id` FK | live category endpoint becomes a join; prevents typos/dups; enables category slug |
| `tags[]` free strings | `tags` + `blog_tags` | dedup enables `related`/query; preserves order via `position` |
| section objects | `blog_sections` rows | editable, queryable, independently sortable |
| `featuredImage` + `thumbnail` | single `blog_images` reference; `thumbnail` as API alias only | removes the dup of §4 |
| `readTime` derived | `blogs.read_time_minutes` | single derived value, no per-request calc |

**What to deliberately keep denormalized** (avoid over-normalization):
- **`blogs.content`** stays as materialized HTML (`TEXT`) — it is the render source and keeping it avoids reassembly cost per request. It coexists with `blog_sections` (§9).
- **Author string** on the blog (§20).
- **Internal links** inside HTML (§19).

This is the right-sizing: normalize the axis we *query* (category, tags, ordering) and the elements the editor *edits* (sections); denormalize the artifact we *render* (content) and the labels we only *display* (author).

---

## 23. JSON → Database Mapping

One seed/runtime blog → 1 `blogs` row + N `blog_sections` rows (+join rows + image refs).

| JSON (blogs.json) | DB target | Notes |
|---|---|---|
| `id` (`'1'`, `blog-...`) | `blogs.legacy_external_id` | preserved for old links; new UUID PK generated |
| `title` | `blogs.title` | |
| `slug` | `blogs.slug` | unique on lower() |
| `excerpt` | `blogs.excerpt` | |
| `featuredImage` | `blog_images` (banner) OR `blogs` reference | see below |
| `thumbnail` | (drop; derived) | alias = featuredImage via `toClient` |
| `author` | `blogs.author_name` | |
| `authorAvatar` | `blogs.author_avatar_url` | only if external/absolute URL |
| `publishedAt` | `blogs.published_at` | normalize date-only → instant (see §33) |
| `readTime` | `blogs.read_time_minutes` | |
| `category` | `categories` (upsert by name) → `blogs.category_id` | |
| `tags[]` | `tags` (upsert by name) + `blog_tags` position | |
| `featured`, `trending` | `blogs.featured`, `blogs.trending` | |
| `content` | `blogs.content` | store as-is (sanitized), see mapping note |
| `status` | `blogs.status` | map to check-labelled value |
| `scheduledAt` | `blogs.scheduled_at` | |
| `sections[]` | `blog_sections` rows | position = array index; `the_legacy_id` = `section.id` |
| `sections[].heading` | `blog_sections.heading` | |
| `sections[].content` | `blog_sections.content` | |
| `sections[].image` | `blog_images` (section) → `blog_sections.image_id` | |
| `sections[].imageCaption` | `blog_sections.image_caption` | |

**Dedup:** for each blog, upsert `categories` and `tags` by name (DISTINCT), then link via FKs.

> **The `content` mapping is the crux (§1, §24):** the stored `blogs.content` equals `buildContentHtml(sections)` for author-driven records, but the API also accepts raw `content`. The migrator must pick a canonical writer: store the **sanitized** assembled HTML and treat `blog_sections` as the editable source; a re-render recomputes `content` on load/save to guarantee consistency.

---

## 24. Migration Strategy

A single-service **one-time JSON→PG** migration, plus an incremental seam for future changes.

**Phase 0 — Pre-migration guardrails**
- Enforce the two `Blog` type copies (`server/types` vs `src/types`) share one definition (they already drifted: `status`/`sections` optional vs required). Align before mapping to avoid ambiguity.

**Phase 1 — Seed**
- Create tables (schema above; FK order: `categories` → `blogs` → `blog_images` → `blog_sections`/`blog_tags` → `tags`, `tags` first, then `blog_tags`).
- Import the 15 published seed blogs (they have `published` status, `publishedAt`, sections, banner images).

**Phase 2 — Point the storage service at PG**
- Replace the JSON read/write inside `blogStorage.ts` with a **PG-backed implementation of the same interface** (`getBlogBySlug`, `create`, `update`, `publish`, etc.) — the repository seam (§26). Because `blogStorage.ts` is the single choke point behind the controllers, **the controllers, routes, API contract, and frontend stay unchanged** (§27).

**Phase 3 — Cutover + backfill**
- For each runtime blog in `blogs.json`, write `blogs` + `blog_sections` (+ categories/tags/images) → commit → **build `content` from sections** (see mapping, §23).
- The runtime JSON file can then be retired as authoritative state.

**Future incremental changes** are DDL migrations (e.g., `ALTER TABLE ... ADD COLUMN`), versioned and idempotent, rather than whole-file rewrites — this is the core benefit over rewriting `blogs.json`.

---

## 25. Migration Difficulty

**Overall: LOW–MEDIUM.**

**Why LOW:**
- Small schema (7 tables), single service, no auth, no tenants — trivial join surface.
- `blogStorage.ts` isolates ALL persistence behind one seam; PG swap needs no frontend/API change.
- Data volume tiny (15 seed + few runtime blogs); a simple import script is enough.
- `blogs.json` is already JSON — a one-pass transformer to parameterized SQL INSERTs is direct (§23).

**Why MEDIUM (real hitches):**
- **Two sources of truth for `content`** (derived-from-sections vs raw API input) must be reconciled — likely requires re-sanitizing/normalizing imported `content` (§23, §33).
- **Date normalization:** runtime `publishedAt` strings are inconsistent (date-only in seed vs full `ISO 8601` after edits) → normalize to `TIMESTAMPTZ`.
- **Field cardinality drift:** `thumbnail` added, `status`/`sections` optionality differs between type copies → need a normalized writer.
- **ID reuse:** must preserve `legacy_external_id` so existing edit URLs/bookmarks survive.
- Author/category/tag are strings → upsert-by-name dedup logic needed (low complexity).

No hard blockers; largest single risk is **`content` ownership**, not the DB itseelf.

---

## 26. Repository / Data Access Considerations

**Current:** `blogStorage.ts` is the single persistence module (in-memory cache + `persist()` to `blogs.json`). Controllers call it (`controllers/blogs.ts`), routes mount controllers (`routes/blogs.ts`).

**Recommended access layer:** keep this **repository seam** and swap its backend from JSON to PG while preserving the interface. Concretely:

- A `BlogRepository` interface (or module) exposing the exact functions the controllers use: `getAll/getBySlug/getById`, `create`, `update`, `delete`, `applySchedule`, `applyPublish`, `applyDraft`, `getDueScheduledBlogs`, plus `getCategories`/`getRelatedByTags`.
- The JSON implementation stays for dev/tests; a PG implementation (parameterized SQL, `pg`) slots behind the same interface.
- **Keep SQL explicit/typed** (not a heavyweight ORM) — the schema is small; raw SQL in thin data-access functions is clearer and avoids ORM magic for a 7-table domain.
- No Redis/DAL cache: the JSON in-memory cache disappears; PG serves queries directly (correctness > premature caching, §31).

Result: controllers, routes, API contract, and all frontends are untouched. This is the highest-leverage recommendation for making the swap low-risk.

---

## 27. API Impact

**Net API impact: approx. zero.**

Verified from `routes/blogs.ts`: the endpoints are REST/JSON and map cleanly onto the new tables.

| Route | Today | After PG (no signature change) |
|---|---|---|
| `GET /api/blogs` | list (published) | `SELECT` from PG, same shape |
| `GET /api/blogs/:id` | by id | by id (or `legacy_external_id`) |
| `GET /api/blogs/by/slug/:slug` | by slug | by slug |
| `GET /api/blogs/featured`, `/trending` | filter | indexed WHERE |
| `GET /api/categories` | live-derived from published | join on `categories` + counts (same shape) |
| `POST /api/blogs` / `PUT /:id` | create/update JSON | transaction write (blogs+sections+tags+images) |
| `POST /:id/schedule`, `publish`, `draft`, `upload` | lifecycle + upload | same; scheduler uses PG query |
| `GET /api/blogs/by/category/:category` | filter | join |
| `GET /api/blogs/related/:id` | by tags | tags join |

**Only documented behavior changes (clearly internal, not breaking):**
- `GET /api/blogs` ordering gains a stable key (e.g., `updated_at`/`created_at`) instead of array order.
- `thumbnail` continues to be returned (alias) — no consumer change.
- Slug uniqueness now **enforced** → conflicting creates return 400 (a correctness improvement, guarded like current behavior).

The API contract is the boundary; the JSON→PG change is invisible to React.

---

## 28. Query Patterns

The actual endpoints enumerated (§27), as SQL, to prove the schema covers every read:

```sql
-- Home: featured carousel
SELECT * FROM blogs WHERE featured = TRUE AND status='published'
 ORDER BY published_at DESC LIMIT 5;

-- Home: latest
SELECT * FROM blogs WHERE status='published' ORDER BY published_at DESC LIMIT 12;

-- Home: trending
SELECT * FROM blogs WHERE trending = TRUE AND status='published'
 ORDER BY published_at DESC LIMIT 4;

-- Sidebar categories (with public counts)
SELECT c.name, COUNT(b.id) AS count
FROM categories c
LEFT JOIN blogs b ON b.category_id=c.id AND b.status='published'
GROUP BY c.id, c.name ORDER BY c.name;

-- Category filter
SELECT * FROM blogs WHERE category_id=$1 AND status='published' ORDER BY published_at DESC;

-- Related (by shared tags)
SELECT DISTINCT b.* FROM blogs b
JOIN blog_tags bt ON bt.blog_id=b.id
WHERE bt.tag_id IN (SELECT tag_id FROM blog_tags WHERE blog_id=$me)
  AND b.id <> $me AND b.status='published'
ORDER BY b.published_at DESC LIMIT 4;

-- Article by slug
SELECT * FROM blogs WHERE lower(slug)=lower($1) AND status='published';

-- Scheduler sweep (index-backed)
SELECT * FROM blogs WHERE status='scheduled' AND scheduled_at <= now() AND published_at IS NULL
 ORDER BY scheduled_at;

-- Admin list (all statuses, newest first)
SELECT * FROM blogs ORDER BY updated_at DESC;
```

All covered by the indexes in §14. The N+1 in BlogHome (`BlogHome.tsx:30-35`) is a frontend fetch concern, not a schema issue; a single aggregated endpoint could collapse it, but the schema supports it either way. **No need for a search service / ES** — `LIKE`/`pg_trgm` suffices for the scale.

---

## 29. Transaction Requirements

**In atomic need of a DB transaction** (all are single-blog writes made of several inserts/updates):

| Operation | Units in one transaction |
|---|---|
| **Create blog** | `INSERT blogs` + `blog_sections` + `blog_images` + upsert `categories`/`tags` + `blog_tags` |
| **Update blog** | update `blogs` + diff/rewrite `blog_sections` (delete/insert) + replace `blog_tags` + upsert tags |
| **Publish / schedule / draft** | single-row `UPDATE` (guarded) |
| **Delete blog** | delete `blogs` → **cascade** `blog_sections`, `blog_tags` (image metadata cleanup optional in same tx) |
| **Publish sweep** | one `UPDATE ... RETURNING` per due blog (atomic §17) |

**Outside a transaction (file system, not DB):** the physical upload file write. Keep uploads/app-then-commit ordering tolerant (write file first, commit DB reference last, or rely on GC) — avoids an orphan upload if the DB commit fails.

Every mutation endpoint in `blogStorage.ts` (create/update/publish/delete) becomes a single transaction. Cron/nightly GC for orphan images can run separately, but each blog entity's row set is committed atomically.

---

## 30. Concurrency Considerations

**Realistic concurrency today:** a single admin + a single scheduler process. Multiple server instances are **not** a current requirement (§36), so avoid premature distributed-sync machinery.

| Concern | Handling |
|---|---|
| Scheduler double-publish (overlapping sweeps) | atomic `UPDATE blogs SET status='published', published_at=now() WHERE id=$1 AND status='scheduled' AND scheduled_at<=now() RETURNING` → exactly-one winner (§17). |
| Concurrent edits to one blog | last-writer-wins is acceptable now; OPTIONAL `blogs.version INTEGER` optimistic-lock to make update fail on conflict (add later if needed, not now). |
| Duplicate inserts (slug/tag) | unique constraints make one insert fail; retry/upsert gracefully (upsert by name for tags/categories). |
| Cache layer | none — PG is the source of truth; avoids invalidation bugs entirely (§26). |

**Conclusion:** no row-locks/queues/Kafka needed. PG constraints + atomic guarded UPDATE cover the only two real races (double-publish, dup slug/tag).

---

## 31. Performance Considerations

**At current/plausible scale this schema performs trivially. Do not add premature scale machinery.**

- **Data volume:** ~15–100 blogs; every read is a handful of indexed rows. No concern.
- **No caching layer needed** (no Redis/Memcached) — direct PG reads are already fast and always correct.
- **Scheduling:** 30 s poll on a small indexed set is negligible; startup catch-up uses the same query.
- **Indexes suffice** (§14); no ES/Kafka/read-replicas. Add those only when measured load demands it.
- **`content` materialized** avoids per-request reassembly of sections (denormalization win, §22).
- **One known frontend inefficiency** — N+1 on BlogHome (`BlogHome.tsx:30-35`) — is a client fetch pattern to fix as an API aggregation, unrelated to DB performance; the schema supports a single query already.

Rule: correctness and simplicity first; optimize only off real metrics.

---

## 32. Security Considerations

| Issue (current) | DB schema mitigation |
|---|---|
| Admin routes publicly reachable (no auth) | Future `admins` table + API auth layer (§21) — schema only anchors identity, does not implement auth. |
| Raw/unsanitized `content` accepted by API (`controllers/blogs.ts:15`) | `blogs.content` stored only **after server-side sanitization** (`sanitizeHtml`, blogStorage.ts) — documented hardening via the repository layer, not a schema flag. |
| Public render uses `dangerouslySetInnerHTML` (`BlogArticle.tsx:131`) | Storage-layer sanitization is the only available control today; DB stores already-sanitized text. Recommend server-side sanitize-before-insert as the invariant. |
| `password_hash` if `admins` added | never return/select/log it; store with bcrypt/argon2 (§21). |
| Uploaded images | restricted folder + 8 MB limit already in `routes/uploads.ts`; `blog_images` records metadata, not content, so no DB-level file risk. |
| SQL injection | access layer always uses parameterized SQL (§26). |

---

## 33. Data Integrity Considerations

**Problems observable in the JSON today that the schema fixes structurally:**

| Current risk (observed) | Schema fix |
|---|---|
| `slug` uniqueness not enforced → duplicate public URLs possible | `UNIQUE` on `lower(slug)` (§15) |
| `status` free value → invalid/none value possible | `CHECK IN ('draft','scheduled','published')` |
| `readTime` could drift negative / inconsistent | `CHECK >= 0`; stored once, not per-request |
| the `thumbnail`/`featuredImage` duplicate can drift | single source; `thumbnail` an API alias (§18) |
| `content` has two sources of truth | canonical writer: `content` = sanitized render of `blog_sections`, stored (§24) |
| `categories.json` written-but-never-read (orphan) | drop the dead file; categories derive from `categories` table (§22) |
| `publishedAt` inconsistent formats (date-only vs full ISO) | `TIMESTAMPTZ` forces normalized instants |
| no `created_at`/`updated_at` | added (proposed) for ordering/audit |
| sections keyed by client-generated `id` | internal UUID PK + informational `the_legacy_id` (§9) |

The DB becomes the authoritative store instead of a mutable JSON file that can drift from committed seed (`server/data/blogs.json` runtime vs `seed.blogs.json`).

---

## 34. Core vs Optional Tables

| Table | Tier | Justification |
|---|---|---|
| `blogs` | **core** | root entity; every operation loads it |
| `blog_sections` | **core** | editor edits these; content derives from them |
| `blog_images` | **core (metadata)** | abstracts banner/section files, object-store ready (§18) |
| `categories` | **core-lite** | today free string; becomes controlled list; or defer |
| `tags` / `blog_tags` | **core-lite** | today free strings; enables `related`; or defer |
| `admins` | **production/future** | auth anchor; not needed until real auth (§21) |

**Build-order suggestion:** `blogs` + `blog_sections` + `blog_images` cover the entire public + editor + scheduler surface today. `categories`/`tags` are cheap to add and close the two de-dup opportunities (§22). Add `admins` only when auth is actually introduced. This keeps v1 minimal and de-risked.

---

## 35. Future Evolution

Planned, low-cost evolutions — none block the current design:

- **Object storage migration** (`blog_images`): move files to S3/R2; only `public_url` resolution changes, `storage_key` already exists. No schema change (§18).
- **Author entities** (`authors` table): promote from `author_name` columns when author pages/bios exist (§20).
- **Real auth + attribution**: enable `admins`, add `created_by`/`updated_by`/`published_by` FKs (§21).
- **Full-text search**: add `pg_trgm`/`tsvector` on `blogs.title`/`content` when search volume warrants (still single DB; no ES).
- **Slug aliases/redirects** (`blog_slug_aliases`): only when slug-change + preserved links are a requirement (§11/§19).
- **Optimistic concurrency**: optional `blogs.version` when concurrent edit conflicts actually occur (§30).
- **Soft-delete/archival** (`deleted_at`): opt-in; not needed now (JSON has none).
- **Read replicas / cache** (Redis): only with measured scale (§31).

The schema deliberately avoids CMS over-engineering: no revisions table, no event sourcing/CQRS, no workflow/RBAC, no multi-tenancy, no localization, no analytics tables — none are warranted.

---

## 36. Microservice Readiness

**Current context:** truly a single service (Express `server/server.ts`), single data store (JSON→PG), single finite-state lifecycle. There is **no** multi-tenant, no auth, no multiple producers/consumers.

**Assessment:** PostgreSQL + UUID PKs + a narrow, enforced schema make future splitting **possible without rework**:
- UUID PKs and `legacy_external_id` mean entities can move between services without key collision.
- The repository seam (§26) isolates storage behind one interface per aggregate.
- Rule: **don't carve services or add a queue/Kafka/event bus preemptively** — a small blog doesn't need it, and the single-finite-bounded-context model is already correct (§30).

If it ever split, the natural boundaries are `blogs` (authoring/publishing) and `assets` (image storage); both map cleanly to today's `blogStorage.ts` + `imageStorage.ts`. No schema change required to enable that later.

---

## 37. Assumptions

1. Scale stays small (tens–low hundreds of blogs); no tenant isolation needed.
2. Single-admin editorial model; no granular permissions until auth is real.
3. The public page rendering `blog.content` via `dangerouslySetInnerHTML` is a **storage/API concern**: `content` must be sanitized server-side before insert (documented announcement, not a schema change).
4. `thumbnail` is intentionally an alias of the banner reference, not separate data (§18).
5. Categories are controlled going forward; one category per blog (matches `category: string`).
6. Tags are de-duplicated globally by `name`; blogs may have many tags; `position` preserves original order.
7. Sections are fully owned by their blog (`ON DELETE CASCADE`); the editor's client-generated section ids are informational only.
8. Existing external/image hosts (Unsplash, pravatar) resolve to `public_url`; uploads resolve to `/uploads/...`.
9. The canonical source of `content` is the `blog_sections` structure; stored `content` is its sanitized materialization (§23/§24).
10. No revisions/soft-delete/analytics/localization required now.
11. Migration runs once by an operator/dev with DB write access; no online-zero-downtime requirement (blog is small).
12. Timezone: all stored timestamps are UTC instants (`TIMESTAMPTZ`); UI-side IST conversion stays at the edge (§17, fixing the `SchedulePublishModal.tsx` zone bug).

---

## 38. Schema Trade-offs

| Decision | Trade-off | Mitigation / why accepted |
|---|---|---|
| UUID PKs over reused strings | non-human ids; URL ids change | `legacy_external_id` keeps old edit URLs working; UUIDs enable service split (§10) |
| Keep `blogs.content` (duplicating sections) | redundancy risk between `content` and `blog_sections` | explicit canonical writer (§24) — acceptable for a materialized render |
| Sections as rows (2 tables) vs embedded JSON | 2-table query cost vs simpler JSON | small scale + queryability/order constraints win (§9) |
| Metadata-only images (no BLOB) | extra row per image | enables S3 move; avoids DB bloat (§18) |
| Normalize category/tag | migration + upsert dedup work | prevents dup/typo; powers `related`/category endpoint (§22) |
| Keep author/link inline | loss of future link/author analysis | explicitly deferred to when features demand it (§19/§20) |
| No auditing history/revisions | losing old-content recovery | not warranted at this scale; keep JSON seed as backup during migration |
| `admins` out of core | no auth today | add with real auth (§21) |

Net: the schema optimizes for **integrity + migration ease + zero API disruption**, at the small cost of one redundant `content` column and a few straight-forwarded dedup rules.

---

## 39. Final Recommended Schema

**PostgreSQL**, 7 tables (6 core + 1 future), ~30 columns. Full definitions in §9 (recommended), ER in §13, indexes §14, constraints §15.

```
core:
  blogs          (id UUID PK, legacy_external_id, title, slug UQ, excerpt,
                  author_name, author_avatar_url, category_id FK,
                  featured, trending, status CHK, scheduled_at, published_at,
                  content TEXT, read_time_minutes, created_at, updated_at)
  blog_sections  (id UUID PK, blog_id FK, position, heading, content,
                  image_id FK, image_caption, the_legacy_id)
  blog_images    (id UUID PK, blog_id FK, bucket CHK, storage_key UQ, public_url,
                  mime_type, byte_size, alt_text, created_at)
  categories     (id UUID PK, name UQ, slug UQ, created_at)
  tags           (id UUID PK, name UQ, slug UQ, created_at)
  blog_tags      (blog_id FK, tag_id FK, position)   -- PK(blog_id,tag_id)
future/production:
  admins         (id UUID PK, email UQ, password_hash, display_name, is_active, created_at, updated_at)
```

**Build-order:** `blogs`+`blog_sections`+`blog_images` now → `categories`/`tags`/`blog_tags` (cheap, closes dedup) → `admins` when auth lands.

---

## 40. Schema Scores

Scored 1–10 (higher is better), grounded in the constraints above.

| Dimension | Score | Rationale |
|---|---|---|
| **Fidelity to domain** | 9 | mirrors current blog/section/category/tag/image/lifecycle 1:1 |
| **Normalization correctness** | 8 | right-sized: normalizes query axis, denormalizes render artifact (§22) |
| **Data integrity** | 9 | constraints, FKs, unique slug, status CHK, atomic transitions (§15) |
| **Migration ease** | 8 | single seam + 1:1 mapping; only `content` dual-source is a real hurdle (§24/25) |
| **API/backend impact** | 9 | zero contract change; repository seam isolates swap (§27) |
| **Performance at scale** | 7 | trivial at current scale; needs index tuning only if much larger (§31) |
| **Security posture** | 6 | schema anchors identity but auth/sanitization are app-layer to implement (§32/21) |
| **Simplicity / no over-engineering** | 9 | 6 core tables, no revisions/event-sourcing/RBAC/queues/ES (§34/35) |
| **Future-proofing** | 8 | UUID + metadata-only images + repository seam enable S3/auth/services later (§36) |
| **Optional-net (avg)** | **8.2 / 10** | strong, evidence-based, appropriately minimal |
| Missing appendices (documentation) | n/a | §41 note |

---

## 41. Final Verdict

**Recommended: PostgreSQL**, with the 6 core tables above (`blogs`, `blog_sections`, `blog_images`, `categories`, `tags`, `blog_tags`) plus optional `admins` — the smallest set that captures the real domain, enforces integrity JSON cannot, and swaps in behind the existing `blogStorage.ts` seam with **zero API or frontend change**.

- **Recommended DB:** PostgreSQL.
- **Core tables:** 6 (7 including future `admins`).
- **Most important decision:** keep the **API contract/JSON shape** as the boundary and **normalize only below it**; store `blogs.content` as sanitized TEXT alongside structured `blog_sections` (with a canonical writer), preserving the public render path unchanged.
- **Biggest migration consideration:** reconcile the **two sources of truth for `content`** (derived-from-sections vs raw API input) and normalize timestamps/ids so the import stays lossless.
- **Overall score:** 8.2/10.
- **Net effect:** removes every integrity gap found in `blogs.json` (dup slug, invalid status, drift, `thumbnail`/`content` duplication, `categories.json` orphan) while keeping the product untouched.

*This is an analysis-only document. No code, data, package, or configuration was modified; the only artifact produced is this report.*
