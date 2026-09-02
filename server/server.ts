import express from 'express';
import cors from 'cors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import blogsRouter from './routes/blogs.ts';
import uploadsRouter from './routes/uploads.ts';
import { initStorage, UPLOADS_DIR } from './services/blogStorage.ts';
import { startScheduler } from './services/scheduler.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5001);

// Ensure data + upload folders exist and seed blogs.json on first run.
initStorage();

// Recover due scheduled posts and periodically publish them.
startScheduler();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health check — used by the frontend to detect an unavailable backend.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Serve uploaded images as static files.
app.use('/uploads', express.static(UPLOADS_DIR));

// API routes.
app.use('/api/blogs', blogsRouter);
app.use('/api/uploads', uploadsRouter);
app.get('/api/categories', (_req, res) => {
  // Re-import to avoid a circular dependency; categories are computed live.
  void import('./services/blogStorage.ts').then((store) =>
    res.json(store.getCategories())
  );
});

// ============================================================
// PRODUCTION SPA fallback: if the client has been built (npm run build)
// into ./dist, serve it from this same server. This lets the whole prototype
// run with one command (npm run server) with no CORS/proxy needed.
// In development, run `npm run dev` (Vite proxies /api and /uploads here).
// ============================================================
const clientDist = join(__dirname, '..', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|uploads).*/, (_req, res, next) => {
    const indexPath = join(clientDist, 'index.html');
    if (existsSync(indexPath)) {
      res.send(readFileSync(indexPath, 'utf8'));
      return;
    }
    next();
  });
}

// 404 JSON handler for unknown API paths.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler.
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: 'Internal Server Error' });
  }
);

app.listen(PORT, () => {
  console.log(`GrinXO blog backend running at http://localhost:${PORT}`);
});
