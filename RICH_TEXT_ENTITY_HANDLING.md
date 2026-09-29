# GrinXO Blog CMS — Rich-Text Entity Handling

Integration guide for how **HTML entities and non-breaking spaces** are handled
in blog rich text — the text bodies and image captions authored in the admin
editor and published to the article page.

This document explains the encoding contract an external application must
satisfy when submitting section content, exactly what the CMS does to that
content on the way out, and the reasoning behind each decision.

- Implementation: `server/services/blogStorage.ts` (server), `src/utils/articleContent.ts` (client)
- Verification: `scripts/verify-nbsp.mjs` (37 checks)
- Data repair: `scripts/repair-nbsp.mjs`
- Related: `SECTION_IMAGE_RULES.md`

---

## Scope

| Field | Normalised | Sanitised | Where |
| --- | --- | --- | --- |
| `sections[].content` | Yes | Yes (allow-list) | `POST` / `PUT /api/blogs` |
| `sections[].imageCaption` | Yes | Yes (allow-list) | `POST` / `PUT /api/blogs` |
| `sections[].heading` | No | Escaped only | `POST` / `PUT /api/blogs` |
| `content` (generated) | Yes | Yes (allow-list) | Regenerated on every write |
| Banners, SEO, social images | No | n/a | See `SECTION_IMAGE_RULES.md` |

Two different things happen, and it is worth keeping them apart:

- **Normalisation** (`normalizeRichTextHtml`) is a *lossless textual cleanup*
  applied before anything else. It never removes a character a reader can see.
- **Sanitisation** (`sanitizeHtml`) is the *security boundary*. It allow-lists
  tags and attributes and escapes what survives.

---

## The problem this fixed

Rich text pasted from Word, Google Docs, or most word processors arrives with
the markup already entity-encoded — a pasted `&nbsp;` is stored as the six
characters `&nbsp;`, not as a raw byte.

The server's text escaper then escaped it a **second** time, because it assumed
incoming text nodes were raw text:

```
pasted        &nbsp;
escaped       &amp;nbsp;      <- the `&` is encoded
rendered      &nbsp;          <- the reader sees these six characters
```

The third line is the bug: instead of an invisible space, the literal string
`&nbsp;` was printed at the end of nearly every paragraph. It affected `&quot;`,
`&amp;` and `&#39;` by the same mechanism; `&nbsp;` was simply the most visible.

It also produced a **preview/published mismatch**: the client serializer
inserts section content verbatim, so Preview was correct while the published
article was wrong.

---

## The fix

### 1. Entity-aware text-node escaping

`escapeTextNode` decodes known entities *before* escaping, so the content is
encoded exactly once:

```
pasted        &nbsp;  &quot;  &amp;
decoded        U+00A0    "      &     (one pass, in memory)
escaped        &nbsp;  &quot;  &amp;
rendered       space     "      &
```

Decoding is a **single pass**. `&amp;nbsp;` therefore resolves to the literal
characters `&nbsp;`, not to a space — text a user genuinely typed as those
characters is preserved rather than silently converted.

### 2. Non-breaking-space normalisation

`normalizeRichTextHtml` converts every non-breaking space to an ordinary space
and drops the whitespace left stranded at the end of a block:

| Form | Detected as |
| --- | --- |
| `&nbsp;` | Named entity (case-insensitive) |
| `&#160;` | Decimal numeric reference |
| `&#xA0;` | Hexadecimal numeric reference |
| U+00A0 | Literal non-breaking space character |

This is deliberate, and it is the part that matters beyond the visible symptom.
A non-breaking space **prevents line wrapping**. In a long paragraph on a
narrow phone, a single U+00A0 can force a word to overflow the viewport. HTML
collapses ordinary spaces, so converting to a normal space is visually lossless
for the reader while removing the overflow risk.

---

## Behaviour reference

All rows below are measured against the running implementation, not asserted.
"Rendered" is the text a reader actually sees.

| Submitted in `content` | Emitted in `content` | Rendered |
| --- | --- | --- |
| `<p>Done&nbsp;</p>` | `<p>Done</p>` | `Done` |
| `<p>a&nbsp;b</p>` | `<p>a b</p>` | `a b` |
| `<p>a&#160;b</p>` | `<p>a b</p>` | `a b` |
| `<p>a&#xA0;b</p>` | `<p>a b</p>` | `a b` |
| `<p>a b</p>` (literal U+00A0) | `<p>a b</p>` | `a b` |
| `<p>say &quot;hi&quot;</p>` | `<p>say &quot;hi&quot;</p>` | `say "hi"` |
| `<p>it&#39;s</p>` | `<p>it&#39;s</p>` | `it's` |
| `<p>it&apos;s</p>` | `<p>it&#39;s</p>` | `it's` |
| `<p>A &amp; B</p>` | `<p>A &amp; B</p>` | `A & B` |
| `<p>a &hellip; b</p>` | `<p>a … b</p>` | `a … b` |
| `<p>a &mdash; b</p>` | `<p>a — b</p>` | `a — b` |
| `<p>&lt;b&gt;x&lt;/b&gt;</p>` | `<p>&lt;b&gt;x&lt;/b&gt;</p>` | `<b>x</b>` (as text) |
| `<p>&amp;nbsp;</p>` | `<p>&amp;nbsp;</p>` | `&nbsp;` (as text) |
| `<p>Tom & Jerry</p>` | `<p>Tom &amp; Jerry</p>` | `Tom & Jerry` |
| `<p>a &bogus; b</p>` | `<p>a &amp;bogus; b</p>` | `a &bogus; b` |

