export interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string;
  imageCaption?: string;
}

export interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  thumbnail?: string;
  content: string;
  featuredImage: string;
  author: string;
  authorAvatar?: string;
  publishedAt: string;
  readTime: number;
  category: string;
  tags: string[];
  featured: boolean;
  trending?: boolean;
  status: 'draft' | 'published';
  sections: BlogSection[];
}

export type BlogStatus = Blog['status'];

export interface BlogCategory {
  name: string;
  count: number;
}

/**
 * Shape accepted when creating/updating a blog. `content` is optional because
 * it is derived from `sections` when not supplied; `featuredImage` may be sent
 * as `thumbnail`.
 */
export interface BlogInput {
  title: string;
  slug: string;
  excerpt: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  authorAvatar?: string;
  publishedAt?: string;
  readTime?: number;
  category: string;
  tags?: string[];
  featured?: boolean;
  trending?: boolean;
  status?: BlogStatus;
  sections?: BlogSection[];
}
