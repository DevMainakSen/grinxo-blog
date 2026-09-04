import type { BlogSection } from '../types/blog';

/** Escape HTML-sensitive characters for safe text embedding. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function wrapParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

/**
 * Build the article body HTML from the editor's structured sections, matching the
 * backend's server-side `buildContentHtml`. This lets Preview render the *current
 * unsaved* section state without persisting anything.
 *
 * Each section's `content` is either plain text (legacy) or rich HTML produced by
 * the rich-text editor; rich HTML is rendered verbatim so formatting survives.
 */
export function buildContentHtml(sections: BlogSection[]): string {
  return sections
    .map((section) => {
      const parts: string[] = [];
      if ((section.heading ?? '').trim()) {
        parts.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
      }
      const body = (section.content ?? '').trim();
      if (body.length > 0) {
        const looksLikeHtml = /<[a-zA-Z][\s\S]*>/.test(body);
        parts.push(looksLikeHtml ? body : wrapParagraphs(body));
      }
      if (section.image) {
        const alt = escapeHtml((section.heading || 'Section image').trim());
        const cap = section.imageCaption
          ? `<figcaption>${escapeHtml(section.imageCaption)}</figcaption>`
          : '';
        parts.push(
          `<figure class="article-figure"><img src="${escapeHtml(section.image)}" alt="${alt}" />${cap}</figure>`
        );
      }
      return parts.join('\n');
    })
    .join('\n');
}

/** True when any section carries visible content (heading, body, or image). */
export function blogHasSectionContent(sections: BlogSection[]): boolean {
  return sections.some(
    (s) => (s.heading ?? '').trim() || (s.content ?? '').trim() || s.image
  );
}
