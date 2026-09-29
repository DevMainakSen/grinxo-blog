# GrinXO Blog CMS — Section Image Upload Rules

Integration guide for the strict image rules applied to **blog section images**
(images that appear inside the body of an article, next to a section's text).

This document covers the validation contract an external application must
satisfy, the API surface it calls, and the reasoning behind each decision. It
is scoped to section images. Banner, OG and social-share images share the
500 KB size limit but are **not** ratio-validated — see
[Scope](#scope-section-images-only).

- Rules implemented: `src/utils/imageValidation.ts` (client), `server/services/imageStorage.ts` (server)
- Preceding design work: `SECTION_IMAGE_POSITIONING_FEASIBILITY.md`
- Verification: `scripts/verify-image-rules.mjs` (66 checks)

---

## Scope (section images only)

| Upload path | 500 KB limit | Ratio rule | Where |
| --- | --- | --- | --- |
| **Section image** | Enforced | **Enforced (2:3, 9:16, 16:9, 3:2)** | `POST /api/uploads` with `folder=sections` |
| Banner / thumbnail | Enforced | Advisory hint only | `folder=banners` |
| SEO OG image | Enforced | Advisory hint only | `folder=banners` |
| Social share image | Enforced | Advisory hint only | `folder=banners` |

Ratios are deliberately **not** enforced on banners. The article hero renders at
a fixed 16:7 and the OG frame at ~1.91:1, and neither is one of the four
permitted ratios — validating them would reject legitimate hero artwork and
break existing blogs. The size limit is applied to every path because it is a
bandwidth and storage concern, not a layout one.

---

## The rules

### 1. Maximum file size

**500 KB, defined as `500 × 1024 = 512,000` bytes.** This exact number is used
everywhere — client, server, and every user-facing message.

| Input size | Result |
| --- | --- |
| ≤ 512,000 bytes | Accepted |
| > 512,000 bytes | Rejected |

Exactly 512,000 bytes is accepted. The limit is inclusive.

### 2. Permitted aspect ratios

Only these four ratios are accepted, measured from the image's **intrinsic
pixels**:

| Orientation | Ratio | Decimal | Example |
| --- | --- | --- | --- |
| Portrait | 2:3 | 0.6667 | 1200 × 1800 |
| Portrait | 9:16 | 0.5625 | 1080 × 1920 |
| Landscape | 16:9 | 1.7778 | 1920 × 1080 |
| Landscape | 3:2 | 1.5 | 1800 × 1200 |

Everything else is rejected: 1:1, 4:3, 3:4, 5:4, 4:5, 5:3, 8:5, 21:9, and any
arbitrary ratio.

### 3. Orientation is measured, never declared

Orientation comes from the pixels, never from the filename or a user-supplied
label:

- `width > height` → landscape
- `height > width` → portrait
- `width === height` → **square, always rejected**

Only ratios matching the detected orientation are considered, so a landscape
image can never be accepted by a portrait ratio. Square images are detected
before the ratio check so they report the dedicated square message.

### 4. Comparison tolerance

Ratios are compared with a **5% relative tolerance**:

```
| (width/height) − (target ratio) | / target ratio  ≤  0.05
```

Export and resize pipelines rarely produce the exact decimal — a real stored
image in this project measures 1264 × 848, which is 1.4906 against a 3:2 target
of 1.5. Exact equality would reject it, so a tolerance is required.

**Why 5% and not more.** The tolerance was chosen from the data rather than
guessed. The distance from each explicitly-rejected ratio to its nearest
permitted ratio:

| Rejected | Ratio | Nearest permitted | Relative distance |
| --- | --- | --- | --- |
| 5:3 | 1.6667 | 16:9 (1.7778) | **6.25%** ← tightest |
| 4:3 | 1.3333 | 3:2 (1.5) | 11.1% |
| 3:4 | 0.75 | 2:3 (0.6667) | 12.5% |
| 5:4 | 1.25 | 3:2 (1.5) | 16.7% |
| 4:5 | 0.8 | 2:3 (0.6667) | 20.0% |
| 1:1 | 1.0 | 3:2 (1.5) | 33.3% |
| 21:9 | 2.3333 | 16:9 (1.7778) | 31.3% |

The tightest neighbour in the entire set is **6.25%** (5:3 against 16:9), so 5%
is the largest round tolerance that still separates every rejected ratio. Above
roughly 6%, 5:3 starts being accepted as 16:9 — which is explicitly wrong. The
previous advisory hint in the admin UI used 8%, which would have had that bug.

### 5. Validation order

Checks run in a fixed order so a file that fails several rules always reports
the same message:

1. **File extension** — must be `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
2. **File size** — must be ≤ 512,000 bytes
3. **Readable dimensions** — header must be parseable
4. **Square** — width must not equal height
5. **Aspect ratio** — must match one of the four permitted ratios

Size is checked first because it is cheap and its message is unambiguous. A
file that is both oversized and wrongly proportioned reports the size error.

---

## Error messages

These strings are part of the API contract and are returned verbatim in the
`error` field. An external application can match on them exactly.

| Condition | HTTP | `error` |
| --- | --- | --- |
| File > 512,000 bytes | 400 | `Image size must be 500 KB or less.` |
| Square image | 400 | `Square images are not supported. Please upload an image with one of the supported ratios: 2:3, 9:16, 16:9, or 3:2.` |
| Disallowed ratio | 400 | `Invalid image ratio. Please upload a portrait image in 2:3 or 9:16, or a landscape image in 16:9 or 3:2.` |
| Unreadable / corrupt image | 400 | `Could not read the image dimensions. Please upload a valid image file.` |
| Unsupported extension | 400 | `Invalid image type. Allowed: jpg, png, gif, webp` |
| No file in request | 400 | `Invalid image upload` |

---

## Integration guide

### Step 1 — Upload the image

```
POST {API_BASE_URL}/api/uploads
Content-Type: multipart/form-data
```

| Field | Type | Value |
| --- | --- | --- |
| `image` | File | The image binary |
| `folder` | Text | **`sections`** |

`folder` is case-sensitive and must be exactly `sections`. **Any other value
falls back to `banners`, which silently skips ratio validation** — a real
integration hazard, so send it explicitly.

```bash
curl -X POST http://localhost:5001/api/uploads \
  -F 'image=@hero.jpg' \
  -F 'folder=sections'
```

Success — `201 Created`:

```json
{ "url": "/uploads/sections/mabc123-xy7890.jpeg" }
```

The returned `url` is a **relative path**. Store and send it back exactly as
received; it is resolved against the same origin. Relative paths starting with
a single `/` are accepted, and `http`/`https` absolute URLs are also accepted.
`javascript:`, `data:`, protocol-relative `//` and any other scheme are
rejected and the image is dropped at render time.

The file is written to `server/uploads/sections/` and served statically at
`/uploads/*`.

### Step 2 — Reference it from a blog section

Include the image in the `sections[]` array of a `POST /api/blogs` or
`PUT /api/blogs/:id` payload:

```json
{
  "title": "How to Choose a Birthday Experience",
  "slug": "how-to-choose-a-birthday-experience",
  "status": "published",
  "sections": [
    {
      "id": "section-1",
      "heading": "Choosing the right theme",
      "content": "<p>Long-form HTML for this section.</p>",
      "image": "/uploads/sections/mabc123-xy7890.jpeg",
      "imageCaption": "<p>Photographed at the venue.</p>",
      "imagePosition": "left"
    }
  ]
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Client-supplied identifier; the server does not generate one |
| `heading` | string | Also used as the image `alt` text when no caption is set |
| `content` | string | Sanitised HTML; `<img>` is stripped — use `image` instead |
| `image` | string | The URL returned by Step 1. Omit or leave empty for no image |
| `imageCaption` | string | Optional rich-text caption, sanitised server-side |
| `imagePosition` | enum | `left` \| `right` \| `bottom`. Absent/unknown → `bottom` |

**Server-side normalisation of `sections[]`:**

- Only the fields above are kept; anything else in a section object is dropped.
- `imagePosition` is **discarded when no `image` is present** — a position is
  meaningless without an image, and the section renders as `bottom`.
- An unrecognised `imagePosition` never reaches the rendered HTML; it is
  reduced to `bottom` by `resolveImagePosition`.
- Caption HTML is sanitised to this allowlist: `p`, `br`, `h1`, `h2`, `h3`,
  `strong`, `b`, `em`, `i`, `u`, `s`, `strike`, `ul`, `ol`, `li`,
  `blockquote`, `a`, `span`, `figure`, `figcaption`. Note that `img` is **not**
  allowed, so an inline image in a caption is removed. A caption containing no
  visible text after sanitisation is dropped entirely and no `<figcaption>` is
  emitted.
- Links in captions are limited to relative paths or `http`/`https`, and are
  emitted with `rel="noopener noreferrer" target="_blank"`.

**Server authority over `content`.** When `sections[]` is non-empty the server
regenerates `content` from those sections, so the stored sections and the
rendered HTML can never disagree. An application that sends only `content` with
an empty or absent `sections` array keeps its own body — that path exists for
seed data and legacy records.

### Step 3 — Rendering contract

For `imagePosition: left` or `right`, the server emits a section wrapper:

```html
<section class="article-section article-section--image-left">
<div class="article-section__body">
<h2>Choosing the right theme</h2>
<p>Long-form HTML for this section.</p>
</div>
<figure class="article-figure"><img src="/uploads/sections/mabc123-xy7890.jpeg" alt="Choosing the right theme" /><figcaption><p>Photographed at the venue.</p></figcaption></figure>
</section>
```

Note the `heading` is emitted as an `<h2>` inside the body, and doubles as the
image `alt` when a caption is absent.

For `bottom`, the text and figure are emitted flat, with no wrapper — the same
markup the platform produced before positions existed, so existing articles are
unaffected:

```html
<h2>Choosing the right theme</h2>
<p>Long-form HTML for this section.</p>
<figure class="article-figure"><img src="/uploads/sections/mabc123-xy7890.jpeg" alt="Choosing the right theme" /><figcaption><p>Photographed at the venue.</p></figcaption></figure>
```

**The text body is always first in the DOM, for every position.** Side-by-side
placement is done with CSS grid column assignment, never with `order` or
`row-reverse`. This is what keeps the mobile order correct (text first, image
below) without any viewport-specific markup or script.

| Viewport | Layout |
| --- | --- |
| ≤ 960px (mobile/tablet) | Stacked: heading → text → image → caption |
| ≥ 961px (desktop) | Two-column grid, image left or right beside the text |

**The image is never distorted.** No `aspect-ratio` box, no `object-fit`
cropping, and no resampling is applied to the file. The browser renders the
original pixels at whatever width the column provides, so the stored ratio is
preserved exactly. The rounded corners applied to article images are purely
cosmetic and do not affect layout.

---

## Approaches used

**Extended the existing upload path instead of building a new one.** The
project already had a single `ImagePicker` component feeding one
`POST /api/uploads` endpoint, used by all four image surfaces. The rules were
added to that one component and that one endpoint, so there is no second image
system to keep in sync.

**Made the server the enforcement boundary.** Validation runs on the server
from the received bytes (`validateImageUpload`), never from anything the client
asserts. The client also validates, but purely to fail fast and give a better
message — a client that skipped validation would still be rejected. The size
limit is additionally enforced by multer during the request stream.

**Added a multer error handler.** Previously an oversized file tripped multer's
own `LIMIT_FILE_SIZE`, which carries no HTTP status, so it fell through to the
central error handler and returned an opaque `500 Internal Server Error`. It now
returns `400` with the size message, matching every other failure mode.

**Read dimensions from bytes with no new dependency.** The project ships no
image library. Rather than add `sharp` (a native module with its own
install/build implications) for one validation step, `readImageDimensions`
parses the fixed-size dimension header already present in every supported
format: `IHDR` for PNG, the `SOFn` marker chain for JPEG, the logical screen
descriptor for GIF, and the `VP8`/`VP8L`/`VP8X` chunks for WebP. It is
bounds-checked and returns `null` on truncated or unrecognised data rather than
guessing. The reader is unit-tested against real encoded images and against
garbage and truncated buffers.

**Validated before insertion, so invalid images never exist.** Validation runs
on the `File` before the upload request is made. A rejected file therefore
produces no URL, so it cannot enter editor state, the draft, a published post,
or a scheduled post. The client measures the local file with an object URL and
`Image.naturalWidth`/`naturalHeight` — no network round trip — and always
revokes the object URL. This is verified by asserting **zero upload requests**
are issued for every rejected case.

**Derived the tolerance from the data.** Rather than picking a round number, the
5% bound was computed from the actual separation between permitted and
explicitly-rejected ratios (see [Comparison tolerance](#4-comparison-tolerance)).
This is why the old 8% advisory value was not reused — it was loose enough to
accept a ratio the specification forbids.

**Preserved the server's self-contained module graph.** `server/` deliberately
never imports from `src/` and is not part of the TypeScript build. Rather than
introduce a shared directory and change that architecture, each side owns one
definition of the rules, and `scripts/verify-image-rules.mjs` asserts the two
agree — identical size limit, ratio set, tolerance, messages, and identical
verdicts for every test dimension. The two cannot drift silently.

**Kept the rules advisory where they must not reject.** Position-specific
guidance (2:3 suits a side column, 16:9 suits a full-width bottom slot) remains
advice, because all four ratios are legal in every position. The admin hint now
reports the image's real ratio against the permitted set, which also flags a
pre-existing image stored before the rules existed, without deleting or
modifying it.

---

## Existing content

Blogs already in the system are untouched. Validation applies to newly uploaded
or replaced images at upload time; no stored record is rewritten, and no image
is cropped, resized, or deleted.

All existing section images in this project already conform — both stored
images are 3:2 (one exactly, one at 1.4906 within tolerance) and all are well
under 500 KB — so the rules are satisfied retroactively. Had any existing image
been non-conforming, it would continue to render, and the admin ratio hint
would flag it for replacement. Re-uploading through the editor applies the new
rules, as required for any replacement workflow.

---

## Verification

`node scripts/verify-image-rules.mjs` — 66 checks, no test framework required.
It covers the size boundary (511,999 / 512,000 / 512,001), all four permitted
ratios, eight rejected ratios, squares at three sizes, orientation detection,
message text, the tolerance argument, the client/server drift guard, the
dimension reader against real PNG bytes plus garbage and truncated input, and
HTTP integration for every rule including that size is reported before ratio.

Additional browser-level suites confirm the rules hold in the editor and that
nothing regressed: rejected images never enter editor state and never reach a
saved, published, or scheduled blog; the mobile layout, desktop positioning,
and preview modal are unchanged; and no image is distorted or letterboxed.

Run the project's own gates with `npm run build` (`tsc -b && vite build`) and
`npm run lint`.

---

## Limitations and assumptions

- **The ratio rule applies to section images only.** Banners, OG and social
  share images are size-limited but not ratio-validated, because their frames
  use ratios outside the permitted four. If ratio enforcement is later extended
  to those surfaces, the existing 16:7 hero artwork would need to be replaced.
- **Dimensions are read from the file header, not decoded.** This is reliable
  for well-formed images and correctly rejects corrupt ones, but an image whose
  header lies about its real pixel dimensions would be measured incorrectly.
- **Multer buffers uploads in memory** (`memoryStorage`), so the file is held in
  RAM before validation. This is pre-existing behaviour, now bounded to 500 KB
  per request.
- **No format conversion or compression happens.** A valid 400 KB PNG is stored
  as-is; the limits are enforced at upload and not re-applied to stored files.
- **`folder` values other than `sections` silently become `banners`**, which
  disables ratio validation. Integrations must send `folder=sections`
  explicitly.
- The client and server rule definitions are kept in step by a test rather than
  by a shared module, to preserve the existing server/client boundary.
