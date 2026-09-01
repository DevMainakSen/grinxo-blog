import { Link } from 'react-router-dom';

export default function BlogNotFound() {
  return (
    <div className="blog-not-found">
      <div className="blog-not-found__inner container">
        <div className="blog-not-found__icon" aria-hidden="true">🎈</div>
        <h1 className="blog-not-found__title">Blog Not Found</h1>
        <p className="blog-not-found__message">
          The article you're looking for doesn't exist or may have been removed.
        </p>
        <Link to="/blog" className="blog-not-found__btn">
          ← Back to Blogs
        </Link>
      </div>
    </div>
  );
}
