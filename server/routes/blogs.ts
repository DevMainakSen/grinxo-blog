import { Router } from 'express';
import {
  createBlog,
  deleteBlog,
  getBlogBySlug,
  getBlogById,
  listBlogs,
  scheduleBlog,
  setStatus,
  updateBlog,
} from '../controllers/blogs.ts';

const router = Router();

router.get('/', listBlogs);
router.get('/slug/:slug', getBlogBySlug);
router.get('/:id', getBlogById);
router.post('/', createBlog);
router.put('/:id', updateBlog);
router.delete('/:id', deleteBlog);
router.post('/:id/publish', setStatus);
router.post('/:id/draft', setStatus);
router.post('/:id/schedule', scheduleBlog);

export default router;
