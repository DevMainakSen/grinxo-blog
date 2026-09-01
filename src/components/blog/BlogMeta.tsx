import type { Blog } from '../../types/blog';
import { formatPublishedDate } from '../../data/blogService';

interface BlogMetaProps {
  blog: Blog;
  variant?: 'default' | 'compact' | 'hero';
}

export default function BlogMeta({ blog, variant = 'default' }: BlogMetaProps) {
  return (
    <div className={`blog-meta blog-meta--${variant}`}>
      {blog.authorAvatar && variant !== 'compact' && (
        <img
          src={blog.authorAvatar}
          alt={blog.author}
          className="blog-meta__avatar"
          width={32}
          height={32}
        />
      )}
      <span className="blog-meta__author">{blog.author}</span>
      <span className="blog-meta__separator" aria-hidden="true">·</span>
      <time className="blog-meta__date" dateTime={blog.publishedAt}>
        {formatPublishedDate(blog.publishedAt)}
      </time>
      <span className="blog-meta__separator" aria-hidden="true">·</span>
      <span className="blog-meta__read-time">{blog.readTime} min read</span>
    </div>
  );
}
