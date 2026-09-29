/**
 * Image upload rules for the blog editor.
 *
 * Every image the editor accepts must be within {@link MAX_IMAGE_BYTES} and — for
 * section images — match one of {@link ALLOWED_IMAGE_RATIOS} as measured from the
 * file's intrinsic pixels. The rules are enforced here before the file is
 * uploaded or inserted into editor state, and again on the server
 * (`server/services/imageStorage.ts`), which is the authority. The two modules
 * deliberately repeat the same numbers because the server is a self-contained
 * module graph; `scripts/verify-image-rules.mjs` fails if the two drift.
 */

/** Maximum upload size: 500 KB, defined as 500 * 1024 bytes. */
export const MAX_IMAGE_BYTES = 500 * 1024;

/** Human-readable size limit, reused in every message and hint. */
export const MAX_IMAGE_SIZE_LABEL = '500 KB';

/**
 * The only permitted section-image aspect ratios.
 *
 * Kept as exact fraction pairs so the comparison never depends on a rounded
 * decimal, and ordered so the UI can group them by orientation.
 */
export const ALLOWED_IMAGE_RATIOS = [
  { width: 2, height: 3, label: '2:3', orientation: 'portrait' },
  { width: 9, height: 16, label: '9:16', orientation: 'portrait' },
  { width: 16, height: 9, label: '16:9', orientation: 'landscape' },
  { width: 3, height: 2, label: '3:2', orientation: 'landscape' },
] as const;

/** Allowed portrait labels, in display order. */
export const ALLOWED_PORTRAIT_RATIOS = ALLOWED_IMAGE_RATIOS.filter(
  (r) => r.orientation === 'portrait'
).map((r) => r.label);

/** Allowed landscape labels, in display order. */
export const ALLOWED_LANDSCAPE_RATIOS = ALLOWED_IMAGE_RATIOS.filter(
  (r) => r.orientation === 'landscape'
).map((r) => r.label);

/**
 * Relative tolerance when matching `width / height` against an allowed ratio.
 *
 * Export/resize pipelines rarely land on the exact decimal, so exact equality
 * would reject conforming images such as 1264x848 (1.4906 vs 1.5). We accept a
 * *relative* deviation of 5% from the target ratio.
 *
 * That bound is chosen to be the loosest value that still separates every
 * explicitly-rejected ratio. The tightest neighbour in the whole set is 5:3
 * (1.6667) against 16:9 (1.7778), which is 6.25% away — so at 5% tolerance 5:3
 * is rejected, while a genuine 16:9 stays accepted. Do not raise this above
 * ~0.06 or 5:3 will start being accepted as 16:9.
 */
export const RATIO_TOLERANCE = 0.05;

/** Orientation derived from intrinsic dimensions, never from the filename. */
export type ImageOrientation = 'portrait' | 'landscape' | 'square';

/** Single source of truth for every validation message. */
export const IMAGE_VALIDATION_MESSAGES = {
  tooLarge: `Image size must be ${MAX_IMAGE_SIZE_LABEL} or less.`,
  square:
    'Square images are not supported. Please upload an image with one of the supported ratios: 2:3, 9:16, 16:9, or 3:2.',
  invalidRatio:
    'Invalid image ratio. Please upload a portrait image in 2:3 or 9:16, or a landscape image in 16:9 or 3:2.',
  unreadable: 'Could not read the image dimensions. Please upload a valid image file.',
} as const;

export type ImageValidationFailure = 'size' | 'square' | 'ratio' | 'unreadable';

export type ImageValidationResult =
  | {
      ok: true;
      width: number;
      height: number;
      orientation: ImageOrientation;
      /** The allowed ratio this image matched, if the ratio was checked. */
      ratio: string | null;
    }
  | { ok: false; reason: ImageValidationFailure; message: string };

/** Detect orientation from intrinsic dimensions. */
export function detectOrientation(
  width: number,
  height: number
): ImageOrientation {
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Find the allowed ratio an image matches, or `null` when it matches none.
 *
 * Only ratios of the image's real orientation are considered, so a landscape
 * image can never be accepted by a portrait ratio (or vice versa).
 */
export function matchAllowedRatio(
  width: number,
  height: number
): string | null {
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

/** Size check, shared by every upload path in the editor. */
export function validateImageFileSize(size: number): ImageValidationResult {
  if (size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'size', message: IMAGE_VALIDATION_MESSAGES.tooLarge };
  }
  return { ok: true, width: 0, height: 0, orientation: 'landscape', ratio: null };
}

/**
 * Dimension/ratio check. Square images are rejected first so they report the
 * dedicated square message rather than the generic ratio one.
 */
export function validateImageDimensions(
  width: number,
  height: number,
  options: { requireAspectRatio?: boolean } = {}
): ImageValidationResult {
  if (options.requireAspectRatio === false) {
    return {
      ok: true,
      width,
      height,
      orientation: detectOrientation(width, height),
      ratio: null,
    };
  }
  if (width <= 0 || height <= 0) {
    return {
      ok: false,
      reason: 'unreadable',
      message: IMAGE_VALIDATION_MESSAGES.unreadable,
    };
  }
  const orientation = detectOrientation(width, height);
  if (orientation === 'square') {
    return { ok: false, reason: 'square', message: IMAGE_VALIDATION_MESSAGES.square };
  }
  const ratio = matchAllowedRatio(width, height);
  if (!ratio) {
    return {
      ok: false,
      reason: 'ratio',
      message: IMAGE_VALIDATION_MESSAGES.invalidRatio,
    };
  }
  return { ok: true, width, height, orientation, ratio };
}

/**
 * Read a File's intrinsic dimensions in the browser. The file is local at this
 * point, so an object URL measures it without uploading anything; the URL is
 * always revoked.
 */
export function readImageFileDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(IMAGE_VALIDATION_MESSAGES.unreadable));
    };
    image.src = objectUrl;
  });
}

/**
 * The single entry point the editor uses before uploading an image.
 *
 * Order matters: file size is checked first (cheap, and the message is
 * unambiguous), then the intrinsic dimensions. Nothing is uploaded and no URL is
 * produced when this fails, so an invalid image can never reach editor state.
 */
export async function validateBlogImage(
  file: File,
  options: { requireAspectRatio?: boolean } = {}
): Promise<ImageValidationResult> {
  const sizeCheck = validateImageFileSize(file.size);
  if (!sizeCheck.ok) return sizeCheck;

  try {
    const { width, height } = await readImageFileDimensions(file);
    return validateImageDimensions(width, height, options);
  } catch {
    return {
      ok: false,
      reason: 'unreadable',
      message: IMAGE_VALIDATION_MESSAGES.unreadable,
    };
  }
}

/** Compact requirement summary rendered next to the upload control. */
export function describeImageRequirements(options: {
  requireAspectRatio?: boolean;
} = {}): string[] {
  const lines = [`Maximum size: ${MAX_IMAGE_SIZE_LABEL}`];
  if (options.requireAspectRatio === false) return lines;
  lines.push(`Portrait: ${ALLOWED_PORTRAIT_RATIOS.join(' or ')}`);
  lines.push(`Landscape: ${ALLOWED_LANDSCAPE_RATIOS.join(' or ')}`);
  return lines;
}
