import { Router } from 'express';
import multer from 'multer';
import { isWithinSizeLimit, saveImage, type UploadFolder } from '../services/imageStorage.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const router = Router();

router.post('/', upload.single('image'), (req, res) => {
  const folder = (req.body.folder as UploadFolder | undefined) === 'sections' ? 'sections' : 'banners';

  if (!req.file) {
    res.status(400).json({ error: 'Invalid image upload' });
    return;
  }

  if (!isWithinSizeLimit(req.file.size)) {
    res.status(400).json({ error: 'Image too large (max 8 MB)' });
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
