# GrinXO Blog Section Image Positioning — Feasibility Analysis

> **Document type:** Feasibility / architecture study only.
> **No source code was modified to produce this document.** The only file created is this report.
> **Codebase inspected:** `/Users/mainaksen/projects/grinxo-blogs/grinxo-blog` @ commit `e45e863`.

---

## 1. Executive Summary

Section-level image positioning is **technically feasible**, and the cost is **low** — but only if the
rendering pipeline is changed at the same time as the data model. The data model change alone is
nearly free; the rendering change is the real work, because the current architecture **does not
render sections structurally at all**.

The single most important architectural fact discovered during this analysis:

> **The public frontend never iterates `blog.sections`.** Sections are an *authoring-time* structure
> that is flattened into a single HTML string (`blog.content`) by a serializer, then rendered with
> `dangerouslySetInnerHTML`. By the time the page renders, section boundaries and any per-section
> metadata no longer exist as data — only as baked-in HTML.

This means:

- Adding `imagePosition` to `BlogSection` is **Low complexity** as a data/persistence change
  (one interface, one sanitizer, one serializer branch).
- Actually *honoring* it requires the article renderer to become section-aware — **Medium** complexity.
- The current `BlogSection` already has `image` and `imageCaption`, so the feature is an
  **extension of an existing concept, not a new one**.
- The `image` field is a **flat string URL** in both the type definitions and all 16 persisted
  blogs. There is **no** structured image object, no alt text, no dimensions, no caption separate
  from the flat field. This is the most consequential gap for the production design.

**Headline recommendation:** introduce a discriminated `layout` concept at the section level
now (cheap, additive, backward-compatible), and plan the renderer to consume `sections[]` directly
rather than flattening. Whether to promote `image` from `string` to a structured object is the
one genuine strategic fork — see §6–7 and §25 for the tradeoffs. Do **not** wait to add the field:
the field is cheap now and expensive after content is in production.

---

## 2. Current Architecture

### Stack

| Concern | Implementation | File(s) |
| --- | --- | --- |
| Frontend | React 18 + Vite 8 + TypeScript | `src/`, `vite.config.ts` |
| Routing | React Router (`/blog`, `/blog/:slug`, `/blog/admin/*`) | `src/App.tsx` |
| Styling | Hand-written global CSS (no Tailwind, no CSS-in-JS) | `src/index.css`, `src/admin.css` |
| Backend | Express + TypeScript (run via Node, `.ts` imports) | `server/server.ts` |
| Persistence | **Flat JSON files on disk** | `server/data/blogs.json` |
| Image storage | Local disk under `server/uploads/`, served at `/uploads/*` | `server/services/imageStorage.ts` |
| Rich text | Custom `contentEditable` RTE, emits HTML strings | `src/components/admin/RichTextEditor.tsx` |
| Sanitization | Custom regex-based HTML allow-list sanitizer (server) | `server/services/blogStorage.ts` |

There is **no database, no ORM, and no object storage**. The whole backend is a JSON file plus a
disk folder. This is explicitly a prototype stage, and it materially lowers the cost of any schema
change *right now* versus after production data exists.

### Server shape

```
server/
├── controllers/blogs.ts        # HTTP handlers + input normalization
├── routes/blogs.ts             # route table
├── routes/uploads.ts           # image upload endpoint
├── services/blogStorage.ts     # JSON read/write, HTML sanitization, read-time, OG resolution
├── services/imageStorage.ts    # extension/size validation, disk write
├── services/scheduler.ts       # scheduled publish timer
├── types/blog.ts               # server-side Blog / BlogSection
├── data/blogs.json             # the database (19 blogs, 16 with sections)
└── uploads/{banners,sections}/ # uploaded images
```

### Data flow (authoring)

```
SectionBuilder.tsx  ──(sections: BlogSection[])──►  BlogEditor.tsx
                                                      │
                          buildContentHtml(sections)  │  (client, src/utils/articleContent.ts)
                                                      ▼
                                              previewDraft.blog.content  (HTML string)
                                                      │
                                    PreviewModal ──► BlogArticleView ──► dangerouslySetInnerHTML

BlogEditor ──POST/PUT /api/blogs { sections, ... }──► controllers/blogs.ts
                                                      │
                                       normalizeInput()  (passthrough for sections, line 108)
                                                      ▼
                                     services/blogStorage.ts  buildContentHtml()  ← SECOND, separate copy
                                                      ▼
                                        server/data/blogs.json  (sections[] AND content HTML)
```

### Two serializer copies — important for any change

`buildContentHtml` exists **twice**, with different security properties:

1. **Client** — `src/utils/articleContent.ts:30`. Escapes heading/caption, and emits section
   `content` **verbatim** when it looks like HTML (no sanitization) so live preview matches
   unsaved state.
2. **Server** — `server/services/blogStorage.ts:234`. Same shape, but runs section `content`
   through `sanitizeHtml()` (tag + attribute allow-list) and the image `src` through
   `sanitizeUrl()` (http/https/internal-relative only).

Any new field that affects emitted markup **must be added to both**, and the server copy is the
security boundary. This duplication is a known cost the production design should collapse (§26).

### Publication states

`BlogStatus = 'draft' | 'scheduled' | 'published'` plus an independent `isActive: boolean` gate
(`server/types/blog.ts:80-84`). A blog is public only when `status === 'published' && isActive`.
`scheduledAt` is cleared automatically whenever status is not `scheduled`
(`server/controllers/blogs.ts:119-121`). None of this interacts with section layout, so positioning
needs no state-specific handling.

### Existing SEO and social structures

Both are already implemented and both are **blog-level, not section-level**:

- `BlogSeo` (`server/types/blog.ts:9`) — `seoTitle`, `metaDescription`, focus/secondary keywords,
  canonical, OG title/description/image, robots flags.
- `BlogSocialSharing` (`server/types/blog.ts:58`) — per-destination (Instagram story/post/DM,
  Facebook story/timeline) content objects, added in commits `14419b8` and `43d6113`, resolved
  through a centralized resolver `src/utils/socialShare.ts`.

`BlogSocialSharing` is the **closest existing precedent** in the codebase for nested structured
optional sub-objects with a sanitizer, and it is a useful template for how a structured
`section.image` would be introduced (§6, §22).

---

## 3. Current Blog Section Structure

The actual model, verbatim from `server/types/blog.ts:1-7` and mirrored identically in
`src/types/blog.ts:1-7`:

```ts
export interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string;
  imageCaption?: string;
}
```

Empirically confirmed against the live data file — every section key across all 19 blogs is exactly:

```
content, heading, id, image, imageCaption
```

And the image is **never** an object in existing data:

```
image as OBJECT anywhere: NO (image is always a string)
```

### Real persisted example

```json
{
  "id": "section-mtqvtxon",
  "heading": "",
  "content": "<p><span style=\"font-size: 11pt;\">There's a particular kind of panic..."
}
```

Notable characteristics of the current model:

- **`id`** — client-generated as `section-${Date.now().toString(36)}-${n+1}`
  (`SectionBuilder.tsx:16-18`). Time-based, not a UUID. Fine for a prototype; worth replacing
  before production since these ids become API identifiers.
- **`heading`** — rendered as `<h2>`; always present, frequently `""` in real data.
- **`content`** — a **string of HTML** produced by the rich-text editor, or plain text for
  legacy/seed blogs. It is not structured block data.
- **`image`** — optional flat string URL. Uploaded images look like `/uploads/sections/mtjs...jpeg`;
  seed blogs carry absolute external URLs.
- **`imageCaption`** — optional flat string, rendered into `<figcaption>`.

### What does **not** exist today

Verified absent (grep for `imagePosition`, `sectionType`, layout/align keys returned nothing):

- No `type` discriminator — every section is implicitly "text + optional image".
- No layout/position/alignment field of any kind.
- No alt text field.
- No image dimensions (width/height).
- No per-section gallery or media array.
- No heading level control (hardcoded `<h2>`).

### The structural limitation that dominates this analysis

Sections are **serialized away** before render. In `BlogArticleView.tsx:74-78`:

```tsx
{blog.content?.trim() ? (
  <div
    className="article-prose"
    dangerouslySetInnerHTML={{ __html: blog.content }}
  />
) : ...}
```

The renderer receives one HTML blob. So a field like `imagePosition` can only affect the page if it
is **baked into the HTML string** during serialization (e.g. emitted as a class or inline style), or
if the renderer is refactored to consume `sections[]` directly. Both routes are analyzed in §8.

