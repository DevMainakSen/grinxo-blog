interface SeoPreviewProps {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  featuredImage?: string;
}

const SITE_NAME = 'GrinXO';
const SITE_URL = 'grinxo.com';

export default function SeoPreview({
  seoTitle,
  metaDescription,
  slug,
  ogImage,
  ogTitle,
  ogDescription,
  featuredImage,
}: SeoPreviewProps) {
  const displayTitle = seoTitle || 'Blog Title';
  const displayDesc = metaDescription || 'Meta description will appear here...';
  const displayUrl = `${SITE_URL}/blog/${slug || 'your-slug'}`;
  const socialTitle = ogTitle || seoTitle || 'Blog Title';
  const socialDesc = ogDescription || metaDescription || 'Description appears here...';
  const socialImage = ogImage || featuredImage;

  return (
    <div className="seo-preview">
      {/* Google search preview */}
      <div className="seo-preview__section">
        <h4 className="seo-preview__label">Google Search Preview</h4>
        <div className="seo-preview__google">
          <div className="seo-preview__google-site">{SITE_NAME}</div>
          <div className="seo-preview__google-title">{displayTitle}</div>
          <div className="seo-preview__google-url">{displayUrl}</div>
          <div className="seo-preview__google-desc">{displayDesc}</div>
        </div>
      </div>

      {/* Social sharing preview */}
      <div className="seo-preview__section">
        <h4 className="seo-preview__label">Social Preview</h4>
        <div className="seo-preview__social">
          {socialImage && (
            <div className="seo-preview__social-image">
              <img src={socialImage} alt="" />
            </div>
          )}
          <div className="seo-preview__social-body">
            <div className="seo-preview__social-title">{socialTitle}</div>
            <div className="seo-preview__social-desc">{socialDesc}</div>
            <div className="seo-preview__social-site">{SITE_URL}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
