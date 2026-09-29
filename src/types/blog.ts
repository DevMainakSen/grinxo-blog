/**
 * Desktop placement of a section image relative to the section text.
 * `bottom` is the default for every section that has no explicit position.
 * `top` is intentionally not offered.
 */
export type SectionImagePosition = 'left' | 'right' | 'bottom';

/** Canonical, ordered list of selectable image positions (used by the admin UI). */
export const SECTION_IMAGE_POSITIONS: readonly SectionImagePosition[] = ['left', 'right', 'bottom'] as const;

/** Resolve a persisted/unknown value to a supported position. */
export function resolveImagePosition(value: unknown): SectionImagePosition {
  return SECTION_IMAGE_POSITIONS.includes(value as SectionImagePosition)
    ? (value as SectionImagePosition)
    : 'bottom';
}

/**
 * Which permitted ratio tends to suit each desktop position.
 *
 * This is layout advice only — all four ratios in `ALLOWED_IMAGE_RATIOS`
 * (2:3, 9:16, 16:9, 3:2) are accepted for any position, and enforcement lives
 * in `src/utils/imageValidation.ts`. Images are never cropped or letterboxed.
 */
export const SECTION_IMAGE_ASPECT_GUIDANCE: Record<
  SectionImagePosition,
  { width: number; height: number; label: string; hint: string }
> = {
  left: {
    width: 2,
    height: 3,
    label: '2:3',
    hint: 'Portrait suits a column beside the text. On mobile the image still stacks below the text.',
  },
  right: {
    width: 2,
    height: 3,
    label: '2:3',
    hint: 'Portrait suits a column beside the text. On mobile the image still stacks below the text.',
  },
  bottom: {
    width: 16,
    height: 9,
    label: '16:9',
    hint: 'A wide landscape sits well under the text and matches today’s full-width layout.',
  },
};

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
  /** Whether the blog is publicly visible. Independent of `status`: a blog is
   * public only when it is published AND active. Defaults to true when absent. */
  isActive: boolean;
  /** Intended publication instant (ISO). Set while the blog is scheduled. */
  scheduledAt?: string;
  sections?: BlogSection[];
  /** Aggregated engagement counters (server-persisted). */
  likeCount?: number;
  bookmarkCount?: number;
  /** Client IDs that liked / saved this blog (used to derive local state). */
  likedBy?: string[];
  savedBy?: string[];
  /** SEO metadata for search engines and social sharing. */
  seo?: BlogSeo;
  /** Admin-configured per-destination share content (Instagram & Facebook). */
  socialSharing?: BlogSocialSharing;
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

/** Text shown at the top of an Instagram/facebook Story: optional title line + body text. */
export interface SocialShareStory {
  image?: string;
  title?: string;
  text?: string;
  hashtags?: string[];
}

/** Feed post content (Instagram posts / feed images). */
export interface SocialSharePost {
  image?: string;
  caption?: string;
  hashtags?: string[];
}

/** Free-form message body for an Instagram direct message. */
export interface SocialShareDm {
  text?: string;
}

/** Facebook link share on the Timeline (link preview card). */
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

/**
 * Per-destination, admin-configured share content. Every field is optional —
 * absent values fall back to blog-derived content (SEO/OG values, excerpt, etc.)
 * at share time via the centralized resolver (src/utils/socialShare.ts).
 */
export interface BlogSocialSharing {
  instagram?: SocialShareInstagram;
  facebook?: SocialShareFacebook;
}

export type BlogCategory = {
  name: string;
  count: number;
};

export type BlogStatus = 'draft' | 'scheduled' | 'published';