---

## 4. Current Image Handling

### Storage

`server/services/imageStorage.ts` — `saveImage(buffer, originalName, folder)`:

- Extensions allow-listed: `.jpg .jpeg .png .gif .webp` (no SVG, no AVIF today).
- Max size 8 MB.
- Filename generated server-side: `${Date.now().toString(36)}-${random}.${ext}` — the original
  filename is discarded, which is good (no path traversal via name).
- Returns **only** `{ url: '/uploads/{folder}/{filename}' }`.
- Served by `server/routes/uploads.ts` at `/uploads/*`.

`UploadFolder = 'banners' | 'sections'` — section images already have their own bucket.

**No image metadata is produced or stored**: no width, no height, no intrinsic ratio, no dominant
color, no alt text, no blurhash/LQIP, no responsive `srcset` variants. `saveImage` never inspects
pixel data.

### UI

`src/components/admin/ImagePicker.tsx`:

```ts
value?: string;
onChange: (url: string | undefined) => void;
```

It is a single-URL picker with upload and remove. The preview `<img>` uses `alt={label}` — i.e. the
alt text shown in the admin preview is the *field label*, never real user-authored alt text.

`SectionBuilder.tsx:116-140` wires one `ImagePicker` per section plus a conditional caption
`input` that only renders when `section.image` is truthy. One image per section, hard maximum.

### Rendering

Both serializer copies emit the same markup:

```html
<figure class="article-figure">
  <img src="..." alt="..." />
  <figcaption>...</figcaption>   <!-- only when imageCaption is set -->
</figure>
```

`alt` is **derived, never authored**: `escapeHtml(section.heading || 'Section image')`
(`blogStorage.ts:247`, `articleContent.ts:43`). Two consequences:

1. A section with no heading gets the literal alt `"Section image"`.
2. A section whose heading is a real heading gets that heading reused as alt — frequently
   redundant or wrong.

### CSS

The styling is essentially inert for this feature:

```css
.article-prose img    { max-width: 100%; height: auto; }   /* index.css:1396 */
.article-prose figure { margin: 1.5rem 0; }                /* index.css:1397 */
```

There is **no** `.article-figure` rule anywhere, no float, no grid, no flex. Images render as
block-level elements stacked with the text, above it. The `class="article-figure"` is currently a
**naming hook that nothing styles** — which is fortunate: it means a layout class can be added later
without fighting existing rules.

No `width`/`height` attributes are emitted on the `<img>`, and there is no `loading="lazy"`.
That is a **pre-existing CLS and LCP concern independent of positioning** (§20).

### Security posture of image URLs

`sanitizeUrl()` (`blogStorage.ts:~38-55`) is solid and worth preserving:

- Rejects `//host` protocol-relative and anything containing `://` when starting with `/`
  (prevents open-redirect-ish `//evil.com`).
- Absolute URLs must parse and use an allow-listed protocol (http/https), blocking
  `javascript:` and `data:`.
- Returns `null` on anything unparseable, and the image is simply omitted.

Note this server-side check protects the `src` attribute. It does **not** protect a hypothetical
future `alt`/`caption` from injection — those are `escapeHtml`'d, which is correct and sufficient.

---

## 5. Core Feasibility

### Question

Can `section` carry an `imagePosition` concept like `left | right | top | bottom`?

### Answer: Yes, with Low data-model complexity. The constraint is downstream, not upstream.

**Why the data model is already adequate:**

- `BlogSection` is a flat, single-level interface with two optional fields already
  (`image`, `imageCaption`). Adding another optional scalar is structurally trivial.
- Sections are already first-class, ordered, independently editable entities with stable ids and
  CRUD UI (add / delete / reorder up-down / per-section image + caption).
- Persistence needs **no structural change at all** — `sections` is persisted as a JSON array, and
  the server currently passes it through with a cast and zero per-field validation
  (`controllers/blogs.ts:108`). An unknown-to-the-server field would technically survive today, but
  that is a bug, not a feature (§22).
- There is **no database migration** — `server/data/blogs.json` is edited in place, and the
  project has 19 blogs, 16 with sections.
- The codebase already has two working precedents for nested optional structured config on a blog:
  `seo` and `socialSharing`. Both were added additively and are fully backward-compatible.

**The real constraint — the flattening bottleneck:**

`imagePosition` cannot influence layout through the current renderer, because the renderer never
sees a section. It sees `blog.content`, a finished HTML string. Therefore exactly two viable
rendering strategies exist:

| Strategy | How position is honored | Cost | Consequence |
| --- | --- | --- | --- |
| **A. Bake into HTML** | Serializer emits `class="article-figure--left"` (or a wrapper) and the public page styles it | Low–Medium | Keeps the flattening architecture. Position is a *rendering artifact*, not data. Frontends that ignore the class silently lose it. |
| **B. Render sections structurally** | Refactor `BlogArticleView` to map over `blog.sections[]`, dropping `dangerouslySetInnerHTML` for section content | Medium | Position is genuine data. Renderer becomes portable. Bigger change, better foundation. |

Strategy A is smaller and keeps existing content/rendering intact. Strategy B is the one that
actually satisfies "the production frontend can display the section image in different positions"
in a frontend-independent way, and it is the only approach that scales to galleries, videos, or
other section types without a second rewrite.

**The deepest issue — `content` is authoritative and lossy:**

`blogStorage.ts:398` and `:456-460` show `content` is *derived* on create/update, but it is also
*storable and authoritative*:

```ts
content: input.content ?? buildContentHtml(sections)   // create
content: input.content !== undefined
  ? input.content                                       // ← client-supplied HTML wins
  : input.sections ? buildContentHtml(sections) : existing.content
```

The client sends `content` (built by the unsanitized client-side copy) alongside `sections`. So
`blog.content` in the JSON is frequently the **client-generated HTML**, not the sanitized server
output. Adding layout info to `sections` without also handling the pre-built `content` path would
produce a mismatch: the section says "image left" while the stored HTML says otherwise.

This is the single most important thing to fix before positioning can be trusted (§22, §29).

### Feasibility verdict

Feasible. Not a data-model problem. Ranked by real cost:

1. Adding the field to the type — trivial.
2. Persisting and round-tripping it — nearly free, but needs real sanitization added.
3. Emitting it into the HTML — small change, **two** places, must not conflict with client `content`.
4. Honoring it in CSS — small, one new class family.
5. Making the renderer genuinely section-aware — the only Medium item, and optional for v1.

---

## 6. Possible Data Models

### Model 0 — Today (baseline, for reference only)

```ts
interface BlogSection {
  id: string;
  heading: string;
  content: string;       // HTML string
  image?: string;        // flat URL
  imageCaption?: string;
}
```

### Model A — Minimal addition

```ts
interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string;
  imageCaption?: string;
  imagePosition?: 'left' | 'right' | 'top' | 'bottom';
}
```

- `imagePosition` present but no image → frontend must ignore it. Requires a documented rule.
- Keeps `image` as a string, so `alt` remains unauthorable and dimensions remain unavailable.
- Fully backward compatible; unknown-value tolerance is trivial.

### Model B — Structured image + structured layout

```ts
interface BlogSectionImage {
  url: string;
  alt?: string;
  caption?: string;
  position?: 'left' | 'right' | 'top' | 'bottom';
  width?: number;
  height?: number;
}

interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: BlogSectionImage;
}
```

- Solves alt text and dimensions; enables `srcset`/responsive art direction later.
- Breaking change to the `image` field's type — requires reading legacy strings.
- Mirrors the existing `SocialShareStory` / `SocialShareTimeline` shape, so it is idiomatic here.

### Model C — Section `type` discriminator + per-type content

```ts
type SectionType = 'text' | 'image-text' | 'gallery' | 'quote' | 'video' | 'embed' | 'cta';

interface BlogSection {
  id: string;
  type: SectionType;
  content: string;
  image?: BlogSectionImage;
  layout?: { imagePosition?: 'left' | 'right' | 'top' | 'bottom' };
}
```

- The strongest long-term foundation (§13, §26).
- Disproportionately more expensive *today* because it interacts with the flattening
  serialization and the two serializer copies.
- Risk of over-engineering a prototype whose real section-type requirements are unvalidated.

### Model D — Layout as an abstract token (recommended direction)

