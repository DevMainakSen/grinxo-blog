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
  /** Alias for featuredImage — used by the admin panel. */
  thumbnail?: string;
  /** HTML body. For seed blogs this is raw HTML; for admin-created blogs it is derived from sections. */
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
  /** Present on blogs served from the backend; optional for bundled seed fallback. */
  status?: BlogStatus;
  /** Intended publication instant (ISO). Set while the blog is scheduled. */
  scheduledAt?: string;
  sections?: BlogSection[];
  /** Aggregated engagement counters (server-persisted). */
  likeCount?: number;
  bookmarkCount?: number;
  /** Client IDs that liked / saved this blog (used to derive local state). */
  likedBy?: string[];
  savedBy?: string[];
}

export type BlogCategory = {
  name: string;
  count: number;
};

export type BlogStatus = 'draft' | 'scheduled' | 'published';
