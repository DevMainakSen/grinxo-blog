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

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Normalise a URL for a public link. Returns a safe string or null if the
 * value uses an unsafe scheme (e.g. javascript:). Bare relative paths such as
 * /blog/slug (internal article links) are allowed.
 */
function sanitizeUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;

  // Internal relative links (/blog/slug, /uploads/...) are permitted.
  if (raw.startsWith('/')) {
    const low = raw.toLowerCase();
    if (low.startsWith('//') || low.includes('://')) return null;
    return raw;
  }

  // Absolute links must use http/https (no javascript:, data:, etc.).
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.href;
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'blockquote', 'a', 'span', 'figure', 'figcaption',
]);

const ALLOWED_ATTRS = new Set(['href', 'target', 'rel', 'style', 'class', 'alt', 'src']);

/**
 * Sanitise rich-text HTML produced by the admin editor. Drops any tag or
 * attribute outside an explicit allow-list and hardens link behaviour so
 * unsafe schemes cannot reach the public page.
 */
function sanitizeHtml(html: string): string {
  if (!html) return '';
  const src = String(html);

  const out: string[] = [];
  const tagRe = /<(\/?)\s*([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  // Track elements whose opening tag was dropped so their inner content and
  // closing tag are also removed (e.g. an <a> with an unsafe href).
  const droppedStack: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(src)) !== null) {
    out.push(escapeHtml(src.slice(lastIndex, m.index)));
    const closing = m[1] === '/';
    const tagName = m[2].toLowerCase();
    const selfClosing = m[4] === '/';
    const fullEnd = m.index + m[0].length;

    if (closing) {
      // If we dropped a matching element, its closing tag goes too.
      const idx = droppedStack.lastIndexOf(tagName);
      if (idx !== -1) {
        droppedStack.splice(idx, 1);
        lastIndex = fullEnd;
        continue;
      }
      if (ALLOWED_TAGS.has(tagName)) out.push(`</${tagName}>`);
    } else if (ALLOWED_TAGS.has(tagName)) {
      let attrs = '';
      if (!selfClosing) attrs = sanitizeAttrs(tagName, m[3]);
      if (tagName === 'a' && attrs === '') {
        droppedStack.push(tagName);
        lastIndex = fullEnd;
        continue;
      }
      out.push(`<${tagName}${attrs}>`);
    }
    lastIndex = fullEnd;
  }
  out.push(escapeHtml(src.slice(lastIndex)));

  return out.join('').trim();
}

/**
 * Allow-list attributes on a single opening tag. Links are forced open in a
 * new tab with rel="noopener noreferrer".
 */
function sanitizeAttrs(tagName: string, rawAttrString: string): string {
  const parts: string[] = [];
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_:.\-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = attrRe.exec(rawAttrString)) !== null) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;
    const value = m[3] ?? m[4] ?? m[5] ?? '';
    const decoded = value
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    if (name === 'href') {
      const safe = sanitizeUrl(decoded);
      if (safe === null) continue; // drop unsafe link entirely
      parts.push(`href="${escapeHtml(safe)}"`);
      seen.add('href');
      continue;
    }

    if (name === 'style') {
      parts.push(`style="${escapeHtml(sanitizeCss(decoded))}"`);
      seen.add('style');
      continue;
    }

    if (name === 'class') {
      // Only allow the specific figure class we emit.
      if (decoded.trim() === 'article-figure') {
        parts.push('class="article-figure"');
        seen.add('class');
      }
      continue;
    }

    // src / alt allowed on img-like tags only.
    if ((name === 'src' || name === 'alt') && (tagName === 'img' || tagName === 'figure')) {
      const safe = name === 'src' ? sanitizeUrl(decoded.replace(/^\/\//, '/')) : decoded;
      if (name === 'src' && safe === null) continue;
      parts.push(`${name}="${escapeHtml(name === 'src' ? safe : decoded)}"`);
      seen.add(name === 'src' ? 'src' : 'alt');
    }
  }

  // Force links to open in a new, secured tab.
  if (tagName === 'a') {
    if (!seen.has('href')) return ''; // no valid href -> drop the anchor
    parts.push('target="_blank"');
    parts.push('rel="noopener noreferrer"');
  }

  return parts.length ? ` ${parts.join(' ')}` : '';
}

/** Reduce a style string to a safe subset used by the editor (size/color/highlight/alignment). */
function sanitizeCss(css: string): string {
  const allowedProps = new Set([
    'font-size', 'color', 'background-color', 'text-align',
    'font-weight', 'font-style', 'text-decoration',
  ]);
  return css
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const sep = decl.indexOf(':');
      if (sep === -1) return '';
      const prop = decl.slice(0, sep).trim().toLowerCase();
      const val = decl.slice(sep + 1).trim();
      if (!allowedProps.has(prop)) return '';
      // basic value safety: no url( or expression()
      if (/url\(|expression|@import|javascript:/i.test(val)) return '';
      return `${prop}: ${val}`;
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * Build an HTML body string from structured sections so the public article
 * page can keep rendering content via its existing .article-prose markup.
 *
 * Each section's `content` may be either plain text (legacy/seed content) or
 * rich HTML produced by the admin rich-text editor. Plain text is wrapped in
 * <p> and escaped; rich HTML is sanitised against an allow-list and rendered
 * verbatim so all formatting (bold, color, lists, links, alignment) survives.
 */
export function buildContentHtml(sections: BlogSection[]): string {
  return sections
    .map((section) => {
      const parts: string[] = [];
      if (section.heading.trim()) {
        parts.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
      }
      const body = (section.content ?? '').trim();
      if (body.length > 0) {
        const looksLikeHtml = /<[a-zA-Z][\s\S]*>/.test(body);
        parts.push(looksLikeHtml ? sanitizeHtml(body) : wrapParagraphs(body));
      }
      if (section.image) {
        const alt = escapeHtml(section.heading || 'Section image');
        const safeSrc = sanitizeUrl(section.image);
        if (safeSrc) {
          const fig = section.imageCaption
            ? `<figcaption>${escapeHtml(section.imageCaption)}</figcaption>`
            : '';
          parts.push(`<figure class="article-figure"><img src="${escapeHtml(safeSrc)}" alt="${alt}" />${fig}</figure>`);
        }
      }
      return parts.join('\n');
    })
    .join('\n');
}

function wrapParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`)
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