```ts
interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string | BlogSectionImage;
  layout?: {
    imagePosition?: 'left' | 'right' | 'top' | 'bottom' | 'full-width';
    /** future: mediaRatio?, textRatio? */
  };
}
```

- Groups presentation concerns under one namespace, so future layout keys don't clutter the
  section root or collide with content fields.
- A `full-width` value is a natural extension of a single enum (§14).

### Content vs layout separation

Both Model C and Model D nest position under `layout`, keeping content and presentation in
separate namespaces. This makes the content/layout boundary explicit (§25) and is the pattern the
`seo` / `socialSharing` blocks already follow at the blog level.

---

## 7. Simple vs Extensible Approach

| Dimension | Model A (flat `imagePosition`) | Model B (structured image) | Model D (`layout` namespace) |
| --- | --- | --- | --- |
| Implementation effort now | Trivial | Low–Medium (type change + read compat) | Low |
| Backward compatibility | Perfect (additive optional) | Requires string→object coercion | Perfect |
| Alt text authoring | **Not supported** | Native | Depends on image shape |
| Image dimensions / CLS | Not supported | Native | Depends on image shape |
| Extensibility to galleries | Poor — needs `images: []` later anyway | Moderate | Moderate |
| Consistency with codebase | Neutral | **High** (matches `SocialShareStory`) | High |
| Sanitizer work | Trivial (one enum check) | Medium (nested object, like `sanitizeStory`) | Low |
| Content/layout separation | Weak (position at root, sibling of content) | Weak | **Strong** |
| Cost of being wrong | Low | Medium (type churn) | Low |

### What the codebase actually argues for

The repository has **already answered this question once**, for social sharing. `BlogSocialSharing`
is a nested, per-destination, fully-optional structured object with a dedicated sanitizer
(`sanitizeSocialSharing`, `controllers/blogs.ts:69-97`) and a centralized resolver
(`src/utils/socialShare.ts`). It was added **additively** — old blogs with no `socialSharing` keep
working, and a shared-composite fallback resolver supplies defaults at read time.

That is a direct, in-repo precedent showing the team can and does build structured optional config
and that backward compatibility is handled by *optionality + resolver defaults*, not by migrations.

### The decision, stated honestly

The genuine fork is **not** "flat vs nested position" (both are cheap). It is:

> **Do we promote `image` from `string` to an object now, or keep it a string and add `alt`/`width`/
> `height` as sibling fields later?**

- Keeping `image` a string and adding `imageAltText?: string` beside it is the *lowest-total-cost*
  path and preserves the existing type, but it is a one-way door: galleries, `srcset`, focal points
  and per-image captions all eventually want an object or array, and sibling-field sprawl
  (`imageAltText`, `imageWidth`, `imageHeight`, `imageFocalX`…) is the classic symptom of a shape
  that outgrew its form.
- Promoting it now costs one sanitizer and one coercion at read, and buys alt text and CLS
  dimensions — the two things that actually matter for accessibility and Core Web Vitals, and both
  of which are needed by the production frontend regardless of positioning.

Positioning itself is largely orthogonal to that choice. That is the most useful thing to know for
planning: **the positioning decision and the image-shape decision can be made independently.**

---

## 8. Production Frontend Rendering

### Consumption path

```
Admin CMS              decides: has image, which image, position, alt, caption
      │  writes
      ▼
Blog data (sections[])  layout is DATA, not CSS
      │
      ▼
API                    returns sections[] including layout.imagePosition
      │
      ▼
Production frontend     maps sections[] → components, chooses CSS
```

This is a clean separation and matches the request. The current architecture already supports
storing a preference in the CMS (it stores `seo`, `socialSharing`, `isActive`, `featured` — all
frontend-interpreted decisions).

### The one contract the frontend should receive

The frontend should receive the section **and its layout preference**, and decide everything about
pixels: widths, ratios, breakpoints, stacking, typography, motion. It should never be handed CSS
strings, class names, or pixel values (§18, §19).

### Two viable renderer shapes

**Shape 1 — HTML emission (minimal change, keeps flattening).**

The serializer emits the position as a class:

```html
<figure class="article-figure article-figure--left">…</figure>
```

and the public page adds:

```css
.article-figure--left  { /* image left, text right */ }
.article-figure--right { /* image right, text left */ }
```

The complication: with the current per-section emission, the image `<figure>` and the text are
**siblings inside one flat `.article-prose` block** — they are not wrapped in a per-section
container. To place an image beside text, the serializer must additionally wrap each section in
a container (e.g. `<section class="article-section article-section--image-left">`) and the CSS must
lay out the `<figure>` and the text nodes as flex/grid children. This is a real but contained
change: the serializer already builds each section's parts in a loop, so adding a wrapper element
is a small, local edit — **applied identically in both copies**.

**Shape 2 — Structural rendering (the better foundation).**

`BlogArticleView` maps over `sections[]` and renders each section with a component that reads
`section.layout.imagePosition`. `dangerouslySetInnerHTML` is retained only for the *rich text body
string*, or replaced by a proper HTML sanitizer on the client.

Advantages: position is real data; the same section data renders identically in any frontend; adding
galleries/videos/quotes later means adding a component, not a serializer. Disadvantage: touches
the highest-traffic render path, and the client currently trusts `blog.content` HTML wholesale, so
this work is better done when the client also gains sanitization (§31).

### Recommendation

Ship **Shape 1** if positioning is needed soon and the goal is a contained, low-risk feature. Plan
**Shape 2** as the production target. Because both read the same `layout` value, the migration from
one to the other is a renderer change only — **the data written by Shape 1 is the same data Shape 2
consumes.** That property is worth protecting deliberately.

---

## 9. Responsive Behavior

### Current state

There is effectively no responsive layout control for section images. `.article-prose img` is
`max-width: 100%; height: auto` and figures are block-level with vertical margin. The single
`@media` rules in `index.css` that touch prose are typography changes. So today, on every viewport,
the image is above the text. **Any `left`/`right` behavior is net-new.**

### The core question: preserve `left`/`right` on mobile, or override?

**Recommendation: the frontend must override on narrow viewports. Do not treat the CMS preference as
binding on mobile.**

Rationale, in order of weight:

1. **Reading order.** `left`/`right` are *visual* left/right. On a 360 px viewport, a genuine
   side-by-side image column either becomes unusably narrow or forces the text into a very short
   measure, badly hurting readability for body copy. The document reading order (image then text) is
   preserved by stacking — only the visual axis collapses.
2. **The layout degrades to `top`, which is what the user sees anyway.** Because the current
   default is "image above text" (block flow), stacking a `left` section on mobile produces exactly
   the established mobile experience. No user is surprised; nothing regresses.
3. **It keeps the data model honest.** The stored value expresses an *editorial intent about
   desktop composition*, not a layout instruction. Documenting it that way is what makes
   `position` safe to consume in many frontends.

Concretely, the production frontend should treat `left`/`right` as a **desktop preference** and
collapse to `top` below its chosen breakpoint, while `top`/`bottom` apply at all widths.

### Breakpoint guidance

- **Mobile (< ~640 px):** single column. `left`/`right` → stack (image first, matching the current
  default). `top`/`bottom` honored as-is.
- **Tablet (~640–1024 px):** either two columns at a tighter ratio, or still stacked. Designer's
  call; the data supports either without change.
- **Desktop (> ~1024 px):** `left`/`right` render as two columns.

**The breakpoint, the ratio, and the media query are frontend-only concerns** and must not be stored
in content (§18).

### Implementation technique (analysis only)

CSS Grid with a named template per position, or flexbox with `order`. A grid sketch, for
illustration only:

```
left:  "media text"     right: "text media"
top:   "media" / "text" bottom: "text" / "media"
```

This is a 4-case mapping, well within the capability of either technique, and needs no
JavaScript-driven conditional rendering. See §32 for the comparison.

### Note on logical properties

For a production system that may support RTL, prefer logical properties (`margin-inline-start`
over `margin-left`, grid `start`/`end` over `left`/`right`) so that `position: "left"` can be
interpreted as "inline-start" and mirrored correctly in RTL locales. This is a frontend
implementation detail; the data value `"left"` should be documented as meaning *inline-start* if
RTL is ever on the roadmap. **Not applicable to GrinXO today** (English-only), but free to get
right later.

---

## 10. Accessibility

### The core risk

Using CSS to visually reorder content (image rendered left while it appears later in the DOM, or
vice versa) is a well-known accessibility hazard. The WCAG-relevant concerns are:

