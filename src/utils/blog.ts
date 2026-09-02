import type { Blog } from '../types/blog';

/**
 * Normalise a raw API blog into the shape the admin UI expects:
 * - `sections` always an array
 * - `status` always defined
 * - `featuredImage`/`thumbnail` kept in sync
 */
export function normalizeBlog(blog: Blog): Blog {
  const featuredImage = blog.featuredImage || blog.thumbnail || '';
  return {
    ...blog,
    featuredImage,
    thumbnail: featuredImage,
    status: blog.status ?? 'draft',
    sections: blog.sections ?? [],
  };
}

/** Build a payload for the API (server maps thumbnail -> featuredImage). */
export function toBlogPayload(blog: Blog): Record<string, unknown> {
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    thumbnail: blog.featuredImage,
    featuredImage: blog.featuredImage,
    author: blog.author,
    authorAvatar: blog.authorAvatar,
    publishedAt: blog.publishedAt,
    readTime: blog.readTime,
    category: blog.category,
    tags: blog.tags,
    featured: blog.featured,
    trending: blog.trending,
    status: blog.status,
    scheduledAt: blog.scheduledAt,
    sections: blog.sections ?? [],
  };
}