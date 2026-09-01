/**
 * One-time generation script.
 *
 * Reads the bundled seed blog data (src/data/blogs.ts) and produces:
 *   - server/data/seed.blogs.json  -> immutable snapshot embedded with the server
 *   - server/data/blogs.json       -> initial runtime data for first startup
 *
 * It converts the legacy HTML `content` into structured `sections` (one per
 * <h2> block) while preserving the original `content` string so the public
 * article page keeps rendering identically.
 *
 * Run with:  node scripts/generate-seed.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogs, blogCategories } from '../src/data/blogs.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'server', 'data');

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/^\d+[.)]?\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

/**
 * Strip HTML markup from an arbitrary snippet down to plain text. Used so the
 * admin Section Builder shows clean text (no tags) while the original HTML
 * `content` string is preserved for public rendering.
 */
// A tiny standalone HTML -> text converter (no external dependency).
function htmlToText(html) {
  let text = String(html == null ? '' : html);
  // Block-level tags become paragraph breaks so prose reads naturally.
  text = text.replace(/\n/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|figcaption|figure)>/gi, '\n')
    // Swap <br> for a newline.
    .replace(/<br\s*\/?>/gi, '\n')
    // Remove every remaining tag.
    .replace(/<[^>]*>/g, '')
    // Decode the handful of entities the seed data uses.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // Collapse blank runs down to a single blank line between paragraphs.
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+/g, ' ').replace(/\n+/, '\n').trim())
    .filter((block) => block.length > 0)
    .join('\n\n');
}

/**
 * Convert raw HTML content into BlogSection[] by splitting on <h2> blocks.
 * The text before the first <h2> becomes an untitled lead section so the
 * ordering of the intro paragraph is preserved when re-rendered.
 */
function htmlToSections(content) {
  const h2Re = /<h2[^>]*>/gi;
  const matches = [];
  let m;
  while ((m = h2Re.exec(content)) !== null) {
    matches.push(m.index);
  }

  if (matches.length === 0) {
    // No headings — treat the whole body as a single untitled section.
    return [{ id: slugifyHeading('main'), heading: '', content: htmlToText(content) }];
  }

  const sections = [];
  const boundaries = [0, ...matches, content.length];

  for (let i = 0; i < matches.length; i++) {
    const blockStart = boundaries[i]; // index where this section's preceding text begins
    const h2Start = matches[i];
    const blockEnd = boundaries[i + 2] ?? content.length; // starts of next chunk

    // Paragraph text that comes before the <h2> heading (intro or interlude).
    const lead = content.slice(blockStart, h2Start).trim();

    // Extract the text between the opening <h2 ...> and the closing </h2>.
    const openTagEnd = content.indexOf('>', h2Start) + 1;
    const closeTagIdx = content.indexOf('</h2>', openTagEnd);
    const heading = closeTagIdx === -1
      ? ''
      : htmlToText(content.slice(openTagEnd, closeTagIdx));

    const bodyStart = closeTagIdx === -1 ? blockEnd : closeTagIdx + '</h2>'.length;
    const body = content.slice(bodyStart, blockEnd);

    const sectionContent = [htmlToText(lead), htmlToText(body)]
      .filter((s) => s.length > 0)
      .join('\n\n');
    const id = slugifyHeading(heading) || `section-${i + 1}`;
    sections.push({ id, heading: heading.trim(), content: sectionContent });
  }

  return sections;
}

const converted = blogs.map((blog) => ({
  ...blog,
  status: 'published',
  featuredImage: blog.featuredImage,
  sections: htmlToSections(blog.content),
}));

const seedSnapshot = {
  blogs: converted,
  categories: blogCategories,
};

// Immutable snapshot bundled with the server for first-startup seeding.
mkdirSync(dataDir, { recursive: true });
writeFileSync(
  join(dataDir, 'seed.blogs.json'),
  JSON.stringify(converted, null, 2) + '\n'
);
writeFileSync(
  join(dataDir, 'blogs.json'),
  JSON.stringify(converted, null, 2) + '\n'
);
writeFileSync(
  join(dataDir, 'categories.json'),
  JSON.stringify(blogCategories, null, 2) + '\n'
);

console.log(
  `Generated seed data: ${converted.length} blogs, ${blogCategories.length} categories -> server/data/*.json`
);
