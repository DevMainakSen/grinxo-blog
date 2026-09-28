import type { Request, Response } from 'express';
import * as store from '../services/blogStorage.ts';
import type {
  BlogInput,
  BlogSeo,
  BlogSection,
  BlogSocialSharing,
  SocialShareFacebook,
  SocialShareInstagram,
  SocialSharePost,
  SocialShareStory,
  SocialShareTimeline,
} from '../types/blog.ts';
import { resolveImagePosition } from '../types/blog.ts';

function sanitizeString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

/**
 * Normalise one section coming from the API. Only the known fields are kept,
 * and `imagePosition` is reduced to a supported value so an unexpected or
 * hand-crafted payload can never reach the rendered HTML.
 */
function sanitizeSection(raw: unknown): BlogSection {
  const body = (raw ?? {}) as Record<string, unknown>;
  const section: BlogSection = {
    id: String(body.id ?? ''),
    heading: String(body.heading ?? ''),
    content: String(body.content ?? ''),
  };
  const image = sanitizeString(body.image);
  if (image !== undefined) section.image = image;
  const caption = sanitizeString(body.imageCaption);
  if (caption !== undefined) section.imageCaption = caption;
  // A position only means anything when an image is present; otherwise the
  // section renders as the default `bottom` layout.
  if (image !== undefined) {
    section.imagePosition = resolveImagePosition(body.imagePosition);
  }
  return section;
}

function sanitizeHashtags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.map((t) => String(t).trim()).filter(Boolean);
  const cleaned = tags.map((t) => t.replace(/\s+/g, ''));
  return cleaned.length ? cleaned : undefined;
}

function sanitizeStory(raw: Record<string, unknown> | undefined): SocialShareStory | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SocialShareStory = {};
  const image = sanitizeString(raw.image);
  const title = sanitizeString(raw.title);
  const text = sanitizeString(raw.text);
  const hashtags = raw.hashtags !== undefined ? sanitizeHashtags(raw.hashtags) : undefined;
  if (image !== undefined) out.image = image;
  if (title !== undefined) out.title = title;
  if (text !== undefined) out.text = text;
  if (hashtags !== undefined) out.hashtags = hashtags;
  return Object.keys(out).length ? out : undefined;
}

function sanitizePost(raw: Record<string, unknown> | undefined): SocialSharePost | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SocialSharePost = {};
  const image = sanitizeString(raw.image);
  const caption = sanitizeString(raw.caption);
  const hashtags = raw.hashtags !== undefined ? sanitizeHashtags(raw.hashtags) : undefined;
  if (image !== undefined) out.image = image;
  if (caption !== undefined) out.caption = caption;
  if (hashtags !== undefined) out.hashtags = hashtags;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeTimeline(raw: Record<string, unknown> | undefined): SocialShareTimeline | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: SocialShareTimeline = {};
  const image = sanitizeString(raw.image);
  const title = sanitizeString(raw.title);
  const description = sanitizeString(raw.description);
  const text = sanitizeString(raw.text);
  const hashtags = raw.hashtags !== undefined ? sanitizeHashtags(raw.hashtags) : undefined;
  if (image !== undefined) out.image = image;
  if (title !== undefined) out.title = title;
  if (description !== undefined) out.description = description;
  if (text !== undefined) out.text = text;
  if (hashtags !== undefined) out.hashtags = hashtags;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeSocialSharing(raw: unknown): BlogSocialSharing | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  const instagramRaw = body.instagram as Record<string, unknown> | undefined;
  const facebookRaw = body.facebook as Record<string, unknown> | undefined;
  const out: BlogSocialSharing = {};

  if (instagramRaw && typeof instagramRaw === 'object') {
    const ig: SocialShareInstagram = {};
    const story = sanitizeStory(instagramRaw.story as Record<string, unknown> | undefined);
    const post = sanitizePost(instagramRaw.post as Record<string, unknown> | undefined);
    const dm = sanitizeString((instagramRaw.directMessage as Record<string, unknown> | undefined)?.text);
    if (story) ig.story = story;
    if (post) ig.post = post;
    if (dm) ig.directMessage = { text: dm };
    if (Object.keys(ig).length) out.instagram = ig;
  }

  if (facebookRaw && typeof facebookRaw === 'object') {
    const fb: SocialShareFacebook = {};
    const story = sanitizeStory(facebookRaw.story as Record<string, unknown> | undefined);
    const timeline = sanitizeTimeline(facebookRaw.timeline as Record<string, unknown> | undefined);
    if (story) fb.story = story;
    if (timeline) fb.timeline = timeline;
    if (Object.keys(fb).length) out.facebook = fb;
  }

  return out;
}

