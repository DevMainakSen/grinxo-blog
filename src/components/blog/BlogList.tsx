import type { Blog } from '../../types/blog';
import BlogCard from './BlogCard';

interface BlogListProps {
  blogs: Blog[];
  title?: string;
}

export default function BlogList({ blogs, title }: BlogListProps) {
  if (blogs.length === 0) {
    return (
      <div className="blog-list-empty">
        <p>No articles found.</p>
      </div>
    );
  }

  return (
    <section className="blog-list-section">
      {title && <h2 className="blog-list-section__title">{title}</h2>}
      <div className="blog-list">
        {blogs.map((blog) => (
          <BlogCard key={blog.id} blog={blog} />
        ))}
      </div>
    </section>
  );
}
