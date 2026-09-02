import { useEffect, useMemo, useState } from 'react';
import { getAllBlogs } from '../../services/blogApi';
import type { Blog } from '../../types/blog';

interface BlogSelectorProps {
  onSelect: (blog: Blog) => void;
  onCancel: () => void;
}

export default function BlogSelector({ onSelect, onCancel }: BlogSelectorProps) {
  const [blogs, setBlogs] = useState<Blog[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAllBlogs()
      .then((list) => {
        if (!cancelled) setBlogs(list);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load blog articles. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!blogs) return [];
    const q = query.trim().toLowerCase();
    return blogs
      .filter((b) => !q || b.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => Number(b.status === 'published') - Number(a.status === 'published'))
      .slice(0, 50);
  }, [blogs, query]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal modal--wide bs-modal" role="dialog" aria-modal="true" aria-label="Select blog article">
        <div className="bs-modal__header">
          <h3 className="modal__title">Select Blog Article</h3>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close" title="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="field bs-modal__search">
          <label className="field__label" htmlFor="bs-search">Search blogs</label>
          <input
            id="bs-search"
            className="field__input"
            type="search"
            placeholder="Search by title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {error && <p className="bs-modal__error">{error}</p>}

        {blogs === null && !error && (
          <div className="dashboard__state">
            <div className="spinner" aria-hidden="true" />
            <p>Loading articles…</p>
          </div>
        )}

        {blogs && filtered.length === 0 && (
          <p className="bs-modal__empty">No articles match your search.</p>
        )}

        <ul className="bs-modal__list">
          {filtered.map((blog) => (
            <li key={blog.id}>
              <button type="button" className="bs-modal__item" onClick={() => onSelect(blog)}>
                {blog.thumbnail || blog.featuredImage ? (
                  <span className="bs-modal__thumb">
                    <img src={blog.thumbnail || blog.featuredImage} alt="" />
                  </span>
                ) : (
                  <span className="bs-modal__thumb bs-modal__thumb--empty" aria-hidden="true">
                    🖼
                  </span>
                )}
                <span className="bs-modal__info">
                  <span className="bs-modal__title">{blog.title}</span>
                  <span className="bs-modal__meta">
                    {blog.category}
                    {blog.category ? ' • ' : ''}
                    <span className={blog.status === 'published' ? 'status-pill status-pill--published' : 'status-pill status-pill--draft'}>
                      {blog.status === 'published' ? 'Published' : 'Draft'}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}