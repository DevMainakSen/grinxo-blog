/**
 * Verifies the non-breaking-space / entity-encoding fix for blog rich text.
 *
 *  1. Pure-logic checks on the server and client section serializers, asserting
 *     the text a reader would actually see rather than the raw markup.
 *  2. A parity check: Preview (client) and the published article (server) must
 *     produce byte-identical HTML.
 *  3. A drift guard: `normalizeRichTextHtml` is duplicated because `server/` is
 *     a self-contained module graph, so the two copies must stay identical.
 *  4. A real-data check against the stored blogs, proving the live paste
 *     artefacts render clean without rewriting the file.
 *  5. HTTP integration checks proving the published body is clean.
 *
 * Run: node scripts/verify-nbsp.mjs
 */
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const API = process.env.API_URL ?? 'http://localhost:5001';
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------------------ *
 * `src/` uses extensionless imports, which plain Node cannot resolve.
 * Register a resolve hook that retries them as .ts files.
 * ------------------------------------------------------------------ */
const RESOLVE_HOOK = `export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (err) {
    if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) return next(spec + '.ts', ctx);
    throw err;
  }
}`;
register(`data:text/javascript,${encodeURIComponent(RESOLVE_HOOK)}`);

const { buildContentHtml: buildServer } = await import('../server/services/blogStorage.ts');
const { buildContentHtml: buildClient } = await import('../src/utils/articleContent.ts');

/**
 * The text a reader actually sees: parse tags away, then decode entities the
 * way a browser does. `&amp;` is decoded last so `&amp;lt;` stays literal.
 */
function renderedText(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

const section1 = (content, extra = {}) => [
  // No heading: renderedText() strips tags, so a heading would be prepended to
  // the visible text and every expected string below would need to include it.
  { id: 's1', heading: '', content, image: '', imagePosition: 'bottom', ...extra },
];

/** The double-escaping signature: an escaped ampersand in the published body. */
const DOUBLE_ESCAPED = /&amp;nbsp;|&amp;#0*160;|&amp;#x0*a0;/i;

/* ------------------------------------------------------------------ *
 * 1. Reader-visible text through the server (published) serializer.
 * ------------------------------------------------------------------ */
section('Server serializer — what the reader sees');

const serverCases = [
  ['trailing &nbsp; is removed (the reported bug)', '<p>Hello world&nbsp;</p>', 'Hello world'],
  ['trailing nbsp inside a span is removed', '<p><span style="font-size: 11pt">Hello&nbsp;</span></p>', 'Hello'],
  ['several trailing nbsp collapse', '<p>Done&nbsp;&nbsp;&nbsp;</p>', 'Done'],
  ['mid-text &nbsp; becomes a normal space', '<p>a&nbsp;b</p>', 'a b'],
  ['numeric &#160; is handled', '<p>a&#160;b</p>', 'a b'],
  ['hex &#xA0; is handled', '<p>a&#xA0;b</p>', 'a b'],
  ['literal U+00A0 is handled', '<p>a\u00A0b</p>', 'a b'],
  ['&quot; renders as a quote', '<p>say &quot;hi&quot;</p>', 'say "hi"'],
  ['&#39; renders as an apostrophe', '<p>it&#39;s</p>', "it's"],
  ['&amp; renders as an ampersand', '<p>A &amp; B</p>', 'A & B'],
  ['&hellip; renders as an ellipsis', '<p>a &hellip; b</p>', 'a \u2026 b'],
  ['a bare ampersand survives', '<p>Tom & Jerry</p>', 'Tom & Jerry'],
  ['an unknown entity stays literal', '<p>a &bogus; b</p>', 'a &bogus; b'],
  ['escaped markup stays escaped', '<p>&lt;b&gt;bold&lt;/b&gt;</p>', '<b>bold</b>'],
  ['formatting around nbsp is preserved', '<p><strong>Buy&nbsp;now</strong></p>', 'Buy now'],
  ['whitespace between tags is preserved', '<p><strong>A</strong> <em>B</em></p>', 'A B'],
  // Author typed the literal characters "&nbsp;" on purpose. Re-encoding them
  // once is correct, so this case asserts the exact markup instead of the
  // blanket "no escaped nbsp" rule.
  [
    '&amp;nbsp; is NOT decoded twice',
    '<p>&amp;nbsp;</p>',
    '&nbsp;',
    { rawHtml: '<p>&amp;nbsp;</p>' },
  ],
];

for (const [name, content, expected, opts = {}] of serverCases) {
  const html = buildServer(section1(content));
  const shown = renderedText(html);
  const markupOk = opts.rawHtml === undefined ? !DOUBLE_ESCAPED.test(html) : html === opts.rawHtml;
  check(
    name,
    shown === expected && markupOk,
    `html=${JSON.stringify(html)}\n        shows=${JSON.stringify(shown)} want=${JSON.stringify(expected)}`
  );
}

/* ------------------------------------------------------------------ *
 * 2. XSS must stay inert after decoding.
 * ------------------------------------------------------------------ */
section('Sanitiser safety is unchanged');

check(
  'a <script> tag is stripped from section content',
  !/<script/i.test(buildServer(section1('<p>ok</p><script>alert(1)</script>'))),
  buildServer(section1('<p>ok</p><script>alert(1)</script>'))
);
check(
  'an encoded <script> stays inert text',
  !/<script/i.test(buildServer(section1('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'))),
  buildServer(section1('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'))
);
check(
  'a javascript: href is still dropped',
  !/javascript:/i.test(buildServer(section1('<p><a href="javascript:alert(1)">x</a></p>')))
);
check(
  'a double-encoded ampersand is not re-decoded into a tag',
  !/<script/i.test(buildServer(section1('<p>&amp;lt;script&amp;gt;</p>'))),
  buildServer(section1('<p>&amp;lt;script&amp;gt;</p>'))
);
check(
  'an onerror handler is still stripped',
  !/onerror/i.test(buildServer(section1('<p><span style="color:red" onerror="alert(1)">x</span></p>')))
);

/* ------------------------------------------------------------------ *
 * 3. Preview and published output must agree.
 * ------------------------------------------------------------------ */
section('Preview / published parity');

const parityInputs = [
  '<p>Hello world&nbsp;</p>',
  '<p><span style="font-size: 11pt">a&nbsp;b &amp; c</span></p>',
  '<p>say &quot;hi&quot;</p>',
  '<p>plain text with no markup</p>',
  '<p>List:</p><ul><li>one&nbsp;</li><li>two</li></ul>',
];

for (const input of parityInputs) {
  const server = buildServer(section1(input));
  const client = buildClient(section1(input));
  check(
    `client matches server: ${JSON.stringify(input.slice(0, 42))}`,
    server === client,
    `server=${JSON.stringify(server)}\n        client=${JSON.stringify(client)}`
  );
}

const caption = { image: '/uploads/sections/mtqw7v9x-awbyyl.jpeg', imageCaption: '<p>Shot here&nbsp;</p>' };
check(
  'captions are normalised identically on both sides',
  buildServer(section1('<p>x</p>', caption)) === buildClient(section1('<p>x</p>', caption)),
  `server=${buildServer(section1('<p>x</p>', caption))}\n        client=${buildClient(section1('<p>x</p>', caption))}`
);

/* ------------------------------------------------------------------ *
 * 4. Drift guard on the duplicated normaliser.
 * ------------------------------------------------------------------ */
section('Drift guard — duplicated normaliser stays in step');

function extractNormaliser(file) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = src.indexOf('function normalizeRichTextHtml');
  if (start === -1) return null;
  const end = src.indexOf('\n}', start);
  return src.slice(start, end).trim();
}

