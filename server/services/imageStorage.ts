import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { UPLOADS_DIR } from './blogStorage.ts';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

/**
 * Authoritative upload limits. The client (`src/utils/imageValidation.ts`)
 * repeats these numbers so the editor can fail fast, but this module is the
 * enforcement boundary: a request that arrives here is validated from its own
 * bytes, never from anything the client claimed.
 */

/** Maximum upload size: 500 KB, defined as 500 * 1024 bytes. */
export const MAX_IMAGE_BYTES = 500 * 1024;
export const MAX_IMAGE_SIZE_LABEL = '500 KB';

/** The only permitted section-image aspect ratios. */
export const ALLOWED_IMAGE_RATIOS = [
  { width: 2, height: 3, label: '2:3', orientation: 'portrait' },
  { width: 9, height: 16, label: '9:16', orientation: 'portrait' },
  { width: 16, height: 9, label: '16:9', orientation: 'landscape' },
  { width: 3, height: 2, label: '3:2', orientation: 'landscape' },
] as const;

/**
 * Relative tolerance when matching `width / height` against an allowed ratio.
 *
 * Export/resize pipelines rarely land on the exact decimal, so exact equality
 * would reject conforming images such as 1264x848 (1.4906 vs 1.5). 5% relative
 * deviation is the loosest bound that still rejects every explicitly-disallowed
 * ratio: the tightest neighbour in the set is 5:3 (1.6667) against 16:9 (1.7778),
 * 6.25% away. Do not raise this above ~0.06 or 5:3 would be accepted as 16:9.
 */
export const RATIO_TOLERANCE = 0.05;

export const IMAGE_VALIDATION_MESSAGES = {
  tooLarge: `Image size must be ${MAX_IMAGE_SIZE_LABEL} or less.`,
  square:
    'Square images are not supported. Please upload an image with one of the supported ratios: 2:3, 9:16, 16:9, or 3:2.',
  invalidRatio:
    'Invalid image ratio. Please upload a portrait image in 2:3 or 9:16, or a landscape image in 16:9 or 3:2.',
  unreadable: 'Could not read the image dimensions. Please upload a valid image file.',
  invalidType: 'Invalid image type. Allowed: jpg, png, gif, webp',
} as const;

export type UploadFolder = 'banners' | 'sections';

export type ImageOrientation = 'portrait' | 'landscape' | 'square';

export type ImageValidationFailure = 'size' | 'square' | 'ratio' | 'unreadable' | 'type';

export type ImageValidationResult =
  | {
      ok: true;
      width: number;
      height: number;
      orientation: ImageOrientation;
      ratio: string | null;
    }
  | { ok: false; reason: ImageValidationFailure; message: string };

export function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXT.has(extname(filename).toLowerCase());
}

export function isWithinSizeLimit(size: number): boolean {
  return size > 0 && size <= MAX_IMAGE_BYTES;
}

