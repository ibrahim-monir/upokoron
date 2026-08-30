import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    proxy: {
      /*
       * The API is proxied rather than called cross-origin, so the browser
       * sees one origin in development exactly as it will in production
       * (React at example.com, Laravel at example.com/api).
       *
       * changeOrigin stays false on purpose: Sanctum decides whether a
       * request is "stateful" by matching the Host header against
       * SANCTUM_STATEFUL_DOMAINS. Rewriting Host to the backend would make
       * every request look non-stateful and silently drop session cookie
       * auth back to token auth.
       */
      '/api': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: false,
      },
      '/sanctum': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: false,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: false,
      },
      '/sitemap.xml': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    // The admin panel is a separate chunk so a customer browsing the shop
    // never downloads the back office.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) return 'router'
            if (id.includes('@tanstack')) return 'query'
            return 'vendor'
          }
        },
      },
    },
  },
})
