export const languages = { en: 'EN', fr: 'FR' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

export const ui = {
  en: {
    'nav.index':      'Index',
    'nav.systems':    'Systems',
    'nav.trace':      'Trace',
    'nav.record':     'Record',
    'nav.contact':    'Contact',
    'nav.skipToMain': 'Skip to content',

    'meta.title':       'Jean-Baptiste Bonvarlet — Agentic Engineer',
    'meta.description': 'I build agentic systems that ship measurable business outcomes. Portfolio, architecture notes and execution traces.',

    'hero.status':   'Available',
    'hero.role':     'Agentic Engineer',
    'hero.headline': 'I build agentic systems that ship business outcomes.',
    'hero.sub':      'Operator background in growth and SEO. I design agents that do the work, and I measure what they changed.',
    'hero.cta':      'View systems',
    'hero.ctaAlt':   'Read the trace',

    'systems.label': 'Systems',
    'systems.title': 'Selected work',
    'systems.intro': 'Each entry states the problem, the architecture, what the agent decides without a human, and the result.',
    'systems.role':      'Role',
    'systems.stack':     'Stack',
    'systems.autonomy':  'Autonomy',
    'systems.outcome':   'Outcome',
    'systems.empty':     'Case studies are being written. The structure below is live; the content is next.',

    'trace.label':   'Execution trace',
    'trace.title':   'What a run actually looks like',
    'trace.intro':   'Anyone can claim they build agents. This is a real run: every tool call, its latency, its token cost, and the decision path the model took.',
    'trace.expand':  'Expand step',
    'trace.run':     'Run',
    'trace.model':   'Model',
    'trace.wall':    'Wall time',
    'trace.tokens':  'Tokens',
    'trace.cost':    'Cost',
    'trace.steps':   'Steps',
    'trace.status':  'Status',
    'trace.ok':      'Completed',

    'record.label':  'Track record',
    'record.title':  'Why the agents target outcomes',
    'record.intro':  'Before agents, I ran growth and SEO on live commercial sites. That is where the bias toward measurable results comes from.',

    'contact.label': 'Contact',
    'contact.title': 'Get in touch',
    'contact.intro': 'Open to agentic engineering roles and consulting work.',
    'contact.email':    'Email',
    'contact.linkedin': 'LinkedIn',
    'contact.github':   'GitHub',
    'contact.resume':   'Résumé (PDF)',

    'footer.built':  'Built with Astro. No trackers, no cookies, no analytics.',
    'footer.source': 'Source',
    'theme.toggle':  'Toggle colour scheme',
  },

  fr: {
    'nav.index':      'Index',
    'nav.systems':    'Systèmes',
    'nav.trace':      'Trace',
    'nav.record':     'Parcours',
    'nav.contact':    'Contact',
    'nav.skipToMain': 'Aller au contenu',

    'meta.title':       'Jean-Baptiste Bonvarlet — Ingénieur agentique',
    'meta.description': "Je conçois des systèmes agentiques qui produisent des résultats mesurables. Portfolio, notes d'architecture et traces d'exécution.",

    'hero.status':   'Disponible',
    'hero.role':     'Ingénieur agentique',
    'hero.headline': 'Je conçois des systèmes agentiques qui produisent des résultats concrets.',
    'hero.sub':      "Profil opérationnel en croissance et SEO. Je conçois des agents qui font le travail, et je mesure ce qu'ils ont changé.",
    'hero.cta':      'Voir les systèmes',
    'hero.ctaAlt':   'Lire la trace',

    'systems.label': 'Systèmes',
    'systems.title': 'Travaux sélectionnés',
    'systems.intro': "Chaque entrée présente le problème, l'architecture, ce que l'agent décide sans humain, et le résultat.",
    'systems.role':      'Rôle',
    'systems.stack':     'Stack',
    'systems.autonomy':  'Autonomie',
    'systems.outcome':   'Résultat',
    'systems.empty':     'Les études de cas sont en cours de rédaction. La structure ci-dessous est en place ; le contenu suit.',

    'trace.label':   "Trace d'exécution",
    'trace.title':   "À quoi ressemble vraiment une exécution",
    'trace.intro':   "Tout le monde peut prétendre construire des agents. Voici une exécution réelle : chaque appel d'outil, sa latence, son coût en tokens, et le chemin de décision du modèle.",
    'trace.expand':  "Déplier l'étape",
    'trace.run':     'Exécution',
    'trace.model':   'Modèle',
    'trace.wall':    'Durée',
    'trace.tokens':  'Tokens',
    'trace.cost':    'Coût',
    'trace.steps':   'Étapes',
    'trace.status':  'Statut',
    'trace.ok':      'Terminé',

    'record.label':  'Parcours',
    'record.title':  'Pourquoi mes agents visent le résultat',
    'record.intro':  "Avant les agents, je pilotais la croissance et le SEO de sites commerciaux en production. C'est de là que vient le biais vers le mesurable.",

    'contact.label': 'Contact',
    'contact.title': 'Me contacter',
    'contact.intro': 'Ouvert aux postes en ingénierie agentique et aux missions de conseil.',
    'contact.email':    'Email',
    'contact.linkedin': 'LinkedIn',
    'contact.github':   'GitHub',
    'contact.resume':   'CV (PDF)',

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