- **1.3.2 Meaningful Sequence** — the visual reading order must make sense without CSS.
- **1.3.1 Info and Relationships** — the association between image and its caption/text must be
  programmatically determinable.

### What the current architecture does today

The serializer emits, per section:

```html
<h2>heading</h2>
…text…
<figure class="article-figure">
  <img src="…" alt="…" />
  <figcaption>…</figcaption>
</figure>
```

So the **DOM order is heading → text → image**, and the image visually appears *below* the text
(block flow). This is consistent and accessible *today*.

### The critical decision this analysis must surface

If `position: "left"` is implemented with a **per-section wrapper** plus flex/grid `order` or grid
placement, the DOM order can be made to **match the visual order** for every position. This is the
preferable approach and it is achievable:

```
position=left   → DOM: <figure/> then text      (visual: image | text)      ✓ match
position=right  → DOM: text then <figure/>      (visual: text | image)      ✓ match
position=top    → DOM: <figure/> then text      (visual: image / text)      ✓ match
position=bottom → DOM: text then <figure/>      (visual: text / image)      ✓ match
```

Because each serializer already controls the order in which it pushes parts into its `parts[]`
array, **matching DOM order to visual order is a local change in the serialization loop** — the
emission order simply follows `position`. No `order` CSS trickery is needed, and no
CSS-only-reordering hazard is introduced.

**This is the single most valuable accessibility recommendation in this report:** the CMS should
store the *editorial* preference, and the serializer should emit DOM in the corresponding order so
CSS only controls geometry, never reading order. Avoid `flex-direction: row-reverse` /
`order:` hacks, which reorder visually while leaving DOM order untouched.

Caveat: because §9 recommends collapsing `left`/`right` to stacked on mobile, the DOM order on
mobile will differ from the DOM order on desktop for those sections. That is acceptable and
expected — the mobile reading order is the natural heading → text → image sequence, and it matches
what a user sees.

### Alt text

This is a pre-existing gap that positioning makes more visible, and the honest accessibility
statement is:

- **Today:** alt is auto-derived from the section heading, or the literal `"Section image"`. There
  is no way for an author to supply meaningful alt text.
- **With positioning:** a side-by-side image sits adjacent to text describing the topic, so screen
  reader users may encounter the image before any text explaining it. A meaningless
  `alt="Section image"` becomes more disruptive.
- **Therefore:** alt text is a **prerequisite for shipping `left`/`right`**, not an optional
  refinement. The two features should ship together, or `left`/`right` should be gated until alt
  text exists.

This materially raises the priority of the Model B decision in §7: `image` as a string cannot carry
alt text without a sibling field.

### Captions

`<figcaption>` inside `<figure>` is already correct and needs no change. The caption input only
appears when an image exists (`SectionBuilder.tsx:126`), which is good progressive disclosure.

### Additional notes

- **Keyboard navigation:** images are not focusable and should not be. No special handling needed.
- **Semantic HTML:** `<figure>`/`<figcaption>`/`<h2>` are already used. Do not add presentation-only
  elements like `<table>` or `<marquee>`-style hacks; grid/flex on semantic elements is correct.
- **Decorative images:** if an image is purely decorative, an empty `alt=""` is the correct output.
  The model should therefore permit an explicitly empty alt distinct from an absent one, or the
  frontend must define the convention (a real gap in any proposed model above).

---

## 11. SEO Considerations

### Direct impact of positioning: none

To be precise and avoid overclaiming: `imagePosition` has **no direct SEO effect**. Layout position
does not appear in any search engine's ranking inputs, is not a crawl signal, and is not
indexed text. Claiming a positioning benefit would be unsupported.

### Indirect effects worth understanding

There *are* real, defensible secondary considerations:

1. **Image discoverability — genuine but modest.** Images rendered inside the article body are
   eligible for image search and, when properly marked up, can surface in Google's image results.
   `left`/`right` does not change eligibility. What *does* matter is that the image sits in
   crawlable article HTML, use-case and relevant filenames. This is a reason to keep images inline
   in the body rather than moving them to CSS backgrounds — and the current `<img>` + `alt` approach
   is already the correct one.
2. **Alt text — real, measurable, accessibility-led.** Descriptive alt text genuinely helps image
   understanding and accessibility. This is an accessibility requirement (§10) that also happens to
   help SEO. It is not a positioning effect.
3. **Crawlable captions** — `<figcaption>` text is body content and is indexable. Useful and
   already supported.
4. **CLS / Core Web Vitals — the one place position touches SEO indirectly.** Cumulative Layout
   Shift is a ranking-relevant Core Web Vital. Two-column layouts with images that have no
   `width`/`height` and no reserved space are a **known CLS source**: the image arrives, the
   column reflows, the layout jumps. Note that the current single-column stack has the same missing
   dimensions, so this is a pre-existing defect (§4) that two-column layouts can worsen. Storing
   `width`/`height` (Model B) or emitting an `aspect-ratio` in the frontend fixes it. **This is a
   concrete, technical reason to care about image metadata — and it is about CLS, not position.**

### Recommendations

- Do not add a `Schema.org` structured-data payload for this; nothing here warrants it.
- Do ensure positioned images remain server-rendered HTML (they are) and not CSS background images
  (they are not).
- Do add `loading="lazy"` for below-the-fold section images and reserve dimensions — real CLS/LCP
  wins, and they are frontend concerns.
- Treat §11 as "positioning is SEO-neutral; image metadata is not." That is the accurate framing.

---

## 12. Image Metadata

### Which fields are useful, and why

| Field | Useful? | Why | Current state |
| --- | --- | --- | --- |
| `url` | Required | The image itself | Present as `image` (string) |
| `alt` | **Essential** | Accessibility prerequisite for positioned images; SEO understanding | **Missing** |
| `caption` | Useful | `<figcaption>`, indexable context, author intent | Present as `imageCaption` |
| `width` | **Valuable** | Reserves space, prevents CLS, allows intrinsic sizing | **Missing** |
| `height` | **Valuable** | Same; enables `aspect-ratio` | **Missing** |
| `position` | Required for this feature | Editorial layout preference | **Missing** |
| `srcset`/`sizes` | Future | Responsive art direction, bandwidth | Not applicable yet (no transforms) |
| `focalPoint` | Future | Smart cropping when `object-fit: cover` is used | Not applicable yet |
| `dominantColor` | Future | LQIP / blur-up placeholder | Not applicable yet |
| `mimeType` | Rarely needed | `Content-Type` covers it | Not needed |
| `blurhash` | Future | Perceived-performance placeholder | Not needed yet |

### Which to adopt now

`url`, `alt`, `caption`, `position`, and `width`/`height` if the image pipeline can supply them
at reasonable cost. Everything else is speculative until real image processing exists.

### The `saveImage` blocker for dimensions

`imageStorage.ts:saveImage` receives a `Buffer` and never inspects it. Adding `width`/`height` means
decoding image headers. That is a **deliberate architectural decision**:

- Cheapest viable approach: parse dimensions from the file header without a full decode library
  (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X, GIF header). This is small, dependency-free, and
  reliable for the already-allow-listed formats.
- The alternative — a full image library — adds a native/bundled dependency to a project that
  currently has none, purely for metadata. Not justified now.

Note that dimensions for **externally hosted** images (seed blogs carry absolute URLs) cannot be
known at upload time. The production design should treat `width`/`height` as *optional hints* and
have the frontend degrade gracefully — which argues for making them optional rather than required.

### Storage implication

Storing dimensions **as data** lets the frontend reserve space without re-fetching, and is the
foundation for responsive art direction later. Storing only an aspect *ratio* is a lighter
alternative that captures most of the CLS benefit with less storage and no upload-time dependency.

---

## 13. Multiple Images per Section

### Should the model move to `images: []`?

**Not now — but the shape should not preclude it, and there is a cheap way to guarantee that.**

Reasoning grounded in the codebase:

- The admin UI (`SectionBuilder.tsx:116-140`) renders exactly one `ImagePicker` and one caption
  input. A gallery needs a different control entirely (multi-select, reorder, per-image alt) — this
  is a UI-level amount of work, not a data-model one.
- Galleries have their own section semantics: a gallery is arguably a *different section type*
  (§24), not a section with more images. Modeling it as `type: 'gallery'` with its own content
  shape is cleaner than overloading `imageText` sections with N images.
