import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  deleteBlog,
  draftBlog,
  getAllBlogs,
  publishBlog,
} from '../../services/blogApi';
import { normalizeBlog } from '../../utils/blog';
import type { Blog, BlogStatus } from '../../types/blog';
import { formatDate, formatScheduledAt } from '../../utils/date';
import { ADMIN_BASE_PATH } from '../../services/config';

const NEW_PATH = `${ADMIN_BASE_PATH}/blogs/new`;
const editPath = (id: string) => `${ADMIN_BASE_PATH}/blogs/${id}/edit`;

type StatusFilter = 'all' | BlogStatus;

function statusTime(blog: Blog): number {
  const t = new Date(blog.scheduledAt || blog.publishedAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Lightweight SEO status from configured metadata (not a ranking score). */
function seoStatus(blog: Blog): { optimized: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!blog.seo?.seoTitle) missing.push('SEO title');
  if (!blog.seo?.metaDescription) missing.push('Meta description');
  if (!blog.seo?.focusKeyword) missing.push('Focus keyword');
  return { optimized: missing.length === 0, missing };
}

export default function BlogDashboard() {
  const location = useLocation();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<Blog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(
    (location.state as { toast?: string } | null)?.toast ?? null
  );

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    getAllBlogs()
      .then((data) => {
        if (cancelled) return;
        setBlogs(data.map(normalizeBlog));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load blogs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(blogs.map((b) => b.category))].sort(),
    [blogs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blogs
      .filter((b) => (statusFilter === 'all' ? true : b.status === statusFilter))
      .filter((b) => (categoryFilter === 'all' ? true : b.category === categoryFilter))
      .filter((b) =>
        q
          ? b.title.toLowerCase().includes(q) ||
            b.author.toLowerCase().includes(q) ||
            b.tags.some((t) => t.toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => statusTime(b) - statusTime(a));
  }, [blogs, search, statusFilter, categoryFilter]);

  async function toggleStatus(blog: Blog) {
    setBusyId(blog.id);
    setError('');
    try {
      const next = await (blog.status === 'published'
        ? draftBlog(blog.id)
        : publishBlog(blog.id));
      setBlogs((prev) => prev.map((b) => (b.id === blog.id ? normalizeBlog(next) : b)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError('');
    try {
      await deleteBlog(deleteTarget.id);
      setBlogs((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout>
      {toast && (
        <div className="toast toast--success" role="status" aria-live="polite">
          {toast}
          <button
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
          >
            ✕
          </button>
        </div>
      )}
      <div className="dashboard">
        <div className="dashboard__topbar">
          <div>
            <h1 className="dashboard__title">Manage Blog Articles</h1>
            <p className="dashboard__subtitle">
              {blogs.length} article{blogs.length === 1 ? '' : 's'}
            </p>
          </div>
          <Link to={NEW_PATH} className="btn btn--primary">
            <span aria-hidden="true">＋</span> Add New Blog
          </Link>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="dashboard__toolbar">
          <input
            type="search"
            className="field__input dashboard__search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search blogs"
          />
          <select
            className="field__input dashboard__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>
          <select
            className="field__input dashboard__select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="dashboard__state">
            <span className="spinner spinner--lg" aria-hidden="true" />
            <p>Loading blogs…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="dashboard__state">
            <div className="dashboard__state-icon" aria-hidden="true">📄</div>
            <p>
              No blogs match your filters.
              {blogs.length === 0 ? ' Create your first article.' : ''}
            </p>
            {blogs.length === 0 && (
              <Link to={NEW_PATH} className="btn btn--primary btn--sm">
                ＋ Add New Blog
              </Link>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="blog-table">
              <thead>
                <tr>
                  <th scope="col" className="blog-table__col-thumb">Image</th>
                  <th scope="col">Blog Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">SEO</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="blog-table__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((blog) => (
                  <tr key={blog.id}>
                    <td>
                      <Link to={editPath(blog.id)} className="blog-table__thumb-link">
                        <img
                          src={blog.featuredImage}
                          alt={blog.title}
                          className="blog-table__thumb"
                          loading="lazy"
                        />
                      </Link>
                    </td>
                    <td>
                      <Link to={editPath(blog.id)} className="blog-table__title">
                        {blog.title}
                      </Link>
                      <div className="blog-table__meta">
                        by {blog.author}
                        {blog.featured && <span className="badge badge--featured">Featured</span>}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--category">{blog.category}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`status-pill status-pill--${blog.status}`}
                        onClick={() => void toggleStatus(blog)}
                        disabled={busyId === blog.id}
                        title={
                          blog.status === 'published'
                            ? 'Move to draft'
                            : blog.status === 'scheduled'
                              ? 'Publish now'
                              : 'Publish now'
                        }
                      >
                        {blog.status === 'published'
                          ? 'Published'
                          : blog.status === 'scheduled'
                            ? 'Scheduled'
                            : 'Draft'}
                      </button>
                    </td>
                    <td>
                      <span className="seo-status">
                        {seoStatus(blog).optimized ? (
                          <span className="seo-status__ok" title="Recommended SEO metadata configured">
                            ✓ Optimized
                          </span>
                        ) : (
                          <span
                            className="seo-status__warn"
                            title={`Missing: ${seoStatus(blog).missing.join(', ')}`}
                          >
                            ⚠ Needs attention
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="blog-table__date">
                      {blog.status === 'scheduled'
                        ? formatScheduledAt(blog.scheduledAt ?? '', 'Asia/Kolkata', 'IST')
                        : formatDate(blog.publishedAt ?? '')}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={editPath(blog.id)} className="btn btn--ghost btn--sm">
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="btn btn--danger-ghost btn--sm"
                          onClick={() => setDeleteTarget(blog)}
                          disabled={busyId === blog.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title" className="modal__title">
              Delete this article?
            </h2>
            <p className="modal__text">
              "{deleteTarget.title}" will be removed from the admin panel, the
              public blog, and <code>blogs.json</code>. This cannot be undone.
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={busyId === deleteTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void confirmDelete()}
                disabled={busyId === deleteTarget.id}
              >
                {busyId === deleteTarget.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
