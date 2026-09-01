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
  if (has('status')) out.status = body.status === 'draft' ? 'draft' : 'published';
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
  const blogs = (onlyPublished ? store.getPublicBlogs() : store.getAllBlogs()).map(toClient);
  res.json({ blogs });
}

export function listPublicBlogs(_req: Request, res: Response): void {
  const blogs = store.getPublicBlogs().map(toClient);
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
  const status = req.path.endsWith('/publish') ? 'published' : 'draft';
  const blog = store.setStatus(String(req.params.id), status);
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

/**
 * Present a blog to clients, exposing `thumbnail` as well as `featuredImage`.
 */
function toClient(blog: import('../types/blog.ts').Blog) {
  return { ...blog, thumbnail: blog.featuredImage };
}