- With a single image, position is a 4-value enum. With N images, "left/right" stops being
  well-defined (a 2×2 grid has no single position). **This is the strongest technical argument for
  keeping galleries as a separate section type rather than an `images[]` array on the same section.**

### Migration path if galleries are required

A single `image` → `images[]` change becomes a breaking type change requiring a read-time
coercion, exactly as in §7. The mitigation that preserves optionality:

- Introduce `images?: BlogSectionImage[]` **alongside** the existing `image`.
- Define precedence (`images` wins when non-empty; otherwise fall back to `image`).
- Read paths normalize once into a canonical `images[]`.
- Write paths emit whichever form the CMS produced.

This is the same "additive + resolver" pattern already used for `socialSharing` in
`controllers/blogs.ts:69-97`, and it is the pattern the production code should keep using. It avoids
breaking existing data and allows the gallery UI to land on its own schedule.

### Complexity

Medium. The data model is the easy part; the admin UI (multi-upload, per-image alt, reordering) and
the renderer (grid, captions, lightbox) carry the real cost.

---

## 14. Layout Options

### Enum values vs an abstract `layout` token

| Option | Values | Pros | Cons |
| --- | --- | --- | --- |
| `position` enum | `left`, `right`, `top`, `bottom` | Small, obvious, easy to validate and sanitize | Binary; no ratios; adding `full-width` grows the enum |
| `position` + `full-width` | + `full-width` | Covers the common "hero band" case | Still no control over column ratio |
| Abstract `layout` | `{ imagePosition, imageSpan, textRatio, … }` | Extensible without new schema versions | Consumers must handle combinations; validation grows; easy to leak presentation into data |
| Ratio enum | `5050`, `6040`, `4060` | Editorial control over balance | Combinatorial with position; more UI |

### What the data should carry vs what it should not

- **Store:** the editorial choice — where the image goes, and coarse span (`inline` | `full-width`).
- **Do not store:** column ratios, pixel widths, breakpoints. A `50/50` vs `60/40` decision is a
  **design-system** decision, and it will differ between the GrinXO production frontend and any
  other consumer. Baking it into content means every frontend that disagrees is wrong.
- Ratios are the first thing a design system wants to change. Storing them creates a
  content-migration problem for a purely visual reason.

### Recommendation

A closed enum that covers intent, with a documented "unknown value → fall back to `top`" rule:

```ts
imagePosition?: 'left' | 'right' | 'top' | 'bottom' | 'full-width'
```

`full-width` is worth including now because it is a genuinely different *structural* outcome
(full-bleed vs inline), not a refinement of the other four. Deeper layout control belongs in the
frontend's design system, not in blog content.

---

## 15. Admin UX Considerations

### Options, evaluated against the existing admin UI

The current `SectionBuilder` card per section already renders: a topbar (index + move up/down/delete
icon buttons), labelled fields (`field__label` + `field__input`), a content RTE, an `ImagePicker`,
and a conditional caption input. The design language is compact, utilitarian, and control-dense —
not spacious or visual.

| Control | Fits this codebase? | Notes |
| --- | --- | --- |
| **Select dropdown** | **Strongly** | Matches `field__input` used for Heading and Caption exactly; zero new CSS; native keyboard/a11y for free; the codebase already uses native `<select>` elsewhere (status, category) |
| **Radio group** | Good | Semantic and accessible, but needs new CSS for the group; the codebase has no existing radio styling |
| **Segmented control** | Weak | Visually nicer, but no precedent and requires new CSS + ARIA (`role="radiogroup"`) |
| **Visual layout selector** | Poor fit | Beautiful concept, but heavy to build well, needs accessible text alternatives anyway, and a prototype admin is not where that value is realised |

### Recommendation: a `<select>` labelled "Image position"

It is the lowest-risk, most consistent, most accessible option and it reuses an existing pattern
verbatim. Place it directly beneath the `ImagePicker` inside the existing
`section-card__image-row`, using the same `field__label` / `field__input` classes as the caption
input — so it visually reads as part of the image block and inherits the existing conditional
reveal pattern (only shown when `section.image` is set).

### The visual selector, honestly assessed

A four-tile visual selector is genuinely attractive and would make the concept obvious to
non-technical authors. Its cost is real: four bespoke SVG/box illustrations, focus management,
`aria-pressed` or radiogroup semantics, and text alternatives for screen readers anyway. It also
risks implying that the chosen layout is guaranteed — when §9 requires the frontend to override it
on mobile anyway.

**Recommendation:** build the dropdown first. If authoring friction proves real, add a visual
selector as an *enhancement over the same state* later — the data model is identical either way,
so this is a reversible UI decision, not an architectural one.

### One UX note worth flagging

Because the frontend collapses `left`/`right` on mobile (§9), the admin preview at mobile width
should communicate that override, or authors may be surprised their `left` selection renders as
`top`. The existing `PreviewModal` already has a **desktop/mobile viewport toggle** — that existing
control is a natural place to make the behavior visible rather than surprising.

---

## 16. Preview Compatibility

### Current preview architecture

`PreviewModal` → `BlogArticleView`, fed by `previewDraft` built in `BlogEditor.tsx:74-75`:

```ts
const content = blogHasSectionContent(sections)
  ? buildContentHtml(sections)   // CLIENT copy, src/utils/articleContent.ts
  : …
```

So preview already runs the **client-side** `buildContentHtml` on unsaved section state, then feeds
the result to the **same** `BlogArticleView` the public page uses. This is a genuinely good
property: preview and production share the renderer component.

### Can the same `imagePosition` drive both?

**Yes, and the mechanism already exists.** Because preview rebuilds HTML from live `sections[]`
through a `buildContentHtml`, adding position handling inside that function automatically affects
preview — the preview would show the positioned layout with no preview-specific code. The public
page needs the same handling in the server copy, plus the CSS.

This means: **one serializer behavior change, applied twice, gives you preview + production
consistency for free.** That is a strong argument for the HTML-emission approach (Shape 1, §8) in
the near term.

### Divergences to be aware of

1. **The two copies already differ.** Client emits section HTML verbatim; server sanitizes it.
   Position handling must be implemented identically in both, or preview and production diverge.
2. **Preview is client-derived, production is server-stored.** With the current `content` override
   logic (`blogStorage.ts:456-460`), the *saved* page may not even use the server's serializer
   output. After publishing, an author could see a different layout in preview than on the live
   page if the copies diverge. This is pre-existing but becomes user-visible the moment layout
   becomes noticeable.
3. **Recommended mitigation:** have preview build from the same shape the server will store, and
   consider having the server be authoritative for `content` on update (§22).

### Long-term

Extract the section→HTML logic into one shared module consumed by both client and server (a
`shared/` package). This eliminates the divergence class entirely and guarantees preview fidelity.
It is a real refactor and out of scope for this feasibility question, but it is the natural
follow-up once layout is in play.

---

## 17. Future Database Considerations

### Proposed relational mapping (PostgreSQL)

```sql
CREATE TABLE blogs ( …existing columns… );

CREATE TABLE blog_sections (
  id            UUID PRIMARY KEY,
  blog_id       UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,          -- ordinal; preserves editor reorder order
  heading       TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',  -- HTML string
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE section_images (
  id            UUID PRIMARY KEY,
  section_id    UUID NOT NULL REFERENCES blog_sections(id) ON DELETE CASCADE,
  -- one-to-one today; already one-to-many so galleries need no migration
  image_url     TEXT NOT NULL,
  alt_text      TEXT,
  caption       TEXT,
  width         INTEGER,
  height        INTEGER,
  position      TEXT CHECK (position IN ('left','right','top','bottom','full-width'))
);
```

Design points worth noting:

- **`position INTEGER` for ordering.** The editor already supports reordering
  (`moveSection`, `SectionBuilder.tsx:29-36`) and today that order lives only in the JSON array
  position. A relational schema needs an explicit ordinal column; it must be re-sequenced on reorder.
- **A CHECK constraint on `position`** makes the enum self-enforcing at the database layer — the
  relational analogue of the sanitizer's allow-list. This is a genuine advantage of the relational
  route: invalid values become impossible rather than merely filtered.
- **Images in a child table, not a column.** Even for a single image, a one-to-many child table
  means a future gallery requires **no schema migration** — only a UI and renderer change. This is
  the strongest argument for normalizing images even while the model is one-per-section.
