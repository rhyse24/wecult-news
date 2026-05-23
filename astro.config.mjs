// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  base: '/news',
  outDir: './dist/news',
  vite: {
    plugins: [tailwindcss()]
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'tr', 'es', 'pt', 'ja'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});