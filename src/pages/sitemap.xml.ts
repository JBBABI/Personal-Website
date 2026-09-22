import type { APIRoute } from 'astro';
import { languages, localePath, defaultLang, type Lang } from '../i18n/ui';

// Hand-rolled rather than @astrojs/sitemap: the site is two routes, and this
// keeps the dependency tree (and the lockfile) untouched. Add paths here when
// new pages land.
const PATHS = ['/'];

const locales = Object.keys(languages) as Lang[];

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://jeanbaptistebonvarlet.com');
  const abs = (lang: Lang, path: string) => new URL(localePath(lang, path), origin).href;

  const entries = PATHS.flatMap((path) =>
    locales.map((lang) => {
      const alternates = [
        ...locales.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(l, path)}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(defaultLang, path)}" />`,
      ].join('\n');
      return `  <url>\n    <loc>${abs(lang, path)}</loc>\n${alternates}\n  </url>`;
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