- **Alt text is a first-class column**, which is the accessibility requirement from §10.

### Document store (MongoDB) — natural fit

The current shape ports almost verbatim:

```js
{
  _id: ObjectId,
  …blog fields…,
  sections: [
    {
      _id: ObjectId,
      heading: String,
      content: String,                    // HTML
      image: {
        url: String,
        alt: String,
        caption: String,
        width: Number,
        height: Number,
        position: { $in: ['left','right','top','bottom','full-width'] }  // or plain string + validator
      }
    }
  ]
}
```

- The nested `image` object maps 1:1 to the JSON file's structure, so migration is a read-and-write
  transform with no flattening.
- Document stores are permissive: an unknown `position` value persists silently, so **validation
  must live in the application layer** (or use a JSON Schema validator). This is a real difference
  from the CHECK-constraint model — do not assume the database will protect you.
- Schema version field recommended from day one, for §28.

### Whichever store is chosen

The layout field maps cleanly to all three. **The migration decision is genuinely low-risk** because
there is no production database yet and the current dataset is 19 blogs. This is the cheapest
possible moment to make this decision, and the moment at which it becomes expensive is when the
first production blog is written.

---

## 18. Avoid Storing CSS

**The CMS should never store `margin`, `padding`, `width`, `height`, `display`,
`flex-direction`, `grid-template-columns`, CSS class names, or CSS strings in blog content.**

### Why

1. **Coupling.** A CSS class in content means content and stylesheet versions must move together.
   Renaming `.article-figure--left` becomes a data migration, because stored blogs reference the
   old name. This is the worst possible coupling for content that outlives any single design.
2. **Leaking implementation.** `display: flex; gap: 2rem` is a *presentation* decision. Storing it
   invites editors to make choices the design system has not sanctioned, producing visually broken
   pages no one can debug.
3. **Frontend lock-in.** A different frontend (the main GrinXO site, a mobile app, an email
   renderer, a PDF exporter) cannot honour a foreign class name. A semantic token like
   `"left"` is self-explanatory anywhere.
4. **Security.** Arbitrary CSS in content is an injection vector — `url()` in a stored background
   enables request forgery/exfiltration; `position: fixed` enables clickjacking overlays. Sanitizing
   arbitrary CSS is a much harder problem than sanitizing a 4-value enum.
5. **Breakpoints are unknowable at authoring time.** The CMS cannot know the frontend's breakpoints,
   column ratios, container widths, or when a design system changes them. Those must be the
   frontend's to own.

### The rule to adopt

> The CMS stores **semantic intent** (`"left"`, `"full-width"`, `"portrait"`).
> The frontend owns **all geometry** (pixels, ratios, queries, transitions).

Every field proposed in this document obeys that rule. Notably, even `width`/`height` (§12) is
acceptable *only* as intrinsic image metadata for CLS — not as a layout instruction, and never as
a CSS string.

---

## 19. Avoid Presentation Coupling

### Data model vs CSS class

Store:

```json
{ "imagePosition": "left" }
```

Not:

```json
{ "imageClass": "section-image-left-large" }
```

### Benefits

- **Portability.** Any frontend maps `"left"` to its own layout primitive. This is precisely the
  microservice-integration requirement in §19 of the brief: the blog service stays a content
  service, and the main GrinXO frontend renders with its own design system.
- **Refactor freedom.** The CMS can rename its CSS classes freely; no stored data changes.
- **Legibility.** A stored payload read by a human or an API client is meaningful without a
  stylesheet in hand.
- **Validation surface.** A 4-value enum is trivially sanitizable; arbitrary class strings are not.
  The codebase already models this discipline in `sanitizeUrl`'s protocol allow-list and
  `sanitizeHashtags`.
- **Design autonomy.** The production frontend can honour `"left"` with CSS Grid while another
  consumer honours it with a table or a flex row — all valid, none requiring CMS changes.

### One honest caveat

Pure token models have a cost: consumers must define a fallback for values they don't understand.
The mitigation is a **documented, mandatory fallback** — any unrecognized `imagePosition` renders
as `top` — so a future consumer that adds `overlay` or `behind` never breaks older frontends. That
rule should be written into the contract from day one, not retrofitted.

---

## 20. Future Design System Compatibility

The proposed model is fully design-system agnostic, which is verifiable field by field:

| Concern | Independence |
| --- | --- |
| Tailwind classes | Model stores no classes; a Tailwind consumer maps tokens to utilities |
| CSS classes | Same |
| React component names | Model declares no components; the renderer decides |
| DOM structure | Model declares no elements; the renderer decides |
| Frontend libraries | Model is plain JSON; any language can consume it |
| Framework | Plain object — serializes identically to JSON, no JS-only constructs |

This is what makes the "same blog data could theoretically be consumed by another frontend"
requirement hold. The blog service can return the same `sections[]` to:

- The GrinXO production site (React/Next, Tailwind, design-system components)
- The prototype (this codebase, hand-written CSS)
- A future native app, email renderer, or static-site generator

None of them require the CMS to know they exist. The only shared contract is the **token vocabulary**
(`left`, `right`, `top`, `bottom`, `full-width`) and the **fallback rule** — both of which are
content contracts, not design-system contracts.

The one thing to avoid is letting the token set drift toward design-system specifics (e.g. adding
`sidebar-left-wide`). `imagePosition` is an editorial intent; that boundary should be enforced by
review, since nothing in the type system prevents a future contributor from over-fitting it.

---

## 21. Preview Compatibility

*(Covered in §16 with full mechanism. Summary of the verdict.)*

- **Feasible: yes, with no preview-specific code**, because `PreviewModal` already re-runs
  `buildContentHtml` on live `sections[]` and feeds the shared `BlogArticleView`.
- Preview gains positioned layout the moment the serializer emits it.
- The existing **desktop/mobile viewport toggle** in `PreviewModal` is a natural way to surface the
  §9 mobile override to authors.
- Caveat: the client and server serializer copies must be kept in sync, or preview will disagree
  with the published page.

---

## 22. Migration Strategy

### The good news

`sections` is a JSON array in a flat file, and the server does **zero** per-field validation on
sections today:

```ts
// server/controllers/blogs.ts:108
if (has('sections')) out.sections = Array.isArray(body.sections) ? (body.sections as BlogInput['sections']) : [];
```

A `blog-section` object is cast, not validated. So:

- **No database migration.** `blogs.json` is edited in place.
- **Backward compatible by construction.** A new optional field is simply absent on old sections.
- **No write-path risk today.** Nothing strips unknown fields.
- **Small dataset.** 19 blogs, 16 with sections — a rewrite is minutes of work.

### The real risks (these are what actually matter)

1. **The `content` override conflict — the main risk.**
   `blogStorage.ts:456-460` lets a client-supplied `content` string **win over** the server's
   `buildContentHtml(sections)`. Since `BlogEditor` always sends `content` (built client-side), the
   stored HTML is typically the client's output. If the serializer learns about `imagePosition` but
   the client copy does not (or the two disagree), **the stored HTML will not match the stored
   section data**, and the published page will silently ignore position.
   *Mitigation:* implement position handling in **both** copies, and make the server authoritative
   for `content` on update (ignore client `content`, or have the client stop sending it).

2. **Reading the wrong field.** If `image` is promoted from `string` to an object (§7), every
   consumer of `section.image` must be updated **simultaneously** — `buildContentHtml` (×2),
   `SectionBuilder`, `ImagePicker`, `sanitizeUrl` usage, and the derived `alt` logic. A partial
   migration yields `[object Object]` in an `src` attribute.
   *Mitigation:* one read-time normalizer that coerces `string | object` into a canonical shape, so
   consumers depend on the normalizer rather than the raw field.

3. **Client/server divergence.** Two copies of the serializer is the underlying structural risk.
   Any layout feature implemented in one and not the other produces a preview/production mismatch
   that is easy to ship and annoying to debug.

### Recommended sequence

1. Add the optional field(s) to both type definitions.
2. Add sanitizer validation for them in `normalizeInput` (whitelist enum values; drop unknown).
3. Implement rendering in **both** `buildContentHtml` copies identically, with a documented
   unknown-value → `top` fallback.
4. Add the frontend CSS class family.
5. Add the admin control (dropdown), visible only when a section image exists.
6. Decide separately on the `image` string→object promotion (§7), and if adopted, ship it via a
   normalizer so it is independent of the position work.

