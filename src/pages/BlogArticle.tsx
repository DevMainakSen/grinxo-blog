import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from '../components/blog/Header';
import Footer from '../components/blog/Footer';
import BlogMeta from '../components/blog/BlogMeta';
import BlogActions from '../components/blog/BlogActions';
import RelatedBlogs from '../components/blog/RelatedBlogs';
import BlogNotFound from '../components/blog/BlogNotFound';
import NewsletterBanner from '../components/blog/NewsletterBanner';
import { getBlogBySlug, getRelatedBlogs } from '../data/blogService';
import type { Blog } from '../types/blog';

type ArticleState =
  | { status: 'loading'; blog?: never }
  | { status: 'ready'; blog: Blog }
  | { status: 'error'; blog?: never };

const initialState: ArticleState = { status: 'loading' };

export default function BlogArticle() {
  const { slug } = useParams<{ slug: string }>();

  // Scroll to top on slug change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  // Keying the loader by slug remounts it on navigation, resetting its state.
  return <ArticleLoader key={slug ?? 'unknown'} slug={slug} />;
}

function ArticleLoader({ slug }: { slug: string | undefined }) {
  const [state, setState] = useState<ArticleState>(initialState);

  const hasSlug = Boolean(slug);

  useEffect(() => {
    if (!hasSlug) return;
    let cancelled = false;
    getBlogBySlug(slug as string)
      .then((found) => {
        if (cancelled) return;
        setState(found ? { status: 'ready', blog: found } : { status: 'error' });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [hasSlug, slug]);

  if (!hasSlug) {
    return <ArticleShell><BlogNotFound /></ArticleShell>;
  }

  if (state.status !== 'ready') {
    return (
      <ArticleShell>
        {state.status === 'loading' ? null : <BlogNotFound />}
      </ArticleShell>
    );
  }

  const blog = state.blog;
  return <ArticleContent blog={blog} />;
}

function ArticleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrapper">
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  );
}

function ArticleContent({ blog }: { blog: Blog }) {
  const [related, setRelated] = useState<Blog[]>([]);

  useEffect(() => {
    let cancelled = false;
    getRelatedBlogs(blog, 3).then((r) => {
      if (!cancelled) setRelated(r);
    });
    return () => {
      cancelled = true;
    };
  }, [blog]);

  return (
    <div className="page-wrapper">
      <Header />

      <main id="main-content">
        {/* Article Hero */}
        <div className="article-hero">
          <img
            src={blog.featuredImage}
            alt={blog.title}
            className="article-hero__image"
          />
          <div className="article-hero__overlay" aria-hidden="true" />
          <div className="article-hero__content container">
            <nav aria-label="Breadcrumb" className="article-breadcrumb">
              <Link to="/blog" className="article-breadcrumb__link">
                Blog
              </Link>
              <span className="article-breadcrumb__sep" aria-hidden="true">
                /
              </span>
              <span className="article-breadcrumb__current">{blog.category}</span>
            </nav>
            <span className="article-hero__category">{blog.category}</span>
            <h1 className="article-hero__title">{blog.title}</h1>
            <BlogMeta blog={blog} variant="hero" />
            <BlogActions blog={blog} variant="hero" />
          </div>
        </div>

        {/* Article Body */}
        <div className="article-body container">
          <div className="article-layout">
            {/* Main content */}
            <article className="article-content">
              <p className="article-excerpt">{blog.excerpt}</p>

              {/* Rich content — rendered from trusted local seed data */}
              <div
                className="article-prose"
                dangerouslySetInnerHTML={{ __html: blog.content }}
              />

              {/* Tags */}
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

              {/* Back link */}
              <div className="article-back">
                <Link to="/blog" className="article-back__link">
                  ← Back to all articles
                </Link>
              </div>
            </article>

            {/* Sticky sidebar */}
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
                  <dd>{blog.category}</dd>
                  <dt>Read Time</dt>
                  <dd>{blog.readTime} min read</dd>
                </dl>
              </div>
            </aside>
          </div>
        </div>

        {/* Related blogs */}
        {related.length > 0 && (
          <div className="container">
            <RelatedBlogs blogs={related} />
          </div>
        )}

        <NewsletterBanner />
      </main>

      <Footer />
    </div>
  );
}
