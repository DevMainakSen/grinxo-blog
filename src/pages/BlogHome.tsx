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

export default function BlogHome() {
  const featured = getFeaturedBlogs();
  const trending = getTrendingBlogs();
  const allBlogs = getBlogs();
  const categories = getCategories();

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