**Complexity of the position feature itself: Low.** The surrounding `content`-authority cleanup is
the part worth budgeting real time for.

---

## 23. Complexity Analysis

Classifications derived from the inspected implementation.

| Area | Complexity | Basis in the actual codebase |
| --- | --- | --- |
| Data model (add optional `imagePosition`) | **Low** | `BlogSection` is a flat interface; two optional fields already present; no validation layer to fight |
| Data model (promote `image` to object) | **Medium** | `image` is read in 4+ places incl. both serializers, `ImagePicker`, `SectionBuilder`; needs a normalizer to avoid `[object Object]` |
| Persistence / API | **Low** | JSON array; server casts without validating; add a sanitizer branch mirroring `sanitizeSocialSharing` |
| Admin UI (position control) | **Low** | `<select>` reusing existing `field__input` + the existing conditional-reveal pattern at `SectionBuilder.tsx:126` |
| Admin UI (visual layout selector) | **Medium** | Four bespoke tiles, ARIA radiogroup, no existing precedent in the design language |
| Preview | **Low** | Preview already re-runs `buildContentHtml` on live sections and shares `BlogArticleView` — no preview-specific code needed |
| Serializer emission (Shape 1) | **Low** | Per-section `parts[]` loop already exists; add a wrapper element and a class |
| Structural rendering (Shape 2) | **Medium** | Must replace `dangerouslySetInnerHTML` for body content; touches the main public render path |
| Responsive behavior | **Medium** | Entirely new: no grid/flex section layout exists today; breakpoint policy must be designed; mobile override rule needs documenting |
| Accessibility (alt text) | **Medium** | Alt is currently derived; needs authoring UI + data shape + renderer change; prerequisite for `left`/`right` |
| Future database migration | **Low** | No DB exists; 19 blogs; maps cleanly to both relational (with CHECK constraint) and document models |
| Backward compatibility | **Low** | Additive optional field; unknown-value fallback rule covers the rest |
| `content` authority cleanup | **Medium** | Client HTML currently overrides server output; must be resolved or layout silently won't apply |
| Multiple images per section | **Medium** | Model easy via child table/array; admin multi-upload UI and grid renderer are the real cost |
| Advanced layouts (ratios) | **Medium** | Should be frontend-owned; a `layout` object permits it without schema change but validation grows |
| Gallery as a section type | **Medium** | Requires `type` discriminator, new admin control, new renderer, and new serializer branch |
| Video / embed sections | **High** | New content types, provider allow-listing, security/privacy review, poster-image handling, admin UX from scratch |
| Arbitrary positioning (free-form offsets) | **High** | Reintroduces CSS injection, breaks the "no CSS in content" rule, and is untestable responsively |

---

## 24. Tradeoffs

### Advantages

- **Flexible production rendering** — the frontend can honour or ignore position per design system.
- **Admin-controlled composition** — editors choose the look without touching code.
- **Future extensibility** — `full-width` now, galleries/video later, via additive fields.
- **Cleaner API contract** — layout is data, so any consumer can implement it.
- **Content/layout separation** — explicit namespaces let the design system change freely.
- **Near-zero migration cost** — no DB, small dataset, additive optional field.
- **Consistent with existing patterns** — mirrors `seo` and `socialSharing` exactly.
- **Preview parity comes free** — the shared serializer + shared view already guarantee it.
- **Accessibility prerequisite surfaced early** — the analysis forces the alt-text question to the
  foreground rather than discovering it after launch (§10).

### Potential drawbacks

- **More complex admin UI** — one more control per section card.
- **More data fields** — and if `image` becomes an object, more nested structure to reason about.
- **More frontend rendering logic** — the production frontend owns a 4-case mapping plus responsive
  overrides that must be designed and tested.
- **Two serializer copies must stay in sync** — a pre-existing hazard that layout makes visible.
- **Responsive override expectations** — authors may assume `left` holds on mobile; the admin must
  communicate the override.
- **`content` authority ambiguity** — the client/server HTML conflict can silently defeat the
  feature if not addressed.
- **A one-way door on image shape** — deferring the `image` string→object decision too long makes
  galleries and responsive images more expensive (§7, §13).
- **Alt text becomes a blocker** — `left`/`right` cannot ship responsibly without it.

---

## 25. Proposed Future Data Contract

**Proposed example only — not implemented, not part of any API.** A concrete illustration of what
the section contract could look like, with each field justified:

```json
{
  "id": "section-123",
  "type": "image-text",
  "heading": "Choosing the right experience",
  "content": "<p>Birthday parties have become an industry…</p>",
  "image": {
    "url": "/uploads/sections/mtjs-mxps.jpeg",
    "alt": "Children celebrating a birthday at an indoor play zone",
    "caption": "A colourful fifth birthday celebration",
    "width": 1280,
    "height": 853,
    "position": "left"
  },
  "layout": {
    "imagePosition": "left"
  }
}
```

### Field-by-field rationale

| Field | Purpose | Notes |
| --- | --- | --- |
| `id` | Stable identifier for edit/reorder/delete and future per-section API ops | Should become a UUID before production; current ids are time-based (`SectionBuilder.tsx:16-18`) |
| `type` | Section kind discriminator; enables gallery/video/quote/cta later without reshaping the model | Optional in v1 — every section is `image-text`. Include as a reserved field with a default so the discriminator exists before it is needed |
| `heading` | Section title, currently emitted as `<h2>` | Preserve; consider a `headingLevel` field later for document outline control |
| `content` | The section's body | Stays a **string of HTML** in v1 (unchanged from today). Rich block structure (JSON-based editor) is a separate, much larger decision and is out of scope here |
| `image.url` | The image | Already exists as `section.image`; promoting it into the object is the Model B decision (§7) |
| `image.alt` | Meaningful alternative text | **Accessibility prerequisite** for `left`/`right` (§10). Currently derived and unauthable |
| `image.caption` | `<figcaption>` text | Already exists as `section.imageCaption` |
| `image.width` / `height` | Intrinsic dimensions to reserve space | Prevents CLS (§11). Optional — external images may not be measurable at upload |
| `image.position` | Where the image sits | The feature under discussion |
| `layout` | Namespace for presentation intent | Groups future layout keys so the section root doesn't sprawl; separates content from layout (§25 of the brief) |

### Contract rules to document alongside it

1. **Fallback:** any `imagePosition` the consumer does not recognise renders as `top`.
2. **Ignored when absent:** if `image` is missing, `imagePosition` is meaningless and MUST be ignored.
3. **Closed vocabulary:** `left | right | top | bottom | full-width`. Additions are new values, not
   new shapes.
4. **Never CSS:** no class names, no inline styles, no dimensions-as-instructions.
5. **Frontend owns geometry:** ratios, breakpoints, and stacking policy are never in this payload.

### A note on the duplication in the sketch

`image.position` and `layout.imagePosition` both express position. **Pick one.** The sketch shows
both to illustrate the two placements; a real contract should have exactly one. Given §6/§25, the
recommendation is to keep the image as a **content-ish object** (`url`, `alt`, `caption`,
dimensions) and place **all presentation intent** under `layout` — so `layout.imagePosition` is the
single source of truth. That keeps "what the image *is*" separate from "how the section should be
arranged", which is the separation §25 of the brief asks about.

---

## 26. Future Extensibility

How the proposed design absorbs later requirements **without rewriting the blog architecture** —
each row assumes only additive changes:

| Future requirement | Additive change | Does the blog model need rewriting? |
| --- | --- | --- |
| Image left/right/top/bottom | `layout.imagePosition` enum values | No |
| Full-width image | Add `'full-width'` to the enum | No |
| Responsive art direction (`srcset`) | `image.srcset?` | No |
| Smart cropping | `image.focalPoint?` | No |
| LQIP / blur placeholder | `image.dominantColor?` / `blurhash?` | No |
| Gallery | New `type: 'gallery'` + `images[]` on that variant | No — sibling type |
| Video | New `type: 'video'` + `videoUrl` | No |
| Embedded YouTube | New `type: 'embed'` + provider-allow-listed URL | No |
| Quote | New `type: 'quote'` + `quoteText`, `attribution` | No |
| CTA | New `type: 'cta'` + `label`, `href` | No |
| Pull-quote / callout | New `type` | No |
| Different heading level | `headingLevel?: 2 \| 3 \| 4` | No |
| Per-section background | `layout.background?` | No |
| Text-only section | `type: 'text'`, no `image` | No |

