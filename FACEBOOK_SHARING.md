# GrinXO Blog CMS — Facebook Sharing

This document describes how the "Share" menu's Facebook option works. It covers exactly what the
website can and cannot do on Facebook, the honest fallback prompts, browser/API constraints, and
what official Meta API integration would require. The Facebook flow shares the same generic
architecture as the Instagram flow, so both are driven by one platform config in
`BlogActions.tsx`.

## Where it lives

The Share menu (article hero + feed cards) now shows:

```text
Share
 ├── Copy link
 ├── WhatsApp          (direct deep link)
 ├── Instagram ›       (submenu: Story / Post / DM)
 └── Facebook ›        (submenu: Story / Timeline)
```

"Share on Facebook" presents two choices:

| Choice | Label | What the website actually does |
|--------|-------|--------------------------------|
| Facebook Story | "Share to Facebook Story" | Hand the cover image to the device's native share sheet (Android), or explain how to add it to a Story manually. |
| Facebook Timeline | "Share to Facebook Timeline" | Open Facebook's own Share dialog for the blog URL (desktop), or pass the link to the native share sheet on phones. |

The menu never pretends to post on the user's behalf and never touches their account — there is
no API access, no login, and no automation.

## Facebook Timeline (supported web mechanism)

Facebook's documented, app-less website mechanism is its Share dialog, i.e. the URL:

```text
https://www.facebook.com/sharer/sharer.php?u=<encoded public URL>
```

This opens Facebook's own post composer; the user completes the post there. Facebook's crawler
then builds the preview from the blog's Open Graph tags (`og:title`, `og:description`,
`og:image`, `og:url`), all of which GrinXO already emits. The website only ever says the share
*flow opened* — never that a post was created.

Because Facebook has restricted `sharer.php` on iOS Safari when the Facebook app is installed
("Sorry, something went wrong" — a known issue since ~Oct 2025, confirmed on Meta's developer
forum, which now recommends `navigator.share` on iPhone), the Timeline option is capability-based:

- **Touch devices with the Web Share API (iPhone, Android):** opens the native share sheet with
  title, description and the canonical URL. The user picks Facebook (or any app). Honest prompt:
  "Share sheet opened. If you picked Facebook, post from there."
- **Desktop / non-touch browsers (Chrome, Safari, Firefox on desktop):** opens Facebook's Share
  dialog (`sharer.php?u=...`) in a new tab directly from the click. If a pop-up blocker stops it,
  the popover says so and never claims the post was made.

## Facebook Story

There is **no supported web mechanism for a website to publish to a user's Facebook Story**.
Story frames can only be created inside the Facebook app. Consequences:

- **Android (Web Share + files):** the cover image is loaded and handed to the native share
  sheet; the user can add it to their Story in the Facebook app. Prompt: "Share sheet opened. If
  you picked Facebook, choose Story there."
- **Everywhere else:** the Story option opens an honest fallback panel:

  ```text
  Facebook Story
  Facebook doesn't let a website post to your Story directly. Download the image,
  then add it to your Story in the Facebook app.

  [ Download image ]  [ Copy blog link ]  [ Open Facebook ]
  ```

The download is always user-initiated (no automatic file downloads), and the image is the Open
Graph image (`seo.ogImage`, falling back to `featuredImage`).

## What the website cannot do (by design)

- Auto-post a Story, photo, or text to the user's Facebook account.
- Open a pre-filled composer or DM thread on the user's behalf.
- Confirm that a post was published (the Share dialog does not report results back to a website).
- Login, session reuse, cookie extraction, scraping, or browser automation of Facebook.

## Capability detection

| Environment | Detection | Behavior |
|-------------|-----------|----------|
| Desktop (no Web Share) | `'share' in navigator === false` | Timeline → Facebook Share dialog; Story → fallback panel. |
| Touch device with Web Share (iPhone/Android) | `navigator.maxTouchPoints > 0` + `'share' in navigator` | Timeline → native share sheet (recommended by Meta for the iOS `sharer.php` bug); Story → native sheet on Android only (files). |
| Chrome Android with file sharing | `navigator.canShare({ files })` | Story passes the cover image to the native sheet. |
| Pop-up blockers | `window.open` returns `null` | Popover shows an allow-pop-ups hint; page is never navigated away. |

Detection is capability-based (no user-agent sniffing).

## What is shared

- **URL:** `resolveCanonicalUrl(blog)` — the blog's `canonicalUrl` if set, else
  `<site base>/blog/<slug>`. In local development the base is `http://localhost:5173`; in
  production it should come from `VITE_PUBLIC_SITE_URL`. Never admin/preview/draft/API URLs.
- **Text:** the article title and excerpt.
- **Image:** `resolveOgImage(blog)` — Open Graph image, falling back to the featured image.

Only **published and active** blogs reach the share UI: the component only renders on public
pages, so drafts, scheduled, and inactive blogs never expose a Facebook share menu, and admin
preview renders no actions at all.

## Accessibility & UX

- Popover is a `role="menu"` with `menuitem` rows; every row is a real `<button>` or anchor.
- Status changes announced via `role="status"`.
- Rows are ≥52px touch targets; Escape and outside mousedown close the menu; buttons disable
  while an image is loading; user cancellation of a share sheet is never treated as an error.

## If direct posting is ever required (future work)

This is intentionally out of scope for a static front-end and would require:

1. **Meta developer application** with the Facebook Login + Graph API products.
2. **OAuth 2.0 login** with `publish_actions`-equivalent permissions (user or Page tokens,
   granted server-side — this repo has no auth/session layer today).
3. **A server-side endpoint** to exchange tokens and call the Graph API publish endpoints
   (feed publish for Timeline; Stories require a Business content token and platform review).
4. **Explicit consent** from the account owner before any auto-post.

None of this changes the current UI: the generic SubOption model in `BlogActions.tsx` lets a
future "published" result replace a fallback panel without touching other platforms.