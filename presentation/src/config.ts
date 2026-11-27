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
/** The public link printed on the closing slides (null = not deployed yet). */
export const PUBLIC_URL: string | null = null;

/** Course details for the title slide of Part II. */
export const COURSE = 'Generative Artificial Intelligence: Lab & Toolkits';
export const GROUP: string | null = null;

/** Material we could not verify from the project history — please supply. */
export const MISSING = {
  ideaOrigin: null as string | null, // how the SŌMNA idea first came up (and whether AI helped brainstorm it)
  briefAuthoring: null as string | null, // was the first 2,105-word brief written by hand or drafted with an AI tool?
  codexPrompts: null as string | null, // the prompts given to Codex and what was asked
  otherTools: null as string | null, // any other GenAI tools (naming, images, audio…)
  referenceImage: null as string | null, // path to the capsule-hotel reference image the first brief mentions
};
