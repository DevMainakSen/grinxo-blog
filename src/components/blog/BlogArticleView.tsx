import { Link } from 'react-router-dom';
import type { Blog } from '../../types/blog';
import BlogMeta from './BlogMeta';

interface BlogArticleViewProps {
  blog: Blog;
  /** Optional extra hero content (e.g. BlogActions). Rendered only when interactive. */
  actions?: React.ReactNode;
  /** When false the view is a self-contained preview: no navigation, no actions. */
  interactive?: boolean;
}

/**
 * Shared article renderer used by both the public article page and the admin
 * Preview modal so the preview always matches the live blog styling. Renders the
 * hero, body and sidebar for a single blog; it does NOT include page chrome
 * (Header/Footer) or SEO `<head>` tags — those live in the callers.
 */
export default function BlogArticleView({
  blog,
  actions,
  interactive = true,
}: BlogArticleViewProps) {
  const hasImage = Boolean(blog.featuredImage);
  const category = blog.category?.trim() || 'Article';

  return (
    <>
      {/* Article Hero */}
      <div className="article-hero">
        {hasImage && (
          <img
            src={blog.featuredImage}
            alt={blog.title}
            className="article-hero__image"
          />
        )}
        {hasImage && <div className="article-hero__overlay" aria-hidden="true" />}
        <div className="article-hero__content container">
          <nav aria-label="Breadcrumb" className="article-breadcrumb">
            {interactive ? (
              <>
                <Link to="/blog" className="article-breadcrumb__link">
                  Blog
                </Link>
                <span className="article-breadcrumb__sep" aria-hidden="true">
                  /
                </span>
              </>
            ) : (
              <span className="article-breadcrumb__current">Preview</span>
            )}
            <span className="article-breadcrumb__sep" aria-hidden="true">
              /
            </span>
            <span className="article-breadcrumb__current">{category}</span>
          </nav>
          <span className="article-hero__category">{category}</span>
          <h1 className="article-hero__title">{blog.title || 'Untitled Blog'}</h1>
          <BlogMeta blog={blog} variant="hero" />
          {interactive && actions}
        </div>
      </div>

      {/* Article Body */}
      <div className="article-body container">
        <div className="article-layout">
          {/* Main content */}
          <article className="article-content">
            {blog.excerpt?.trim() ? (
              <p className="article-excerpt">{blog.excerpt}</p>
            ) : null}

            {blog.content?.trim() ? (
              <div
                className="article-prose"
                dangerouslySetInnerHTML={{ __html: blog.content }}
              />
            ) : (
              <p className="article-excerpt article-excerpt--empty">
                No content added yet.
              </p>
            )}

            {blog.tags.length > 0 && (
              <div className="article-tags">
                <span className="article-tags__label">Tags:</span>
                {blog.tags.map((tag) => (
                  <span key={tag} className="article-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {interactive && (
              <div className="article-back">
                <Link to="/blog" className="article-back__link">
                  ← Back to all articles
                </Link>
              </div>
            )}
          </article>

          {/* Sidebar */}
          <aside className="article-sidebar">
            <div className="article-sidebar__card">
              <h3 className="article-sidebar__heading">About the Author</h3>
              {blog.authorAvatar && (
                <img
                  src={blog.authorAvatar}
                  alt={blog.author}
                  className="article-sidebar__avatar"
                  width={56}
                  height={56}
                />
              )}
              <p className="article-sidebar__author">{blog.author}</p>
              <p className="article-sidebar__author-bio">
                Party planning expert and contributor at GrinXO.
              </p>
            </div>

            <div className="article-sidebar__card">
              <h3 className="article-sidebar__heading">Article Details</h3>
              <dl className="article-sidebar__details">
                <dt>Category</dt>
                <dd>{category}</dd>
                <dt>Read Time</dt>
                <dd>{blog.readTime} min read</dd>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
