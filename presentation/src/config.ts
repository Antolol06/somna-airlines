/**
 * Everything the team needs to fill in or adjust lives here.
 * Values set to `null` render as a dashed "To add" marker on screen, so nothing
 * unverified is ever presented as fact.
 */

/** Group members, in speaking order. Each slide names its speaker by index (0–3). */
export const TEAM: { name: string; role: string }[] = [
  { name: 'Presenter 1', role: 'Opening & the problem' },
  { name: 'Presenter 2', role: 'The product' },
  { name: 'Presenter 3', role: 'Live demo & how it began' },
  { name: 'Presenter 4', role: 'Behind the scenes' },
];

/**
 * The live website shown in the demo. Override at runtime with ?site=https://…
 * When the deck is published inside the website (…/presentation/), the demo opens that same
 * website; when it runs on its own (ports 5180/5181), it opens the website's dev server.
 */
const HOSTED_IN_SITE = typeof location !== 'undefined' && /\/presentation\/(index\.html)?$/.test(location.pathname);
export const SITE_URL = HOSTED_IN_SITE ? new URL('../', location.href).href : 'http://localhost:5173/';
/** The public link printed on the closing slides (null = not deployed yet). From our report. */
export const PUBLIC_URL: string | null = 'somnaairlines.netlify.app';

/** Course details for the title slide of Part II. */
export const COURSE = 'Generative Artificial Intelligence: Lab & Toolkits';
export const GROUP: string | null = null;

/**
 * Material we could not verify from the project history. The first three come from our project
 * report (“Chronologic Report of Generative AI Project”); the rest is still to supply.
 */
export const MISSING = {
  ideaOrigin:
    'We gave the course brief to Claude, ChatGPT and Gemini. Their ideas kept converging — memories, dreams, a “Dreamflix” — until more specific prompts led us to an airline where you sleep in pods, inspired by Japanese pod hotels.' as
      | string
      | null,
  briefAuthoring: 'ChatGPT wrote this brief from our own short request; we pasted it into Claude.' as string | null,
  otherTools: 'ChatGPT and Gemini (brainstorming, prompt writing) · Netlify (hosting)' as string | null,
  codexPrompts: null as string | null, // the prompts given to Codex and what was asked (not in the report)
  referenceImage: null as string | null, // path to the capsule-hotel reference image the first brief mentions
};
