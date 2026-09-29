/**
 * One-time repair for non-breaking-space artefacts in stored blog data.
 *
 * Older saves ran rich-text section content through an escaper that encoded the
 * `&` of entities the editor had already encoded, so a pasted `&nbsp;` was
 * stored as `&amp;nbsp;` and rendered to readers as the literal text "&nbsp;".
 * The serializer in server/services/blogStorage.ts is now fixed, so this script
 * only needs to clean up what was already written.
 *
 * It edits the stored strings in place and deliberately does NOT regenerate
 * `content` from `sections`: most blogs were seeded with hand-authored bodies
 * that no longer round-trip through buildContentHtml, and rebuilding them would
 * discard real text.
 *
 * Idempotent, and safe to re-run. Pass --dry-run to report without writing.
 *
 * Run: node scripts/repair-nbsp.mjs [--dry-run]
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const BLOGS = new URL('../server/data/blogs.json', import.meta.url);

/** Non-breaking space in any encoding, including the double-escaped form. */
const NBSP = /&nbsp;|&#160;|&#xa0;|\u00A0/gi;
const DOUBLE_ESCAPED_NBSP = /&amp;(nbsp|#0*160|#x0*a0);/gi;

/**
 * Collapse non-breaking spaces and the whitespace they leave at the end of a
 * block. Applied to already-sanitised markup, so the entity form to expect is
 * the escaped one.
 */
function repairGeneratedHtml(html) {
  return String(html ?? '')
    .replace(DOUBLE_ESCAPED_NBSP, ' ')
    .replace(/[ \t]+(<\/)/g, '$1')
    .replace(/[ \t]+$/, '');
}

/** Same cleanup for the editor's own source, where the entity is unescaped. */
function repairSourceHtml(html) {
  return String(html ?? '')
    .replace(NBSP, ' ')
    .replace(/[ \t]+(<\/)/g, '$1')
    .replace(/[ \t]+$/, '');
}

const raw = readFileSync(BLOGS, 'utf8');
const blogs = JSON.parse(raw);

/**
 * Normalise a field only when it is already a string, so sections that never
 * had an `imageCaption` do not gain an empty one.
 */
function cleanField(holder, key, clean) {
  if (typeof holder[key] !== 'string') return false;
  const before = holder[key];
  const after = clean(before);
  if (after === before) return false;
  holder[key] = after;
  return true;
}

let blogsChanged = 0;
const report = [];

for (const blog of blogs) {
  const beforeContent = typeof blog.content === 'string' ? blog.content : null;
  const sections = Array.isArray(blog.sections) ? blog.sections : [];

  const contentChanged = cleanField(blog, 'content', repairGeneratedHtml);
  let sectionNbsp = 0;
  let sectionsChanged = false;
  for (const section of sections) {
    for (const key of ['content', 'imageCaption']) {
      const before = typeof section?.[key] === 'string' ? section[key] : '';
      const changed = cleanField(section, key, repairSourceHtml);
      if (changed) {
        sectionsChanged = true;
        sectionNbsp += (before.match(NBSP) || []).length;
      }
    }
  }

  if (contentChanged || sectionsChanged) {
    blogsChanged += 1;
    report.push(`  ${blog.slug}`);
    if (contentChanged) {
      const hits = (beforeContent?.match(DOUBLE_ESCAPED_NBSP) || []).length;
      report.push(`    content  : ${hits} escaped nbsp removed`);
    }
    if (sectionNbsp) report.push(`    sections : ${sectionNbsp} nbsp normalised`);
  }
}

console.log(`\n  blogs scanned : ${blogs.length}`);
console.log(`  blogs changed : ${blogsChanged}`);

if (blogsChanged === 0) {
  console.log('\n  nothing to repair; the stored data is already clean\n');
  process.exit(0);
}

console.log('');
for (const line of report) console.log(line);

if (DRY_RUN) {
  console.log('\n  dry run: no file written\n');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = new URL(`../server/data/blogs.json.bak-${stamp}`, import.meta.url);
copyFileSync(BLOGS, backup);
console.log(`\n  backup: ${fileURLToPath(backup)}`);

writeFileSync(BLOGS, `${JSON.stringify(blogs, null, 2)}\n`);
console.log(`  wrote repaired data for ${blogsChanged} blog(s)\n`);
