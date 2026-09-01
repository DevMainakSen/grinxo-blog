import type { BlogSection } from '../../types/blog';
import ImagePicker from './ImagePicker';

interface SectionBuilderProps {
  sections: BlogSection[];
  onChange: (sections: BlogSection[]) => void;
}

function newSection(id: string): BlogSection {
  return { id, heading: '', content: '', image: undefined, imageCaption: '' };
}

function nextSectionId(sections: BlogSection[]): string {
  return `section-${Date.now().toString(36)}-${sections.length + 1}`;
}

export default function SectionBuilder({ sections, onChange }: SectionBuilderProps) {
  function updateSection(id: string, patch: Partial<BlogSection>) {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSection(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }

  function moveSection(index: number, delta: -1 | 1) {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  function addSection() {
    onChange([...sections, newSection(nextSectionId(sections))]);
  }

  return (
    <div className="section-builder" data-testid="section-builder">
      <div className="section-builder__header">
        <h3 className="section-builder__title">Article Content</h3>
        <span className="section-builder__count">
          {sections.length} section{sections.length === 1 ? '' : 's'}
        </span>
      </div>

      {sections.length === 0 && (
        <div className="section-builder__empty">
          <p>No sections yet. Add one to start building your article.</p>
        </div>
      )}

      {sections.map((section, index) => (
        <div className="section-card" key={section.id} data-testid={`section-${index}`}>
          <div className="section-card__topbar">
            <span className="section-card__index">Section {index + 1}</span>
            <div className="section-card__controls">
              <button
                type="button"
                className="icon-btn"
                onClick={() => moveSection(index, -1)}
                disabled={index === 0}
                aria-label={`Move section ${index + 1} up`}
                title="Move up"
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => moveSection(index, 1)}
                disabled={index === sections.length - 1}
                aria-label={`Move section ${index + 1} down`}
                title="Move down"
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                onClick={() => removeSection(section.id)}
                aria-label={`Delete section ${index + 1}`}
                title="Delete section"
              >
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
          </div>

          <div className="section-card__fields">
            <label className="field">
              <span className="field__label">Heading</span>
              <input
                type="text"
                className="field__input"
                value={section.heading}
                onChange={(e) => updateSection(section.id, { heading: e.target.value })}
                placeholder="Section heading"
              />
            </label>

            <label className="field">
              <span className="field__label">Content</span>
              <textarea
                className="field__textarea"
                value={section.content}
                onChange={(e) => updateSection(section.id, { content: e.target.value })}
                placeholder="Write the section content. Leave a blank line between paragraphs."
                rows={5}
              />
            </label>

            <div className="section-card__image-row">
              <div className="section-card__image-picker">
                <ImagePicker
                  label="Add section image"
                  folder="sections"
                  value={section.image}
                  onChange={(url) => updateSection(section.id, { image: url })}
                  className="image-picker--section"
                />
              </div>
              {section.image && (
                <label className="field field--caption">
                  <span className="field__label">Image caption</span>
                  <input
                    type="text"
                    className="field__input"
                    value={section.imageCaption ?? ''}
                    onChange={(e) =>
                      updateSection(section.id, { imageCaption: e.target.value })
                    }
                    placeholder="Optional caption below the image"
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn--dashed btn--block" onClick={addSection}>
        <span aria-hidden="true">＋</span> Add Section
      </button>
    </div>
  );
}