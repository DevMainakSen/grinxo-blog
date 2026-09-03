import { Link } from 'react-router-dom';
import type { Blog } from '../../types/blog';
import BlogMeta from './BlogMeta';
import BlogActions from './BlogActions';

interface BlogCardProps {
  blog: Blog;
  variant?: 'default' | 'featured';
}

export default function BlogCard({ blog, variant = 'default' }: BlogCardProps) {
  return (
    <article className={`blog-card blog-card--${variant}`}>
      <Link
        to={`/blog/${blog.slug}`}
        className="blog-card__image-link"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="blog-card__image-wrapper">
          <img
            src={blog.thumbnail || blog.featuredImage}
            alt={blog.title}
            className="blog-card__image"
            loading="lazy"
          />
          <span className="blog-card__category">{blog.category}</span>
        </div>
      </Link>

      <div className="blog-card__body">
        <BlogMeta blog={blog} variant="compact" />

        <h2 className="blog-card__title">
          <Link to={`/blog/${blog.slug}`} className="blog-card__title-link">
            {blog.title}
          </Link>
        </h2>

        <p className="blog-card__excerpt">{blog.excerpt}</p>

        <div className="blog-card__footer">
          <Link to={`/blog/${blog.slug}`} className="blog-card__read-more">
            Read Article
            <span className="blog-card__arrow" aria-hidden="true">→</span>
          </Link>

          <BlogActions blog={blog} variant="icon" />
        </div>
      </div>
    </article>
  );
}
