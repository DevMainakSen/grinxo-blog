import type { BlogSection, SectionImagePosition } from '../types/blog';
import { resolveImagePosition } from '../types/blog';

/** Escape HTML-sensitive characters for safe text embedding. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Turn non-breaking spaces into ordinary spaces and drop the whitespace that
 * pastes strand at the end of a block.
 *
 * Kept in step with the same helper in server/services/blogStorage.ts so
 * Preview and the published article render identically. Escaping and
 * sanitising are the server's job; this only normalises the source HTML.
 */
function normalizeRichTextHtml(html: string): string {
  return html
    .replace(/&nbsp;|&#160;|&#xa0;|\u00A0/gi, ' ')
    .replace(/[ \t]+(<\/)/g, '$1')
    .replace(/[ \t]+$/, '');
}

function wrapParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

/** Heuristic used to tell editor-generated HTML from legacy plain text. */
function hasHtmlMarkup(text: string): boolean {
  return /<[a-zA-Z][\s\S]*>/.test(text);
}

/**
 * True when a rich-text fragment contains something a reader would see.
 * The editor emits an empty document as `<p></p>`, so tag presence alone is
 * not enough to decide whether a caption should be rendered.
 */
function hasVisibleText(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#x27;|&#39;/gi, "'")
      .trim().length > 0
  );
}

/**
 * Render a caption. Captions authored in the rich-text editor are emitted as
 * HTML so formatting survives; legacy plain-text captions are escaped so they
 * keep rendering exactly as typed. Returns '' for an effectively empty caption
 * so no empty <figcaption> is emitted.
 */
function buildCaptionHtml(caption: string | undefined): string {
  const value = normalizeRichTextHtml(caption ?? '').trim();
  if (!value) return '';
  if (!hasHtmlMarkup(value)) return escapeHtml(value);
  return hasVisibleText(value) ? value : '';
}

function buildFigureHtml(section: BlogSection): string {
  const image = (section.image ?? '').trim();
  if (!image) return '';
  const alt = escapeHtml((section.heading || 'Section image').trim());
  const caption = buildCaptionHtml(section.imageCaption);
  const fig = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="article-figure"><img src="${escapeHtml(image)}" alt="${alt}" />${fig}</figure>`;
}

/**
 * Wrap the text body and figure in a two-column container for side-by-side
 * positions. The text body always comes first in the DOM so the stacked mobile
 * layout keeps its existing heading → text → image reading order; the desktop
 * columns are produced by grid placement, not by reordering the DOM.
 */
function buildPositionedSection(body: string[], figure: string, position: SectionImagePosition): string {
  if (position === 'bottom') {
    return [...body, figure].join('\n');
  }
  return [
    `<section class="article-section article-section--image-${position}">`,
    '<div class="article-section__body">',
    body.join('\n'),
    '</div>',
    figure,
    '</section>',
  ].join('\n');
}

/**
 * Build the article body HTML from the editor's structured sections, matching the
 * backend's server-side `buildContentHtml`. This lets Preview render the *current
 * unsaved* section state without persisting anything.
 *
 * Each section's `content` is either plain text (legacy) or rich HTML produced by
 * the rich-text editor; rich HTML is rendered verbatim so formatting survives.
 * `imagePosition` is a semantic token (`left` | `right` | `bottom`); sections
 * without a side-by-side position keep the original flat markup.
 */
export function buildContentHtml(sections: BlogSection[]): string {
  return sections
    .map((section) => {
      const body: string[] = [];
      if ((section.heading ?? '').trim()) {
        body.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
      }
      const content = normalizeRichTextHtml(section.content ?? '').trim();
      if (content.length > 0) {
        body.push(hasHtmlMarkup(content) ? content : wrapParagraphs(content));
      }
      const figure = buildFigureHtml(section);
      if (!figure) return body.join('\n');
      return buildPositionedSection(body, figure, resolveImagePosition(section.imagePosition));
    })
    .join('\n');
}

/** True when any section carries visible content (heading, body, or image). */
export function blogHasSectionContent(sections: BlogSection[]): boolean {
  return sections.some(
    (s) => (s.heading ?? '').trim() || (s.content ?? '').trim() || s.image
  );
}