function normalizeInput(body: Record<string, unknown>): BlogInput {
  const has = (k: string) => body[k] !== undefined;
  const out: BlogInput = {};
  if (has('title')) out.title = String(body.title);
  if (has('slug')) out.slug = String(body.slug);
  if (has('excerpt')) out.excerpt = String(body.excerpt);
  if (has('featuredImage') && body.featuredImage) out.thumbnail = String(body.featuredImage);
  if (has('thumbnail') && body.thumbnail) out.thumbnail = String(body.thumbnail);
  if (has('category')) out.category = String(body.category);
  if (has('sections')) {
    out.sections = Array.isArray(body.sections) ? body.sections.map(sanitizeSection) : [];
  }
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
  if (has('isActive')) out.isActive = Boolean(body.isActive);
  if (has('scheduledAt')) out.scheduledAt = String(body.scheduledAt);

  // SEO metadata
  if (has('seo') && body.seo && typeof body.seo === 'object') {
    const raw = body.seo as Record<string, unknown>;
    const seo: BlogSeo = {};
    if (raw.seoTitle !== undefined) seo.seoTitle = String(raw.seoTitle);
    if (raw.metaDescription !== undefined) seo.metaDescription = String(raw.metaDescription);
    if (raw.focusKeyword !== undefined) seo.focusKeyword = String(raw.focusKeyword);
    if (Array.isArray(raw.secondaryKeywords)) {
      seo.secondaryKeywords = (raw.secondaryKeywords as string[]).map(String).filter(Boolean);
    }
    if (raw.canonicalUrl !== undefined) seo.canonicalUrl = String(raw.canonicalUrl);
    if (raw.ogTitle !== undefined) seo.ogTitle = String(raw.ogTitle);
    if (raw.ogDescription !== undefined) seo.ogDescription = String(raw.ogDescription);
    if (raw.ogImage !== undefined) seo.ogImage = String(raw.ogImage);
    if (raw.robotsIndex !== undefined) seo.robotsIndex = Boolean(raw.robotsIndex);
    if (raw.robotsFollow !== undefined) seo.robotsFollow = Boolean(raw.robotsFollow);
    out.seo = seo;
  }

  // Per-destination social share config.
  // Provided (even empty) → replace persisted config; omitted → unchanged.
  if (has('socialSharing')) {
    if (body.socialSharing && typeof body.socialSharing === 'object') {
      out.socialSharing = sanitizeSocialSharing(body.socialSharing) ?? {};
    } else {
      out.socialSharing = {};
    }
  }

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
  // Public endpoint: drafts, scheduled, and inactive blogs are not exposed by
  // slug — direct URL access behaves like a removed resource (404).
  if (!blog || blog.status !== 'published' || blog.isActive === false) {
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

/** Set the activity/visibility flag on a blog. Body: { isActive }. */
export function setActivity(req: Request, res: Response): void {
  const id = String(req.params.id);
  const isActive = (req.body ?? {}).isActive;
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive must be a boolean' });
    return;
  }
  const blog = store.setActivity(id, isActive);
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
  return { ...blog, thumbnail: blog.featuredImage, isActive: blog.isActive ?? true };
}
