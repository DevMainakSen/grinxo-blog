import type { Blog, BlogSocialSharing, SocialShareFacebook, SocialShareInstagram } from '../types/blog';
import { resolveCanonicalUrl, resolveOgDescription, resolveOgImage, resolveOgTitle } from './seo';

export type SocialPlatform = 'instagram' | 'facebook';
export type SocialMode = 'story' | 'post' | 'dm' | 'timeline';
export type SocialTarget =
  | 'instagram:story'
  | 'instagram:post'
  | 'instagram:dm'
  | 'facebook:story'
  | 'facebook:timeline';

export const SOCIAL_TARGETS: readonly SocialTarget[] = [
  'instagram:story',
  'instagram:post',
  'instagram:dm',
  'facebook:story',
  'facebook:timeline',
];

export const SOCIAL_TARGET_LABELS: Record<SocialTarget, string> = {
  'instagram:story': 'Instagram Story',
  'instagram:post': 'Instagram Post',
  'instagram:dm': 'Instagram Direct Message',
  'facebook:story': 'Facebook Story',
  'facebook:timeline': 'Facebook Timeline',
};

/** Recommended image aspect ratio shown to admins (informational, not enforced). */
export const SOCIAL_TARGET_RATIO: Record<SocialTarget, string> = {
  'instagram:story': '9:16 vertical (1080×1920)',
  'instagram:post': '1:1 square (1080×1080)',
  'instagram:dm': 'No image',
  'facebook:story': '9:16 vertical (1080×1920)',
  'facebook:timeline': '1.91:1 landscape (1200×630)',
};

const PLACEHOLDER_PATTERN = /\{\{\s*(title|url|excerpt)\s*\}\}/g;

/** Default DM payload when no template was configured (generic message + title + URL). */
const DEFAULT_DM_TEMPLATE = [
  'I found this on GrinXO and thought you might like it!',
  '{{title}}',
  '{{url}}',
].join('\n\n');

interface UTM {
  source: string;
  content: string;
}

/**
 * Optional analytics tags appended ONLY to shared URLs (never the canonical URL).
 * This project has no analytics backend; the builder is centralized so it can be
 * enabled/disabled in one place.
 */
const UTM_BY_TARGET: Record<SocialTarget, UTM> = {
  'instagram:story': { source: 'instagram', content: 'story' },
  'instagram:post': { source: 'instagram', content: 'post' },
  'instagram:dm': { source: 'instagram', content: 'dm' },
  'facebook:story': { source: 'facebook', content: 'story' },
  'facebook:timeline': { source: 'facebook', content: 'timeline' },
};

export function targetParts(target: SocialTarget): { platform: SocialPlatform; mode: SocialMode } {
  const [platform, mode] = target.split(':');
  return { platform: platform as SocialPlatform, mode: mode as SocialMode };
}

export function toTarget(platform: SocialPlatform, mode: SocialMode): SocialTarget {
  return `${platform}:${mode}` as SocialTarget;
}

/** Substitute `{{title}}`, `{{url}}` and `{{excerpt}}` placeholders in a share template. */
export function buildSocialText(template: string | undefined | null, blog: Blog, url?: string): string {
  if (!template) return '';
  const shareUrl = url ?? resolveCanonicalUrl(blog);
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
    if (key === 'title') return blog.title;
    if (key === 'url') return shareUrl;
    return blog.excerpt || '';
  }).trim();
}

function instagramOf(blog: Blog): SocialShareInstagram {
  return blog.socialSharing?.instagram ?? {};
}

function facebookOf(blog: Blog): SocialShareFacebook {
  return blog.socialSharing?.facebook ?? {};
}

/** Append hashtags as a trailing line, e.g. caption + "\n\n#tag #tag". */
function joinText(base: string, hashtags: string[]): string {
  if (!hashtags.length) return base;
  const clean = base.trim();
  return clean ? `${clean}\n\n${hashtags.join(' ')}` : hashtags.join(' ');
}

