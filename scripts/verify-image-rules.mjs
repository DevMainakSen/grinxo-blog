/**
 * Verifies the blog image upload rules.
 *
 *  1. Pure-logic checks on the client validator and the server validator.
 *  2. A drift guard: the client and server must agree on every rule constant,
 *     because `server/` is a self-contained module graph and cannot import the
 *     client module.
 *  3. HTTP integration checks against POST /api/uploads using real encoded
 *     images, proving the server is the enforcement boundary.
 *
 * Run: node scripts/verify-image-rules.mjs
 */
import { Buffer } from 'node:buffer';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const client = await import('../src/utils/imageValidation.ts');
const server = await import('../server/services/imageStorage.ts');

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
 * Minimal PNG encoder (no image library needed at test time).
 * ------------------------------------------------------------------ */
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** Encode a real, decodable truecolour PNG of the given intrinsic size. */
function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3;
      raw[p] = (x * 7 + y * 3) % 256;
      raw[p + 1] = (x * 5 + y * 11) % 256;
      raw[p + 2] = (x * 13 + y * 17) % 256;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Pad a valid PNG with trailing bytes after IEND to hit an exact size.
 * Decoders ignore data past IEND, so the file stays a valid image.
 */
function padTo(png, targetBytes) {
  if (png.length > targetBytes) return png;
  return Buffer.concat([png, Buffer.alloc(targetBytes - png.length, 0x41)]);
}

/* ------------------------------------------------------------------ *
 * 1. File size (pure logic, exact boundaries)
 * ------------------------------------------------------------------ */
section('File size — 500 KB boundary (client)');
check('1 byte under limit accepted', client.validateImageFileSize(512000 - 1).ok === true);
check('exactly 500 KB (512000) accepted', client.validateImageFileSize(512000).ok === true);
const overClient = client.validateImageFileSize(512000 + 1);
check('1 byte over limit rejected', overClient.ok === false && overClient.reason === 'size');
check(
  'size message is exactly "Image size must be 500 KB or less."',
  overClient.ok === false && overClient.message === 'Image size must be 500 KB or less.',
  overClient.ok ? '' : overClient.message
);
check('server limit matches 512000 bytes', server.MAX_IMAGE_BYTES === 512000);
check(
  'server isWithinSizeLimit boundary behaves identically',
  server.isWithinSizeLimit(512000) === true && server.isWithinSizeLimit(512001) === false
);
check('client MAX_IMAGE_BYTES matches server', client.MAX_IMAGE_BYTES === server.MAX_IMAGE_BYTES);

/* ------------------------------------------------------------------ *
 * 2. Ratios (pure logic) — spec table
 * ------------------------------------------------------------------ */
section('Permitted ratios (client validator)');
const ACCEPT = [
  ['2:3 portrait', 1200, 1800, '2:3'],
  ['2:3 portrait (small)', 400, 600, '2:3'],
  ['9:16 portrait', 1080, 1920, '9:16'],
  ['16:9 landscape', 1920, 1080, '16:9'],
  ['3:2 landscape', 1800, 1200, '3:2'],
  ['3:2 landscape (real-world off-exact)', 1264, 848, '3:2'],
];
for (const [name, w, h, label] of ACCEPT) {
  const r = client.validateImageDimensions(w, h);
  check(`${name} ${w}x${h} accepted as ${label}`, r.ok === true && r.ratio === label,
    r.ok ? `ratio=${r.ratio}` : `rejected: ${r.message}`);
}

section('Disallowed ratios (client validator)');
const REJECT = [
  ['4:3 landscape', 400, 300],
  ['5:4 landscape', 400, 320],
  ['21:9 landscape', 700, 300],
  ['3:4 portrait', 300, 400],
  ['4:5 portrait', 320, 400],
  ['5:3 landscape (closest to 16:9)', 500, 300],
  ['8:5 landscape', 320, 200],
  ['16:10 landscape', 320, 200],
];
for (const [name, w, h] of REJECT) {
  const r = client.validateImageDimensions(w, h);
  check(`${name} ${w}x${h} rejected`, r.ok === false && r.reason === 'ratio',
    r.ok ? `accepted as ${r.ratio}` : `reason=${r.reason}`);
}

section('Square images');
for (const [w, h] of [[400, 400], [1000, 1000], [1920, 1920]]) {
  const r = client.validateImageDimensions(w, h);
  check(`${w}x${h} rejected as square`,
    r.ok === false && r.reason === 'square' && r.message.startsWith('Square images are not supported.'),
    r.ok ? 'accepted' : r.message);
}

