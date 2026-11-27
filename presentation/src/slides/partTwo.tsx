import { useMemo } from 'react';
import { BeforeAfter, Brand, Clip, Counter, Eyebrow, Img, Lines, Missing, Rv, St, Typewriter, Wordmark, bt, d } from '../deck/components';
import type { SlideCtx, SlideDef } from '../deck/types';
import { COURSE, GROUP, MISSING, PUBLIC_URL, TEAM } from '../config';
// genuine source code from the finished website, read at build time (never modified)
import cameraSource from '@site/three/scenes/cabinCamera.ts?raw';

// ---------------------------------------------------------------- the verified record
/**
 * The prompts Claude received, exactly as sent (local time, Rome; word counts from the conversation
 * log). Where our report quotes the request we first gave ChatGPT to turn into a prompt (meta-prompting),
 * it is shown as `ours`, verbatim.
 */
const PROMPTS: { when: string; words: number; label: string; quote: string; also: string; ours?: string; result: string; img: string }[] = [
  {
    when: 'Nov 25 · 21:11',
    words: 2105,
    label: 'The creative brief',
    quote: 'Design and develop a fully functional, cinematic, interactive 3D website for SŌMNA.',
    also: 'The website should feel like an interactive short film in which the visitor controls the camera and the journey.',
    result: 'v1 running 55 minutes later: seven chapters, a 3D aircraft, the capsule, a globe and a dream sequence.',
    img: 'history/v1_hero.jpg',
  },
  {
    when: 'Nov 25 · 22:35',
    words: 498,
    label: 'First critique',
    quote: 'The cabin presentation is currently the weakest part of the website.',
    also: 'Pay particular attention to the rendering of the "Ō" character.',
    result: 'v2: a faster globe, a hand-drawn macron, a capsule-hotel cabin.',
    img: 'history/v2_cabin_seats.jpg',
  },
  {
    when: 'Nov 26 · 10:04',
    words: 1290,
    label: 'The quality pass',
    ours: 'I do not want the cabin to be like one man is walking and the screen is shacking.',
    quote: 'I do not like the current first-person walking effect inside the aircraft cabin.',
    also: 'Do not generate generic city skylines and simply change their names.',
    result: 'v3: three cabins, licensed photographs of real cities, the globe’s white flashes traced to their cause.',
    img: 'history/v3_cabin_panel.jpg',
  },
  {
    when: 'Nov 26 · 12:14',
    words: 744,
    label: 'With a screen recording',
    quote: 'Think of a camera mounted on a professional cinematic dolly rather than a first-person video game.',
    also: 'Create a realistic, interactive touchscreen physically integrated into the capsule wall.',
    result: 'v4: a dolly camera, a choreographed entrance, a working touchscreen in the wall.',
    img: 'history/dolly_centred.jpg',
  },
];

const FAILS = [
  { img: 'history/wordmark_tests.jpg', t: 'A brand name that broke', p: 'Web fonts could not place the macron over the Ō.', f: 'We drew it in code instead.' },
  { img: 'history/globe_halo.jpg', t: 'A globe that flashed', p: 'Laggy, with white flashes when dragged.', f: 'Root causes: an undefined shader maths call and over-bright clouds.' },
  { img: 'history/v1_tokyo_ui.jpg', t: 'A Tokyo that was not Tokyo', p: 'Generated skylines looked fake.', f: 'Replaced by eight licensed photographs.' },
  { img: 'history/dubai_text_over.jpg', t: 'Words over the landmark', p: 'The title covered the Burj Khalifa.', f: 'Each photo got its own layout.' },
  { img: 'history/v1_cabin.jpg', t: '“A first-person video game”', p: 'A walking, bobbing camera.', f: 'Rebuilt as a dolly with set shots.' },
  { img: 'history/v1_blank.jpg', t: 'Empty frames', p: 'Blank screens between scenes.', f: 'Scenes compiled before they are needed.' },
  { img: 'history/showcase_tight.jpg', t: 'Too close', p: 'Showcase shots overfilled the lens.', f: 'Framing scaled to each capsule.' },
  { img: 'history/wall_haze.jpg', t: 'Turning into a wall', p: 'Waking up, the camera stared at a wall.', f: 'The gaze now lifts to the ceiling light.' },
];

