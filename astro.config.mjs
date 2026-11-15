// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import markdoc from '@astrojs/markdoc';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import keystatic from '@keystatic/astro';
import tailwindcss from '@tailwindcss/vite';

import { DEFAULT_LOCALE, LOCALES } from './src/i18n/config.ts';
import { untranslatedRoutes } from './src/i18n/untranslated-routes.ts';

// Single source of truth for the canonical origin. Change SITE_URL once a domain is bought.
const SITE_URL = process.env.SITE_URL ?? 'https://me.pages.dev';

const noindexRoutes = new Set(untranslatedRoutes());

// `astro dev` runs on Node so the Studio's local mode can read and write files.
// Builds, previews and deploys use the Cloudflare adapter (workerd).
const isDev = process.argv.includes('dev');

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: { format: 'file' },

  // Every page is prerendered to static HTML. Only the Keystatic routes run on the server.
  output: 'static',
  adapter: isDev
    ? undefined
    : cloudflare({
        // Optimize images with sharp at build time; nothing is transformed at request time.
        imageService: 'compile',
      }),
  session: false,

  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: { prefixDefaultLocale: false },
  },

  env: {
    schema: {
      STUDIO_BASIC_AUTH_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      STUDIO_BASIC_AUTH_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },

  image: {
    responsiveStyles: true,
  },

  integrations: [
    react(),
    markdoc(),
    keystatic(),
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: { en: 'en', id: 'id' },
      },
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '');
        if (path.startsWith('/keystatic') || path.startsWith('/api/')) return false;
        return !noindexRoutes.has(path);
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
