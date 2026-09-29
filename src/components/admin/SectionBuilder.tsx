import { lazy, Suspense, useState } from 'react';
import type { BlogSection, SectionImagePosition } from '../../types/blog';
import {
  resolveImagePosition,
  SECTION_IMAGE_ASPECT_GUIDANCE,
  SECTION_IMAGE_POSITIONS,
} from '../../types/blog';
import ImagePicker from './ImagePicker';
import { ALLOWED_IMAGE_RATIOS, matchAllowedRatio } from '../../utils/imageValidation';

const RichTextEditor = lazy(() => import('./RichTextEditor'));

interface SectionBuilderProps {
  sections: BlogSection[];
  onChange: (sections: BlogSection[]) => void;
}

interface ImageSize {
  width: number;
  height: number;
}

/** Human label for the position selectors and the guidance text. */
const POSITION_LABELS: Record<SectionImagePosition, string> = {
  left: 'Left',
  right: 'Right',
  bottom: 'Bottom',
};

function newSection(id: string): BlogSection {
  return {
    id,
    heading: '',
    content: '',
    image: undefined,
    imageCaption: '',
    imagePosition: 'bottom',
  };
}

function nextSectionId(sections: BlogSection[]): string {
  return `section-${Date.now().toString(36)}-${sections.length + 1}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/** Reduce the measured pixels to a readable ratio such as `16:9`. */
function formatRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height) || 1;
  return `${width / divisor}:${height / divisor}`;
}

/**
 * Position-specific guidance plus the image's real ratio.
 *
 * The permitted ratios are enforced when an image is selected (see
 * `validateBlogImage`), so nothing here blocks anything: it reports what was
 * measured against the permitted set, which also surfaces a pre-existing image
 * that was stored before the rules existed.
 */
function ImageRatioHint({
  position,
  size,
}: {
  position: SectionImagePosition;
  size?: ImageSize;
}) {
  const guidance = SECTION_IMAGE_ASPECT_GUIDANCE[position];
  const base = (
    <p className="image-position__hint">
      Best suited here: <strong>{guidance.label}</strong> — {guidance.hint}
    </p>
  );

  if (!size || size.width <= 0 || size.height <= 0) return base;

  const matched = matchAllowedRatio(size.width, size.height);

  return (
    <div className="image-position__ratio">
      {base}
      <p className={`image-position__actual${matched ? '' : ' image-position__actual--warn'}`}>
        Current image: {formatRatio(size.width, size.height)} ({size.width}×{size.height}) —{' '}
        {matched
          ? `matches the permitted ${matched}.`
          : `not one of the permitted ratios (${ALLOWED_IMAGE_RATIOS.map((r) => r.label).join(', ')}). Replace it to publish.`}
      </p>
    </div>
  );
}

/**
 * Loads the image purely to read its natural dimensions. There is no image
 * metadata in the upload pipeline, so the browser is the only zero-dependency
 * source available; nothing here is persisted.
 */
function SizeProbe({ src, onSize }: { src: string; onSize: (size: ImageSize) => void }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="visually-hidden"
      onLoad={(e) =>
        onSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
      }
    />
  );
}

export default function SectionBuilder({ sections, onChange }: SectionBuilderProps) {
  const [imageSizes, setImageSizes] = useState<Record<string, ImageSize>>({});

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

  /** Replacing or removing an image always restarts at the default position. */
  function setSectionImage(id: string, url: string | undefined) {
    updateSection(id, url ? { image: url, imagePosition: 'bottom' } : { image: undefined });
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

      {sections.map((section, index) => {
        const position = resolveImagePosition(section.imagePosition);
        return (
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

              <div className="field">
                <span className="field__label">Content</span>
                <Suspense fallback={<div className="rte rte--loading">Loading editor…</div>}>
                  <RichTextEditor
                    value={section.content}
                    onChange={(html) => updateSection(section.id, { content: html })}
                  />
                </Suspense>
              </div>

              <div className="section-card__image-row">
                <div className="section-card__image-picker">
                  <ImagePicker
                    label="Add section image"
                    folder="sections"
                    value={section.image}
                    onChange={(url) => setSectionImage(section.id, url)}
                    className="image-picker--section"
                    enforceAspectRatio
                  />
                </div>

                {section.image && (
                  <>
                    <SizeProbe
                      key={section.image}
                      src={section.image}
                      onSize={(size) =>
                        setImageSizes((prev) =>
                          prev[section.image as string]?.width === size.width ? prev : { ...prev, [section.image as string]: size }
                        )
                      }
                    />

                    <div className="field image-position">
                      <label className="field__label" htmlFor={`image-position-${section.id}`}>
                        Image position (desktop)
                      </label>
                      <select
                        id={`image-position-${section.id}`}
                        className="field__input"
                        value={position}
                        onChange={(e) =>
                          updateSection(section.id, {
                            imagePosition: e.target.value as SectionImagePosition,
                          })
                        }
                      >
                        {SECTION_IMAGE_POSITIONS.map((option) => (
                          <option key={option} value={option}>
                            {POSITION_LABELS[option]}
                          </option>
                        ))}
                      </select>
                      <ImageRatioHint
                        position={position}
                        size={imageSizes[section.image]}
                      />
                    </div>

                    <div className="field field--caption">
                      <span className="field__label">Image caption</span>
                      <Suspense fallback={<div className="rte rte--loading">Loading editor…</div>}>
                        <RichTextEditor
                          value={section.imageCaption ?? ''}
                          onChange={(html) => updateSection(section.id, { imageCaption: html })}
                        />
                      </Suspense>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <button type="button" className="btn btn--dashed btn--block" onClick={addSection}>
        <span aria-hidden="true">＋</span> Add Section
      </button>
    </div>
  );
}
