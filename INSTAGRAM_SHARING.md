# GrinXO Blog CMS — Instagram Sharing

This document describes how the "Share" menu's Instagram option works in the GrinXO Blog CMS
prototype. It covers exactly what the website can and cannot do on Instagram, the honest
fallback prompts, browser/API constraints, and the changes needed if the site ever integrates
Meta's APIs for direct publishing.

## How it works

The article page and feed cards expose a "Share" menu. Selecting **Instagram** opens a submenu
with three choices:

| Choice | Goal | What the website actually does |
|--------|------|--------------------------------|
| Share to Instagram Story | Add the article to a Story | Hand the cover image to the device's native share sheet (where supported), or explain how to do it manually. |
| Share as Instagram Post | Create a feed post | Hand the cover image to the native share sheet (where supported), or explain how to post manually. |
| Share via Instagram DM | Send the article in a direct message | Open the native share sheet with the link (where supported), or explain how to paste the link into a DM. |

The menu never pretends to post on the user's behalf and never touches their account — there is
no API access, no login, and no automation.

## Exactly what the website can do

### 1. Copy the link (always available)

The canonical article URL is written to the clipboard. Success shows a momentary "Blog link
copied" state on the button; if the clipboard API is unavailable the popover tells the user to
copy the address manually.

### 2. Download the cover image (Story / Post only)

The article's Open Graph image (`ogImage`, falling back to `featuredImage`) is fetched
cross-origin and saved via a standard download anchor. If the fetch or download fails, the image
opens in a new tab so the user can long-press to save on mobile.

### 3. Open Instagram (always available)

A universal link to `https://www.instagram.com/` opens in a new tab. On phones the OS routes it
to the installed Instagram app; on desktop it opens the web app. If the browser blocks the
pop-up, the popover tells the user how to proceed.

### 4. Native share sheet (device-dependent)

When the Web Share API is available (`navigator.share`):

- **DM** shares `{ title, text, url }` with no files, so it works on every Web Share device.
- **Story / Post** only use the file variant (`navigator.share` with a `File` attachment) when
  `navigator.canShare` confirms images are accepted — currently Chrome Android only. The cover
  image is loaded, converted to a `File`, and handed to the share sheet. The user still picks
  Instagram (or any app) from the sheet.
- Cancelling the share sheet is treated as a deliberate action, not an error, and never shows a
  failure message.

## What the website cannot do (by design)

There are no fake capabilities. Browsers and Instagram do not permit these from a plain website:

- Posting a Story, an image, or text **directly** to the user's Instagram account.
- Opening a pre-filled DM thread or composing a message on the user's behalf (Instagram does not
  expose this to the web).
- Auto-login, session reuse, or cookies/hacks around Instagram's app. The site will never
  attempt unofficial automation, and this is not a limitation that can be removed client-side.

The Story / Post fallback panels therefore tell the user honestly what to do next (download the
image, then add it in the app), and the DM fallback tells them to copy the link and paste it into
a conversation.

## Capability detection

| Capability | Detection | Result |
|------------|-----------|--------|
| Desktop without Web Share (most browsers) | `navigator.share === undefined` | Fallback panel with Download / Copy / Open Instagram. |
| iOS Safari / Android Web Share, text only | `navigator.share` present | DM uses the native sheet; Story/Post fall back because files are not supported. |
| Chrome Android with Web Share + files | `navigator.canShare({ files })` returns `true` | Story/Post pass the cover image to the native sheet. |
| Pop-up blockers | `window.open` returns `null` | Popover shows an allow-pop-ups hint. |

## What is shared

- **URL:** `resolveCanonicalUrl(blog)` — the blog's `canonicalUrl` if set, else
  `<site base>/blog/<slug>`. In local development the base is `http://localhost:5173`; in
  production it should come from `VITE_PUBLIC_SITE_URL`.
- **Text:** one empty line between the article title and excerpt.
- **Image:** `resolveOgImage(blog)` — Open Graph image, falling back to the featured image
  (`/uploads/banners/*` or a remote CDN such as Unsplash).

## Where shares appear

- Article page hero actions (labelled pill variants).
- Feed card actions (icon variants).

Shared articles are always **published and active**: the share component only renders on public
pages, so drafts, scheduled, and inactive blogs never expose a share menu (admin preview also
renders no actions).

## Accessibility

- The popover is a `role="menu"` with `menuitem` rows; every row is a real `<button>` or anchor.
- State changes are announced via `role="status"` paragraphs (busy/result messages).
- Rows have a 52px minimum height for comfortable touch targets; Escape and outside mousedown
  close the menu; buttons disable while an image is loading.

## If direct posting is ever required (future work)

This is intentionally out of scope for a static front-end and would require:

1. **Meta developer account** and a registered app with the
   [Instagram Graph API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
   product.
2. **OAuth 2.0 login with the `instagram_business_content_publish` permission**, handled
   server-side (this repo has no auth/session layer today and the CMS has no backend identity).
3. **A server-side endpoint** to exchange tokens and call Graph API publish endpoints (Facebook
   Content Publishing API for feed posts / Reels, Stories require the app to be reviewed and the
   token to belong to a Business account).
4. **Explicit content-owner consent** before any post is created on their account.

None of this changes the current UI: the submenu and fallback panels are designed so the "Share
to Story / Post / DM" actions can later be swapped to "published successfully" results if such an
API path is added.