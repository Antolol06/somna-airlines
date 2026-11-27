import { useRef } from 'react';
import { previewCapsule, useStore } from '../../state/store';
import { scroll } from '../../state/runtime';
import { Annot, Split, useChapterSection, useFrameUpdate, useReveals } from '../hooks';
import { clamp } from '../../lib/math';
import { TIERS, formatEUR, type TierId } from '../../data/capsules';
import { TOUR_PANELS, TOUR_SEGMENTS } from '../../data/capsuleOS';

/**
 * Scroll windows of the cabin chapter. They match the held camera shots in CabinScene:
 * the aisle, then one composed shot per cabin, each joined by a walnut threshold.
 */
const PANELS: {
  id: TierId;
  at: [number, number];
  side: 'left' | 'right';
  index: string;
  where: string;
  line: string;
  layout: string;
  bed: string;
  materials: string[];
  comfort: string[];
}[] = [
  {
    id: 'essential',
    at: TOUR_PANELS.essential,
    side: 'left',
    index: '01',
    where: 'Aft cabin',
    line: 'A private, full-length bed in a calm two-tier gallery.',
    layout: 'Two tiers · 24 capsules',
    bed: '2.00 × 0.90 m',
    materials: ['Ivory composite shell', 'Ribbed acoustic textile', 'Brushed champagne rails'],
    comfort: ['Acoustic privacy shade', 'Adaptive ambient light', 'Personal climate'],
  },
  {
    id: 'signature',
    at: TOUR_PANELS.signature,
    side: 'left',
    index: '02',
    where: 'Mid cabin',
    line: 'One level, wider capsules, warm walnut and soft leather.',
    layout: 'Single level · 8 capsules',
    bed: '2.00 × 1.20 m',
    materials: ['Oiled walnut slats', 'Aniline leather trim', 'Wool bouclé liner'],
    comfort: ['Sunrise wake-up programme', 'Air purification', 'Personal wardrobe'],
  },
  {
    id: 'grand',
    at: TOUR_PANELS.grand,
    side: 'left',
    index: '03',
    where: 'Forward cabin',
    line: 'A suite of your own, behind a full-height doorway.',
    layout: 'Suites · 6 per flight',
    bed: '2.10 × 1.60 m double',
    materials: ['Champagne metal portal', 'Navy wool felt', 'Smoked walnut'],
    comfort: ['Seated lounge nook', 'Private vanity', 'Host on request'],
  },
];

const vol = (id: TierId) => {
  const d = TIERS[id].dims;
  return d.l * d.w * d.h;
};
const MAX_VOL = vol('grand');
const SEGMENTS = TOUR_SEGMENTS;