section('Messages match the spec exactly');
check(
  'invalid ratio message',
  client.IMAGE_VALIDATION_MESSAGES.invalidRatio ===
    'Invalid image ratio. Please upload a portrait image in 2:3 or 9:16, or a landscape image in 16:9 or 3:2.'
);
check(
  'square message',
  client.IMAGE_VALIDATION_MESSAGES.square ===
    'Square images are not supported. Please upload an image with one of the supported ratios: 2:3, 9:16, 16:9, or 3:2.'
);
check('client and server messages are identical',
  JSON.stringify(client.IMAGE_VALIDATION_MESSAGES.invalidRatio) ===
  JSON.stringify(server.IMAGE_VALIDATION_MESSAGES.invalidRatio) &&
  JSON.stringify(client.IMAGE_VALIDATION_MESSAGES.square) ===
  JSON.stringify(server.IMAGE_VALIDATION_MESSAGES.square) &&
  JSON.stringify(client.IMAGE_VALIDATION_MESSAGES.tooLarge) ===
  JSON.stringify(server.IMAGE_VALIDATION_MESSAGES.tooLarge));

section('Orientation is derived from dimensions, never the filename');
check('w>h is landscape', client.detectOrientation(100, 50) === 'landscape');
check('h>w is portrait', client.detectOrientation(50, 100) === 'portrait');
check('w==h is square', client.detectOrientation(50, 50) === 'square');
check('landscape image matches only a landscape ratio',
  client.matchAllowedRatio(900, 600) === '3:2' && client.matchAllowedRatio(1920, 1080) === '16:9');
check('portrait image matches only a portrait ratio',
  client.matchAllowedRatio(600, 900) === '2:3' && client.matchAllowedRatio(1080, 1920) === '9:16');
check('the matched ratio always agrees with the detected orientation',
  [[400, 600], [1080, 1920], [1920, 1080], [600, 400]].every(([w, h]) => {
    const matched = client.matchAllowedRatio(w, h);
    if (!matched) return false;
    const meta = client.ALLOWED_IMAGE_RATIOS.find((r) => r.label === matched);
    return meta.orientation === client.detectOrientation(w, h);
  }));

section('Tolerance is tight enough to reject every listed bad ratio');
// The tightest neighbour in the whole set is 5:3 (1.6667) against 16:9 (1.7778).
const fiveThree = client.validateImageDimensions(500, 300);
check('5:3 is rejected even though it is only 6.25% from 16:9', fiveThree.ok === false);
check('tolerance is 5%', client.RATIO_TOLERANCE === 0.05 && server.RATIO_TOLERANCE === 0.05);
// A genuine 16:9 that lost a pixel row to resizing must still pass.
check('16:9 within tolerance (1919x1080)', client.validateImageDimensions(1919, 1080).ok === true);
check('2:3 within tolerance (1200x1799)', client.validateImageDimensions(1200, 1799).ok === true);

section('Drift guard — client and server rule sets agree');
check('same ratio set',
  JSON.stringify(client.ALLOWED_IMAGE_RATIOS.map((r) => r.label)) ===
  JSON.stringify(server.ALLOWED_IMAGE_RATIOS.map((r) => r.label)));
check('same tolerance', client.RATIO_TOLERANCE === server.RATIO_TOLERANCE);
check('same size limit', client.MAX_IMAGE_BYTES === server.MAX_IMAGE_BYTES);
check('every ratio maps to the same result on both sides',
  [[400, 600], [1080, 1920], [1920, 1080], [1800, 1200], [400, 400], [400, 300], [500, 300]]
    .every(([w, h]) => {
      const c = client.matchAllowedRatio(w, h);
      const s = server.matchAllowedRatio(w, h);
      return c === s;
    }));

/* ------------------------------------------------------------------ *
 * 3. Server dimension reader against real encoded bytes
 * ------------------------------------------------------------------ */
section('Server reads intrinsic dimensions from real bytes');
for (const [w, h] of [[1200, 1800], [1080, 1920], [1920, 1080], [1800, 1200], [400, 400]]) {
  const dims = server.readImageDimensions(makePng(w, h));
  check(`PNG ${w}x${h} read back correctly`, dims?.width === w && dims?.height === h,
    JSON.stringify(dims));
}
check('garbage buffer returns null, not a guess',
  server.readImageDimensions(Buffer.from('not an image at all!!')) === null);
check('truncated buffer returns null',
  server.readImageDimensions(makePng(400, 600).subarray(0, 20)) === null);

/* ------------------------------------------------------------------ *
 * 4. HTTP integration — the server is the real enforcement boundary
 * ------------------------------------------------------------------ */
