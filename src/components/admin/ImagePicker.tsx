import { useRef, useState } from 'react';
import { uploadImage } from '../../services/blogApi';
import {
  describeImageRequirements,
  validateBlogImage,
} from '../../utils/imageValidation';

interface ImagePickerProps {
  label: string;
  folder: 'banners' | 'sections';
  value?: string;
  onChange: (url: string | undefined) => void;
  /** Extra class for sizing previews (e.g. wide banner vs square section). */
  className?: string;
  accept?: string;
  /**
   * Section images must match one of the permitted aspect ratios, measured from
   * the file's own pixels. Banners, OG and social-share images are rendered at
   * their own fixed ratios, so they are size-limited only.
   */
  enforceAspectRatio?: boolean;
}

export default function ImagePicker({
  label,
  folder,
  value,
  onChange,
  className,
  accept = 'image/jpeg,image/png,image/gif,image/webp',
  enforceAspectRatio = false,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      // Validate before uploading: a rejected file never produces a URL, so it
      // can never reach editor state, the draft, or a published/scheduled post.
      const validation = await validateBlogImage(file, { requireAspectRatio: enforceAspectRatio });
      if (!validation.ok) {
        setError(validation.message);
        return;
      }
      const url = await uploadImage(file, folder);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const requirements = describeImageRequirements({ requireAspectRatio: enforceAspectRatio });

  return (
    <div className={`image-picker${className ? ` ${className}` : ''}`}>
      <span className="image-picker__label">{label}</span>

      <ul className="image-picker__requirements">
        {requirements.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {value ? (
        <div className="image-picker__preview-block">
          <div className="image-picker__preview">
            <img src={value} alt={label} className="image-picker__img" />
          </div>
          <div className="image-picker__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              Replace image
            </button>
            <button
              type="button"
              className="btn btn--danger-ghost btn--sm"
              onClick={() => onChange(undefined)}
              disabled={uploading}
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="image-picker__dropzone"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <span className="image-picker__icon spinner" aria-hidden="true" />
              Uploading…
            </>
          ) : (
            <>
              <span className="image-picker__icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 16V4m0 0 4 4m-4-4L8 8M4 20h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{label}</span>
            </>
          )}
        </button>
      )}

      {error && <p className="image-picker__error">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="visually-hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}