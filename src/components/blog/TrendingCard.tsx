import { Link } from 'react-router-dom';
import type { Blog } from '../../types/blog';

interface TrendingCardProps {
  blog: Blog;
  rank: number;
}

export default function TrendingCard({ blog, rank }: TrendingCardProps) {
  return (
    <article className="trending-card">
      <Link to={`/blog/${blog.slug}`} className="trending-card__image-link">
        <div className="trending-card__image-wrapper">
          <img
            src={blog.featuredImage}
            alt={blog.title}
            className="trending-card__image"
            loading="lazy"
          />
          {/* Rank badge — solid bubble on the top-right corner of the image */}
          <span className="trending-card__rank" aria-label={`Trending #${rank}`}>
            #{rank}
          </span>
        </div>
      </Link>
      <div className="trending-card__body">
        <span className="trending-card__category">{blog.category}</span>
        <h3 className="trending-card__title">
          <Link to={`/blog/${blog.slug}`} className="trending-card__title-link">
            {blog.title}
          </Link>
        </h3>
      </div>
    </article>
  );
}
