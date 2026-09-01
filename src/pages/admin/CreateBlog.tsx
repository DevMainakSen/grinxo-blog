import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import BlogEditor from '../../components/admin/BlogEditor';
import { createBlog } from '../../services/blogApi';
import { toBlogPayload } from '../../utils/blog';
import type { Blog } from '../../types/blog';
import { slugify } from '../../utils/slug';
import { ADMIN_BASE_PATH } from '../../services/config';

export default function CreateBlog() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleSave({ blog, action }: { blog: Blog; action: string }) {
    setSaving(true);
    setSubmitError('');
    try {
      const payload = toBlogPayload({ ...blog, slug: blog.slug || slugify(blog.title) });
      payload.status = action === 'publish' ? 'published' : 'draft';
      const created = await createBlog(payload as never);
      navigate(`${ADMIN_BASE_PATH}/blogs/${created.id}/edit`, {
        replace: true,
        state: { success: action === 'publish' ? 'published' : 'saved' },
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to save blog');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="page-heading">
        <h1 className="page-heading__title">Create New Blog</h1>
        <p className="page-heading__subtitle">
          Start with the banner image, fill in the details, and build your article
          section by section.
        </p>
      </div>
      <BlogEditor
        onSave={handleSave}
        saving={saving}
        submitError={submitError}
      />
    </AdminLayout>
  );
}