const serverNormaliser = extractNormaliser('../server/services/blogStorage.ts');
const clientNormaliser = extractNormaliser('../src/utils/articleContent.ts');

check('server normaliser is present', Boolean(serverNormaliser));
check('client normaliser is present', Boolean(clientNormaliser));
check(
  'both normalisers are identical',
  serverNormaliser !== null && serverNormaliser === clientNormaliser,
  `server=${serverNormaliser}\n        client=${clientNormaliser}`
);

/* ------------------------------------------------------------------ *
 * 5. The real stored blogs (read-only — nothing is written back).
 * ------------------------------------------------------------------ */
section('Real stored content');

let blogs = [];
try {
  blogs = JSON.parse(readFileSync(new URL('../server/data/blogs.json', import.meta.url), 'utf8'));
} catch {
  console.log('  info  blogs.json not readable; skipping real-data checks');
}

const affected = blogs.filter((b) => JSON.stringify(b.sections ?? []).includes('&nbsp;'));
console.log(`  info  ${blogs.length} blogs stored, ${affected.length} contain &nbsp;`);

for (const blog of affected) {
  const html = affected.length
    ? (await import('../server/services/blogStorage.ts')).buildContentHtml(blog.sections)
    : '';
  check(
    `"${blog.slug}": published body has no escaped nbsp`,
    !DOUBLE_ESCAPED.test(html),
    `first hit: ${JSON.stringify(html.match(DOUBLE_ESCAPED)?.[0] ?? '')}`
  );
  check(
    `"${blog.slug}": reader no longer sees literal "&nbsp;"`,
    !renderedText(html).includes('&nbsp;'),
    `shows: ${JSON.stringify(renderedText(html).slice(0, 160))}`
  );
  check(
    `"${blog.slug}": article prose is still non-empty`,
    renderedText(html).replace(/\s+/g, ' ').trim().length > 200,
    `length=${renderedText(html).replace(/\s+/g, ' ').trim().length}`
  );
}

/* ------------------------------------------------------------------ *
 * 6. HTTP integration.
 * ------------------------------------------------------------------ */
section('HTTP integration');

async function api(method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

let serverUp = false;
try {
  await api('GET', '/api/blogs');
  serverUp = true;
} catch {
  console.log(`  info  no server on ${API}; skipping HTTP checks`);
}

if (serverUp) {
  const created = await api('POST', '/api/blogs', {
    title: 'Nbsp Verify',
    slug: 'nbsp-verify-probe',
    excerpt: 'probe',
    category: 'General',
    status: 'published',
    isActive: true,
    sections: [
      {
        id: 's1',
        heading: 'Probe',
        content: '<p><span style="font-size: 11pt">Hello world&nbsp;</span></p>',
        image: '',
        imagePosition: 'bottom',
      },
    ],
  });

  try {
    const saved = await api('GET', `/api/blogs/${created.id}`);
    check(
      'GET /api/blogs/:id returns a body with no escaped nbsp',
      !DOUBLE_ESCAPED.test(saved.content),
      `content=${JSON.stringify(saved.content)}`
    );
    check(
      'the reader-visible text is clean',
      renderedText(saved.content).includes('Hello world') &&
        !renderedText(saved.content).includes('&nbsp;'),
      `shows=${JSON.stringify(renderedText(saved.content))}`
    );

    const listed = await api('GET', '/api/blogs');
    const probe = (listed.blogs ?? listed).find((b) => b.id === created.id);
    check('the blog survives the round trip', Boolean(probe));
  } finally {
    await api('DELETE', `/api/blogs/${created.id}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
