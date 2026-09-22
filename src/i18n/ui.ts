export const languages = { en: 'EN', fr: 'FR' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

export const ui = {
  en: {
    'nav.skipToMain': 'Skip to content',

    'meta.title':       'Jean-Baptiste Bonvarlet',
    'meta.description': 'Jean-Baptiste Bonvarlet. From marketing to AI engineering. I build tools for power and land projects: Power Scout and the R&B Power platform.',

    'hero.role':  'Marketing & AI tools',
    'hero.intro': 'I come from marketing. Now I build AI tools for power and land projects at R&B Power.',

    'now.label':   'Now',
    'now.updated': 'Updated',

    'contact.label': 'Elsewhere',
    'contact.email':    'Email',
    'contact.linkedin': 'LinkedIn',
    'contact.github':   'GitHub',

    'footer.built':  'Built with Astro. No trackers, no cookies, no analytics.',
    'footer.source': 'Source',
    'theme.toggle':  'Toggle colour scheme',
  },

  fr: {
    'nav.skipToMain': 'Aller au contenu',

    'meta.title':       'Jean-Baptiste Bonvarlet',
    'meta.description': "Jean-Baptiste Bonvarlet. Du marketing à l'ingénierie IA. Je construis des outils pour des projets d'énergie et de foncier : Power Scout, plateforme R&B Power.",

    'hero.role':  'Marketing & outils IA',
    'hero.intro': "Je viens du marketing. Je construis aujourd'hui des outils IA pour des projets d'énergie et de foncier chez R&B Power.",

    'now.label':   'En ce moment',
    'now.updated': 'Mis à jour',

    'contact.label': 'Ailleurs',
    'contact.email':    'Email',
    'contact.linkedin': 'LinkedIn',
    'contact.github':   'GitHub',

    'footer.built':  'Construit avec Astro. Aucun traqueur, aucun cookie, aucune analytique.',
    'footer.source': 'Code source',
    'theme.toggle':  'Changer de thème',
  },
} as const;

export function useTranslations(lang: Lang) {
  return function t(key: keyof typeof ui[typeof defaultLang]): string {
    return (ui[lang] as Record<string, string>)[key] ?? ui[defaultLang][key];
  };
}

/** Prefix a root-relative path with the locale segment. */
export function localePath(lang: Lang, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return lang === defaultLang ? clean : `/${lang}${clean === '/' ? '/' : clean}`;
}