Note the two intent-preserving rows near the bottom. `&lt;b&gt;` stays visible
markup rather than becoming a real tag, and `&amp;nbsp;` stays the literal text
a user typed rather than collapsing to a space. Both are covered by checks.

### Entities that are decoded

`nbsp`, `quot`, `amp`, `apos`, `lt`, `gt`, `hellip`, `mdash`, `ndash`,
`lsquo`, `rsquo`, `ldquo`, `rdquo`, plus any valid numeric reference
(`&#8212;`, `&#x2014;`).

Numeric references are rejected — and therefore left as escaped literal text —
when they are `0`, above `U+10FFFF`, or a lone surrogate half.

An **unknown** named entity such as `&bogus;` is not decoded. Its `&` is
escaped and the reader sees `&bogus;`, which is what a browser does with it too.

---

## What is deliberately *not* decoded

**Attribute values are excluded from the entity-aware path.** This is the most
important integration detail in the document.

`sanitizeAttrs` already decodes attribute values itself before calling the
plainer `escapeHtml`. Routing attributes through `escapeTextNode` as well would
decode them **twice**, which defeats the checks `sanitizeAttrs` performs — an
`href` that decodes to a safe-looking value on the first pass could resolve to
something different on the second.

The split is therefore:

| Context | Function | Behaviour |
| --- | --- | --- |
| Text nodes | `escapeTextNode` | Decode, then escape |
| Attribute values | `escapeHtml` | Escape only (already decoded) |

The same applies to `heading`, which is a plain text field and is escaped
without decoding.

---

## Integration guide

### Step 1 — Submit section content

Send the same rich HTML the editor produces. No entity pre-processing is
required; the CMS normalises on the way in.

```json
POST /api/blogs
{
  "title": "Choosing a birthday experience",
  "slug": "choosing-a-birthday-experience",
  "status": "published",
  "sections": [
    {
      "id": "venues",
      "heading": "Choosing the venue",
      "content": "<p>Start by listing the options nearby.</p>",
      "image": "/uploads/sections/mabc123-xy7890.jpeg",
      "imagePosition": "left"
    }
  ]
}
```

Content is **allow-listed**. Only these tags survive:

`p`, `br`, `h1`, `h2`, `h3`, `strong`, `b`, `em`, `i`, `u`, `s`, `strike`,
`ul`, `ol`, `li`, `blockquote`, `a`, `span`, `figure`, `figcaption`

Only `href`, `target`, `rel`, `style`, `class`, `alt`, `src` survive as
attributes. Anything else — including `<script>`, `<img>`, event handlers such
as `onerror`, and `<style>` — is dropped along with its content. `<img>` is
intentionally absent from the allow-list: **section images must be supplied
through the `image` field**, not embedded in the body HTML, so that the image
rules in `SECTION_IMAGE_RULES.md` are enforced at upload time.

Style values are reduced to a safe subset (`font-size`, `color`,
`background-color`, `text-align`, `font-weight`, `font-style`,
`text-decoration`), and any declaration containing `url(`, `expression(`,
`@import` or `javascript:` is removed.

### Step 2 — Rendering contract

The server regenerates the article body from `sections` on **every write**, and
returns it in the `content` field. For a side-by-side image position:

```html
<section class="article-section article-section--image-left">
<div class="article-section__body">
<h2>Choosing the venue</h2>
<p>Start by listing the options nearby.</p>
</div>
<figure class="article-figure"><img src="/uploads/sections/mabc123-xy7890.jpeg" alt="Choosing the venue" /><figcaption><p>Photographed at the venue.</p></figcaption></figure>
</section>
```

A caption made only of whitespace is dropped and no empty `<figcaption>` is
emitted. `heading` doubles as the image `alt` when a caption is absent.

### Step 3 — Preview parity

`src/utils/articleContent.ts` mirrors the server's serializer so Preview renders
the current unsaved state exactly as the published article will. The two
implementations produce **byte-identical** HTML, and a check in the
verification script fails the build if they drift.

If an integration has its own preview, it must apply the same two steps —
non-breaking-space normalisation, and single-pass entity escaping — or the
preview will not match the article.

