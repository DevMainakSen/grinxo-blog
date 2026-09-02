import { blogs as seedBlogs, blogCategories as seedCategories } from './blogs';
import type { Blog, BlogCategory } from '../types/blog';
import {
  getPublishedBlogs,
  getBlogBySlug as fetchBlogBySlug,
  getCategories as fetchCategories,
  ApiError,
} from '../services/blogApi';

/**
 * Load the published blog list from the backend API.
 * Falls back to the bundled seed data if the API is unreachable,
 * so the public site still renders during development without a server.
 */
async function loadBlogs(): Promise<Blog[]> {
  try {
    return await getPublishedBlogs();
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      return seedBlogs.filter((b) => b.status === 'published');
    }
    throw error;
  }
}

export const getBlogs = async (): Promise<Blog[]> => loadBlogs();

export const getFeaturedBlogs = async (): Promise<Blog[]> => {
  const blogs = await loadBlogs();
  return blogs.filter((blog) => blog.featured);
};

export const getTrendingBlogs = async (): Promise<Blog[]> => {
  const blogs = await loadBlogs();
  return blogs.filter((blog) => blog.trending);
};

export const getBlogBySlug = async (slug: string): Promise<Blog | undefined> => {
  try {
    return await fetchBlogBySlug(slug);
  } catch {
    // API unavailable or not found — fall back to the bundled seed data,
    // but only ever expose published articles to the public site.
    return seedBlogs.find((blog) => blog.slug === slug && blog.status === 'published');
  }
};

export const getBlogsByCategory = async (category: string): Promise<Blog[]> => {
  const blogs = await loadBlogs();
  return blogs.filter(
    (blog) => blog.category.toLowerCase() === category.toLowerCase()
  );
};

export const getRelatedBlogs = async (
  blog: Blog,
  count = 3
): Promise<Blog[]> => {
  const blogs = await loadBlogs();
  return blogs
    .filter(
      (b) =>
        b.id !== blog.id &&
        (b.category === blog.category ||
          b.tags.some((tag) => blog.tags.includes(tag)))
    )
    .slice(0, count);
};

export const getCategories = async (): Promise<BlogCategory[]> => {
  try {
    return await fetchCategories();
  } catch {
    return seedCategories;
  }
};

export const formatPublishedDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
