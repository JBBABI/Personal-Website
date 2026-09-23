export const languages = { en: 'EN', fr: 'FR' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

export const ui = {
  en: {
    'nav.skipToMain': 'Skip to content',

    'nav.name': 'Jean-Baptiste Bonvarlet',
    'nav.research': 'Research',
    'research.title': 'Research index',
    'research.lede': 'Every arXiv paper matching a fixed set of terms on agentic engineering, tagged so you can filter them yourself instead of trusting a ranking.',
    'research.papers': 'papers',
    'research.updated': 'updated',
    'research.filterLabel': 'Filter by topic',
    'research.clear': 'clear',
    'research.more': 'Show more',
    'research.unsure': 'unsure',
    'research.unsureHint': 'The classifier could not confidently place this paper in or out of scope.',
    'research.note': 'Tags are assigned by a classifier, not by hand, and their accuracy has not been measured yet. Treat them as a way to narrow the list, not as fact.',

    'meta.title':       'Jean-Baptiste Bonvarlet',
    'meta.description': 'Jean-Baptiste Bonvarlet. I build AI tools for power and land projects at R&B Power. This site documents my work in agentic AI: what I build and what I learn.',

    'hero.welcome': 'Welcome',
    'hero.intro': 'This site documents my work in agentic AI: what I build, what I learn, and how I tell whether it works.',

    'now.label':   'Now',
    'now.updated': 'Updated',

    'contact.label': 'Elsewhere',
    'contact.linkedin': 'LinkedIn',

    'footer.built':  'Built with Astro. No trackers, no cookies, no analytics.',
    'theme.toggle':  'Toggle colour scheme',
  },

  fr: {
    'nav.skipToMain': 'Aller au contenu',

    'nav.name': 'Jean-Baptiste Bonvarlet',
    'nav.research': 'Recherche',
    'research.title': 'Index de recherche',
    'research.lede': "Tous les articles arXiv correspondant à une liste fixe de termes sur l'ingénierie agentique, étiquetés pour que vous puissiez les filtrer plutôt que de vous fier à un classement.",
    'research.papers': 'articles',
    'research.updated': 'mis à jour',
    'research.filterLabel': 'Filtrer par sujet',
    'research.clear': 'effacer',
    'research.more': 'Afficher plus',
    'research.unsure': 'incertain',
    'research.unsureHint': "Le classifieur n'a pas pu déterminer avec certitude si cet article entre dans le périmètre.",
    'research.note': "Les étiquettes sont attribuées par un classifieur, pas à la main, et leur exactitude n'a pas encore été mesurée. À utiliser pour restreindre la liste, pas comme un fait.",

    'meta.title':       'Jean-Baptiste Bonvarlet',
    'meta.description': "Jean-Baptiste Bonvarlet. Je construis des outils IA pour des projets d'énergie et de foncier chez R&B Power. Ce site documente mon travail en IA agentique.",

    'hero.welcome': 'Bienvenue',
    'hero.intro': "Ce site documente mon travail en IA agentique : ce que je construis, ce que j'apprends, et comment je sais si ça fonctionne.",

    'now.label':   'En ce moment',
    'now.updated': 'Mis à jour',

    'contact.label': 'Ailleurs',
    'contact.linkedin': 'LinkedIn',

    'footer.built':  'Construit avec Astro. Aucun traqueur, aucun cookie, aucune analytique.',
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
