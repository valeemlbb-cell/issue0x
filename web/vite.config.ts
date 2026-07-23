import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev proxy to the pons launchpad API (real Robinhood Chain token prices).
    // pons serves these same-origin with no CORS header, so a browser fetch from
    // our origin is blocked — the dev server proxies it server-side instead.
    // Prod serves the same shape from the agent runtime's /prices endpoint.
    proxy: {
      '/pons': {
        target: 'https://www.ponsfamily.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/pons/, '/api'),
      },
    },
  },
})
