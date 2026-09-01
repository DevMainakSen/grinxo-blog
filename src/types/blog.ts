export interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImage: string;
  author: string;
  authorAvatar?: string;
  publishedAt: string;
  readTime: number; // minutes
  category: string;
  tags: string[];
  featured: boolean;
  trending?: boolean;
}

export type BlogCategory = {
  name: string;
  count: number;
};
