import { useState } from 'react';
import type { BlogSeo } from '../../types/blog';

interface KeywordManagerProps {
  focusKeyword: string;
  secondaryKeywords: string[];
  onChange: (seo: Partial<BlogSeo>) => void;
}

export default function KeywordManager({ focusKeyword, secondaryKeywords, onChange }: KeywordManagerProps) {
  const [newKeyword, setNewKeyword] = useState('');

  function addKeyword() {
    const kw = newKeyword.trim().toLowerCase();
    if (!kw) return;
    if (kw === focusKeyword.toLowerCase()) {
      setNewKeyword('');
      return;
    }
    if (secondaryKeywords.some((k) => k.toLowerCase() === kw)) {
      setNewKeyword('');
      return;
    }
    onChange({ secondaryKeywords: [...secondaryKeywords, kw] });
    setNewKeyword('');
  }

  function removeKeyword(index: number) {
    onChange({ secondaryKeywords: secondaryKeywords.filter((_, i) => i !== index) });
  }

  return (
    <div className="seo-keywords">
      <div className="field">
        <label className="field__label" htmlFor="focusKeyword">Focus Keyword</label>
        <p className="field__hint">The main search phrase this article targets.</p>
        <input
          id="focusKeyword"
          className="field__input"
          value={focusKeyword}
          onChange={(e) => onChange({ focusKeyword: e.target.value })}
          placeholder="e.g. kids birthday decoration ideas"
        />
        {focusKeyword && <p className="field__hint field__hint--ok">✓ Set</p>}
      </div>

      <div className="field">
        <label className="field__label">Secondary Keywords</label>
        <p className="field__hint">Additional phrases related to this article.</p>
        {secondaryKeywords.length > 0 && (
          <div className="seo-keyword-tags">
            {secondaryKeywords.map((kw, i) => (
              <span key={`${kw}-${i}`} className="seo-keyword-tag">
                {kw}
                <button
                  type="button"
                  className="seo-keyword-tag__remove"
                  onClick={() => removeKeyword(i)}
                  aria-label={`Remove ${kw}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="seo-keyword-add">
          <input
            className="field__input"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder="Add a keyword"
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={addKeyword}>
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}
