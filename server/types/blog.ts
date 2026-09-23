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

export interface SocialShareStory {
  image?: string;
  title?: string;
  text?: string;
  hashtags?: string[];
}

export interface SocialSharePost {
  image?: string;
  caption?: string;
  hashtags?: string[];
}

export interface SocialShareDm {
  text?: string;
}

export interface SocialShareTimeline {
  image?: string;
  title?: string;
  description?: string;
  text?: string;
  hashtags?: string[];
}

export interface SocialShareInstagram {
  story?: SocialShareStory;
  post?: SocialSharePost;
  directMessage?: SocialShareDm;
}

export interface SocialShareFacebook {
  story?: SocialShareStory;
  timeline?: SocialShareTimeline;
}

export interface BlogSocialSharing {
  instagram?: SocialShareInstagram;
  facebook?: SocialShareFacebook;
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
  /** Whether the blog is publicly visible. Independent of `status`: a blog is
   * public only when it is published AND active. Defaults to true when absent. */
  isActive: boolean;
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
  /** Admin-configured per-destination share content (Instagram & Facebook). */
  socialSharing?: BlogSocialSharing;
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
  /** Activity/visibility flag. Missing → treated as `true`. */
  isActive?: boolean;
  /** Intended publication instant (ISO) — set when scheduling. */
  scheduledAt?: string;
  sections?: BlogSection[];
  /** SEO metadata. */
  seo?: BlogSeo;
  /** Per-destination share content. Absent → blog keeps its existing config. */
  socialSharing?: BlogSocialSharing;
}
