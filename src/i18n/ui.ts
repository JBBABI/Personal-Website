export const languages = { en: 'EN', fr: 'FR' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

export const ui = {
  en: {
    'nav.skipToMain': 'Skip to content',

    'meta.title':       'Jean-Baptiste Bonvarlet',
    'meta.description': 'Agentic engineering. A small page about what I am working on.',

    'hero.role':  'Agentic engineering',
    'hero.intro': 'This page is deliberately small. It is here so there is somewhere to point at while I build things worth writing up.',

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
    'meta.description': "Ingénierie agentique. Une petite page sur ce que je fais en ce moment.",

    'hero.role':  'Ingénierie agentique',
    'hero.intro': "Cette page est volontairement courte. Elle existe pour avoir quelque chose à montrer pendant que je construis des choses qui méritent d'être racontées.",

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
