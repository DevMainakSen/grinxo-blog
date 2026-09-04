import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Node backend (npm run server) serves the REST API and uploaded images.
// During development the Vite dev server proxies those paths so the frontend
// can use same-origin relative URLs.
const backend = 'http://localhost:5001'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/uploads': { target: backend, changeOrigin: true },
      '/robots.txt': { target: backend, changeOrigin: true },
      '/sitemap.xml': { target: backend, changeOrigin: true },
    },
  },
})