function TierPanel({ p }: { p: (typeof PANELS)[number] }) {
  const t = TIERS[p.id];
  const d = t.dims;
  return (
    <article className={`tier-panel tier-${p.side} reveal`} data-in={p.at[0]} data-out={p.at[1]} data-f="0.03" aria-label={`${t.short} capsule`}>
      <div className="tp-index">
        <span className="tp-n">{p.index}</span>
        <span className="tp-of">/ 03</span>
        <span className="tp-rule" aria-hidden="true" />
        <Annot>{p.where}</Annot>
      </div>
      <h3 className="tp-name display-l">
        <Split text={t.short} />
      </h3>
      <p className="tp-line">{p.line}</p>
      <dl className="tp-specs">
        <div>
          <dt>Interior</dt>
          <dd>
            {d.l.toFixed(2)} × {d.w.toFixed(2)} × {d.h.toFixed(2)} m
          </dd>
        </div>
        <div>
          <dt>Bed</dt>
          <dd>{p.bed}</dd>
        </div>
        <div>
          <dt>Layout</dt>
          <dd>{p.layout}</dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>
            {formatEUR(t.minFare)} <small>illustrative</small>
          </dd>
        </div>
      </dl>
      <div className="tp-space" aria-label="Personal space compared">
        {(['essential', 'signature', 'grand'] as TierId[]).map((id) => (
          <div key={id} className="tp-bar" data-on={id === p.id}>
            <span className="tp-bar-label">{TIERS[id].short}</span>
            <span className="tp-bar-track">
              <span className="tp-bar-fill" style={{ ['--w' as any]: (vol(id) / MAX_VOL).toFixed(3) }} />
            </span>
            <span className="tp-bar-val">{vol(id).toFixed(1)} m³</span>
          </div>
        ))}
      </div>
      <div className="tp-cols">
        <div>
          <span className="tp-h">Materials</span>
          <ul>
            {p.materials.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
        <div>
          <span className="tp-h">Comfort</span>
          <ul>
            {p.comfort.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

export function CabinChapter() {
  const section = useChapterSection('cabin');
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const capsuleLabel = useStore((s) => previewCapsule(s).id);
  const root = useReveals(() => scroll.progress.cabin);
  const where = useRef<HTMLSpanElement>(null);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const segs = useRef<(HTMLLIElement | null)[]>([]);
  const last = useRef('');
  useFrameUpdate(() => {
    const p = scroll.progress.cabin;
    let cur = 0;
    SEGMENTS.forEach((s, i) => {
      const f = clamp((p - s.a) / (s.b - s.a));
      if (p >= s.a) cur = i;
      const el = fills.current[i];
      if (el) el.style.transform = `scaleX(${f.toFixed(3)})`;
    });
    const key = String(cur);
    if (key !== last.current) {
      last.current = key;
      segs.current.forEach((el, i) => el && (el.dataset.on = String(i === cur)));
      if (where.current) where.current.textContent = `Cabin 0${cur + 1} · ${TIERS[SEGMENTS[cur].id].short}`;
    }
  });
  return (
    <>
      <section ref={section} className="chapter" id="experience" style={{ height: '820vh' }} aria-label="The cabin" />
      <div className="stage stage-cabin" data-active={chapter === 'cabin' && mode === 'scroll'} ref={root}>
        <div className="cabin-kicker reveal" data-in="0.0" data-out="0.19" data-f="0.03">
          <span className="eyebrow">02 — Enter the aircraft</span>
        </div>
        <h2 className="cabin-line cabin-a display-xxl reveal" data-in="0.03" data-out="0.1" data-f="0.025">
          <Split text="No rows." />
        </h2>
        <h2 className="cabin-line cabin-b display-xxl reveal" data-in="0.1" data-out="0.18" data-f="0.025">
          <Split text="No middle seats." />
        </h2>

        {PANELS.map((p) => (
          <TierPanel key={p.id} p={p} />
        ))}

        <p className="cabin-pass reveal" data-in="0.39" data-out="0.45" data-f="0.015">
          <Annot>Through to cabin 02 — Signature</Annot>
        </p>
        <p className="cabin-pass reveal" data-in="0.665" data-out="0.725" data-f="0.015">
          <Annot>Through to cabin 03 — Grand</Annot>
        </p>

        <div className="cabin-close reveal" data-in="0.915" data-out="1.2" data-f="0.035">
          <h2 className="display-xl">
            <span className="line">
              <Split text="Just you," />
            </span>
            <span className="line em">
              <Split text="and the space to dream." />
            </span>
          </h2>
          <p className="lede">Capsule {capsuleLabel} — reserved for you tonight.</p>
        </div>

        <div className="cabin-hud reveal" data-in="0.02" data-out="0.99" data-f="0.04">
          <Annot>
            <span ref={where}>Cabin 01 · Essential</span>
          </Annot>
          <ol className="cabin-track" aria-hidden="true">
            {SEGMENTS.map((s, i) => (
              <li key={s.id} ref={(el) => { segs.current[i] = el; }} data-on={i === 0}>
                <span className="ct-label">{TIERS[s.id].short}</span>
                <span className="ct-track">
                  <span className="ct-fill" ref={(el) => { fills.current[i] = el; }} />
                </span>
              </li>
            ))}
          </ol>
          <Annot className="hud-wide">38 private capsules</Annot>
          <Annot className="hud-wide">Cabin altitude 6,000 ft</Annot>
        </div>
      </div>
    </>
  );
}