export function detectOrientation(width: number, height: number): ImageOrientation {
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Match intrinsic pixels against the permitted ratios.
 *
 * Only ratios sharing the image's real orientation are considered, so a
 * landscape image can never be accepted by a portrait ratio. Returns `null`
 * when nothing matches (including every square image).
 */
export function matchAllowedRatio(width: number, height: number): string | null {
  const orientation = detectOrientation(width, height);
  if (orientation === 'square') return null;
  const actual = width / height;
  for (const ratio of ALLOWED_IMAGE_RATIOS) {
    if (ratio.orientation !== orientation) continue;
    const target = ratio.width / ratio.height;
    if (Math.abs(actual - target) / target <= RATIO_TOLERANCE) return ratio.label;
  }
  return null;
}

/**
 * Read intrinsic width/height straight from the encoded bytes.
 *
 * The project intentionally ships no image dependency (`sharp` et al.), and
 * every supported format carries its dimensions in a fixed header, so a small
 * bounds-checked reader is enough. Returns `null` for unrecognised or truncated
 * data rather than guessing.
 */
export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 16) return null;

  // PNG: 8-byte signature, then the IHDR width/height as big-endian uint32.
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    if (buffer.length < 24) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // GIF: "GIF87a"/"GIF89a" then little-endian uint16 dimensions.
  if (buffer.subarray(0, 3).toString('latin1') === 'GIF') {
    if (buffer.length < 10) return null;
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }

  // WebP: RIFF container; the canvas size lives in the VP8/VP8L/VP8X chunk.
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    if (buffer.length < 30) return null;
    const chunk = buffer.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8 ') {
      // Lossy: 14-bit dimensions packed into two little-endian uint16s.
      if (buffer.length < 30) return null;
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L') {
      // Lossless: 14 bits of (width - 1) then 14 bits of (height - 1).
      if (buffer.length < 25) return null;
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === 'VP8X') {
      // Extended: 24-bit little-endian canvas width/height, each minus one.
      if (buffer.length < 30) return null;
      return {
        width: (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1,
        height: (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1,
      };
    }
    return null;
  }

  // JPEG: walk the marker chain to the first SOFn frame header, which carries
  // the true dimensions for the frame.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // Padding and standalone markers carry no payload.
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isStartOfFrame) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      if (segmentLength < 2) return null;
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Validate an upload from its own bytes.
 *
 * Size is checked first so an oversized file always reports the size message,
 * then the intrinsic dimensions decide square vs. ratio. Section images must
 * match a permitted ratio; banners/OG/share images are only size-limited,
 * because the hero, OG and social frames are rendered at their own fixed
 * aspect ratios and rejecting them here would break existing artwork.
 */
export function validateImageUpload(
  buffer: Buffer,
  size: number,
  originalName: string,
  folder: UploadFolder
): ImageValidationResult {
  if (!isAllowedExtension(originalName)) {
    return { ok: false, reason: 'type', message: IMAGE_VALIDATION_MESSAGES.invalidType };
  }
  if (!isWithinSizeLimit(size)) {
    return { ok: false, reason: 'size', message: IMAGE_VALIDATION_MESSAGES.tooLarge };
  }

  const dimensions = readImageDimensions(buffer);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return {
      ok: false,
      reason: 'unreadable',
      message: IMAGE_VALIDATION_MESSAGES.unreadable,
    };
  }

  if (folder !== 'sections') {
    return {
      ok: true,
      width: dimensions.width,
      height: dimensions.height,
      orientation: detectOrientation(dimensions.width, dimensions.height),
      ratio: null,
    };
  }

  const orientation = detectOrientation(dimensions.width, dimensions.height);
  if (orientation === 'square') {
    return { ok: false, reason: 'square', message: IMAGE_VALIDATION_MESSAGES.square };
  }
  const ratio = matchAllowedRatio(dimensions.width, dimensions.height);
  if (!ratio) {
    return { ok: false, reason: 'ratio', message: IMAGE_VALIDATION_MESSAGES.invalidRatio };
  }
  return {
    ok: true,
    width: dimensions.width,
    height: dimensions.height,
    orientation,
    ratio,
  };
}

/**
 * Save an uploaded buffer to disk and return the public URL path.
 * Keeps filesystem access contained here (storage layering), so it can be
 * swapped for object storage later.
 */
export function saveImage(
  buffer: Buffer,
  originalName: string,
  folder: UploadFolder
): { url: string } | { error: string } {
  if (!isAllowedExtension(originalName)) {
    return { error: IMAGE_VALIDATION_MESSAGES.invalidType };
  }
  const dir = join(UPLOADS_DIR, folder);
  mkdirSync(dir, { recursive: true });
  const filename = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}${extname(originalName).toLowerCase()}`;
  writeFileSync(join(dir, filename), buffer);
  return { url: `/uploads/${folder}/${filename}` };
}

export { UPLOADS_DIR };