---

## Repairing existing content

`node scripts/repair-nbsp.mjs [--dry-run]`

Content stored before the fix keeps its artefact until it is rewritten, because
`content` is generated once at write time and served as stored. The repair
script fixes those records in place.

It is **idempotent** (a second run reports nothing to do) and takes a timestamped
backup of `blogs.json` before writing. `--dry-run` reports the scope without
touching the file.

| Property | Behaviour |
| --- | --- |
| Backup | `server/data/blogs.json.bak-<timestamp>` |
| Scope | Only blogs that actually contain the artefact |
| Method | In-place entity repair — **never** regenerates from `sections` |

That last row matters. Most blogs in this project were seeded with
hand-authored `content` that no longer round-trips through `buildContentHtml`
— rebuilding them would have discarded real text. The script therefore edits
only the entity sequences and leaves every other byte alone. It also normalises
only fields that are already strings, so sections that never had an
`imageCaption` do not acquire an empty one.

---

## Approaches used

**Fixed the encoder, not the symptom.** Stripping `&nbsp;` alone would have
removed the visible text while leaving `&quot;`, `&amp;` and `&#39;` broken by
the same mechanism, and would have left non-breaking spaces in the text
suppressing line wrapping. Fixing the encode/decode order removes the whole
class.

**Normalised non-breaking spaces rather than only trailing ones.** A mid-paragraph
U+00A0 is invisible but blocks wrapping, which is the usual cause of a single
word overflowing a phone viewport. Converting all of them is safe because HTML
collapses ordinary spaces anyway.

**Kept the sanitizer as the security boundary.** Entity decoding makes no change
to what is allowed through; it only changes how surviving text is encoded. The
five safety checks in the verification script confirm that `<script>` stripping,
`javascript:` href rejection, `onerror` removal and double-encoding resistance
all still hold.

**Repaired data in place instead of rebuilding it.** See the table above. The
repair is provably minimal: on the affected blog the rendered prose was
byte-identical before and after, with all 1508 words and every `<p>`, `<h2>`,
figure, image and link preserved.

**Kept the client and server as separate module graphs.** `server/` is
self-contained by design, so `normalizeRichTextHtml` exists in two files. A
drift guard in the verification script compares the two source texts and fails
if they ever differ, rather than trusting a comment to keep them aligned.

---

## Verification

`node scripts/verify-nbsp.mjs` — 37 checks, no test framework required.

It covers: trailing, mid-text, numeric, hexadecimal and literal-U+00A0
non-breaking spaces; entity round-trips for `&quot;`, `&#39;`, `&amp;`,
`&apos;`, `&hellip;` and `&mdash;`; bare and unknown ampersands; the
intent-preserving `&amp;nbsp;` and `&lt;b&gt;` cases; formatting and inter-tag
whitespace preservation; five sanitiser safety checks; client/server output
parity; the normaliser drift guard; the stored `blogs.json` (read-only); and an
HTTP round trip through the live API. Three checks are conditional on the
stored data still containing artefacts, so the count is 34 once the data is
clean.

A browser check confirmed the fix on the live article page at 900px and 390px:
paragraphs rendering the literal `&nbsp;` fell from 24 to 0, with no horizontal
overflow at either width.

Run the project's own gates with `npm run build` (`tsc -b && vite build`) and
`npm run lint`. The image suite (`node scripts/verify-image-rules.mjs`, 66
checks) was re-run to confirm no regression.

---

## Limitations and assumptions

- **The stored `content` string is generated once, at write time.** The fix
  corrects every future write; already-published records keep the artefact
  until `scripts/repair-nbsp.mjs` is run or the blog is re-saved from the
  editor.
- **`heading` is not entity-decoded.** It is a plain text field, so `&amp;`
  typed into it renders as the six characters `&amp;`. This is intentional —
  headings are not rich text.
- **Only 13 named entities are decoded.** Anything outside the list is escaped
  and shown literally. This is a deliberate allow-list: a broader table would
  mean trusting a large mapping to stay correct.
- **Trailing-whitespace removal is limited to spaces and tabs**, not newlines.
  Newlines between block tags are structural and are left intact.
- **The trailing trim operates on the assembled HTML**, not per text node,
  because a closing tag is a separate token from the text before it. A
  per-text-node trim can never see the boundary it needs to clean.
- **Interior runs of spaces are not collapsed.** They are harmless — HTML
  collapses them at render time — and collapsing them would alter deliberate
  spacing in code samples.
- **Non-breaking spaces are lost on purpose.** If a future feature needs a
  genuinely non-breaking space (a `10 kg` unit that must not split), this rule
  must become opt-in rather than universal.
- **The client and server normaliser are duplicated**, kept in step by a check
  rather than by a shared module, to preserve the existing server/client
  boundary.
