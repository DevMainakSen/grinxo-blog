import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import BlogEditor from '../../components/admin/BlogEditor';
import { getBlog, updateBlog } from '../../services/blogApi';
import { normalizeBlog, toBlogPayload } from '../../utils/blog';
import type { Blog } from '../../types/blog';
import type { EditorAction } from '../../components/admin/BlogEditor';
import { ADMIN_BASE_PATH } from '../../services/config';

const BLOGS_PATH = `${ADMIN_BASE_PATH}/blogs`;

interface SuccessState {
  success?: 'published' | 'saved';
}

export default function EditBlog() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const successState = (location.state as SuccessState | null)?.success;

  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toast, setToast] = useState(successState);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBlog(id)
      .then((b) => {
        if (cancelled) return;
        setBlog(normalizeBlog(b));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load blog');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave({ blog: target, action }: { blog: Blog; action: EditorAction }) {
    if (!id) return;
    setSaving(true);
    setSubmitError('');
    try {
      const payload = toBlogPayload(target);
      payload.status = target.status ?? 'draft';
      const updated = await updateBlog(id, payload as never);
      if (action === 'publish') {
        navigate(BLOGS_PATH, {
          replace: true,
          state: { toast: 'Article published and now live on the public blog.' },
        });
      } else if (action === 'schedule') {
        navigate(BLOGS_PATH, {
          replace: true,
          state: {
            toast: `Article scheduled to publish ${target.scheduledAt ? `for ${new Date(target.scheduledAt).toLocaleString('en-IN')}` : ''}.`,
          },
        });
      } else {
        setBlog(normalizeBlog(updated));
        setToast('saved');
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to save blog');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="dashboard__state">
          <span className="spinner spinner--lg" aria-hidden="true" />
          <p>Loading article…</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !blog) {
    return (
      <AdminLayout>
        <div className="page-heading">
          <h1 className="page-heading__title">Article not found</h1>
          <p className="page-heading__subtitle">
            {error || "We couldn't find that article."}
          </p>
          <Link to={BLOGS_PATH} className="btn btn--primary btn--sm">
            ← Back to dashboard
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {toast && (
        <div className={`toast toast--${toast === 'published' ? 'success' : 'success'}`} role="status">
          {toast === 'published'
            ? 'Article published and now live on the public blog.'
            : 'Changes saved as a draft.'}
        </div>
      )}

      <div className="page-heading">
        <div className="page-heading__row">
          <h1 className="page-heading__title">Edit Blog</h1>
          <Link to={`/blog/${blog.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
            View public →
          </Link>
        </div>
        <p className="page-heading__subtitle">{blog.title}</p>
      </div>

      <BlogEditor
        initial={blog}
        onSave={handleSave}
        saving={saving}
        submitError={submitError}
      />
    </AdminLayout>
  );
}
