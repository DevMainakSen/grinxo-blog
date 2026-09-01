/**
 * API configuration.
 *
 * The Vite dev server proxies `/api` and `/uploads` to the Node backend,
 * so relative URLs work in development. Set VITE_API_URL to override
 * (e.g. when the frontend is served separately from the backend).
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Base path for the blog admin panel. Kept under /blog so it does not clash
 * with GrinXO's main site admin (/admin).
 */
export const ADMIN_BASE_PATH = '/blog/admin';