/** Normalize a hashtag input: strip leading #, drop empties, re-prefix with #. */
export function normalizeHashtag(tag: string): string {
  const clean = tag.trim().replace(/^#+/, '').replace(/\s+/g, '');
  return clean ? `#${clean}` : '';
}

export interface ResolvedSocialImage {
  /** Absolute URL of the image to attach, or '' when a destination has none. */
  url: string;
  /** Human-readable label of which source won the fallback chain. */
  source: string;
}

/**
 * Centralized image fallback chains (spec: story/post/timeline spreads).
 *
 * instagram:story → IG story image → FB story image → OG image → featured image
 * instagram:post  → IG post image  → OG image → featured image
 * instagram:dm    → no image
 * facebook:story  → FB story image → IG story image → OG image → featured image
 * facebook:timeline → FB timeline image → OG image → featured image
 */
export function resolveSocialImage(blog: Blog, platform: SocialPlatform, mode: SocialMode): ResolvedSocialImage {
  if (platform === 'instagram' && mode === 'dm') {
    return { url: '', source: 'No image' };
  }
  const ig = instagramOf(blog);
  const fb = facebookOf(blog);
  const og = resolveOgImage(blog);
  const ogSource = og && og !== blog.featuredImage ? 'OG image' : 'Featured image';

  const steps: Array<[string | undefined, string]> =
    platform === 'instagram'
      ? mode === 'story'
        ? [[ig.story?.image, 'Instagram Story image'], [fb.story?.image, 'Facebook Story image'], [og || undefined, ogSource]]
        : [[ig.post?.image, 'Instagram Post image'], [og || undefined, ogSource]]
      : mode === 'story'
        ? [[fb.story?.image, 'Facebook Story image'], [ig.story?.image, 'Instagram Story image'], [og || undefined, ogSource]]
        : [[fb.timeline?.image, 'Facebook Timeline image'], [og || undefined, ogSource]];

  for (const [url, source] of steps) {
    if (url && url.trim()) return { url: url.trim(), source };
  }
  return { url: '', source: 'No image' };
}

/** Hashtags configured for a destination (never auto-derived from keywords/tags). */
export function resolveSocialHashtags(blog: Blog, platform: SocialPlatform, mode: SocialMode): string[] {
  const ig = instagramOf(blog);
  const fb = facebookOf(blog);
  const list =
    platform === 'instagram'
      ? mode === 'story' ? ig.story?.hashtags : mode === 'post' ? ig.post?.hashtags : undefined
      : mode === 'story' ? fb.story?.hashtags : fb.timeline?.hashtags;
  return (list ?? []).map(normalizeHashtag).filter(Boolean);
}

/**
 * The body text actually shared for a destination (placeholders resolved,
 * hashtags NOT yet appended — see getShareContent).
 *
 * instagram:story → configured text → {title}\n\n{excerpt}
 * instagram:post  → configured caption → excerpt → title
 * instagram:dm    → configured message → default template
 * facebook:story  → configured text → title
 * facebook:timeline → configured text → excerpt → title
 */
export function resolveSocialText(blog: Blog, target: SocialTarget, url?: string): string {
  const shareUrl = url ?? resolveCanonicalUrl(blog);
  const ig = instagramOf(blog);
  const fb = facebookOf(blog);

  switch (target) {
    case 'instagram:story': {
      const t = ig.story?.text;
      if (t) return buildSocialText(t, blog, shareUrl);
      return [blog.title, blog.excerpt].filter(Boolean).join('\n\n');
    }
    case 'instagram:post': {
      const t = ig.post?.caption;
      if (t) return buildSocialText(t, blog, shareUrl);
      return blog.excerpt || blog.title;
    }
    case 'instagram:dm':
      return buildSocialText(ig.directMessage?.text || DEFAULT_DM_TEMPLATE, blog, shareUrl);
    case 'facebook:story': {
      const t = fb.story?.text;
      if (t) return buildSocialText(t, blog, shareUrl);
      return blog.title;
    }
    case 'facebook:timeline': {
      const t = fb.timeline?.text;
      if (t) return buildSocialText(t, blog, shareUrl);
      return blog.excerpt || blog.title;
    }
  }
}

/** Title for destinations that surface one (Story title, Timeline card title). */
export function resolveSocialTitle(blog: Blog, target: SocialTarget): string {
  const ig = instagramOf(blog);
  const fb = facebookOf(blog);
  switch (target) {
    case 'instagram:story':
      return buildSocialText(ig.story?.title, blog) || blog.title;
    case 'facebook:timeline':
      return buildSocialText(fb.timeline?.title, blog) || resolveOgTitle(blog);
    default:
      return blog.title;
  }
}

/** Description for the Facebook Timeline link card. */
export function resolveSocialDescription(blog: Blog): string {
  const fb = facebookOf(blog);
  const t = fb.timeline?.description;
  if (t) return buildSocialText(t, blog);
  return resolveOgDescription(blog);
}

/** Share URL for a destination: canonical URL + UTM tags (canonical stays untouched). */
export function buildShareUrl(blog: Blog, target: SocialTarget): string {
  const canonical = resolveCanonicalUrl(blog);
  const utm = UTM_BY_TARGET[target];
  const sep = canonical.includes('?') ? '&' : '?';
  return `${canonical}${sep}utm_source=${utm.source}&utm_medium=social&utm_campaign=blog_share&utm_content=${utm.content}`;
}

export interface SocialShareContent {
  target: SocialTarget;
  /** Share URL for this destination (canonical + UTM). */
  url: string;
  /** Resolved image URL ('' when the destination has none). */
  image: string;
  /** Label of the image source that won the fallback chain. */
  imageSource: string;
  /** Resolved title for destinations that surface one. */
  title: string;
  /** Resolved description for link-card destinations. */
  description: string;
  /** Full share text: placeholders resolved AND hashtags appended (when applicable). */
  text: string;
  /** Normalized configured hashtags (displayed separately in the UI). */
  hashtags: string[];
}

/**
 * Single entry point shared by BOTH the admin live preview and the public share
 * UI (spec: one resolver — no duplicated fallback logic).
 */
export function getShareContent(blog: Blog, target: SocialTarget): SocialShareContent {
  const { platform, mode } = targetParts(target);
  const url = buildShareUrl(blog, target);
  const hashtags = resolveSocialHashtags(blog, platform, mode);
  const text = target === 'instagram:dm' ? resolveSocialText(blog, target, url) : joinText(resolveSocialText(blog, target, url), hashtags);
  const image = resolveSocialImage(blog, platform, mode);
  return {
    target,
    url,
    image: image.url,
    imageSource: image.source,
    title: resolveSocialTitle(blog, target),
    description: target === 'facebook:timeline' ? resolveSocialDescription(blog) : '',
    text,
    hashtags,
  };
}

/** Compact "domain/path" form of a URL for previews (strips UTM noise). */
export function displayShareUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

/** Type guard: does the blog carry any socialSharing config at all? */
export function hasSocialSharingConfig(ss: BlogSocialSharing | undefined): boolean {
  return Boolean(
    ss &&
      (ss.instagram?.story?.text || ss.instagram?.story?.hashtags?.length || ss.instagram?.post?.caption || ss.instagram?.directMessage?.text ||
        ss.facebook?.story?.text || ss.facebook?.timeline?.title || ss.facebook?.timeline?.description || ss.facebook?.timeline?.text),
  );
}