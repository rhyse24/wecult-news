// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  base: '/',
  compressHTML: true,
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'images.igdb.com' },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          // Keep vendor chunks separate for better long-term caching
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
          },
        },
      },
    },
  },
});