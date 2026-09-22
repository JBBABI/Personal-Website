// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://jeanbaptistebonvarlet.com',
  // Real routes per language (/ and /fr/) so both are indexable —
  // the old site used a JS display-toggle, which meant Google only ever
  // saw the English copy.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    routing: { prefixDefaultLocale: false },
  },
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
});
