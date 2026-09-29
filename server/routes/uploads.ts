import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  IMAGE_VALIDATION_MESSAGES,
  MAX_IMAGE_BYTES,
  saveImage,
  validateImageUpload,
  type UploadFolder,
} from '../services/imageStorage.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

const router = Router();

/**
 * Translate multer's own limit trips into the same 400 + message contract the
 * handler below uses. Without this, `LIMIT_FILE_SIZE` carries no HTTP status,
 * so an oversized file fell through to the central error handler and surfaced as
 * an opaque 500 instead of a size message the user can act on.
 */
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: IMAGE_VALIDATION_MESSAGES.tooLarge });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

router.post('/', handleUpload, (req, res) => {
  const folder = (req.body.folder as UploadFolder | undefined) === 'sections' ? 'sections' : 'banners';

  if (!req.file) {
    res.status(400).json({ error: 'Invalid image upload' });
    return;
  }

  // The authority: size, intrinsic orientation and aspect ratio are all decided
  // from the received bytes, never from what the client reported.
  const validation = validateImageUpload(
    req.file.buffer,
    req.file.size,
    req.file.originalname,
    folder
  );
  if (!validation.ok) {
    res.status(400).json({ error: validation.message });
    return;
  }

  const result = saveImage(req.file.buffer, req.file.originalname, folder);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(201).json({ url: result.url });
});

export default router;
