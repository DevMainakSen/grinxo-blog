import type { Request, Response } from 'express';
import * as store from '../services/blogStorage.ts';
import type { BlogInput } from '../types/blog.ts';

function normalizeInput(body: Record<string, unknown>): BlogInput {
  const has = (k: string) => body[k] !== undefined;
  const out: BlogInput = {};
  if (has('title')) out.title = String(body.title);
  if (has('slug')) out.slug = String(body.slug);
  if (has('excerpt')) out.excerpt = String(body.excerpt);
  if (has('featuredImage') && body.featuredImage) out.thumbnail = String(body.featuredImage);
  if (has('thumbnail') && body.thumbnail) out.thumbnail = String(body.thumbnail);
  if (has('category')) out.category = String(body.category);
  if (has('sections')) out.sections = Array.isArray(body.sections) ? (body.sections as BlogInput['sections']) : [];
  if (has('content')) out.content = String(body.content);
  if (has('author')) out.author = String(body.author);
  if (has('authorAvatar')) out.authorAvatar = String(body.authorAvatar);
  if (has('publishedAt')) out.publishedAt = String(body.publishedAt);
  if (has('readTime')) out.readTime = Number(body.readTime);
  if (has('tags')) out.tags = Array.isArray(body.tags) ? (body.tags as string[]) : [];
  if (has('featured')) out.featured = Boolean(body.featured);
  if (has('trending')) out.trending = Boolean(body.trending);
  if (has('status')) {
    const s = String(body.status);
    out.status = ['draft', 'scheduled', 'published'].includes(s) ? (s as BlogInput['status']) : 'draft';
    // A draft or published article is never scheduled — clear any old schedule.
    if (out.status !== 'scheduled') out.scheduledAt = undefined;
  }
  if (has('scheduledAt')) out.scheduledAt = String(body.scheduledAt);
  return out;
}

function isInvalid(input: BlogInput): string | null {
  if (!input.title?.trim()) return 'Title is required';
  if (!input.slug?.trim()) return 'Slug is required';
  return null;
}

export function listBlogs(req: Request, res: Response): void {
  // Public callers pass ?status=published to exclude drafts.
  const onlyPublished = String(req.query.status ?? '') === 'published';
  const blogs = (onlyPublished ? store.getPublicBlogs() : store.getAllBlogs())
    .map((b) => store.getBlogById(b.id) ?? b)
    .map(toClient);
  res.json({ blogs });
}

export function listPublicBlogs(_req: Request, res: Response): void {
  const blogs = store.getPublicBlogs()
    .map((b) => store.getBlogById(b.id) ?? b)
    .map(toClient);
  res.json(blogs);
}

export function getBlogById(req: Request, res: Response): void {
  const blog = store.getBlogById(String(req.params.id));
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

export function getBlogBySlug(req: Request, res: Response): void {
  const blog = store.getBlogBySlug(String(req.params.slug));
  // Public-facing endpoint: drafts are not exposed by slug.
  if (!blog || blog.status !== 'published') {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

export function getCategories(_req: Request, res: Response): void {
  res.json(store.getCategories());
}

/** Published blogs the given client has bookmarked. Query: { clientId }. */
export function listSavedBlogs(req: Request, res: Response): void {
  const clientId = String(req.query.clientId ?? '');
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return;
  }
  const blogs = store.getSavedBlogs(clientId).map(toClient);
  res.json({ blogs });
}

export function createBlog(req: Request, res: Response): void {
  const input = normalizeInput(req.body ?? {});
  const error = isInvalid(input);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const blog = store.createBlog(input);
  res.status(201).json(toClient(blog));
}

export function updateBlog(req: Request, res: Response): void {
  const input = normalizeInput(req.body ?? {});
  const existing = store.getBlogById(String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  const error = isInvalid({ ...existing, ...input });
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const blog = store.updateBlog(existing.id, input);
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

export function setStatus(req: Request, res: Response): void {
  const id = String(req.params.id);
  let blog: import('../types/blog.ts').Blog | undefined;
  if (req.path.endsWith('/publish')) {
    blog = store.applyPublish(id);
  } else {
    blog = store.applyDraft(id);
  }
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

export function scheduleBlog(req: Request, res: Response): void {
  const id = String(req.params.id);
  const existing = store.getBlogById(id);
  if (!existing) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  const blog = store.applySchedule(id, (req.body ?? {}).scheduledAt);
  if (blog === null) {
    res.status(400).json({ error: 'Invalid date. Scheduled time must be a valid future timestamp.' });
    return;
  }
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

export function deleteBlog(req: Request, res: Response): void {
  const ok = store.deleteBlog(String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json({ ok: true });
}

/** Toggle a like for a client on a blog. Body: { clientId }. */
export function toggleLike(req: Request, res: Response): void {
  const id = String(req.params.id);
  const clientId = String((req.body ?? {}).clientId ?? '');
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return;
  }
  const blog = store.toggleLike(id, clientId);
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

/** Toggle a bookmark for a client on a blog. Body: { clientId }. */
export function toggleBookmark(req: Request, res: Response): void {
  const id = String(req.params.id);
  const clientId = String((req.body ?? {}).clientId ?? '');
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return;
  }
  const blog = store.toggleBookmark(id, clientId);
  if (!blog) {
    res.status(404).json({ error: 'Blog not found' });
    return;
  }
  res.json(toClient(blog));
}

/**
 * Present a blog to clients, exposing `thumbnail` as well as `featuredImage`.
 */
function toClient(blog: import('../types/blog.ts').Blog) {
  return { ...blog, thumbnail: blog.featuredImage };
}
