import { useMemo, useState } from 'react';
import { Brand, Clip, Eyebrow, Img, Lines, Rv, St, Wordmark, bt, d } from '../deck/components';
import type { SlideCtx, SlideDef } from '../deck/types';
import { TIERS, type TierId } from '@site/data/capsules';
import { PUBLIC_URL, SITE_URL } from '../config';
import { Live3D } from '../deck/live/LiveLayer';
import { SHOTS } from '../deck/live/state';

const eur = (n: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const dims = (t: TierId) => `${TIERS[t].dims.l.toFixed(2)} × ${TIERS[t].dims.w.toFixed(2)} × ${TIERS[t].dims.h.toFixed(2)} m`;

// ---------------------------------------------------------------- 01 · cold open
const ColdOpen = (c: SlideCtx) => (
  <>
    <div className="cold-mark rv" style={d(0.2)}>
      <i />
    </div>
    <p className="cold-line">
      <span className="rv" style={d(1.1)}>
        Tonight, somewhere over the ocean,
      </span>
      <span className="rv" style={d(2.9)}>
        someone is trying to sleep <em>sitting up.</em>
      </span>
    </p>
  </>
);

// ---------------------------------------------------------------- 02 · the problem
function SeatMap({ c }: { c: SlideCtx }) {
  const rows = 9;
  const blocks = [3, 4, 3];
  const seats: { x: number; y: number; k: number }[] = [];
  let k = 0;
  for (let r = 0; r < rows; r++) {
    let x = 0;
    blocks.forEach((n, b) => {
      for (let i = 0; i < n; i++) seats.push({ x: x + i * 58, y: r * 74, k: k++ });
      x += n * 58 + 64;
      void b;
    });
  }
  const dissolve = c.still || c.step >= 2;
  return (
    <svg className={`seatmap ${dissolve ? 'dissolve' : ''}`} viewBox="-20 -20 760 700" aria-hidden="true">
      <g className="seats">
        {seats.map((s) => (
          <g key={s.k} transform={`translate(${s.x} ${s.y})`} style={{ transitionDelay: `${(s.k % 17) * 18}ms` }}>
            <rect x="0" y="10" width="46" height="44" rx="10" />
            <rect x="4" y="0" width="38" height="14" rx="6" className="back" />
          </g>
        ))}
      </g>
      <g className="beds">
        {[
          [0, 162],
          [238, 220],
          [534, 162],
        ].flatMap(([x, w]) =>
          [0, 228, 456].map((y) => (
            <g key={`${x}-${y}`} style={{ transitionDelay: `${0.35 + (x / 534) * 0.25 + y / 1800}s` }}>
              <rect className="bed" x={x} y={y} width={w} height={206} rx={30} />
              <rect className="pillow" x={x + 18} y={y + 16} width={w - 36} height={30} rx={11} />
            </g>
          )),
        )}
      </g>
    </svg>
  );
}
const Problem = (c: SlideCtx) => (
  <>
    <div className="pb-text">
      <Eyebrow at={0.1}>The problem</Eyebrow>
      <h1 className="d-l">
        <Lines lines={['Long-haul flying', 'was designed', 'for sitting.']} at={0.2} />
      </h1>
      <ul className="pb-list">
        {['Rows.', 'Armrests.', 'The middle seat.', 'A whole night, upright.'].map((t, i) => (
          <St c={c} at={1} key={t} as="li" style={d(0.12 * i)}>
            {t}
          </St>
        ))}
      </ul>
      <St c={c} at={2} className="pb-turn">
        What if every passenger had <em>a bed of their own?</em>
      </St>
    </div>
    <div className="pb-map rv" style={d(0.4)}>
      <SeatMap c={c} />
    </div>
  </>
);

// ---------------------------------------------------------------- 03 · reveal
const Reveal = (c: SlideCtx) => (
  <>
    {/* the website's own hero: the aircraft at night, flown by its scroll camera */}
    <Live3D c={c} poster="clips/hero.jpg" clip="hero" shot={SHOTS.hero} />
    <div className="shade-full" />
    <div className="rv-center">
      <Eyebrow at={0.5}>Introducing</Eyebrow>
      <h1 className="reveal-wm">
        <Wordmark />
      </h1>
      <Rv at={2.2} className="reveal-sub">
        The sleeping-capsule airline
      </Rv>
      <Rv at={2.8} as="p" className="reveal-tag">
        Fall asleep here. <em>Wake up anywhere.</em>
      </Rv>
    </div>
  </>
);

// ---------------------------------------------------------------- 04 · manifesto
const Manifesto = (c: SlideCtx) => (
  <>
    {/* the website's cabin: its dolly camera through the portal and down the aisle */}
    <Live3D c={c} poster="clips/cabin.jpg" clip="cabin" shot={SHOTS.cabin} />
    <div className="shade-l strong" />
    <div className="mf-text">
      <h1 className="d-l">
        <Lines lines={['We are not', 'selling flights.']} at={0.3} />
      </h1>
      <p className="d-m mf-2">
        <Lines lines={[<em key="a">We are selling the feeling of</em>, <em key="b">waking up somewhere new.</em>]} at={1.4} gap={0.16} />
      </p>
    </div>
  </>
);

// ---------------------------------------------------------------- 05 · depart · dream · arrive
const TRIPTYCH = [
  { w: 'Depart.', img: 'site/c_hero_flight.jpg', pos: '4% 50%', line: 'Board an aircraft with no rows — only private capsules.' },
  { w: 'Dream.', img: 'site/c_rest.jpg', pos: '20% 50%', line: 'A real bed, your light, your climate, your sound.' },
  { w: 'Arrive.', img: 'site/c_arrival_paris.jpg', pos: '50% 50%', line: 'Wake to sunrise, rested, in another city.' },
];
const Triptych = (c: SlideCtx) => (
  <div className="tri">
    {TRIPTYCH.map((t, i) => (
      <div className="tri-col" key={t.w} style={d(0.15 + i * 0.18)}>
        <Img src={t.img} className="tri-img" style={{ objectPosition: t.pos }} />
        <div className="tri-shade" />
        <div className="tri-copy">
          <span className="annot">0{i + 1}</span>
          <h2 className="d-l">{t.w}</h2>
          <p className="lede">{t.line}</p>
        </div>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------- 06 · who it's for
const PEOPLE = [
  { t: 'The 9 a.m. meeting', b: 'Business travellers who land and walk straight into the day — and need to be themselves when they do.', img: 'site/c_arrival_newyork.jpg' },
  { t: 'The first night of the holiday', b: 'Couples and families who want the trip to begin the moment they board, not the morning after.', img: 'site/c_arrival_rome.jpg' },
  { t: 'The long-distance life', b: 'People who cross continents often, and refuse to lose a day to every journey.', img: 'site/c_arrival_singapore.jpg' },
];
const Audience = (c: SlideCtx) => (
  <>
    <div className="au-head">
      <Eyebrow at={0.1}>Who it is for</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['For people who need to arrive', <em key="e">as themselves.</em>]} at={0.2} />
      </h1>
    </div>
    <div className="au-grid">
      {PEOPLE.map((p, i) => (
        <Rv className="au-item" at={0.6 + i * 0.16} key={p.t}>
          <div className="au-img">
            <Img src={p.img} />
          </div>
          <span className="annot">0{i + 1}</span>
          <h3>{p.t}</h3>
          <p>{p.b}</p>
        </Rv>
      ))}
    </div>
  </>
);

// ---------------------------------------------------------------- 07 · the capsule (interactive 3D)
function Capsule(c: SlideCtx) {
  const [tier, setTier] = useState<TierId>('signature');
  const [mode, setMode] = useState<'relax' | 'dream' | 'wake'>('relax');
  const [manual, setManual] = useState<boolean | null>(null);
  const exploded = manual ?? c.step >= 1;
  // stills (PDF, overview) show the exploded capsule in warm light — the website's own still of it
  const light = !c.still && c.step >= 2 && mode === 'relax' ? 'dream' : mode;
  return (
    <>
      {/* the website's capsule showcase, live: its model, studio light, plinth and exploded view */}
      <Live3D
        c={c}
        poster="site/c_capsule_exploded.jpg"
        shot={SHOTS.showcase}
        params={{ tier, light, exploded }}
      />
      <div className="cap-text">
        <Eyebrow at={0.1}>The capsule</Eyebrow>
        <h1 className="d-l">
          <Lines lines={['Your own world.', <em key="e">At 35,000 feet.</em>]} at={0.2} />
        </h1>
        <Rv at={0.8} as="p" className="lede">
          A private room with a full-length bed, lighting that follows your night and a climate of your own. Eight systems. One quiet room.
        </Rv>
        <Rv at={1.1} className="cap-controls">
          <div className="seg" role="radiogroup" aria-label="Capsule category">
            {(['essential', 'signature', 'grand'] as TierId[]).map((t) => (
              <button key={t} role="radio" aria-checked={tier === t} className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>
                {TIERS[t].short}
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Lighting">
            {(['relax', 'dream', 'wake'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={light === m} className={light === m ? 'on' : ''} onClick={() => setMode(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button className="pill" onClick={() => setManual(!exploded)}>
            {exploded ? 'Assemble' : 'Explode the capsule'}
          </button>
        </Rv>
        <Rv at={1.3} className="cap-hint annot">
          Drag to turn it · {bt(TIERS[tier].name)} · {dims(tier)}
        </Rv>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 08 · three ways to sleep
const TIER_INFO: Record<TierId, { img: string; line: string; bed: string; layout: string }> = {
  essential: { img: 'site/c_cabin_essential.jpg', line: 'A private, full-length bed in a calm two-tier gallery.', bed: '2.00 × 0.90 m', layout: 'Two tiers · 24 capsules' },
  signature: { img: 'site/c_cabin_signature.jpg', line: 'One level, wider capsules, warm walnut and soft leather.', bed: '2.00 × 1.20 m', layout: 'Single level · 8 capsules' },
  grand: { img: 'site/c_cabin_grand.jpg', line: 'A suite of your own, behind a full-height doorway.', bed: '2.10 × 1.60 m double', layout: 'Suites · 6 per flight' },
};
const ORDER: TierId[] = ['essential', 'signature', 'grand'];
const Tiers = (c: SlideCtx) => {
  const cur = ORDER[Math.min(2, c.still ? 0 : c.step)];
  return (
    <>
      {ORDER.map((t) => (
        <Img key={t} src={TIER_INFO[t].img} className={`bg tier-bg ${t === cur ? 'on' : ''}`} />
      ))}
      <div className="shade-l" />
      <div className="tier-text">
        <Eyebrow at={0.1}>Three ways to sleep</Eyebrow>
        <div className="tier-swap" key={cur}>
          <h1 className="d-xl">{TIERS[cur].short}</h1>
          <p className="lede">{TIER_INFO[cur].line}</p>
          <dl className="specs">
            <div>
              <dt>Interior</dt>
              <dd>{dims(cur)}</dd>
            </div>
            <div>
              <dt>Bed</dt>
              <dd>{TIER_INFO[cur].bed}</dd>
            </div>
            <div>
              <dt>Layout</dt>
              <dd>{TIER_INFO[cur].layout}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                {eur(TIERS[cur].minFare)} <small>illustrative</small>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="tier-tabs">
        {ORDER.map((t, i) => (
          <span key={t} className={t === cur ? 'on' : ''}>
            <i />
            0{i + 1} · {TIERS[t].short}
          </span>
        ))}
      </div>
    </>
  );
};

// ---------------------------------------------------------------- 09 · the journey
const FRAMES = [
  { t: 'Choose where to wake up', img: 'site/c_globe.jpg', pos: '72% 50%' },
  { t: 'Choose your capsule', img: 'site/u_booking.jpg', pos: '70% 50%' },
  { t: 'Board', img: 'site/c_cabin_aisle.jpg', pos: '50% 50%' },
  { t: 'Settle in', img: 'site/c_rest.jpg', pos: '40% 50%' },
  { t: 'Set your night', img: 'site/u_panel_relax.jpg', pos: '50% 45%' },
  { t: 'Dream', img: 'site/c_dreamscape.jpg', pos: '50% 50%' },
  { t: 'Wake up somewhere new', img: 'site/c_arrival_tokyo.jpg', pos: '58% 50%' },
];
const Journey = (c: SlideCtx) => (
  <>
    <div className="jr-head">
      <Eyebrow at={0.1}>The experience</Eyebrow>
      <h1 className="d-m">
        <Lines lines={['One night.', <em key="e">Seven moments.</em>]} at={0.2} />
      </h1>
    </div>
    <div className="jr-strip">
      {FRAMES.map((f, i) => (
        <Rv className="jr-frame" at={0.45 + i * 0.09} key={f.t} style={{ '--i': i }}>
          <div className="jr-img">
            <Img src={f.img} style={{ objectPosition: f.pos }} />
          </div>
          <span className="annot">0{i + 1}</span>
          <p>{f.t}</p>
        </Rv>
      ))}
    </div>
  </>
);

// ---------------------------------------------------------------- 10 · signature features
const FEATURES = [
  { t: 'SŌMNA OS', b: 'A touchscreen built into the capsule wall: light, colour, climate, window tint, sound and wake-up — changed live, in the room around you.', media: 'panel' },
  { t: 'Wake to light, not alarms', b: 'The capsule fills with warm morning light, the shade rises, and the city you chose is waiting.', media: 'arrival' },
  { t: 'Your night, arranged', b: 'Pick your capsule on a live cabin map, set your preferences once, and download a boarding pass for the night.', media: 'site/u_booking.jpg', pos: '88% 50%' },
];
const Features = (c: SlideCtx) => {
  const cur = Math.min(2, c.still ? 0 : c.step);
  const f = FEATURES[cur];
  return (
    <>
      <div className="ft-media rv" style={d(0.3)}>
        {FEATURES.map((x, i) =>
          x.media.startsWith('site/') ? (
            <Img key={x.t} src={x.media} className={`ft-m ${i === cur ? 'on' : ''}`} style={{ objectPosition: (x as { pos?: string }).pos }} />
          ) : (
            <div key={x.t} className={`ft-m ${i === cur ? 'on' : ''}`}>
              <Clip name={x.media} c={{ ...c, active: c.active && i === cur }} />
            </div>
          ),
        )}
      </div>
      <div className="ft-text">
        <Eyebrow at={0.1}>Designed around the night</Eyebrow>
        <ol className="ft-list">
          {FEATURES.map((x, i) => (
            <li key={x.t} className={i === cur ? 'on' : ''}>
              <span className="annot">0{i + 1}</span>
              <h3>{bt(x.t)}</h3>
              <p>{x.b}</p>
            </li>
          ))}
        </ol>
      </div>
      <span className="sr-only">{f.t}</span>
    </>
  );
};

// ---------------------------------------------------------------- 11 · why people will buy it
const Why = (c: SlideCtx) => (
  <>
    <Img src="site/c_arrival_rome.jpg" className="bg why-bg" />
    <div className="shade-l strong" />
    <div className="why-text">
      <Eyebrow at={0.1}>Why they will book it</Eyebrow>
      <h1 className="d-l">
        <Lines lines={['You are not buying a seat.', <em key="e">You are buying a morning.</em>]} at={0.2} gap={0.2} />
      </h1>
      <div className="why-row">
        {[
          ['A real bed', 'Fully flat, fully private, every row gone.'],
          ['A night shaped around you', 'Light, climate, sound and wake-up, set from your own screen.'],
          ['A morning that starts the trip', 'Arrive rested — not recovering from the flight.'],
        ].map(([h, p], i) => (
          <Rv at={1.1 + i * 0.14} key={h} className="why-item">
            <span className="annot">0{i + 1}</span>
            <h3>{h}</h3>
            <p>{p}</p>
          </Rv>
        ))}
      </div>
      <Rv at={1.7} className="why-price">
        <span className="annot">From</span>
        <strong>{eur(TIERS.essential.minFare)}</strong>
        <span className="annot">per night · illustrative fares</span>
      </Rv>
    </div>
  </>
);

// ---------------------------------------------------------------- 12 · live demo
function Demo(c: SlideCtx) {
  const host = useMemo(() => {
    try {
      return new URL(new URLSearchParams(location.search).get('site') || SITE_URL).host;
    } catch {
      return SITE_URL;
    }
  }, []);
  return (
    <>
      <Clip name="dream" c={c} className="bg" />
      <div className="shade-full strong" />
      <div className="rv-center">
        <Eyebrow at={0.2}>Live</Eyebrow>
        <h1 className="d-xl">
          <Lines lines={['Experience it.']} at={0.3} />
        </h1>
        <Rv at={0.9}>
          <button className="pill pill-primary demo-launch" onClick={c.openDemo}>
            Launch the website <kbd>Enter</kbd>
          </button>
        </Rv>
        <Rv at={1.2} className="annot demo-host">
          {host} · the full <Brand /> website, running live
        </Rv>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 13 · close of part I
const CloseOne = (c: SlideCtx) => (
  <>
    {/* the website's finale: the aircraft flying into the sunrise */}
    <Live3D c={c} poster="clips/finale.jpg" clip="finale" shot={SHOTS.finale} />
    <div className="shade-l" />
    <div className="c1-text">
      <h1 className="d-xl">
        <Lines lines={['Go further.', 'Dream deeper.', <em key="e">Arrive differently.</em>]} at={0.3} gap={0.22} />
      </h1>
      <Rv at={1.4} className="c1-cta">
        <span className="pill pill-primary">Book your dream</span>
        <span className="annot">{PUBLIC_URL ?? <><Brand /> · The art of arriving</>}</span>
      </Rv>
    </div>
  </>
);

export const PART_ONE: SlideDef[] = [
  {
    id: 'cold',
    part: 'I',
    chapter: 'Opening',
    title: 'Cold open',
    speaker: 0,
    seconds: 30,
    className: 's-cold',
    render: ColdOpen,
    notes:
      'Lights low. Say nothing for two seconds — let the ring breathe. The two lines appear on their own. Read the second line slowly: “…someone is trying to sleep sitting up.” Pause, then press → .',
  },
  {
    id: 'problem',
    part: 'I',
    chapter: 'The problem',
    title: 'Designed for sitting',
    speaker: 0,
    seconds: 40,
    steps: 2,
    className: 's-problem',
    render: Problem,
    notes:
      'Long-haul flying has one shape: rows of seats. → (step 1) Rows. Armrests. The middle seat. A whole night spent upright — we accept it because there has never been an alternative. → (step 2) The seat map dissolves into one shape: what if every passenger simply had a bed of their own?',
  },
  {
    id: 'reveal',
    part: 'I',
    chapter: 'The reveal',
    title: 'Introducing SŌMNA',
    speaker: 0,
    seconds: 25,
    className: 's-reveal s-live',
    live: SHOTS.hero,
    render: Reveal,
    notes:
      'Let the wordmark draw itself. “This is SŌMNA — the sleeping-capsule airline. Fall asleep here. Wake up anywhere.” Every passenger gets a private capsule with a real bed.',
  },
  {
    id: 'manifesto',
    part: 'I',
    chapter: 'The vision',
    title: 'Not selling flights',
    speaker: 0,
    seconds: 25,
    className: 's-manifesto s-live',
    live: SHOTS.cabin,
    render: Manifesto,
    notes:
      'Our vision in one sentence — it is also the first line of the brief that started the project: “We are not selling flights. We are selling the feeling of waking up somewhere new.” Hand over to Presenter 2.',
  },
  {
    id: 'triptych',
    part: 'I',
    chapter: 'Value proposition',
    title: 'Depart. Dream. Arrive.',
    speaker: 1,
    seconds: 30,
    className: 's-triptych',
    render: Triptych,
    notes:
      'Our promise has three words. Depart — an aircraft with no rows. Dream — a real bed, and a night set the way you like it. Arrive — wake to sunrise, rested, in another city.',
  },
  {
    id: 'audience',
    part: 'I',
    chapter: 'Target audience',
    title: 'Who it is for',
    speaker: 1,
    seconds: 25,
    className: 's-audience',
    render: Audience,
    notes:
      'Three people we designed for: the business traveller with a 9 a.m. meeting; the couple or family whose holiday should start on board; and people who cross continents often and refuse to lose a day each time.',
  },
  {
    id: 'capsule',
    part: 'I',
    chapter: 'The product',
    title: 'The capsule (live 3D)',
    speaker: 1,
    seconds: 40,
    steps: 2,
    className: 's-capsule s-live',
    live: SHOTS.showcase,
    render: Capsule,
    notes:
      'This is the website’s own 3D capsule showcase, running live. Drag to turn it. → (step 1) It opens into its eight systems, and the marker walks through them one at a time: privacy shade, full-length bed, adaptive lighting, acoustic liner, ceiling display, storage, airflow, personal climate. → (step 2) The light shifts to “Dream”. You can switch between Essential, Signature and Grand with the buttons.',
  },
  {
    id: 'tiers',
    part: 'I',
    chapter: 'The product',
    title: 'Three ways to sleep',
    speaker: 1,
    seconds: 30,
    steps: 2,
    className: 's-tiers',
    render: Tiers,
    notes:
      'Three cabins on one aircraft. Essential — a private, full-length bed in a two-tier gallery, from €190. → Signature — wider, single level, walnut and leather, from €340. → Grand — a suite with a double bed, from €690. (Fares are illustrative.)',
  },
  {
    id: 'journey',
    part: 'I',
    chapter: 'The experience',
    title: 'One night, seven moments',
    speaker: 1,
    seconds: 20,
    className: 's-journey',
    render: Journey,
    notes:
      'The whole experience in seven moments: choose where you want to wake up, choose your capsule, board, settle in, set your night, dream — and wake up somewhere new.',
  },
  {
    id: 'features',
    part: 'I',
    chapter: 'Innovation',
    title: 'Designed around the night',
    speaker: 1,
    seconds: 25,
    steps: 2,
    className: 's-features',
    render: Features,
    notes:
      'What makes it different. SŌMNA OS — a touchscreen built into the capsule wall that changes the real room around you. → Waking with light instead of alarms. → And booking that remembers your night, down to a boarding pass.',
  },
  {
    id: 'why',
    part: 'I',
    chapter: 'Why buy it',
    title: 'You are buying a morning',
    speaker: 1,
    seconds: 20,
    className: 's-why',
    render: Why,
    notes:
      'Why people will book it: you are not buying a seat — you are buying a morning. A real bed, a night shaped around you, and a trip that starts rested. From €190 (illustrative). Hand over to Presenter 3 for the demo.',
  },
  {
    id: 'demo',
    part: 'I',
    chapter: 'Live demo',
    title: 'Experience it (website)',
    speaker: 2,
    seconds: 150,
    className: 's-demo',
    render: Demo,
    notes:
      'Press Enter (or click) to open the live website inside the deck; “Back to the presentation” returns here. Suggested 2½-minute path: 1) Begin in silence → scroll the hero into the cabin. 2) Scroll through Essential → Signature → Grand. 3) “The capsule”: explode it. 4) Destinations: pick a city on the globe → “Dream me there”. 5) In the capsule, tap the wall tablet, switch the light to Dream. 6) “Good night” — or Skip to the arrival. 7) “Choose your capsule” → cabin map. If the site is offline, the deck plays a recorded walkthrough instead.',
  },
  {
    id: 'close1',
    part: 'I',
    chapter: 'Closing',
    title: 'Arrive differently',
    speaker: 2,
    seconds: 20,
    className: 's-close1 s-live',
    live: SHOTS.finale,
    render: CloseOne,
    notes: '“Go further. Dream deeper. Arrive differently.” Pause on the sunrise. Then: “Now let us show you how we built it.”',
  },
];
