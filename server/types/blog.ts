export interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string;
  imageCaption?: string;
}

export interface BlogSeo {
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  secondaryKeywords?: string[];
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
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
  status: BlogStatus;
  /** Intended publication instant (ISO). Set while the blog is scheduled. */
  scheduledAt?: string;
  sections: BlogSection[];
  /** Aggregated engagement counters (server-persisted). */
  likeCount?: number;
  bookmarkCount?: number;
  /** Client IDs that liked / saved this blog (server-persisted). Defaults to []. */
  likedBy?: string[];
  savedBy?: string[];
  /** SEO metadata for search engines and social sharing. */
  seo?: BlogSeo;
}

export type BlogStatus = 'draft' | 'scheduled' | 'published';

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
  /** Intended publication instant (ISO) — set when scheduling. */
  scheduledAt?: string;
  sections?: BlogSection[];
  /** SEO metadata. */
  seo?: BlogSeo;
}
