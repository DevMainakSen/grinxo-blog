import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../components/blog/Header';
import Footer from '../components/blog/Footer';
import BlogArticleView from '../components/blog/BlogArticleView';
import BlogActions from '../components/blog/BlogActions';
import RelatedBlogs from '../components/blog/RelatedBlogs';
import BlogNotFound from '../components/blog/BlogNotFound';
import NewsletterBanner from '../components/blog/NewsletterBanner';
import { getBlogBySlug, getRelatedBlogs } from '../data/blogService';
import type { Blog } from '../types/blog';
import {
  getSiteBaseUrl,
  resolveCanonicalUrl,
  resolveMetaDescription,
  resolveOgDescription,
  resolveOgImage,
  resolveOgTitle,
  resolveRobots,
  resolveSeoTitle,
} from '../utils/seo';

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

  const baseUrl = getSiteBaseUrl();
  const canonical = resolveCanonicalUrl(blog);
  const ogImage = resolveOgImage(blog);

  // Structured data: Article schema.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: resolveSeoTitle(blog),
    description: resolveMetaDescription(blog),
    image: ogImage || undefined,
    datePublished: blog.publishedAt || undefined,
    dateModified: blog.publishedAt || undefined,
    author: { '@type': 'Person', name: blog.author },
    publisher: { '@type': 'Organization', name: 'GrinXO' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
  };

  // Structured data: BreadcrumbList reflecting the visible navigation.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: `${baseUrl}/blog` },
      { '@type': 'ListItem', position: 2, name: blog.title, item: canonical },
    ],
  };

  return (
    <div className="page-wrapper">
      <Helmet>
        <title>{`${resolveSeoTitle(blog)} | GrinXO`}</title>
        <meta name="description" content={resolveMetaDescription(blog)} />
        <link rel="canonical" href={canonical} />
        <meta name="robots" content={resolveRobots(blog)} />
        <meta name="author" content={blog.author} />

        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={resolveOgTitle(blog)} />
        <meta property="og:description" content={resolveOgDescription(blog)} />
        <meta property="og:url" content={canonical} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:site_name" content="GrinXO" />

        {/* Structured data */}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      <Header />

      <main id="main-content">
        <BlogArticleView
          blog={blog}
          actions={<BlogActions blog={blog} variant="hero" />}
        />

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