// ---------------------------------------------------------------- 14 · part II opener
function Behind(c: SlideCtx) {
  const code = useMemo(() => cameraSource.split('\n').slice(0, 64).join('\n'), []);
  return (
    <>
      <div className="bh-render">
        <Img src="site/c_hero_side.jpg" className="kenburns" />
      </div>
      <div className="bh-code" aria-hidden="true">
        <pre>{code}</pre>
        <span className="annot bh-file">src/three/scenes/cabinCamera.ts — from the live site</span>
      </div>
      <div className="bh-title">
        <Eyebrow at={0.2}>Part II · Behind the scenes</Eyebrow>
        <h1 className="d-xl">
          <Lines lines={['Behind', <em key="e">the dream.</em>]} at={0.3} />
        </h1>
        <Rv at={1} as="p" className="lede">
          How we built <Brand /> with Generative AI — ideas from three models, prompts sharpened with ChatGPT, code by Claude, nineteen hours.
        </Rv>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 15 · the idea
const Idea = (c: SlideCtx) => (
  <>
    <div className="id-quote">
      <Eyebrow at={0.1}>Where it began</Eyebrow>
      <blockquote className="d-m">
        <Lines lines={['“We are not selling flights.', <em key="e">We are selling the feeling of</em>, <em key="f">waking up somewhere new.”</em>]} at={0.25} gap={0.16} />
      </blockquote>
      <Rv at={1.2} className="annot">
        The first line of our first prompt · Nov 25, 21:11
      </Rv>
      <Rv at={1.4} className="id-missing">
        {MISSING.ideaOrigin ? <p className="lede">{MISSING.ideaOrigin}</p> : <Missing label="how the idea first came up — and whether AI helped brainstorm it" />}
      </Rv>
    </div>
    <div className="id-brief">
      <Rv at={0.6} className="id-count">
        <strong>
          <Counter to={2105} c={c} delay={0.6} />
        </strong>
        <span className="annot">words in our first prompt — a full creative brief</span>
      </Rv>
      <dl className="id-anatomy">
        {[
          ['Name & promise', 'SŌMNA · Fall asleep here. Wake up anywhere.'],
          ['Inspiration', 'Apple product pages · Lusion · oryzo.ai · Aman · capsule hotels'],
          ['Rules', 'No stock photography, no generic SaaS layouts, no copying'],
          ['Structure', 'Seven chapters, from a dark opening to a sunrise finale'],
        ].map(([k, v], i) => (
          <Rv at={0.9 + i * 0.12} key={k} as="div">
            <dt>{k}</dt>
            <dd>{bt(v)}</dd>
          </Rv>
        ))}
        <Rv at={1.4} as="div">
          <dt>Palette</dt>
          <dd className="id-swatches">
            {['#090B10', '#111827', '#F2EDE4', '#C8AD85', '#E7AE70'].map((h) => (
              <span key={h} style={{ background: h }} title={h} />
            ))}
          </dd>
        </Rv>
      </dl>
    </div>
  </>
);

// ---------------------------------------------------------------- 16 · the toolkit
const TOOLS = [
  { n: 'Claude · ChatGPT · Gemini', by: 'three models', role: 'The brainstorm', use: 'We gave all three the course brief. Their ideas converged — memories, dreams, a “Dreamflix” — until our prompts became more specific.' },
  { n: 'ChatGPT', by: 'OpenAI', role: 'The prompt writer', use: 'Turned our own words into detailed prompts for Claude — meta-prompting, based on our specifications.' },
  { n: 'Claude Code', by: 'Anthropic', role: 'The builder', use: 'Wrote and debugged the site in 1,242 agent steps, and checked its own work in its browser: 157 screenshots, 126 in-page measurements.' },
  { n: 'Codex', by: 'OpenAI', role: 'The finisher', use: 'The final polish on day two, 13:20–16:28: 33 files — showcase, navigation, cabin map, the capsule tablet, a demo checkout and a downloadable boarding pass.' },
  { n: 'Unsplash', by: 'human photographers', role: 'The destinations', use: 'Eight licensed photographs of real cities — chosen with the AI, credited on screen. Not AI-generated.' },
  { n: 'Code, not stock', by: 'procedural', role: 'Everything else', use: 'Aircraft, cabins, capsules, clouds and sky are generated in code; the globe uses NASA’s public-domain satellite textures.' },
  { n: 'Netlify', by: 'hosting', role: 'The launch', use: 'Hosts the website and this presentation: somnaairlines.netlify.app.' },
];
const Tools = (c: SlideCtx) => (
  <>
    <div className="tl-head">
      <Eyebrow at={0.1}>The toolkit</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['One studio,', <em key="e">mostly made of prompts.</em>]} at={0.2} />
      </h1>
      <Rv at={1.2} as="p" className="lede tl-meta">
        This deck was made the same way: a 1,240-word brief written with ChatGPT, built by Claude Code — and it runs the website’s own 3D, live.
      </Rv>
      {!MISSING.otherTools && (
        <Rv at={1.4}>
          <Missing label="any other AI tools we used (naming, images, audio…)" />
        </Rv>
      )}
    </div>
    <div className="tl-table">
      {TOOLS.map((t, i) => (
        <Rv className="tl-row" at={0.4 + i * 0.1} key={t.n}>
          <div className="tl-name">
            <strong>{t.n}</strong>
            <span className="annot">{t.by}</span>
          </div>
          <span className="tl-role">{t.role}</span>
          <p>
            {t.use}
          </p>
        </Rv>
      ))}
    </div>
  </>
);

// ---------------------------------------------------------------- 17 · the prompts
const Prompts = (c: SlideCtx) => {
  const cur = Math.min(3, c.still ? 0 : c.step);
  const p = PROMPTS[cur];
  return (
    <>
      <div className="pr-rail">
        <Eyebrow at={0.1}>The prompts that shaped it</Eyebrow>
        <ol>
          {PROMPTS.map((x, i) => (
            <li key={x.when} className={i === cur ? 'on' : i < cur ? 'done' : ''}>
              <span className="annot">{x.when}</span>
              <strong>{x.label}</strong>
              <span className="annot">{x.words.toLocaleString('en-GB')} words</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="pr-main" key={cur}>
        <span className="annot pr-num">Prompt 0{cur + 1} · sent to Claude · verbatim</span>
        <blockquote className="d-m">“{bt(p.quote)}”</blockquote>
        {p.ours ? (
          <p className="pr-also pr-ours">
            <span className="annot">Our words, to ChatGPT</span>“{p.ours}”
          </p>
        ) : (
          <p className="pr-also">“{p.also}”</p>
        )}
        <div className="pr-result">
          <Img src={p.img} />
          <div>
            <span className="annot">What came back</span>
            <p>{p.result}</p>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------------------------------------------------------------- 18 · prompt → result
const PromptResult = (c: SlideCtx) => (
  <>
    <div className="px-prompt">
      <Eyebrow at={0.1}>Prompt → result</Eyebrow>
      <p className="px-type">
        <Typewriter c={c} text="Think of a camera mounted on a professional cinematic dolly rather than a first-person video game." cps={34} delay={0.6} />
      </p>
      <Rv at={0.3} className="annot">
        Prompt 04 · Nov 26, 12:14 · sent with a 20-second screen recording of what felt wrong
      </Rv>
    </div>
    <div className="px-compare">
      <St c={c} at={1} className="px-side">
        <div className="px-vid">
          <Clip name="before_cabin" c={{ ...c, active: c.active && c.step >= 1 }} />
        </div>
        <span className="annot">Before · our own screen recording</span>
      </St>
      <St c={c} at={1} className="px-side" style={d(0.25)}>
        <div className="px-vid">
          <Clip name="cabin" c={{ ...c, active: c.active && c.step >= 1 }} />
        </div>
        <span className="annot">After · captured from the live site</span>
      </St>
    </div>
  </>
);

// ---------------------------------------------------------------- 19 · evolution timeline
const STAGES = [
  { t: 'Nov 25 · 21:11', h: 'The brief', b: '2,105 words', img: null },
  { t: '22:06', h: 'v1 is live', b: 'First self-review screenshots', img: 'history/v1_hero.jpg' },
  { t: '22:35', h: 'v2', b: 'Globe, the Ō, a new cabin', img: 'history/v2_cabin.jpg' },
  { t: 'Nov 26 · 10:04', h: 'v3', b: 'Three cabins, real cities', img: 'history/v3_os.jpg' },
  { t: '12:14', h: 'v4', b: 'Dolly camera, wall touchscreen', img: 'history/tablet_canvas.jpg' },
  { t: '13:20–16:28', h: 'v5 · Codex', b: 'Tablet, cabin map, checkout, boarding pass', img: 'site/u_panel_relax.jpg' },
];
const Timeline = (c: SlideCtx) => (
  <>
    <div className="ev-head">
      <Eyebrow at={0.1}>Evolution</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['First prompt to finished site:', <em key="e">19 hours, 17 minutes.</em>]} at={0.2} />
      </h1>
    </div>
    <div className="ev-track">
      <span className="ev-line rv" style={d(0.5)} />
      {STAGES.map((s, i) => (
        <Rv className="ev-stop" at={0.6 + i * 0.14} key={s.t}>
          <div className={`ev-img ${s.img ? '' : 'ev-img-text'}`}>{s.img ? <Img src={s.img} /> : <span className="ev-words">2,105</span>}</div>
          <i className="ev-dot" />
          <span className="annot">{s.t}</span>
          <h3>{s.h}</h3>
          <p>{s.b}</p>
        </Rv>
      ))}
    </div>
    <Rv at={1.6} className="annot ev-note">
      Times from the project’s own conversation log and file history · Rome time
    </Rv>
  </>
);

// ---------------------------------------------------------------- 20 · what didn't work
const Fails = (c: SlideCtx) => (
  <>
    <div className="fl-head">
      <Eyebrow at={0.1}>What did not work</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['The AI was confident.', <em key="e">It was not always right.</em>]} at={0.2} />
      </h1>
    </div>
    <div className="fl-grid">
      {FAILS.map((f, i) => (
        <Rv className="fl-item" at={0.4 + i * 0.07} key={f.t}>
          <div className="fl-img">
            <Img src={f.img} />
          </div>
          <h3>{f.t}</h3>
          <p>{f.p}</p>
          <p className="fl-fix">{f.f}</p>
        </Rv>
      ))}
    </div>
  </>
);

// ---------------------------------------------------------------- 21 · before / after
const PAIRS = [
  { k: 'Arriving', before: 'history/v1_tokyo_ui.jpg', after: 'site/u_arrival_tokyo.jpg', note: 'A generated skyline “called” Tokyo → a real photograph of Tokyo Tower at sunrise.' },
  { k: 'Capsule controls', before: 'history/v1_settings.jpg', after: 'site/u_panel_relax.jpg', note: 'A web form floating over 3D → a tablet built into the capsule wall.' },
  { k: 'The cabin', before: 'history/v1_cabin.jpg', after: 'site/c_cabin_aisle.jpg', note: 'A dim corridor seen while “walking” → an architectural cabin on a dolly.' },
];
const BeforeAfterSlide = (c: SlideCtx) => {
  const cur = Math.min(2, c.still ? 0 : c.step);
  const p = PAIRS[cur];
  return (
    <>
      <div className="bf-head">
        <Eyebrow at={0.1}>Before / after</Eyebrow>
        <div className="bf-tabs">
          {PAIRS.map((x, i) => (
            <span key={x.k} className={i === cur ? 'on' : ''}>
              0{i + 1} · {x.k}
            </span>
          ))}
        </div>
      </div>
      <Rv at={0.3} className="bf-frame">
        <BeforeAfter key={cur} before={p.before} after={p.after} labels={['Version 1 · Nov 25', 'Final']} c={c} />
      </Rv>
      <p className="bf-note lede" key={`n${cur}`}>
        {p.note}
      </p>
      <span className="annot bf-hint">Drag the line · genuine version-1 screenshots</span>
    </>
  );
};

// ---------------------------------------------------------------- 22 · human in the loop
// Our own words only.
// Quotes 1, 4 and 5 are from our requests as quoted in the report; 2 and 3 are our replies to Claude.
const DECISIONS = [
  { q: 'I do not want the cabin to be like one man is walking', ctx: 'We judged the work. The AI never decided something was good enough.' },
  { q: 'Only free things.', ctx: 'Claude asked whether to buy a map service or use licensed photos. We chose free, licensed photography.' },
  { q: 'Yes, download them.', ctx: 'We approved the eight destination photos from forty-eight candidates.' },
  { q: 'Let me try the checkout like a real booking.', ctx: 'We asked for the real thing: card details you can type, a ticket you can download.' },
  { q: 'rewrite as a good prompt.', ctx: 'We said what we wanted in our own words — ChatGPT turned it into precise prompts for Claude.' },
];
const Human = (c: SlideCtx) => (
  <>
    <div className="hm-head">
      <Eyebrow at={0.1}>Human in the loop</Eyebrow>
      <h1 className="d-l">
        <Lines lines={['AI proposed.', <em key="e">We decided.</em>]} at={0.2} />
      </h1>
      <Rv at={0.8} className="hm-img">
        <Img src="history/photo_candidates.jpg" />
        <span className="annot">48 candidate photographs, eight chosen</span>
      </Rv>
    </div>
    <ol className="hm-list">
      {DECISIONS.map((x, i) => (
        <Rv as="li" at={0.5 + i * 0.12} key={x.q}>
          <q>{x.q}</q>
          <p>{x.ctx}</p>
        </Rv>
      ))}
    </ol>
  </>
);

// ---------------------------------------------------------------- 23 · by the numbers
const NUMBERS: { n: number; f?: (v: number) => string; l: string }[] = [
  { n: 19.3, f: (v) => v.toFixed(1), l: 'hours from first prompt to finished site' },
  { n: 8, l: 'messages we sent Claude Code to build the website' },
  { n: 1242, l: 'agent steps in one conversation' },
  { n: 157, l: 'screenshots the AI took to review its own work' },
  { n: 14015, l: 'lines of code across 57 files' },
  { n: 0, l: '3D models bought or downloaded' },
];
const Numbers = (c: SlideCtx) => (
  <>
    <div className="nb-head">
      <Eyebrow at={0.1}>By the numbers</Eyebrow>
    </div>
    <div className="nb-grid">
      {NUMBERS.map((x, i) => (
        <Rv className="nb-item" at={0.2 + i * 0.1} key={x.l}>
          <strong>
            <Counter to={x.n} c={c} delay={0.2 + i * 0.1} format={x.f} />
          </strong>
          <span>{x.l}</span>
        </Rv>
      ))}
    </div>
    <Rv at={1} className="annot nb-note">
      Measured from the conversation log, file history and source code · 19.3 h = Nov 25, 21:11 → Nov 26, 16:28
    </Rv>
  </>
);

// ---------------------------------------------------------------- 24 · pros & cons
// Word for word from our project report (“Final Evaluation of Pros and Cons”); each item's
// first words are set brighter, the rest of the sentence follows unchanged.
const PROS: [string, string][] = [
  ['Fast output', ' (subject to how demanding the task is)'],
  ['Increased productivity', ' (possibility to subsequently work on multiple tasks)'],
  ['Easy interface', ' due to simple chat mechanics'],
  ['Capable of asking clarifying question', ' intermittently'],
];
const CONS: [string, string][] = [
  ['Large output convergence', ', giving rise to AI slop'],
  ['False sense of confidence', ' in presenting AI slop as unique and original'],
  ['Presentation of arbitrary/subjective values', ' with little-to-no added value'],
  ['There are time and token limit-related constraints', ''],
  ['Requirement to point out flaws in the output.', ''],
];
const Honest = (c: SlideCtx) => (
  <>
    <div className="hn-head">
      <Eyebrow at={0.1}>From our report</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['Final evaluation', <em key="e">of pros and cons.</em>]} at={0.2} />
      </h1>
    </div>
    <div className="hn-cols">
      {([
        ['Pros', PROS, ''],
        ['Cons', CONS, 'hn-tag-c'],
      ] as const).map(([tag, items, cls]) => (
        <div key={tag}>
          <Rv at={0.5} className={`annot hn-tag ${cls}`}>
            {tag}
          </Rv>
          {items.map(([lead, rest], i) => (
            <Rv at={0.6 + i * 0.1} className="hn-item" key={lead} as="p">
              <b>{lead}</b>
              {rest}
            </Rv>
          ))}
        </div>
      ))}
    </div>
  </>
);

// ---------------------------------------------------------------- 25 · final
const Final = (c: SlideCtx) => (
  <>
    <Clip name="arrival" c={c} className="bg" loop={false} />
    <div className="shade-full fn-shade" />
    <div className="fn-text">
      <p className="d-l fn-line">
        <Lines lines={['Every journey begins with a destination.', <em key="e">Ours began with a prompt.</em>]} at={0.6} gap={0.5} />
      </p>
      <Rv at={2.4} className="fn-brand">
        <Wordmark />
      </Rv>
      <Rv at={3} as="p" className="fn-tag">
        Fall asleep here. Wake up anywhere.
      </Rv>
      <Rv at={3.5} className="fn-team">
        {TEAM.map((m) => (
          <span key={m.name}>{m.name}</span>
        ))}
      </Rv>
      <Rv at={3.7} className="annot fn-meta">
        Thank you · {GROUP ?? COURSE}
        {PUBLIC_URL ? ` · ${PUBLIC_URL}` : ''}
      </Rv>
    </div>
  </>
);

export const PART_TWO: SlideDef[] = [
  {
    id: 'behind',
    part: 'II',
    chapter: 'Behind the scenes',
    title: 'Behind the dream',
    speaker: 2,
    seconds: 15,
    className: 's-behind',
    render: Behind,
    notes: 'Part II. On the left, the product; on the right, the real code behind its camera — written by AI, directed by us. “Three models for the idea, ChatGPT to sharpen the prompts, Claude for the build — nineteen hours.”',
  },
  {
    id: 'idea',
    part: 'II',
    chapter: 'The idea',
    title: 'Where it began',
    speaker: 2,
    seconds: 30,
    className: 's-idea',
    render: Idea,
    notes:
      'We started by giving the course brief to Claude, ChatGPT and Gemini — and they kept converging on the same ideas: memories, dreams, a “Dreamflix”. Only when we made our prompts more specific did we find ours: an airline where you sleep in pods, inspired by Japanese pod hotels. Then we wrote our first prompt, inspired by Apple’s scrolling pages and oryzo.ai: a 2,105-word creative brief — the name, the promise, the palette, the rules — and pasted it into Claude.',
  },
  {
    id: 'tools',
    part: 'II',
    chapter: 'The tools',
    title: 'The toolkit',
    speaker: 2,
    seconds: 35,
    className: 's-tools',
    render: Tools,
    notes:
      'Three models for the brainstorm. ChatGPT as our prompt writer — we told it what we wanted, it wrote the detailed prompts. Claude Code built the product and checked its own work in its browser; Codex did the final polish. The photographs are real, licensed photos by human photographers — we chose not to fake cities. Everything 3D is generated in code, and Netlify hosts it all. This deck was made the same way. Hand over to Speaker 4.',
  },
  {
    id: 'prompts',
    part: 'II',
    chapter: 'Key prompts',
    title: 'The prompts that shaped it',
    speaker: 3,
    seconds: 45,
    steps: 3,
    className: 's-prompts',
    render: Prompts,
    notes:
      'Four prompts did most of the work — quoted verbatim. 01 our creative brief. → 02 the first critique: the cabin was the weakest part, and the Ō was broken. → 03 here ChatGPT helped: compare our words — “one man is walking and the screen is shacking” — with the prompt it made of them (meta-prompting). → 04 with a screen recording: a camera on a dolly.',
  },
  {
    id: 'prompt-result',
    part: 'II',
    chapter: 'Iteration',
    title: 'Prompt → result',
    speaker: 3,
    seconds: 30,
    steps: 1,
    className: 's-prompt-result',
    render: PromptResult,
    notes: 'One sentence changed the cabin. Let it type. → Left: our own recording of the old walkthrough. Right: the result — a stable dolly with composed showcase shots.',
  },
  {
    id: 'timeline',
    part: 'II',
    chapter: 'Evolution',
    title: '19 hours, 17 minutes',
    speaker: 3,
    seconds: 30,
    className: 's-timeline',
    render: Timeline,
    notes: 'The whole evolution: the brief at 21:11; a running v1 at 22:06; four versions with Claude Code — slowed down by its usage limits — then Codex refinements from 13:20 to 16:28 the next day. Every timestamp comes from the project log and file history.',
  },
  {
    id: 'fails',
    part: 'II',
    chapter: 'Failures',
    title: 'What did not work',
    speaker: 3,
    seconds: 40,
    className: 's-fails',
    render: Fails,
    notes:
      'The brief asked us to show what went wrong — so here are eight genuine failures, screenshot by the AI itself. Pick two or three: the broken Ō, the fake Tokyo, the camera that felt like a video game. Each one was caught by us and fixed through prompting.',
  },
  {
    id: 'before-after',
    part: 'II',
    chapter: 'Iteration',
    title: 'Before / after',
    speaker: 3,
    seconds: 35,
    steps: 2,
    className: 's-before-after',
    render: BeforeAfterSlide,
    notes: 'Drag the line, or just let it sweep. Arrival: a generated city vs. the real Tokyo. → Capsule controls: a web form vs. a tablet in the wall. → The cabin: version 1 vs. final.',
  },
  {
    id: 'human',
    part: 'II',
    chapter: 'Human decisions',
    title: 'AI proposed. We decided.',
    speaker: 0,
    seconds: 25,
    className: 's-human',
    render: Human,
    notes: 'Every quote here is something we typed ourselves — several of the prompts Claude received were ChatGPT’s rewrites of words like these. We judged quality, set limits (“only free things”, when Claude asked about a paid map service), chose the photographs, asked for the real thing — and decided when it was finished.',
  },
  {
    id: 'numbers',
    part: 'II',
    chapter: 'By the numbers',
    title: 'By the numbers',
    speaker: 0,
    seconds: 15,
    className: 's-numbers',
    render: Numbers,
    notes: 'Quick: 19.3 hours, 8 messages to Claude Code, 1,242 agent steps, 157 self-review screenshots, 14,015 lines of code — and not a single 3D model bought or downloaded.',
  },
  {
    id: 'honest',
    part: 'II',
    chapter: 'Pros & cons',
    title: 'Pros and cons',
    speaker: 1,
    seconds: 35,
    className: 's-honest',
    render: Honest,
    notes:
      'Our final evaluation, as in the report. Pros: fast output — depending on how demanding the task is; increased productivity, because we could work on several tasks at once; an easy chat interface; and it asks clarifying questions along the way. Cons: the outputs converge, which gives rise to AI slop — and a false sense of confidence in presenting that slop as unique and original; arbitrary, subjective values with little added value; time and token limits; and we always had to point out the flaws in the output ourselves.',
  },
  {
    id: 'final',
    part: 'II',
    chapter: 'Closing',
    title: 'Ours began with a prompt',
    speaker: 1,
    seconds: 25,
    className: 's-final',
    render: Final,
    notes: '“Every journey begins with a destination. Ours began with a prompt.” Let the wordmark land. “SŌMNA — fall asleep here, wake up anywhere. Thank you.” All four presenters step forward.',
  },
];
