import { Link } from 'react-router-dom';
import type { Blog } from '../../types/blog';
import { formatPublishedDate } from '../../data/blogService';

interface RelatedBlogsProps {
  blogs: Blog[];
}

export default function RelatedBlogs({ blogs }: RelatedBlogsProps) {
  if (blogs.length === 0) return null;

  return (
    <section className="related-blogs">
      <h2 className="related-blogs__heading">You Might Also Like</h2>
      <div className="related-blogs__grid">
        {blogs.map((blog) => (
          <article key={blog.id} className="related-blog-card">
            <Link to={`/blog/${blog.slug}`} className="related-blog-card__image-link">
              <div className="related-blog-card__image-wrapper">
                <img
                  src={blog.featuredImage}
                  alt={blog.title}
                  className="related-blog-card__image"
                  loading="lazy"
                />
              </div>
            </Link>
            <div className="related-blog-card__body">
              <span className="related-blog-card__category">{blog.category}</span>
              <h3 className="related-blog-card__title">
                <Link to={`/blog/${blog.slug}`} className="related-blog-card__title-link">
                  {blog.title}
                </Link>
              </h3>
              <time className="related-blog-card__date" dateTime={blog.publishedAt}>
                {formatPublishedDate(blog.publishedAt)}
              </time>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
