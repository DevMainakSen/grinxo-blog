import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { UPLOADS_DIR } from './blogStorage.ts';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export type UploadFolder = 'banners' | 'sections';

export function isAllowedExtension(filename: string): boolean {
  return ALLOWED_EXT.has(extname(filename).toLowerCase());
}

export function isWithinSizeLimit(size: number): boolean {
  return size > 0 && size <= MAX_BYTES;
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
  const ext = extname(originalName).toLowerCase();
  if (!isAllowedExtension(originalName)) {
    return { error: 'Invalid image type. Allowed: jpg, png, gif, webp' };
  }
  const dir = join(UPLOADS_DIR, folder);
  mkdirSync(dir, { recursive: true });
  const filename = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}${ext}`;
  writeFileSync(join(dir, filename), buffer);
  return { url: `/uploads/${folder}/${filename}` };
}

export { UPLOADS_DIR };
