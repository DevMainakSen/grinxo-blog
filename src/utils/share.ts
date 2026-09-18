/**
 * Web Share API + image helpers used by the Instagram sharing flow.
 *
 * These are capability checks rather than assumptions: a browser may or may
 * not support `navigator.share`, and file sharing (needed to hand an image to
 * the Instagram app) is a separate capability that must be probed with
 * `navigator.canShare`.
 */

export type NativeShareResult = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** Whether the browser exposes the Web Share API at all. */
export function isNativeShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Whether the browser can share files (Web Share Level 2). Without this we
 * cannot hand an image file to the native share sheet (e.g. for Instagram).
 */
export function canShareFiles(): boolean {
  if (!isNativeShareSupported() || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({
      files: [new File([''], 'share.jpg', { type: 'image/jpeg' })],
    });
  } catch {
    return false;
  }
}

/**
 * Invoke the native share sheet. Resolves with an honest result so callers
 * never claim a share succeeded when the user cancelled or the API failed.
 */
export async function nativeShare(input: ShareData): Promise<NativeShareResult> {
  if (!isNativeShareSupported()) return 'unsupported';
  try {
    await navigator.share(input);
    return 'shared';
  } catch (err) {
    // AbortError means the user dismissed the sheet — not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
    return 'failed';
  }
}

function extensionForMime(mime: string): string {
  const ext = mime.split('/')[1]?.toLowerCase() ?? '';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'avif') return ext;
  return 'jpg';
}

function sanitizeFileName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || 'blog';
}

/** Fetch an image as a File (for native file sharing). Null on any failure. */
export async function getImageFile(url: string, baseName: string): Promise<File | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'image/*' } });
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = extensionForMime(blob.type);
    return new File([blob], `${sanitizeFileName(baseName)}.${ext}`, {
      type: blob.type || 'image/jpeg',
    });
  } catch {
    return null;
  }
}

/**
 * Download an image to the user's device. The user explicitly chooses this
 * action; images are never downloaded automatically. Returns false when the
 * image could not be fetched (e.g. network/CORS), letting the caller fall back
 * to opening the image in a new tab.
 */
export async function downloadImage(url: string, baseName: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Accept: 'image/*' } });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${sanitizeFileName(baseName)}.${extensionForMime(blob.type)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a URL in a new tab. Returns false when the popup was blocked so callers
 * can surface that honestly rather than claiming an app/site was opened.
 */
export function openInNewTab(url: string): boolean {
  try {
    // `noopener,noreferrer` also prevents the opened page from reaching
    // `window.opener`, which keeps the sharing flow safe from reverse-tabnabbing.
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    return win !== null;
  } catch {
    return false;
  }
}