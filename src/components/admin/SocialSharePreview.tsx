import type { SocialShareContent, SocialTarget } from '../../utils/socialShare';
import { SOCIAL_TARGET_LABELS, displayShareUrl } from '../../utils/socialShare';

interface SocialSharePreviewProps {
  target: SocialTarget;
  content: SocialShareContent;
}

/**
 * Live, read-only preview of a social share destination. It renders the exact
 * resolved content the share feature will use (same resolver, same fallbacks).
 * It is a schematic approximation — not a reproduction of any platform's UI.
 */
export default function SocialSharePreview({ target, content }: SocialSharePreviewProps) {
  return (
    <div className="social-preview">
      <span className="social-preview__label">
        {SOCIAL_TARGET_LABELS[target]} preview
      </span>
      <PreviewFrame target={target} content={content} />
    </div>
  );
}

function PreviewFrame({ target, content }: SocialSharePreviewProps) {
  const [, mode] = target.split(':') as [string, 'story' | 'post' | 'dm' | 'timeline'];
  if (mode === 'story') return <StoryFrame content={content} />;
  if (mode === 'post') return <PostFrame content={content} />;
  if (mode === 'dm') return <DmFrame content={content} />;
  return <TimelineFrame content={content} />;
}

function canShowImage(url: string | undefined): boolean {
  return Boolean(url && url.trim());
}

function StoryFrame({ content }: { content: SocialShareContent }) {
  const image = canShowImage(content.image);
  return (
    <div
      className={`social-preview__story${image ? '' : ' social-preview__story--empty'}`}
      style={image ? { backgroundImage: `url(${content.image})` } : undefined}
    >
      <div className="social-preview__story-text">
        {content.title && <p className="social-preview__story-title">{content.title}</p>}
        <p className="social-preview__story-body">{content.text || 'No story text'}</p>
      </div>
    </div>
  );
}

function PostFrame({ content }: { content: SocialShareContent }) {
  const image = canShowImage(content.image);
  return (
    <div className={`social-preview__post${image ? '' : ' social-preview__post--empty'}`}>
      <div
        className="social-preview__post-media"
        style={image ? { backgroundImage: `url(${content.image})` } : undefined}
      >
        {!image && <span className="social-preview__placeholder-tag">No image</span>}
      </div>
      <p className="social-preview__post-caption">
        {content.text || 'No caption'}
      </p>
    </div>
  );
}

function DmFrame({ content }: { content: SocialShareContent }) {
  return (
    <div className="social-preview__dm">
      <p className="social-preview__dm-sender">Direct message</p>
      <pre className="social-preview__dm-body">{content.text || 'No message'}</pre>
    </div>
  );
}

function TimelineFrame({ content }: { content: SocialShareContent }) {
  const image = canShowImage(content.image);
  return (
    <div className="social-preview__timeline">
      <div
        className={`social-preview__timeline-media${image ? '' : ' social-preview__timeline-media--empty'}`}
        style={image ? { backgroundImage: `url(${content.image})` } : undefined}
      >
        {!image && <span className="social-preview__placeholder-tag">No image</span>}
      </div>
      <div className="social-preview__timeline-body">
        <p className="social-preview__timeline-title">{content.title || 'Untitled'}</p>
        <p className="social-preview__timeline-desc">{content.description || 'No description'}</p>
        <p className="social-preview__timeline-site">{displayShareUrl(content.url)}</p>
      </div>
    </div>
  );
}