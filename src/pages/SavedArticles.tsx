import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/blog/Header';
import Footer from '../components/blog/Footer';
import BlogList from '../components/blog/BlogList';
import { getSavedBlogs } from '../services/blogApi';
import { getClientId } from '../services/clientId';
import type { Blog } from '../types/blog';

export default function SavedArticles() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [error, setError] = useState(false);
  const clientId = useMemo(() => getClientId(), []);

  useEffect(() => {
    let cancelled = false;
    getSavedBlogs(clientId)
      .then((b) => {
        if (!cancelled) setBlogs(b);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [clientId]);

  if (error) {
    return (
      <div className="page-wrapper">
        <Header />
        <main id="main-content">
          <div className="container" style={{ padding: '4rem 0' }}>
            <p style={{ textAlign: 'center' }}>Failed to load saved articles. Please try again.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <Header />
      <main id="main-content">
        <section className="content-section">
          <div className="container">
            <div className="section-header">
              <h1 className="section-title">Saved Articles</h1>
              <Link to="/blog" className="section-view-all">
                <span aria-hidden="true">←</span> Back to home
              </Link>
            </div>

            {blogs.length === 0 && (
              <div className="blog-list-empty" style={{ padding: '3rem 0' }}>
                <p>You haven't saved any articles yet.</p>
                <Link to="/blog" style={{ display: 'inline-block', marginTop: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  Browse articles →
                </Link>
              </div>
            )}

            <BlogList blogs={blogs} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
