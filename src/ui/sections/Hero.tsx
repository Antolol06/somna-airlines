import { useRef } from 'react';
import { useStore } from '../../state/store';
import { scroll } from '../../state/runtime';
import { Annot, Split, useChapterSection, useFrameUpdate, useReveals } from '../hooks';
import { smoothstep } from '../../lib/math';
import { CITY } from '../../data/cities';
import { Brand } from '../Wordmark';

export function HeroChapter() {
  const section = useChapterSection('hero');
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const entered = useStore((s) => s.entered);
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const root = useReveals(() => scroll.progress.hero);
  const cue = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const alt = useRef<HTMLSpanElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const last = useRef(0);

  useFrameUpdate(() => {
    const p = scroll.progress.hero;
    const tOut = smoothstep(0.03, 0.15, p);
    root.current?.style.setProperty('--hero-out', tOut.toFixed(3));
    if (cue.current) cue.current.style.opacity = (1 - smoothstep(0.01, 0.05, p)).toFixed(3);
    if (top.current) top.current.style.opacity = (1 - smoothstep(0.85, 0.95, p)).toFixed(3);
    const now = performance.now();
    if (now - last.current > 1000) {
      last.current = now;
      const d = new Date();
      if (clock.current) clock.current.textContent = `UTC ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }
    if (alt.current) alt.current.textContent = p > 0.55 ? `WINDOW 12 K · ${Math.max(0.2, 12 * (1 - p) / 0.45).toFixed(1)} M` : 'FL350 · MACH 0.85';
  });

  return (
    <>
      <section ref={section} className="chapter" id="top" style={{ height: '360vh' }} aria-labelledby="hero-title" />
      <div className="stage stage-hero" data-active={entered && chapter === 'hero' && mode === 'scroll'} ref={root}>
        <div className="hero-top" ref={top}>
          <Annot>
            SMN 001 · {CITY[from].code} → {CITY[to].code}
          </Annot>
          <Annot>
            <span ref={alt}>ALT 35,000 FT</span>
          </Annot>
          <Annot>
            <span ref={clock}>UTC --:--</span>
          </Annot>
        </div>
        <div className="hero-copy">
          <h1 className="hero-title display-xxl" id="hero-title">
            <span className="line">The world is closer</span>
            <em className="line">than you dream.</em>
          </h1>
          <p className="hero-sub lede">
            Private sleeping capsules for overnight flights.
          </p>
        </div>
        <div className="scroll-cue" ref={cue} aria-hidden="true">
          <span className="annot">Scroll to begin</span>
          <span className="cue-line" />
        </div>

        <div className="hero-beyond reveal" data-in="0.22" data-out="0.5" data-f="0.07">
          <span className="eyebrow">01 — Beyond flying</span>
          <p className="display-l">
            <Split text="We are not selling flights." />
          </p>
          <p className="display-l soft">
            <Split text="We are selling the feeling of waking up somewhere new." />
          </p>
        </div>

        <div className="hero-spec reveal" data-in="0.3" data-out="0.5" data-f="0.06">
          <dl className="spec-list">
            <div>
              <dt>Aircraft</dt>
              <dd>
                <Brand /> S-1 · concept
              </dd>
            </div>
            <div>
              <dt>Configuration</dt>
              <dd>Private sleeping capsules</dd>
            </div>
            <div>
              <dt>Rows · Middle seats</dt>
              <dd>None · None</dd>
            </div>
          </dl>
        </div>

        <div className="hero-promise reveal" data-in="0.6" data-out="0.86" data-f="0.07">
          <p className="display-xl">
            <Split text="Fall asleep here." />
          </p>
          <p className="display-xl em">
            <Split text="Wake up anywhere." />
          </p>
        </div>
        <div className="hero-window-annot reveal" data-in="0.74" data-out="0.92" data-f="0.05">
          <Annot>Window 12 K · capsule interior · 2,700 K</Annot>
        </div>
      </div>
    </>
  );
}