The mechanism: a `type` discriminator plus per-type content, with shared `id`/`layout` at the
section root. Each new capability is a new `type` and a new renderer component. The blog, the API
envelope, the editor's section list, and every existing renderer stay untouched.

### The two structural preconditions

1. **A `type` discriminator must exist** before the first non-`image-text` section. Retrofitting a
   discriminator across stored data plus two serializers is the expensive path.
2. **The renderer must become section-aware** (Shape 2, §8). While the page renders one flat HTML
   blob, no new section type can be expressed at all — every new type is a new serializer branch
   producing bespoke HTML, which is exactly how the codebase ends up with divergent copies.

So extensibility is not free: it depends on a renderer change that positioning alone does not
require, but that positioning makes obviously worthwhile.

### The structural debt to address

- **Two `buildContentHtml` copies** (client + server) with different sanitization — the single
  biggest source of "works in preview, wrong in production" risk. Extracting to a shared module is
  the highest-value structural fix, and it is a prerequisite for trustworthy layout behavior.
- **`content` as a derived-but-overridable field** — should be unambiguously server-derived.
- **Time-based section ids** — should be UUIDs before they become API identifiers.

---

## 27. Limitations

Explicit caveats about this analysis:

- **The prototype is not the production frontend.** Everything about real rendering, breakpoints,
  design-system integration, and performance is inferred from a hand-written-CSS prototype and a
  19-blog JSON file. Production reality will differ.
- **No production database exists.** The migration analysis in §17 is a design projection, not a
  validated migration. A real DB with real data has constraints the flat file does not (ordinal
  columns, transaction consistency, index strategy).
- **No image processing pipeline.** `saveImage` writes bytes and returns a URL. There is no
  resizing, format conversion, CDN, or dimension extraction, so `srcset`/responsive-image
  conclusions are aspirational.
- **Image storage will change.** Local disk under `server/uploads/` is explicitly described in code
  as swappable ("Keeps filesystem access contained here (storage layering), so it can be swapped for
  object storage later"). Absolute URLs may replace relative paths — any layout design must remain
  indifferent to URL shape.
- **No `alt` authoring exists.** The accessibility analysis in §10 identifies a real gap; it is not
  resolvable within the current data model and is called out as a prerequisite rather than assumed.
- **SEO conclusions are general**, not measured — there is no analytics, no Search Console, no real
  traffic. No SEO *claim* is made; only defensible mechanism-level statements.
- **Responsive behavior is unvalidated.** The prototype has essentially no section-level responsive
  layout to extend, so §9 is design guidance, not a description of current behavior.
- **Social-platform image requirements are independent.** IG/FB share configs
  (`BlogSocialSharing`) have their own image semantics and aspect-ratio rules; section positioning
  must not leak into them, and they must not constrain section layout.
- **The current content pipeline is HTML-string-based.** If production moves to a block-based
  (JSON) editor, the whole serialization layer changes and any model designed around "sections
  flatten to HTML" would need revisiting — though `sections[]` with structured image/layout data
  survives that transition intact, since the data model is independent of the output format.
- **No multi-author or versioning system** exists, so no analysis of concurrent edits to layout.
- **Complexity ratings are engineering judgment** based on the inspected code, not measured
  effort estimates from a team with this codebase's context.

---

## 28. Final Feasibility Conclusion

A neutral technical assessment, answering each question in turn.

### 1. Is section-level image positioning feasible?

**Yes.** Technically sound and low-risk. The concept already exists in the codebase —
`BlogSection.image` and `BlogSection.imageCaption` exist and work; only the *position* concept is
absent. There is no architectural obstacle, no database, and no migration surface.

### 2. Can it be represented cleanly in the current blog data?

**Yes.** `BlogSection` is a flat interface with optional fields and no validation layer, so an
optional `imagePosition` (or a `layout` namespace) is additive and backward-compatible. The data
model is suitable. The one caveat is that `image` is a bare string and cannot carry alt text or
dimensions — which matters for accessibility, and therefore for this feature specifically.

### 3. What is the smallest architectural change required?

Adding the field to the two type definitions, sanitizing it in `normalizeInput`, emitting it in
**both** `buildContentHtml` copies, adding one CSS class family, and adding one `<select>` to
`SectionBuilder`. Estimate: **Low complexity**, contained, and reversible.

The single largest hidden cost is not the field but the surrounding `content`-authority question
(§22.1) — a client-supplied HTML string currently overrides the server's serializer output, so a
position feature implemented only in the serializer can silently not apply to published blogs.

### 4. What is the more extensible architecture?

A `type` discriminator plus per-type content, with presentation intent namespaced under `layout`
(Model C/D), and a renderer that consumes `sections[]` structurally rather than as flattened HTML
(Model B for the image object). This supports galleries, video, embeds, quotes, and CTAs as additive
type extensions. It is more expensive to adopt today *only* because the flattening serializer
must be replaced — and that is the same change that makes the extensibility possible at all.

### 5. What should the future production frontend receive?

The section, including the image (url, alt, caption, dimensions) and the layout preference
(`imagePosition`), plus a documented vocabulary and fallback rule. It should also receive stable
section ids and an explicit ordinal. It should **not** receive CSS, class names, ratios,
breakpoints, or pixel values.

### 6. What should remain frontend-only?

Everything geometric: widths, ratios, spacing, breakpoints, responsive collapsing, typography,
animation, whether `left`/`right` becomes `top` on mobile, `srcset` generation, lazy loading,
aspect-ratio application, and CLS mitigation. The CMS stores intent; the frontend owns pixels.

### 7. What should remain CMS-controlled?

Whether a section has an image, which image, the alt text, the caption, and the editorial position
intent (plus whether the section is a gallery/video/quote/CTA). These are content-authoring
decisions that a frontend should never make on the author's behalf.

### 8. What should be avoided?

- Storing CSS, class names, or inline styles in content (§18).
- Storing column ratios, pixel widths, or breakpoints — design-system decisions (§14).
- Storing responsive-collapse behavior — the frontend must be free to override (§9).
- Implementing position via CSS `order`/`row-reverse`, which desynchronizes visual and DOM order
  and harms screen-reader users (§10).
- Shipping `left`/`right` **without** alt-text authoring — a genuine accessibility blocker.
- Retrofitting a `type` discriminator later; adding it as a reserved field now is far cheaper (§26).
- Adding a `type` discriminator and a new image object shape **at the same time** — two independent
  changes should be sequenced so partial migration cannot occur (§7, §22.2).

### 9. What would need to change before production integration?

1. Resolve the `content` authority conflict so the server is authoritative for derived HTML.
2. Consolidate the two `buildContentHtml` copies into one shared, sanitized module.
3. Add real sanitization for `sections` (currently an unchecked cast).
4. Replace time-based section ids with UUIDs.
5. Add alt-text authoring and make it a required part of positioned images.
6. Introduce a `type` discriminator with a default, before non-`image-text` sections exist.
7. Add image dimensions (or aspect ratio) to prevent CLS, ideally with a light-weight header parser
   rather than a new dependency.
8. Move image storage behind an interface so object storage/CDN can be substituted.
9. Establish the production database with a schema that keeps images in a child table, so galleries
   need no later migration (§17).

### 10. Are there any blockers?

**No hard blockers.** Two items are genuine *prerequisites* rather than obstacles:

- **Alt text authoring** — a soft blocker on shipping `left`/`right` responsibly. It requires
  promoting `image` to an object (or adding a sibling field) and a small admin UI addition.
- **The `content` authority conflict** — a soft blocker on the feature working reliably in
  production, because a serializer-only implementation may be bypassed by client-supplied content.

Both are low-complexity and independent of the positioning decision itself.

### Final position

The request is feasible, and the timing is favorable: the cost of this decision is at its lowest
now, with no production database, a 19-blog dataset, and no deployed consumers of the API contract.
The single most consequential finding is architectural rather than about positioning:

> **Because the public renderer consumes a flattened HTML string rather than `sections[]`, position
> is only as real as the HTML it is baked into.** Adding the field is cheap; deciding how much the
> section model is genuinely the source of truth is the strategic question, and the answer should
> be "as much as the production frontend needs" — which argues for planning a section-aware
> renderer before, not after, the first new section type.

---

*End of report. No source code, schema, API, configuration, or dependency was modified in the
production of this document. The only file created is `SECTION_IMAGE_POSITIONING_FEASIBILITY.md`.*
