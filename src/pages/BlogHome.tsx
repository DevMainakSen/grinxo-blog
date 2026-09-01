import { useEffect, useState } from 'react';
import Header from '../components/blog/Header';
import Footer from '../components/blog/Footer';
import BlogCarousel from '../components/blog/BlogCarousel';
import BlogList from '../components/blog/BlogList';
import TrendingCard from '../components/blog/TrendingCard';
import CategorySidebar from '../components/blog/CategorySidebar';
import NewsletterBanner from '../components/blog/NewsletterBanner';
import {
  getBlogs,
  getFeaturedBlogs,
  getTrendingBlogs,
  getCategories,
} from '../data/blogService';
import type { Blog, BlogCategory } from '../types/blog';

interface HomeData {
  featured: Blog[];
  trending: Blog[];
  allBlogs: Blog[];
  categories: BlogCategory[];
}

export default function BlogHome() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFeaturedBlogs(),
      getTrendingBlogs(),
      getBlogs(),
      getCategories(),
    ])
      .then(([featured, trending, allBlogs, categories]) => {
        if (cancelled) return;
        setData({ featured, trending, allBlogs, categories });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page-wrapper">
        <Header />
        <main id="main-content">
          <div className="container blog-not-found">
            <div className="blog-not-found__inner">
              <div className="blog-not-found__icon" aria-hidden="true">🎈</div>
              <h1 className="blog-not-found__title">Something went wrong</h1>
              <p className="blog-not-found__message">
                We couldn't load the blog right now. Please try again in a moment.
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-wrapper">
        <Header />
        <main id="main-content"></main>
        <Footer />
      </div>
    );
  }

  const { featured, trending, allBlogs, categories } = data;

  // Latest stories: all blogs sorted by date, most recent first
  const latestStories = [...allBlogs].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <div className="page-wrapper">
      <Header />

      <main id="main-content">
        {/* Featured carousel */}
        <BlogCarousel blogs={featured} />

        {/* Trending section */}
        {trending.length > 0 && (
          <section className="trending-section" aria-labelledby="trending-heading">
            <div className="container">
              <div className="section-header">
                <h2 id="trending-heading" className="section-title">
                  Trending on GrinXO
                </h2>
                <a href="#latest" className="section-view-all">
                  View all <span aria-hidden="true">→</span>
                </a>
              </div>
              <div className="trending-grid">
                {trending.map((blog, i) => (
                  <TrendingCard key={blog.id} blog={blog} rank={i + 1} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Main content: latest stories + sidebar */}
        <section id="latest" className="content-section">
          <div className="container content-layout">
            {/* Latest stories */}
            <div className="content-main">
              <div className="section-header">
                <h2 className="section-title">Latest Stories</h2>
              </div>
              <BlogList blogs={latestStories} />
            </div>

            {/* Sidebar */}
            <aside className="content-sidebar" id="topics">
              <CategorySidebar categories={categories} />
            </aside>
          </div>
        </section>

        {/* Newsletter */}
        <NewsletterBanner />
      </main>

      <Footer />
    </div>
  );
}
