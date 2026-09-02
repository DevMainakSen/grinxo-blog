import { useMemo, useState } from 'react';
import type { Blog, BlogSection } from '../../types/blog';
import ImagePicker from './ImagePicker';
import SectionBuilder from './SectionBuilder';
import SchedulePublishModal, {
  type ScheduleValue,
} from './SchedulePublishModal';
import { formatScheduledAt, toDateInputValue } from '../../utils/date';
import { slugify } from '../../utils/slug';

export type EditorAction = 'save_draft' | 'publish' | 'schedule';

export interface BlogEditorProps {
  initial?: Blog;
  onSave: (payload: {
    blog: Blog;
    action: EditorAction;
  }) => Promise<void>;
  saving: boolean;
  submitError?: string;
  presets?: {
    title?: string;
    publishedAt?: string;
  };
}

function blankSection(): BlogSection {
  return { id: `section-${Date.now().toString(36)}`, heading: '', content: '' };
}

export default function BlogEditor({
  initial,
  onSave,
  saving,
  submitError,
  presets,
}: BlogEditorProps) {
  const [draft, setDraft] = useState<Blog>(() =>
    buildInitial(initial, presets)
  );
  const [slugTouched, setSlugTouched] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedError, setSchedError] = useState('');

  const isEdit = Boolean(initial);
  const isScheduled = draft.status === 'scheduled';

  function set<K extends keyof Blog>(key: K, value: Blog[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function autoSlug(value: string) {
    if (slugTouched) return;
    set('slug', slugify(value));
  }

  const categories = useMemo(
    () => defaultCategories(),
    []
  );

  function toAction(action: EditorAction): Blog {
    // Save actions persist edits. A scheduled blog that is merely saved keeps
    // its schedule; everything else is captured as a draft (publish handled below).
    if (draft.status === 'scheduled') return { ...draft, status: 'scheduled' };
    if (action === 'publish') return { ...draft, status: 'published' };
    return { ...draft, status: 'draft' };
  }

  async function handleSave(action: EditorAction) {
    setSchedError('');
    if (action === 'schedule') {
      setShowSchedule(true);
      return;
    }
    await onSave({ blog: toAction(action), action: action === 'publish' ? 'publish' : 'save_draft' });
  }

  async function handleSchedule(value: ScheduleValue) {
    setSchedError('');
    try {
      await onSave({
        blog: { ...draft, status: 'scheduled', scheduledAt: value.iso },
        action: 'schedule',
      });
      setShowSchedule(false);
    } catch (e) {
      setSchedError(e instanceof Error ? e.message : 'Failed to schedule publish');
    }
  }

  async function handleCancelSchedule() {
    setSchedError('');
    try {
      await onSave({ blog: { ...draft, status: 'draft', scheduledAt: undefined }, action: 'save_draft' });
    } catch (e) {
      setSchedError(e instanceof Error ? e.message : 'Failed to cancel schedule');
    }
  }

  return (
    <form
      className="blog-editor"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="blog-editor__grid">
        {/* Left column */}
        <div className="blog-editor__main">
          {/* Banner */}
          <section className="editor-card">
            <h2 className="editor-card__title">Blog Thumbnail / Banner</h2>
            <p className="editor-card__hint">
              The primary image shown on cards and the article hero.
            </p>
            <ImagePicker
              label="Choose a banner image"
              folder="banners"
              value={draft.featuredImage}
              onChange={(url) => set('featuredImage', url ?? '')}
              className="image-picker--banner"
            />
          </section>

          {/* Title & metadata */}
          <section className="editor-card">
            <h2 className="editor-card__title">Blog Details</h2>
            <div className="field">
              <label className="field__label" htmlFor="title">Title</label>
              <input
                id="title"
                className="field__input"
                value={draft.title}
                onChange={(e) => {
                  set('title', e.target.value);
                  autoSlug(e.target.value);
                }}
                placeholder="e.g. 10 Fun Birthday Party Themes"
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="slug">Slug</label>
              <input
                id="slug"
                className="field__input"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value);
                }}
                placeholder="e.g. 10-fun-birthday-party-themes"
              />
              <p className="field__hint">Auto-generated from the title; edit freely.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="excerpt">Excerpt</label>
              <textarea
                id="excerpt"
                className="field__textarea"
                rows={3}
                value={draft.excerpt}
                onChange={(e) => set('excerpt', e.target.value)}
                placeholder="A short summary shown on cards."
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field__label" htmlFor="author">Author</label>
                <input
                  id="author"
                  className="field__input"
                  value={draft.author}
                  onChange={(e) => set('author', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="category">Category</label>
                <input
                  id="category"
                  className="field__input"
                  list="category-options"
                  value={draft.category}
                  onChange={(e) => set('category', e.target.value)}
                />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field__label" htmlFor="publishedAt">Published date</label>
                <input
                  id="publishedAt"
                  type="date"
                  className="field__input"
                  value={toDateInputValue(draft.publishedAt)}
                  onChange={(e) => set('publishedAt', new Date(e.target.value).toISOString())}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="tags">Tags</label>
                <input
                  id="tags"
                  className="field__input"
                  value={draft.tags.join(', ')}
                  onChange={(e) =>
                    set(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="comma, separated"
                />
              </div>
            </div>

            <div className="field-row field-row--toggles">
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  onChange={(e) => set('featured', e.target.checked)}
                />
                <span>Featured</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.trending ?? false}
                  onChange={(e) => set('trending', e.target.checked)}
                />
                <span>Trending</span>
              </label>
            </div>
          </section>
        </div>

        {/* Right column: status summary */}
        <aside className="blog-editor__sidebar">
          <section className="editor-card">
            <h2 className="editor-card__title">Status</h2>
            {isScheduled && draft.scheduledAt ? (
              <>
                <p className="publish-status">
                  This article is scheduled to publish automatically.
                </p>
                <p className="publish-status publish-status--scheduled">
                  Scheduled for{' '}
                  <strong>
                    {formatScheduledAt(draft.scheduledAt, 'Asia/Kolkata', 'IST')}
                  </strong>
                </p>
                {isEdit && (
                  <button
                    type="button"
                    className="btn btn--danger-ghost btn--sm publish-cancel"
                    onClick={() => void handleCancelSchedule()}
                    disabled={saving}
                  >
                    Cancel schedule
                  </button>
                )}
              </>
            ) : (
              <p className="publish-status">
                {draft.status === 'published'
                  ? 'This article is currently published and visible on the public blog.'
                  : 'This article is a draft and will not appear publicly until you publish it.'}
              </p>
            )}
            {isEdit && (
              <p className="publish-status publish-status--hint">
                Current status: <strong>{draft.status}</strong>
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* Sections */}
      <SectionBuilder
        sections={draft.sections ?? []}
        onChange={(sections) => set('sections', sections)}
      />

      {submitError && <div className="alert alert--error">{submitError}</div>}

      <div className="editor-actions">
        <div className="editor-actions__group">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void handleSave('save_draft')}
            disabled={saving}
          >
            {saving ? 'Saving…' : isScheduled ? 'Save changes' : 'Save Draft'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void handleSave('schedule')}
            disabled={saving}
          >
            {isScheduled ? 'Update Schedule' : 'Schedule Publish'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleSave('publish')}
            disabled={saving}
          >
            Publish Now
          </button>
        </div>
      </div>

      {showSchedule && (
        <SchedulePublishModal
          initialScheduledAt={draft.scheduledAt}
          title={draft.title}
          saving={saving}
          error={schedError}
          onCancel={() => {
            setShowSchedule(false);
            setSchedError('');
          }}
          onConfirm={(value) => void handleSchedule(value)}
        />
      )}
    </form>
  );
}

function buildInitial(initial?: Blog, presets?: BlogEditorProps['presets']): Blog {
  if (initial) {
    return {
      ...initial,
      featuredImage: initial.featuredImage || initial.thumbnail || '',
      sections: initial.sections ?? [],
      status: initial.status ?? 'draft',
      scheduledAt: initial.scheduledAt,
      publishedAt: initial.publishedAt ?? new Date().toISOString(),
      featured: initial.featured ?? false,
      tags: initial.tags ?? [],
    };
  }
  return {
    id: '',
    title: presets?.title ?? '',
    slug: '',
    excerpt: '',
    featuredImage: '',
    content: '',
    author: 'GrinXO Team',
    publishedAt: presets?.publishedAt ?? new Date().toISOString(),
    readTime: 1,
    category: '',
    tags: [],
    featured: false,
    status: 'draft' as const,
    sections: [blankSection()],
  };
}

function defaultCategories(): string[] {
  return [
    'Party Themes',
    'First Birthday',
    'Decorations',
    'Party Games',
    'Party Favours',
    'Planning',
    'Photography',
    'Traditions',
    'Catering',
  ];
}