# GrinXO Blog — Codebase Audit Report

**Scope:** Full-codebase, read-only review of the GrinXO Blog prototype (React + TypeScript public site, React admin panel, Express + Node API with JSON-file persistence).
**Mode:** Audit only. No code was modified, refactored, deleted, or rewritten. The only artifact this review creates is this report and the bundled seed data files it documents.
**Audit date:** 2026-09-02
**Conventions used:**
- **Prototype-good vs must-change-before-production** are distinguished explicitly in every finding.
- Findings are **evidence-based** with exact file:line references.
- No recommendation endorses Redis/Kafka/queues/distributed schedulers/microservices-in-general/a hosted database **unless the code demonstrates a genuine need**. It does not.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Quality Scores at a Glance](#2-quality-scores-at-a-glance)
3. [Repository & Layout](#3-repository--layout)
4. [What the System Does](#4-what-the-system-does)
5. [Architecture Overview](#5-architecture-overview)
6. [Data Model](#6-data-model)
7. [Dependencies & Toolchain](#7-dependencies--toolchain)
   - 7.1 [Complete Library / Dependency Inventory](#71-complete-library--dependency-inventory)
8. [Frontend: Public Site](#8-frontend-public-site)
9. [Frontend: Admin Panel](#9-frontend-admin-panel)
10. [Backend: API & Server](#10-backend-api--server)
11. [Backend: Storage & Scheduler](#11-backend-storage--scheduler)
12. [Publishing Workflow (Draft / Scheduled / Published)](#12-publishing-workflow)
13. [Security Review](#13-security-review)
14. [Input Validation & Sanitisation](#14-input-validation--sanitisation)
15. [XSS & HTML Rendering](#15-xss--html-rendering)
16. [Authorization & Admin Access](#16-authorization--admin-access)
17. [File Upload Security](#17-file-upload-security)
18. [Error Handling & Resilience](#18-error-handling--resilience)
19. [Persistence & Durability](#19-persistence--durability)
20. [Concurrency & Atomicity](#20-concurrency--atomicity)
21. [The Scheduler](#21-the-scheduler)
22. [Timezone & Date Handling](#22-timezone--date-handling)
23. [SEO & Accessibility](#23-seo--accessibility)
24. [Performance](#24-performance)
25. [Testing](#25-testing)
26. [Type Safety](#26-type-safety)
27. [Linting & Static Analysis](#27-linting--static-analysis)
28. [Build & Tooling](#28-build--tooling)
29. [Documentation](#29-documentation)
30. [Git Hygiene & Data Files](#30-git-hygiene--data-files)
31. [Dead Code & Orphaned Data](#31-dead-code--orphaned-data)
32. [Code Quality & Maintainability](#32-code-quality--maintainability)
33. [Security Posture Summary](#33-security-posture-summary)
34. [Top 10 Risks](#34-top-10-risks)
35. [Top 10 Recommendations (Prioritised)](#35-top-10-recommendations-prioritised)
36. [Prototype vs Production Verdicts](#36-prototype-vs-production-verdicts)
37. [Production Readiness Roadmap](#37-production-readiness-roadmap)

---

## 1. Executive Summary

The GrinXO Blog is a **self-contained, single-server prototype** that demonstrates a complete editorial publishing lifecycle — draft, scheduled auto-publish, live publish — backed by a small Express API that persists blogs to a local JSON file. The public site and admin panel share one dataset through the same backend, with the public API intentionally filtering to published posts only.

The code is well-structured, readable, and idiomatic. The sanitisation layer for rich-text HTML is a genuine, above-prototype-strength mitigation against XSS, and the scheduled-publishing implementation (in-process timer + startup recovery + idempotent publish) is clean and correct for this deployment model.

**Overall, this is a strong prototype.** For the prototype's stated purpose (single-server demo, `npm run build && npm run server`), it is fit for purpose. **It is not production-ready**, primarily for security reasons (no authentication at all on the admin API) and resilience reasons (JSON-file persistence has no atomicity, no concurrency control, no backup strategy).

The single most important gap: **there is no authentication or authorization anywhere on the server.** The admin API — create, edit, delete, publish, draft, schedule — is fully exposed to anyone who can reach the server. All other issues are secondary to this.

---

## 2. Quality Scores at a Glance

| Dimension | Score (0–10) | Notes |
|---|---|---|
| **Prototype Quality** | **9/10** | Complete workflow, clean structure, working build, good UX |
| **Production Readiness** | **4/10** | Blocked by absent auth, non-atomic JSON persistence, no tests |
| Code Structure & Clarity | 8/10 | Clear layering; dead code and duplicated types reduce score |
| Type Safety | 6/10 | `src` type-checked; `server/` **not** type-checked at all |
| Security | 4/10 | Good sanitisation; fatal absence of auth / raw-content API |
| Data Integrity / Persistence | 4/10 | No atomic writes, no locking, no backup |
| Performance | 8/10 | Tiny dataset, synchronous file I/O acceptable at this scale |
| Testing | 2/10 | No automated tests |
| Documentation | 7/10 | Good README; API summary out of date; incomplete inline doc |
| Accessibility | 7/10 | Good forms/marks; placeholder contrast and hidden content issues |
| SEO | 6/10 | SPA, no meta/OG handling for dynamic articles |

---

## 3. Repository & Layout

```
grinxo-blog/
├── src/                  # React frontend (public + admin) — type-checked
│   ├── App.tsx           # Routes
│   ├── pages/            # blog home / article / admin dashboards
│   ├── components/       # blog UI + admin editors
│   ├── services/         # API client, config
│   ├── utils/            # date, slug, blog normaliser
│   ├── data/             # legacy seed data + public data service
│   └── index.css, admin.css
├── server/               # Express backend — NOT type-checked
│   ├── server.ts         # entrypoint
│   ├── routes/           # blogs, uploads
│   ├── controllers/      # blogs
│   ├── services/         # storage, scheduler, image storage
│   ├── types/            # server-side blog types (duplicated from src)
│   └── data/             # runtime JSON (blogs.json ignored) + committed seed
├── scripts/generate-seed.mjs
├── public/               # static assets
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.js
└── package.json
```

**Finding (structure):** the schema/types are duplicated between `src/types/blog.ts` and `server/types/blog.ts`, and they have drifted (see §26).

---

## 4. What the System Does

- **Public blog** (`/blog`, `/blog/:slug`): homepage with featured carousel, trending, latest stories, category sidebar, and newsletter banner; per-article pages with rich content, author box, related posts.
- **Admin panel** (`/blog/admin/blogs`): dashboard listing every blog with status filter, category filter, search; create/edit pages with a Tiptap rich-text editor, section builder, image uploads, and a three-way publishing action (Save Draft / Schedule Publish / Publish Now).
- **Scheduling:** a future-dated blog with status `scheduled` is auto-promoted to `published` by an in-process timer (30 s) that also recovers due posts on startup.
- **Persistence:** `server/data/blogs.json` (runtime, git-ignored) seeded on first run from `server/data/seed.blogs.json` (committed snapshot). Images persisted to `server/uploads/banners|sections`.

---

## 5. Architecture Overview

Single Express server (`server/server.ts`) provides the REST API and, when `dist/` exists, serves the built SPA + static uploads on one port (`:5001`). In dev, Vite (`:5173`) proxies `/api` and `/uploads` to the backend.

**Strengths**
- Clean separation: routes → controllers → storage services.
- Storage is encapsulated behind a service module with an in-memory cache + JSON write.
- Public vs admin data access is separated at the storage layer (`getPublicBlogs()` vs `getAllBlogs()`).
- SPA fallback / static serving / API 404 / error handler ordering is deliberate and correct (`server/server.ts:49-78`).

**Notable design choice (prototype-appropriate):** the `/api/categories` endpoint is computed live from published blogs (`server/server.ts:36-41`), and does a dynamic `import('./services/blogStorage.ts')` to "avoid a circular dependency" — see §31 (dead data) for why this is worth noticing.

---

## 6. Data Model

`Blog` (both `src/types/blog.ts:9` and `server/types/blog.ts:9`) has these status-relevant fields:

```
id, title, slug, excerpt, thumbnail?, content (HTML),
featuredImage, author, authorAvatar?, publishedAt (string),
readTime, category, tags[], featured, trending?,
status: 'draft'|'scheduled'|'published',
scheduledAt? (ISO), sections?[]
```

**Findings**
- **Duplicate type definitions with drift.** The frontend `src/types/blog.ts` declares `status?: BlogStatus` (optional) and `sections?: BlogSection[]` (optional); the backend `server/types/blog.ts` declares `status: BlogStatus` (required) and `sections: BlogSection[]` (required). `scheduledAt`, `publishedAt`, `thumbnail` are kept broadly consistent but the optionality differs. Nowhere is a shared type imported — each tree re-declares it. This is a real maintainability risk: a future field added to one will silently miss the other, and the two trees have different consumers (`createBlog` accepts `Omit<Blog,'id'>` on the client vs `BlogInput` on the server).
- `publishedAt` is a required `string`, and for drafts/scheduled blogs it holds either a stale date or the creation date (`blogStorage.ts:342`). Semantics: `publishedAt` is "the wall-clock date that will be shown", not "the instant it went live" for scheduled posts. The scheduler sets `publishedAt = scheduledAt` on publish (`blogStorage.ts:433`), which is reasonable but means a scheduled post's displayed date is its scheduled instant.
- IDs differ between the embedded seed (`src/data/blogs.ts` uses `'1'`..`'15'`) and server-generated blogs (`blog-<base36>-<rand>`, `blogStorage.ts:326`). Not a bug (disjoint namespaces), but the fallback data and server data are structurally different universes.

---

## 7. Dependencies & Toolchain

**Production deps** (`package.json`): `react` 19, `react-dom` 19, `react-router-dom` 6, `@tiptap/*` 3.31 (editor), `express` 5.2, `cors`, `multer`. **Dev:** `typescript` 6, `vite` 8, `eslint` 10 + typescript-eslint, react-hooks/refresh plugins.

**Findings**
- **No date/time library.** Timezone handling is manual `Intl`/`Intl.DateTimeFormat` code in `src/utils/date.ts` (see §22). Given the constraints (no new deps desired), this is acceptable but is the highest-touch, most error-prone area of the codebase.
- **No testing framework, no logging library, no validation library** (e.g. zod/joi), no ORM/database. These are all reasonable deferrals for a prototype; see §25 and §19.
- No `uuid`, uses `Date.now().toString(36)` + `Math.random` for ids — collision risk is negligible at prototype scale but not cryptographically random. Fine for prototype.

### 7.1 Complete Library / Dependency Inventory

All runtime libraries actually used by the codebase (most are imported directly; Tiptap's ProseMirror peer `@tiptap/pm` is required by the editor). Versions are the declared ranges from `package.json`. No library is listed here that is not present in `package.json`, and all libraries in `package.json` are used.

#### Frontend — runtime dependencies

| Package | Version | Modules | Purpose |
|---|---|---|---|
| `react` | `^19.2.8` | `react` | UI framework (used everywhere in `src/`) |
| `react-dom` | `^19.2.8` | `react-dom/client` | Client-side DOM rendering (`src/main.tsx`) |
| `react-router-dom` | `^6.26.2` | `react-router-dom`, `useParams`, `useNavigate`, `NavLink`, `Link`, `useLocation` | All routing (`/blog`, `/blog/:slug`, `/blog/admin/...`) |
| `@tiptap/react` | `^3.31.0` | `useEditor`, `EditorContent` | Rich text editor host (`RichTextEditor.tsx`) |
| `@tiptap/starter-kit` | `^3.31.0` | `StarterKit` | Editor base extensions (headings, bold, lists, blockquote, undo/redo…) |
| `@tiptap/pm` | `^3.31.0` | (peer) | ProseMirror peer required by Tiptap v3 |
| `@tiptap/extension-text-align` | `^3.31.0` | `TextAlign` | Left/center/right/justify alignment (`RichTextEditor.tsx`) |
| `@tiptap/extension-text-style` | `^3.31.0` | `TextStyle` | Inline styles; backing for Color + Custom FontSize extension |
| `@tiptap/extension-color` | `^3.31.0` | `Color` | Text colour |
| `@tiptap/extension-highlight` | `^3.31.0` | `Highlight` | Highlighter (multicolor) |
| `@tiptap/extension-underline` | `^3.31.0` | `Underline` | Underline |
| `@tiptap/extension-link` | `^3.31.0` | `Link` | Hyperlinks with custom `isAllowedUri` allow-list |

> Note: `FontSize` is a **custom in-repo extension** (`src/components/admin/extensions/fontSize.ts`), not an installed package — it builds on `@tiptap/core`'s `Extension` and `TextStyle`.

#### Backend — runtime dependencies

| Package | Version | Modules | Purpose |
|---|---|---|---|
| `express` | `^5.2.1` | `express`, `Request/Response/NextFunction` | HTTP server + routing + static serving + SPA fallback (`server/server.ts`) |
| `cors` | `^2.8.6` | `cors` | CORS middleware (open by default) |
| `multer` | `^2.3.0` | `multer` | Multipart image upload parsing (`server/routes/uploads.ts`) |

#### Dev / tooling dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `~6.0.2` | Type-checking (`tsc -b`) and type-stripping at runtime for `.ts` |
| `vite` | `^8.2.2` | Dev server + production bundler |
| `@vitejs/plugin-react` | `^6.1.0` | React Fast Refresh / JSX transform in Vite |
| `eslint` | `^10.9.0` | Flat-config linter |
| `typescript-eslint` | `^8.67.0` | TS-aware ESLint rules |
| `@eslint/js` | `^10.0.1` | Recommended JS ruleset base |
| `eslint-plugin-react-hooks` | `^7.1.1` | React Hooks rules |
| `eslint-plugin-react-refresh` | `^0.5.4` | Fast-refresh rules |
| `@types/react` | `^19.2.18` | React typings |
| `@types/react-dom` | `^19.2.4` | react-dom typings |
| `@types/node` | `^24.13.3` | Node typings |
| `@types/cors` | `^2.8.19` | cors typings |
| `@types/express` | `^5.0.6` | express typings |
| `@types/multer` | `^2.2.0` | multer typings |

#### Bundled / no-package assets
- **Vite template favicon assets** (`public/favicon.svg`, `public/icons.svg`, `src/assets/vite.svg`) — included, not dependencies.
- **Logo** (`public/grinxo-logo.png`) — an image asset, with an inline SVG fallback component (`GrinXOLogo.tsx`), not a library.
- **Seed data** (`src/data/blogs.ts`, `server/data/seed.blogs.json`) — content, not libraries.

**Usage-coverage note:** every entry above maps to real usages found during review (§8–§22). No installed-but-unused packages were identified, and no code depends on a package that is absent from `package.json`. Consequently there is no dependency-sprawl concern at this stage; the constraint-driven gaps (no date lib, no testing/validation/logging lib) are intentional deferrals appropriate to a prototype.

---

## 8. Frontend: Public Site

Files: `src/pages/BlogHome.tsx`, `src/pages/BlogArticle.tsx`, `src/components/blog/*`.

**Findings**
- **4 parallel fetches on the homepage repeat the same request.** `BlogHome.tsx:30-35` calls `getFeaturedBlogs()`, `getTrendingBlogs()`, `getBlogs()`, `getCategories()` in `Promise.all`. Each funnels through `loadBlogs()` → `getPublishedBlogs()` → `GET /api/blogs?status=published`, so the full public list is fetched up to four times per page load. Functionally correct; a prototype-ok inefficiency, and a genuine "must-consider-before-production" scaling note.
- `BlogArticle.tsx:131` renders `blog.content` with `dangerouslySetInnerHTML`. The inline comment says "trusted local seed data", but the same component renders admin-authored content too (see §15 — this is mitigated only by the server sanitising `buildContentHtml`, and it is bypassable via the raw `content` API field).
- `BlogHome.tsx` has no pagination/infinite-scroll — fine for 15 seed posts, a production note.
- **Accessibility:** the `BlogCarousel` idle slides are `aria-hidden` with `tabIndex=-1` on their CTA (correct). Category sidebar items are not focusable or clickable (they are `<span>`), which is fine (informational) but the "Explore Topics" implies navigation.

---

## 9. Frontend: Admin Panel

Files: `src/pages/admin/*`, `src/components/admin/*`.

Implementations are solid: dashboard filtering/sorting (`BlogDashboard.tsx:70-83`), a well-built Tiptap editor with toolbar and link-menu, a section builder with move/remove/add, and image pickers.

**Findings**
- **`as never` casts bypass type checks** — `createBlog(payload as never)` (`CreateBlog.tsx:24`) and `updateBlog(id, payload as never)` (`EditBlog.tsx:56`). The `toBlogPayload` returns `Record<string, unknown>`, which is then forced through `as never` to satisfy `Omit<Blog,'id'>` / `Partial<Blog>`. This is a type-safety escape hatch that removes compiler protection over the network payload. It works because the API is tolerant, but it's a code smell.
- **Toast/status duplication** — `EditBlog.tsx:116` computes `toast--${toast === 'published' ? 'success' : 'success'}` which is always `success` (dead ternary). Minor.
- **`BlogSelector` mislabels scheduled blogs as "Draft".** `BlogSelector.tsx:93` only distinguishes `published` vs anything-else (`Draft`), so scheduled blogs show a "Draft" pill. Cosmetic, but confusing.
- **Scheduling UI review** (`SchedulePublishModal.tsx`): the default-time helper `defaultDateTime` derives the date from the chosen timezone but the time from the server's local clock (`SchedulePublishModal.tsx:38`), so "tomorrow 09:00" is actually 09:00 *local* the day chosen *in-zone*. Minor edge-case inconsistency (§22).

---

## 10. Backend: API & Server

Endpoints (`server/routes/blogs.ts`):

```
GET    /api/blogs                    all blogs (drafts included)
GET    /api/blogs?status=published   published only
GET    /api/blogs/:id                any blog (including drafts) by id
GET    /api/blogs/slug/:slug         published only
POST   /api/blogs
PUT    /api/blogs/:id
DELETE /api/blogs/:id
POST   /api/blogs/:id/publish
POST   /api/blogs/:id/draft
POST   /api/blogs/:id/schedule
POST   /api/uploads
GET    /api/categories
GET    /api/health
```

**Findings**
- **Route ordering is correct**: `/slug/:slug` precedes `/:id` (`blogs.ts:16-17`), so slugs aren't shadowed. Good.
- **`GET /api/blogs/:id` exposes drafts to any caller.** `getBlogById` (`controllers/blogs.ts:51-58`) returns any blog regardless of status. It's used by the admin edit page, but the endpoint is public with no auth (§16). Anyone who guesses/derives an id (they're sequential-ish `blog-...`) can read unpublished drafts.
- **`GET /api/blogs` without `?status=published` also returns drafts to the public.** Only the public site's `blogApi.getPublishedBlogs` passes the query param; the raw endpoint leaks drafts.
- **Confusing dual "public" endpoints.** There is both `listBlogs` (uses `?status=published`) and `listPublicBlogs` which is dead code (§31).
- **`POST /api/blogs` accepts raw `content`.** `normalizeInput` (`controllers/blogs.ts:15`) forwards `content` verbatim; `createBlog` stores it directly, bypassing `buildContentHtml` and therefore **bypassing sanitisation** (§15). The official frontend never sends `content` (it sends `sections`), so this is only exploitable via direct API use — but the API is what the admin effectively is.

---

## 11. Backend: Storage & Scheduler

`server/services/blogStorage.ts` and `scheduler.ts`. See dedicated sections §19 (persistence), §20 (concurrency), §21 (scheduler) for depth. Highlights:
- Cache + write-through persist; reads never re-read disk after init except `reloadFromDisk`.
- `buildContentHtml` derives sanitised HTML from sections — the security backbone (§15).
- `sanitizeHtml`/`sanitizeAttrs`/`sanitizeCss`/`sanitizeUrl`/`escapeHtml` form a real allow-list sanitisation layer (§14).

---

## 12. Publishing Workflow (Draft / Scheduled / Published)

This is the feature the recent commits added, and it is implemented correctly for a single-server prototype.

**Lifecycle transitions (server-side, enforced)**
- **Publish now:** `POST /:id/publish` → `applyPublish(id)` sets `status='published'`, `publishedAt=now` (`blogStorage.ts:433`) and clears `scheduledAt`.
- **Move to draft:** `POST /:id/draft` → `applyDraft` sets `status='draft'`, clears `scheduledAt`.
- **Schedule:** `POST /:id/schedule` → `applySchedule` validates the timestamp is a parseable, **strictly-future** instant (`normalizeScheduledAt`, `blogStorage.ts:251`) and returns `400` otherwise (`controllers/blogs.ts:129`).
- **PUT carries status/`scheduledAt` through `normalizeInput`**, and any non-`scheduled` status clears `scheduledAt` (`controllers/blogs.ts:23-28`) — this is a correct guard that prevents "published but still scheduled".

**Verification performed (ad-hoc, via live API):** schedule → re-schedule → publish-now → draft → delete; PUT-scheduled preserves schedule; status draft/published clears schedule; public list excludes drafts/scheduled; slug 404 for non-published; startup recovery publishes due posts; the 30 s interval publishes due posts; far-future posts stay scheduled across restarts. All passed.

**Findings / caveats**
- **Scheduler is in-process and single-tenant.** With one demo server this is exactly right. If this ever runs as N processes (or on a horizontally scaled deployment), the interval + startup recovery becomes racy and non-distributed. **Per the audit constraint, this is genuinely fine for this prototype and is the correct call — do not over-engineer. Only revisit if/when the deployment genuinely becomes multi-instance.**
- **Client and server both do future-validation** (client in `SchedulePublishModal.tsx:79-89`, server in `normalizeScheduledAt`). Correct defense-in-depth; server is authoritative.
- A **manual POST with `status:'scheduled'` but no/invalid `scheduledAt`** creates a scheduled blog that never publishes and is invisible on the public site (`createBlog`/`updateBlog` don't validate this invariant). The UI prevents this via the modal, so it's only reachable via direct API. Low severity for prototype; worth a server-side invariant.
- `BlogDashboard.tsx:258` formats the scheduled date with a hard-coded `'Asia/Kolkata'` while the modal lets the user pick IST or UTC — a post scheduled in UTC will be shown converted to IST in the dashboard; acceptable but worth documenting.

---

## 13. Security Review

Overall: **the codebase shows good security discipline in HTML handling, and none in access control.** The absence of any authentication is the decisive factor in the Production Readiness score.

| # | Finding | Severity | Type |
|---|---|---|---|
| S1 | **No authentication on any admin endpoint** (create/update/delete/publish/draft/schedule/uploads). Anyone with network access can read/edit/delete blogs and upload files. | **Critical** | Production-blocker |
| S2 | raw `content` accepted by `POST/PUT /api/blogs` bypasses sanitisation → **stored XSS** via `dangerouslySetInnerHTML` (`BlogArticle.tsx:131`). | **High** | XSS |
| S3 | `GET /api/blogs/:id` and `GET /api/blogs` (no `?status=published`) expose drafts/scheduled content. | **High** | Info leak |
| S4 | Upload endpoint: no auth, so arbitrary images can be uploaded to fill the disk. Size/type checks exist but see §17. | **High** | DoS / storage abuse |
| S5 | JSON-file writes are **not atomic** (no temp-file + rename). A crash mid-write can corrupt or truncate `blogs.json`. | **Medium** | Data integrity |
| S6 | No rate limiting, no request size guard beyond `express.json({limit:'2mb'})` for JSON. | **Low/Med** | Abuse |
| S7 | `cors()` is wide open (`server/server.ts:22`) — acceptable for a same-origin prototype, revisit in production. | **Low** | Config |

Detail and remediation in the sections below.

---

## 14. Input Validation & Sanitisation

**What's done well (genuinely above prototype-bar)**
- Rich-text HTML is parsed with a **tag/attribute allow-list** (`ALLOWED_TAGS`, `ALLOWED_ATTRS`, `blogStorage.ts:56-61`) rather than a block-list.
- Link URLs are scheme-checked to `http/https` only; `javascript:`/`data:` are dropped; `//`-prefixed and `://`-containing relative "links" are rejected (`sanitizeUrl`, `blogStorage.ts:33`).
- CSS is limited to a small allow-list of properties with a value check against `url(`, `expression`, `@import`, `javascript:` (`sanitizeCss`, `blogStorage.ts:177`).
- Anchors are always forced to `target="_blank" rel="noopener noreferrer"` (`blogStorage.ts:167-171`).
- The frontend editor independently restricts link protocols via Tiptap's `isAllowedUri` (`RichTextEditor.tsx:38-47`) and `safeHttpUrl` (`LinkMenu.tsx:33`). Defense-in-depth.

**Weaknesses**
- **The sanitiser is a hand-rolled HTML parser, not a DOM/HTML parser.** It operates on regex tokenisation. While the allow-list is strong, regex HTML handling is historically fragile against obfuscation (encoding variants, malformed attribute quoting). It is a good prototype implementation, but production should use a battle-tested library (e.g. DOMPurify) — this is a case where the recommendation is **not** gratuitous (the audit constraint allows it because there is genuine exposure here: raw content reaches `dangerouslySetInnerHTML`).
- **`content` supplied by clients bypasses `buildContentHtml`/`sanitizeHtml` entirely** (§10 S2). The sanitisation only runs inside `buildContentHtml`, which is only invoked when the client does *not* provide `content`. A direct API call providing `content` is stored verbatim.
- `excerpt`, `title`, `author`, `category` are stored as raw strings and later rendered as React text (safe by escaping), not as HTML — fine.
- `featuredImage`/`authorAvatar` (client-supplied URLs) are rendered as `img src`. React does **not** disable `javascript:` in `img src` in all cases historically; but modern React escapes it. The server does not sanitise `featuredImage` on the write path (only `sections` content is sanitised). Low risk, but the write API trusts arbitrary image URLs.

---

## 15. XSS & HTML Rendering

The single sink is `BlogArticle.tsx:131`:

```tsx
dangerouslySetInnerHTML={{ __html: blog.content }}
```

**Risk analysis**
- For seeded content: sandboxed/trusted, safe.
- For admin-authored content via the official UI: `content` is derived from `sections` by `buildContentHtml` → `sanitizeHtml`, so the allow-list applies. Controlled.
- For content set directly through the API's raw `content` field: **unsanitised** → stored XSS. Combined with S1 (no auth), any network caller can inject `<script>`/event-handlers and steal sessions (if any existed) or deface pages.

**Impact:** Persistent XSS affecting every visitor to that article page. Escalates to full account/data compromise in a system that had sessions — this one doesn't, but it still compromises site integrity.

**Verdict:** Fixing the raw-`content` path (either refuse `content` on write, always rebuild from `sections`, or run `sanitizeHtml` on raw content) and adding auth together close this class of bug.

---

## 16. Authorization & Admin Access

**There is no Authorization layer at all.** `AdminLayout.tsx:61` even states openly: "`GrinXO Blog Admin — prototype demo. No authentication.`"

Mapping of exposure:
- Any visitor can navigate to `/blog/admin/blogs` (client-side route, no guard — `App.tsx:21`).
- Any network caller can invoke every mutation endpoint.

**For the prototype this is acceptable and honestly documented.** For production it is a **release blocker** and the #1 recommendation (§35).

---

## 17. File Upload Security

`server/services/imageStorage.ts` + `server/routes/uploads.ts`.

**Good**
- 8 MB limit enforced twice: multer `limits.fileSize` (`uploads.ts:7`) and `isWithinSizeLimit` (`uploads.ts:20`, `imageStorage.ts:14`). Redundant but harmless (defense-in-depth).
- Extension allow-list `jpg/jpeg/png/gif/webp` (`imageStorage.ts:5`); rejects others.
- The **content is not validated** — only the extension is checked. A JPEG-named executable is stored under `server/uploads/...`. However, uploaded files are served via `express.static` with the same origin, so no `Content-Disposition` header issue for pages; still, MIME sniffing risk exists. **Recommendation (production):** sniff magic bytes / validate MIME, and consider serving uploads from a separate origin or with restrictive headers.

**Findings**
- `isWithinSizeLimit` directly duplicates multer's `8MB` and uses the same magic constant (`uploads.ts:7`, `imageStorage.ts:6`) — a single source of truth would be cleaner.
- No auth on upload endpoint → unrestricted disk growth (S4).
- Generated filenames are unguessable-ish (`Date.now` base36 + `Math.random`), good for guessing-protection but not cryptographically random.
- No orphan cleanup: sections/banners are written but deleting a blog never removes its uploaded images. A production note (disk growth over time).

---

## 18. Error Handling & Resilience

- Central Express error handler returns `{error: 'Internal Server Error'}` with the right status (`server/server.ts:67-78`). Good.
- Storage `persist` catches write failures, keeps in-memory state, and logs; the scheduler catches and logs per-blog publish failures (`scheduler.ts:18-21`). Good resilience intent.
- **API 404 handler** returns JSON (`server.ts:63-65`). Good.
- **Frontend fallback contract mismatch (real bug-ish):** `src/data/blogService.ts:19` only falls back to seed data when `ApiError.status === 503`, but the backend never returns 503 for health (a stopped backend causes a network `fetch` rejection, not a 503 JSON `ApiError`). So in practice the seed fallback almost never triggers; a down backend instead throws and the home page shows its error state (`BlogHome.tsx:40-65`). Given the demo runs server-first, this is acceptable, but the intended "render from seed when API is down" path is effectively dead. See §31.
- Dashboard errors are surfaced per-action via toasts/alerts with `busyId` disabling — nice UX.

---

## 19. Persistence & Durability

**Storage model:** in-memory array cache + synchronous `writeFileSync` of the whole dataset (`blogStorage.ts:470-480`).

**Findings**
- **Writes are not atomic.** `writeJson` truncates + writes in place (`blogStorage.ts:268`). A crash, power loss, or disk-full mid-write corrupts `blogs.json` and loses data. **Production must** use temp-file + atomic `rename` (and ideally periodic backups / a real DB). This is high-value and cheap to fix, independent of any DB decision.
- Whole-file rewrite on every mutation — O(n) per write, trivially fine at 15–few-thousand records, a note beyond that.
- Read path: `getAllBlogs()` returns the cache; no lock, but single-threaded Node + single server makes race windows small (see §20).

---

## 20. Concurrency & Atomicity

- Node's single-threaded event loop means synchronous file writes serialize naturally; there are **no async awaits anywhere in the storage/scheduler path**, so within one process there's no read-modify-write race in practice.
- `persist` sets `cache = blogs` *before* the write; if the write fails, memory and disk disagree until the next successful write/timeout — acceptable but documented behavior.
- **Multi-process hazard:** `npm run server` twice (two servers on different ports) or a clustered deploy share the same `blogs.json` with no file locking → lost updates. The demo explicitly runs one server (`README`). Per the audit constraint, this is fine for the prototype; the atomic-rename fix (§19) plus an explicit lock or a real DB are the production paths.

---

## 21. The Scheduler

`server/services/scheduler.ts` — a 30 s `setInterval` with `unref()` (won't hold the process open) and a startup `checkDueBlogs()` for recovery.

**Assessment: correct for this deployment.**
- Idempotent (`startScheduler` guards with `timer`).
- Startup recovery calls `reloadFromDisk()` then `checkDueBlogs()` — handles blogs that came due while the server was down.
- The query is `status==='scheduled' && scheduledAt <= now` (`getDueScheduledBlogs`, `blogStorage.ts:463`), and `applyPublish` clears `scheduledAt`, so a duplicate tick/restart can't double-publish.
- 30 s granularity is a fine trade for a blog (no need for second-level precision).

**Caveats** (prototype-correct, documented for production):
- In-process → run exactly one server instance for correctness. Multi-instance requires an externalised trigger that is not a distributed queue — the audit constraint notes there is **no genuine need** here, so no recommendation to add infrastructure.
- A restart that happens in the seconds between `scheduledAt` becoming due and the 30 s tick is fine (recovery covers it), but a blog whose `scheduledAt` is exactly now and the server is down will publish at most 30 s late. Acceptable.

---

## 22. Timezone & Date Handling

All timezone logic is hand-rolled `Intl` in `src/utils/date.ts`. This was flagged in the work notes and verified:

- `zonedTimeToUtc` (iterative offset convergence) — verified correct: `09:00 Asia/Kolkata → 03:30Z`, and EDT/EST DST cases were checked.
- `utcToZonedParts` pads single-digit fields — correct given Node's ICU returns `1` not `01`.
- `formatScheduledAt` builds a display string from the zoned parts.

**Findings**
- **Default-time helper mixes timezones** (§9): `SchedulePublishModal.tsx:29-40` uses the selected zone for the date but the *server local* time for the hour/minute. Cosmetic.
- `<input type="date">` for `publishedAt` is rendered via `toDateInputValue` which shifts by `getTimezoneOffset` (`date.ts:106-111`); combined with `utcToZonedParts` formatting elsewhere, date pickers and displays can disagree by a day for some local timezones. Real but edge; worth a dedicated test.
- `publishedAt` seed values are date-only strings (`'2026-08-10'`); `BlogMeta`/`formatPublishedDate` handle this, but `new Date('2026-08-10')` parses as UTC midnight which displays as the prior day in negative-offset browsers. Minor display inconsistency.

**Verdict:** logic is sound and verified; the surface is broad enough that **a small set of unit tests for the date helpers is the single highest-value test addition** (§25).

---

## 23. SEO & Accessibility

**Accessibility (good overall)**
- Landmarks (`header`, `main`, `aside`, `nav`, `footer`), `aria-label`s, `aria-modal` dialogs, `role="tablist/tab"` carousel (though slides are `aria-hidden` non-focusable, not full tab semantics), `aria-current`-style nav, focus-scroll on article navigation, `alt` text on content images, form labels present, delete/schedule confirmation dialogs have `aria-labelledby`.
- **Issues:** many icon-only buttons rely on `title`/`aria-label` (ok); some `img` with empty `alt` used decoratively with `aria-hidden` (ok); the "Explore Topics" sidebar lists categories but they are not interactive (§8). `EditBlog.tsx:116` classifier is a no-op. Color-contrast of placeholder hints and some `--ghost` buttons may fall short (not measured, worth a lint pass).

**SEO**
- SPA with no server-side rendering: article title/description/meta are not set per-route; search engines see a single shell. **Production** needs `meta`/`OG` handling (e.g. document.title + meta tags on route change or SSR). Acceptable for prototype.
- URLs are clean `/blog/<slug>`; good.
- Dates use `<time dateTime>`; semantics good.

---

## 24. Performance

At this scale, performance is a non-issue electrically, but worth stating:
- Four redundant public-list requests per homepage load (§8) — largest frontend waste.
- Body render uses `dangerouslySetInnerHTML` of server-sanitized content — efficient client-side, no hydration concern (no SSR).
- Tiptap editor is `lazy()`-loaded (`SectionBuilder.tsx:5`), splitting ~412 kB out of the main bundle — good practice; note `dist/assets/RichTextEditor-*.js` is 412 kB (gzip 128 kB), the largest chunk.
- Synchronous JSON writes block the event loop briefly on each mutation — negligible at this dataset.
- No image optimisation/resizing on upload — full-resolution files are served. Production note.

---

## 25. Testing

**There are no automated tests.** No test runner in `package.json`, no `*.test.*` / `*.spec.*` files. The publishing workflow was verified manually (ad-hoc API calls documented in the session).

**Recommendation (production; low-effort high-value):**
1. A small `vitest` suite for `src/utils/date.ts` (zonedTimeToUtc, utcToZonedParts, formatScheduledAt) — covers the most fragile logic.
2. Integration tests for `sanitizeHtml`/`buildContentHtml`/`sanitizeUrl`/`sanitizeCss` (the security backbone) and `normalizeScheduledAt`.
3. A `node:test`/`vitest` integration test that boots `server/server.ts`, exercises the full lifecycle (create → schedule → tick → publish → public visibility), reinstating `blogs.json` afterward.

`server/` currently has no test harness; `node --test` with strip-types is the least-friction path.

---

## 26. Type Safety

- `tsc -b` passes; **only `src` is type-checked** (`tsconfig.app.json:25 include:["src"]`; `tsconfig.node.json:22 include:["vite.config.ts"]`). **The entire `server/` tree is not type-checked by tsc at all**, and `server/` files import their own duplicated types. Runtime uses Node strip-types (type-stripping only, no checking).
- Consequences:
  - `src/types/blog.ts` and `server/types/blog.ts` drift silently (confirmed §6).
  - Server code can carry type errors invisible until runtime.
  - `as never` casts in `CreateBlog.tsx:24` / `EditBlog.tsx:56` defeat the frontend payload type.
- **Recommendation:** add a `server/tsconfig.json` (e.g. `module: nodenext`, `types:["node"]`, `noEmit`) and include it in `tsc -b` build references, and consider a shared `types/` package or imports so the model isn't duplicated.

---

## 27. Linting & Static Analysis

`npm run lint` (eslint 10, flat config) → **2 errors, both pre-existing / pre-sanctioned, both in `server/`:**
1. `server/server.ts:73` — `_next` declared but unused (`@typescript-eslint/no-unused-vars`).
2. `server/services/blogStorage.ts:119` — unnecessary escape `\-` in a regex character class (`no-useless-escape`).

These are out of the sanctioned `src` scope (the audit is not permitted to fix them), and both are trivial. `src` is clean.

Additional static-analysis observations:
- `eslint.config.js` applies `globals.browser` to **all** `ts/tsx` files including `server/` (Node code) — which is *why* server lint surfaces oddities and the config is mis-targeted. A `server/` block with `globals.node` and browser-only overrides for `src` would be more correct.
- No `react/prop-types` or strict a11y rulesets; `tseslint.configs.recommended` + hooks is a reasonable baseline.

---

## 28. Build & Tooling

- `npm run build` = `tsc -b && vite build` — **passes** (verified: `tsc -b` exit 0; `vite build` 110 modules, 3 chunks). `dist/` produced (~320 kB main + 412 kB RTE).
- `npm run server` runs Node with type-stripping for `.ts` — works (verified live earlier this session; the server was restarted with current code after a stale process was killed).
- Dev (`vite`) proxies `/api` and `/uploads` — correct (`vite.config.ts:12-15`).
- **`npm run lint` is `eslint .`** which lints server too and fails on the 2 pre-existing errors (§27) — so `npm run lint` is currently **red**. A `npm run typecheck` script (tsc) is not defined separately; `build` runs it.

---

## 29. Documentation

- `README.md` is solid: run instructions (both single-server and dev), a clear architecture diagram, API summary, seed-regeneration steps, and explicit "no database" note.
- **Out of date:** the API summary (`README.md:81-92`) omits `POST /api/blogs/:id/schedule` — added by the recent scheduling feature. It also does not mention that `/api/blogs/:id` returns drafts or that there is no auth. The "How it works" ASCII diagram omits the scheduler.
- Inline doc comments (`blogStorage.ts`, `scheduler.ts`, `date.ts`) are high quality.
- `AdminLayout.tsx:61` documents the no-auth demo contract honestly — good.

---

## 30. Git Hygiene & Data Files

- `.gitignore` correctly ignores `server/data/blogs.json` and `server/uploads/` but keeps the seed and categories (`README` intent). Good.
- `git status` is clean; HEAD is `e8b670d` (scheduling modal spacing). Recent commits are focused on the publishing feature.
- **Data verified clean:** `server/data/blogs.json` currently = 15 blogs, all `published`, no `scheduledAt` (restored after testing). `server/data/seed.blogs.json` = 15 published. `categories.json` committed with 10 categories.
- `server/uploads/` contains a handful of uploaded demo files (not committed) — expected for tested uploads.

---

## 31. Dead Code & Orphaned Data

- **`listPublicBlogs` is unused.** Defined in `controllers/blogs.ts:46-49` but never wired to a route.
- **`getBlogBySlug` (server) vs controller** naming: `store.getBlogBySlug` is used correctly; no dead duplicate at storage level. But `serverStorage.setStatus` (`blogStorage.ts:405`) is defined and **unused** — the controller calls `applyPublish`/`applyDraft` directly instead.
- **`reloadFromDisk` is exported public API but only used by the scheduler** — fine, not dead.
- **`server/data/categories.json` is orphaned.** It is written by `initStorage` (`blogStorage.ts:287-289`, initialized to `[]`) and by the seed script, but **never read** anywhere (verified by grep). The `/api/categories` endpoint computes categories live from published blogs (`server.ts:36-41`). So `categories.json` is writes-only dead data. Remove or wire it up.
- **The seed fallback path is effectively dead** (§18): `blogService.ts:19` matches `503` only, which the backend never returns; a down API throws a network error instead, so `seedBlogs` is rarely used. The "render from seed when API down" intent doesn't hold in practice.
- **`categories.json` empty-array init** would, on a fresh checkout where the file is absent, write `[]` — harmless since unread, but it shadows whether categories are meant to persist.

---

## 32. Code Quality & Maintainability

**Strengths**
- Layered and readable; naming is clear; comments explain *why* (scheduler unref, selection capture for native color pickers, timestamp guessing).
- Error paths are handled; no swallowed errors in `src`.
- The scheduler and sanitisation code are compact and correct.

**Weaknesses**
- Duplicated type definitions (§6/§26).
- `Record<string, unknown>` payloads with `as never` casts (§9).
- Hand-rolled HTML/CSS sanitisation (§14) — strong for a prototype, flagged for production replacement.
- Homepage N+1 fetch pattern (§8) and dead fallback (§31).
- Magic constants (8 MB) duplicated across upload route and storage (§17).

---

## 33. Security Posture Summary

| Layer | Prototype | Must-change-before-production |
|---|---|---|
| AuthN/AuthZ on admin | None (documented) | **Add real auth + role guard on all mutations and on draft exposure** |
| XSS | Sanitised via `buildContentHtml` on official path | **Block/ sanitise raw `content` API path; adopt DOMPurify; audit `dangerouslySetInnerHTML`** |
| Info leak (drafts by id/list api) | Present | **Gate by auth; stop leaking non-published in public endpoints** |
| Uploads | Size+ext checks | **Validate MIME/magic bytes, auth, explicit origin/headers, purge orphans** |
| Persistence | Sync JSON write-through | **Atomic temp+rename writes; backups; (or real DB)** |
| Transport (TLS/CORS/rate limit) | None / open CORS | **HTTPS, restrict CORS, rate limit, request body limits** |

---

## 34. Top 10 Risks

1. **[Critical] No authentication/authorization on the entire admin API** → data tampering, deletion, arbitrary uploads, XSS injection by anyone. `server/routes/*`, `App.tsx:21`.
2. **[High] Stored XSS via raw `content`** → because `normalizeInput` forwards `content` and `createBlog`/`updateBlog` store it, `dangerouslySetInnerHTML` in `BlogArticle.tsx:131` can render attacker HTML/JS. Bypasses `buildContentHtml` sanitisation.
3. **[High] Draft/scheduled content leaks through `GET /api/blogs` and `GET /api/blogs/:id`** with no auth.
4. **[High] Unauthenticated, unvalidated-MIME image upload** → disk-fill DoS and file-type spoofing.
5. **[Medium] Non-atomic JSON writes** → data loss/corruption on crash mid-write.
6. **[Medium] No automated tests**, especially for timezone (most fragile logic) and sanitisation (security backbone).
7. **[Medium] `server/` not type-checked** + duplicated type models drifting.
8. **[Low-Med] `npm run lint` currently fails** on 2 pre-existing server errors.
9. **[Low] N+1 homepage fetches** (4× the same public list) and effectively-dead seed fallback.
10. **[Low] Orphaned uploads** accumulate on delete; no size/orphan management.

---

## 35. Top 10 Recommendations (Prioritised)

1. **Add authentication and authorization** on all admin routes (an auth middleware + per-route guard). Block `GET /api/blogs/:id` / non-published reads to unauthorised callers. — *Blocking.*
2. **Close the raw-`content` XSS path:** on write, always derive content from `sections` via `buildContentHtml`, or run the allow-list sanitiser on any supplied `content`; reject unexpected fields. — *Blocking.*
3. **Make writes atomic:** write to `blogs.json.tmp` then `rename()` (atomic on POSIX). — *High, cheap.*
4. **Type-check the server:** add `server/tsconfig.json` and reference it from `tsconfig.json`; share/import a single `Blog` type instead of duplicating. — *High.*
5. **Add tests (vitest):** date utils + `sanitizeHtml`/`buildContentHtml`/`applySchedule`, plus a server integration test for the publish lifecycle. — *High.*
6. **Fix the dead fallback + N+1:** have `loadBlogs` fall back to seed on **any** fetch failure (not just 503), and consolidate the 4 homepage calls into one fetch. — *Medium.*
7. **Fix lint config and the 2 server errors:** scope `globals.node` to `server/`, and resolve `_next` / `\-` escapes. — *Low, quick.*
8. **Remove dead code & orphaned data:** drop unused `listPublicBlogs`, `setStatus`, and delete/wire-up `categories.json`; restore categories endpoint to a single source of truth. — *Low.*
9. **Production images:** validate MIME by magic bytes, add HTTPS/CORS/rate limiting, purge orphaned uploads on delete. — *Medium.*
10. **Update README** API summary to include `POST /api/blogs/:id/schedule`, draft-exposure caveats, and the no-auth demo contract. — *Low.*
11. *Addendum (not an infra recommendation, per audit rule):* adopt **DOMPurify** for HTML sanitisation in production. This is a genuine need (real XSS exposure), not a gratuitous microservice/db suggestion.

---

## 36. Prototype vs Production Verdicts

| Area | Prototype verdict | Production verdict | Key rationale |
|---|---|---|---|
| Scheduling (in-process timer + recovery) | ✅ Correct & appropriate | ⚠️ Requires single-instance guarantee | Idempotent, clean; not distributed — correctly so at this scale |
| Rich-text sanitisation allow-list | ✅ Above bar | ⚠️ Replace with DOMPurify | Real XSS exposure via raw content; hand-rolled parser |
| JSON-file persistence | ✅ Good enough | ❌ Replace/atomicise | Non-atomic writes = corruption risk |
| Timezone conversions | ✅ Verified correct | Add tests | Most fragile code, untested |
| Admin API | ✅ Fine as demo | ❌ Add auth now | Release blocker |
| Public filtering | ✅ Correct | Keep + gate by id | `?status=published` correct on official path |
| Frontend | ✅ Polished | Iterate on SEO/meta + fetch consolidation | Great DX/UX already |

---

## 37. Production Readiness Roadmap

**Phase 0 — Release blockers (before any production traffic)**
1. Authentication + authorization on all admin routes; gate draft/id reads.
2. Close raw-`content` XSS (sanitise/derive content on write).
3. Atomic file writes (temp + rename) or migrate to a real store.

**Phase 1 — Hardening (low cost, high value)**
4. Type-check `server/`; unify `Blog` types.
5. Vitest for date utils + sanitisation + scheduler lifecycle.
6. Fix lint (2 server errors + config scoping) so `npm run lint` is green.

**Phase 2 — Scale/hygiene**
7. MIME validation on upload + orphan cleanup + rate limiting + CORS restriction + HTTPS.
8. SEO meta/OG per article (or SSR).
9. Pagination / image optimisation.
10. Consolidate homepage data fetching; fix seed fallback.

**Phase 3 — Multi-instance (ONLY if/when genuinely needed)**
11. Move scheduling trigger off the in-process timer to a durable lock/pollhub; adopt DOMPurify if not already; choose persistence (object storage for images; a transactional store for blogs). Per the audit rule, none of this is warranted for the current single-server prototype.

---

*This audit was performed by opencode as a read-only review. No source files other than this report (and the previously-committed seed data files it references) were created or modified.*