import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Blog, BlogInput, BlogSection } from '../types/blog.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const BLOGS_FILE = join(DATA_DIR, 'blogs.json');
const SEED_FILE = join(DATA_DIR, 'seed.blogs.json');
const CATEGORIES_FILE = join(DATA_DIR, 'categories.json');

export const UPLOADS_DIR = join(__dirname, '..', 'uploads');

/**
 * Escapes text for safe embedding in generated HTML body content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build an HTML body string from structured sections so the public article
 * page can keep rendering content via its existing .article-prose markup.
 */
export function buildContentHtml(sections: BlogSection[]): string {
  return sections
    .map((section) => {
      const parts: string[] = [];
      if (section.heading.trim()) {
        parts.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
      }
      // Paragraphs (blank-line separated) are wrapped in <p>.
      const paragraphs = section.content
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`);
      parts.push(...paragraphs);
      if (section.image) {
        const alt = escapeHtml(section.heading || 'Section image');
        const fig = section.imageCaption
          ? `<figcaption>${escapeHtml(section.imageCaption)}</figcaption>`
          : '';
        parts.push(`<figure class="article-figure"><img src="${section.image}" alt="${alt}" />${fig}</figure>`);
      }
      return parts.join('\n');
    })
    .join('\n');
}

let cache: Blog[] | null = null;

function readFile<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Initialise storage on first run:
 *   - ensure the data directory and upload folders exist
 *   - if blogs.json does not exist, seed it from the bundled snapshot.
 */
export function initStorage(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(UPLOADS_DIR, 'banners'), { recursive: true });
  mkdirSync(join(UPLOADS_DIR, 'sections'), { recursive: true });

  if (!existsSync(BLOGS_FILE)) {
    const seed = readFile<Blog[]>(SEED_FILE, []);
    writeJson(BLOGS_FILE, seed);
  }
  if (!existsSync(CATEGORIES_FILE)) {
    writeJson(CATEGORIES_FILE, []);
  }
  cache = readFile<Blog[]>(BLOGS_FILE, []);
}

function refreshCache(): void {
  cache = readFile<Blog[]>(BLOGS_FILE, []);
}

export function getAllBlogs(): Blog[] {
  if (cache === null) initStorage();
  return cache ?? [];
}

export function getPublicBlogs(): Blog[] {
  return getAllBlogs().filter((b) => b.status === 'published');
}

export function getBlogById(id: string): Blog | undefined {
  return getAllBlogs().find((b) => b.id === id);
}

export function getBlogBySlug(slug: string): Blog | undefined {
  return getAllBlogs().find((b) => b.slug === slug);
}

export function getCategories(): { name: string; count: number }[] {
  const blogs = getPublicBlogs();
  const map = new Map<string, number>();
  for (const b of blogs) {
    map.set(b.category, (map.get(b.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function nextId(): string {
  return `blog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBlog(input: BlogInput): Blog {
  const now = new Date().toISOString();
  const sections = input.sections ?? [];
  const blog: Blog = {
    id: nextId(),
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt ?? '',
    thumbnail: input.thumbnail,
    content: input.content ?? buildContentHtml(sections),
    featuredImage: input.thumbnail ?? '',
    author: input.author ?? 'GrinXO Team',
    authorAvatar: input.authorAvatar,
    publishedAt: input.publishedAt ?? now,
    readTime: input.readTime ?? estimateReadTime(input),
    category: input.category ?? 'General',
    tags: input.tags ?? [],
    featured: input.featured ?? false,
    trending: input.trending ?? false,
    status: input.status ?? 'draft',
    sections,
  };
  const blogs = getAllBlogs();
  blogs.unshift(blog);
  persist(blogs);
  return blog;
}

export function updateBlog(id: string, input: BlogInput): Blog | undefined {
  const blogs = getAllBlogs();
  const idx = blogs.findIndex((b) => b.id === id);
  if (idx === -1) return undefined;

  const existing = blogs[idx];
  const sections = input.sections ?? existing.sections;

  const fullInput: BlogInput = {
    ...existing,
    ...input,
    sections,
    thumbnail: input.thumbnail ?? existing.featuredImage,
  };

  const updated: Blog = {
    ...existing,
    title: fullInput.title,
    slug: fullInput.slug,
    excerpt: fullInput.excerpt,
    thumbnail: fullInput.thumbnail,
    content: input.content !== undefined
      ? input.content
      : input.sections
        ? buildContentHtml(sections)
        : existing.content,
    featuredImage: fullInput.thumbnail,
    author: fullInput.author,
    authorAvatar:
      fullInput.authorAvatar !== undefined ? fullInput.authorAvatar : existing.authorAvatar,
    publishedAt: fullInput.publishedAt,
    readTime:
      input.readTime ??
      (input.sections ? estimateReadTime(fullInput) : existing.readTime),
    category: fullInput.category,
    tags: fullInput.tags,
    featured: fullInput.featured,
    trending: fullInput.trending,
    status: fullInput.status,
    sections,
  };
  blogs[idx] = updated;
  persist(blogs);
  return updated;
}

export function setStatus(id: string, status: Blog['status']): Blog | undefined {
  return updateBlog(id, { status });
}

export function deleteBlog(id: string): boolean {
  const blogs = getAllBlogs();
  const next = blogs.filter((b) => b.id !== id);
  if (next.length === blogs.length) return false;
  persist(next);
  return true;
}

function estimateReadTime(input: BlogInput): number {
  const words = [
    input.title ?? '',
    input.excerpt ?? '',
    ...(input.sections ?? []).map((s) => `${s.heading} ${s.content}`),
  ]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  return Math.max(1, Math.round(words.length / 200));
}

function persist(blogs: Blog[]): void {
  cache = blogs;
  writeJson(BLOGS_FILE, blogs);
}

export function reloadFromDisk(): void {
  refreshCache();
}
