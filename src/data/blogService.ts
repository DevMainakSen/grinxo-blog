import { blogs, blogCategories } from './blogs';
import type { Blog, BlogCategory } from '../types/blog';

export const getBlogs = (): Blog[] => {
  return blogs;
};

export const getFeaturedBlogs = (): Blog[] => {
  return blogs.filter((blog) => blog.featured);
};

export const getTrendingBlogs = (): Blog[] => {
  return blogs.filter((blog) => blog.trending);
};

export const getBlogBySlug = (slug: string): Blog | undefined => {
  return blogs.find((blog) => blog.slug === slug);
};

export const getBlogsByCategory = (category: string): Blog[] => {
  return blogs.filter(
    (blog) => blog.category.toLowerCase() === category.toLowerCase()
  );
};

export const getRelatedBlogs = (blog: Blog, count = 3): Blog[] => {
  return blogs
    .filter(
      (b) =>
        b.id !== blog.id &&
        (b.category === blog.category ||
          b.tags.some((tag) => blog.tags.includes(tag)))
    )
    .slice(0, count);
};

export const getCategories = (): BlogCategory[] => {
  return blogCategories;
};

export const formatPublishedDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
