import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* A system = one agentic project. The schema is deliberately opinionated:
   it forces the four things that make a case study credible, so a vague
   entry fails the build rather than shipping quietly. */
const systems = defineCollection({
  loader: glob({ base: './src/content/systems', pattern: '**/*.md' }),
  schema: z.object({
    lang: z.enum(['en', 'fr']),
    order: z.number(),
    /** true = structural slot, renders as an obvious placeholder. */
    placeholder: z.boolean().default(false),

    title: z.string(),
    summary: z.string(),

    /** What I owned. */
    role: z.string(),
    /** What it's built on. */
    stack: z.array(z.string()),
    /** What the agent decides with no human in the loop. This is the differentiator. */
    autonomy: z.string(),
    /** A number, or an honest "no number yet". Never a vague adjective. */
    outcome: z.string(),

    links: z.array(z.object({ label: z.string(), href: z.string().url() })).default([]),
    year: z.string().optional(),
  }),
});

export const collections = { systems };
