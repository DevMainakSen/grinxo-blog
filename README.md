# GrinXO Blog — Public Blog + Admin Panel + Node.js Backend

A standalone prototype of the GrinXO Blog Platform. It demonstrates a complete
publishing workflow: a React + TypeScript public blog, a functional admin
panel, and a small Node.js backend that persists data to local files (no
database).

## How to run

Install dependencies once:

```bash
npm install
```

### Option A — Single server (recommended for the demo)

Build the client and serve everything (app + API + uploads) from one port:

```bash
npm run build   # compile the frontend into dist/
npm run server  # serves http://localhost:5001
```

Then open:

| Page              | URL                                       |
| ----------------- | ----------------------------------------- |
| Public blog       | http://localhost:5001/blog               |
| Admin dashboard   | http://localhost:5001/blog/admin/blogs   |
| Create a blog     | http://localhost:5001/blog/admin/blogs/new |

### Option B — Development (hot reload)

Run the backend and the Vite dev server in two terminals:

```bash
# terminal 1 — Node backend on :5001
npm run server

# terminal 2 — Vite dev server on :5173 (proxies /api and /uploads)
npm run dev
```

Open http://localhost:5173/blog and http://localhost:5173/blog/admin/blogs.

> The admin panel lives under `/blog/admin` on purpose, so it does not clash
> with GrinXO's main site admin at `/admin`.

## How it works

```
React (public + admin)
        │
        ▼
   Node.js API  (server/server.ts)
        │
        ├── /api/blogs……  blog CRUD + draft/publish
        ├── /api/categories
        └── /api/uploads… image uploads (multer)
                │
        ┌───────┴────────┐
        ▼                ▼
  blogs.json        server/uploads/banners + /sections
```

- **No database.** Blog data lives in `server/data/blogs.json`; images are
  saved to `server/uploads/`.
- **Seed data is reused.** On first start, `blogs.json` is initialised from the
  bundled snapshot (`server/data/seed.blogs.json`), generated from the original
  frontend seed data (`src/data/blogs.ts`) by `npm run seed`. If `blogs.json`
  already exists it is never overwritten.
- **One dataset for admin and public.** Both surfaces consume the same backend;
  the admin sees drafts, the public site only shows published articles.
- **Sections with images.** New articles are written as dynamic sections
  (heading, text, optional image + caption). The public article page renders
  them and the backend derives the HTML body automatically.

## API (summary)

```
GET    /api/blogs                     all blogs (drafts included)
GET    /api/blogs?status=published    only published
GET    /api/blogs/:id
GET    /api/blogs/slug/:slug
POST   /api/blogs
PUT    /api/blogs/:id
DELETE /api/blogs/:id
POST   /api/blogs/:id/publish
POST   /api/blogs/:id/draft
POST   /api/uploads                   multipart image upload
```

## Regenerating the seed snapshot

```bash
npm run seed   # reads src/data/blogs.ts -> server/data/seed.blogs.json
```