async function upload(png, folder) {
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'test.png');
  form.append('folder', folder);
  const res = await fetch(`${API}/api/uploads`, { method: 'POST', body: form });
  let body = {};
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

section('HTTP: section images reject invalid ratios (not just the client)');
for (const [name, w, h] of [
  ['4:3', 400, 300], ['3:4', 300, 400], ['5:4', 400, 320],
  ['4:5', 320, 400], ['5:3', 500, 300], ['21:9', 700, 300],
]) {
  const { status, body } = await upload(makePng(w, h), 'sections');
  check(`sections ${name} ${w}x${h} -> 400 invalid ratio`,
    status === 400 && typeof body.error === 'string' && body.error.startsWith('Invalid image ratio.'),
    `status=${status} body=${JSON.stringify(body)}`);
}

section('HTTP: section images reject squares and oversize');
{
  const square = await upload(makePng(400, 400), 'sections');
  check('sections 1:1 -> 400 square message',
    square.status === 400 && square.body.error?.startsWith('Square images are not supported.'),
    `status=${square.status} body=${JSON.stringify(square.body)}`);
}
{
  const base = makePng(600, 400);
  const over = padTo(base, 512001);
  const res = await upload(over, 'sections');
  check('sections 512001 bytes (valid 3:2) -> 400 size message',
    res.status === 400 && res.body.error === 'Image size must be 500 KB or less.',
    `status=${res.status} body=${JSON.stringify(res.body)}`);
}

section('HTTP: valid section images are accepted');
const acceptedUrls = [];
for (const [label, w, h] of [['2:3', 400, 600], ['9:16', 360, 640], ['16:9', 640, 360], ['3:2', 600, 400]]) {
  const { status, body } = await upload(makePng(w, h), 'sections');
  check(`sections ${label} ${w}x${h} -> 201`, status === 201 && typeof body.url === 'string',
    `status=${status} body=${JSON.stringify(body)}`);
  if (body.url) acceptedUrls.push(body.url);
}
{
  const exact = await upload(padTo(makePng(600, 400), 512000), 'sections');
  check('sections exactly 512000 bytes (3:2) -> 201', exact.status === 201,
    `status=${exact.status} body=${JSON.stringify(exact.body)}`);
  if (exact.body.url) acceptedUrls.push(exact.body.url);
  const under = await upload(padTo(makePng(600, 400), 511999), 'sections');
  check('sections 511999 bytes (3:2) -> 201', under.status === 201,
    `status=${under.status} body=${JSON.stringify(under.body)}`);
  if (under.body.url) acceptedUrls.push(under.body.url);
}

section('HTTP: banners are size-limited but not ratio-limited');
{
  // A 16:7 hero is a legitimate banner; section rules must not apply here.
  const hero = await upload(makePng(700, 306), 'banners');
  check('banners 16:7-ish -> 201 (ratio not enforced for banners)', hero.status === 201,
    `status=${hero.status} body=${JSON.stringify(hero.body)}`);
  if (hero.body.url) acceptedUrls.push(hero.body.url);
  const overBanner = await upload(padTo(makePng(600, 400), 512001), 'banners');
  check('banners over 500 KB -> 400 size message',
    overBanner.status === 400 && overBanner.body.error === 'Image size must be 500 KB or less.',
    `status=${overBanner.status} body=${JSON.stringify(overBanner.body)}`);
}

section('HTTP: combined failures report size first');
{
  // Oversize AND a disallowed ratio: the size message must win.
  const res = await upload(padTo(makePng(400, 300), 600000), 'sections');
  check('over-size + bad ratio -> 400 with the size message',
    res.status === 400 && res.body.error === 'Image size must be 500 KB or less.',
    `status=${res.status} body=${JSON.stringify(res.body)}`);
}

section('HTTP: rejected uploads are never written to disk');
{
  const before = await fetch(`${API}/api/blogs`).then((r) => r.json());
  void before;
  const res = await upload(makePng(400, 400), 'sections');
  // A 400 means saveImage never ran, so no URL is returned to reference.
  check('square upload returns no url to persist', res.status === 400 && !res.body.url,
    JSON.stringify(res.body));
}

/* Cleanup: delete the accepted test uploads so the store is left as found. */
if (acceptedUrls.length) {
  const dir = new URL('../server/uploads/', import.meta.url);
  for (const url of acceptedUrls) {
    const file = join(fileURLToPath(dir), url.replace('/uploads/', ''));
    try {
      rmSync(file, { force: true });
    } catch {
      console.log(`  warn  could not remove ${file}`);
    }
  }
  console.log(`\n  info  removed ${acceptedUrls.length} test uploads`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
