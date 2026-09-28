/**
 * Desktop placement of a section image relative to the section text.
 * `bottom` is the default for every section that has no explicit position.
 * `top` is intentionally not offered.
 */
export type SectionImagePosition = 'left' | 'right' | 'bottom';

/** Canonical, ordered list of valid image positions. Used to validate API input. */
export const SECTION_IMAGE_POSITIONS: readonly SectionImagePosition[] = [
  'left',
  'right',
  'bottom',
] as const;

/** Resolve a persisted/unknown value to a supported position. */
export function resolveImagePosition(value: unknown): SectionImagePosition {
  return SECTION_IMAGE_POSITIONS.includes(value as SectionImagePosition)
    ? (value as SectionImagePosition)
    : 'bottom';
}

export interface BlogSection {
  id: string;
  heading: string;
  content: string;
  image?: string;
  /** Caption below the section image. Stores rich text (HTML) from the editor. */
  imageCaption?: string;
  /** Desktop-only image placement. Absent or unrecognised → 'bottom'. */
  imagePosition?: SectionImagePosition;
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
