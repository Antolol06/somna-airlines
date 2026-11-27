import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SLIDES } from '../slides';
import { SITE_URL, TEAM } from '../config';
import { Clip, M, Wordmark, bt } from './components';
import type { SlideCtx } from './types';
import { LiveLayer } from './live/LiveLayer';

const W = 1920;
const H = 1080;
export const CHANNEL = 'somna-deck';
const pad = (n: number) => String(n).padStart(2, '0');

/** Parse "#12" or "#12.2" (1-based slide, 0-based step). */
function fromHash(): { i: number; s: number } {
  const m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash);
  if (!m) return { i: 0, s: 0 };
  return { i: Math.min(SLIDES.length - 1, Math.max(0, +m[1] - 1)), s: +(m[2] ?? 0) };
}

export function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      const w = el?.clientWidth ?? innerWidth;
      const h = el?.clientHeight ?? innerHeight;
      setK(Math.min(w / W, h / H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (ref.current) ro.observe(ref.current);
    addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      removeEventListener('resize', fit);
    };
  }, [ref]);
  return k;
}

/** One slide, mounted while near the current one. */
export function SlideView({ index, ctx, state }: { index: number; ctx: SlideCtx; state: 'active' | 'leaving' | 'near' }) {
  const s = SLIDES[index];
  return (
    <section className={`slide ${s.className ?? ''} is-${state}`} aria-hidden={state !== 'active'} data-part={s.part}>
      <div className="slide-inner">{s.render(ctx)}</div>
    </section>
  );
}

export function Deck() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const still = params.has('still');
  const siteUrl = params.get('site') || SITE_URL;
  const start = fromHash();
  const [index, setIndex] = useState(start.i);
  const [step, setStep] = useState(still ? SLIDES[start.i].steps ?? 0 : start.s);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [overview, setOverview] = useState(false);
  const [black, setBlack] = useState(false);
  const [help, setHelp] = useState(false);
  const [demo, setDemo] = useState(false);
  const [siteDown, setSiteDown] = useState(false);
  const [idle, setIdle] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const k = useStageScale(host);
  const bc = useMemo(() => (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null), []);
  const leaveTimer = useRef(0);
  const typed = useRef('');

  const indexRef = useRef(index);
  indexRef.current = index;
  const go = useCallback((i: number, s = 0) => {
    const n = Math.min(SLIDES.length - 1, Math.max(0, i));
    const cur = indexRef.current;
    if (n !== cur) {
      setDir(n > cur ? 1 : -1);
      setLeaving(cur);
      clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setLeaving(null), 900);
      setIndex(n);
    }
    setStep(s);
  }, []);
  const next = useCallback(
    (skipSteps = false) => {
      const max = SLIDES[index].steps ?? 0;
      if (!skipSteps && step < max) setStep(step + 1);
      else if (index < SLIDES.length - 1) go(index + 1, 0);
    },
    [index, step, go],
  );
  const prev = useCallback(
    (skipSteps = false) => {
      if (!skipSteps && step > 0) setStep(step - 1);
      else if (index > 0) go(index - 1, SLIDES[index - 1].steps ?? 0);
    },
    [index, step, go],
  );

  // keep the URL in sync (reload-safe) and tell the presenter window
  useEffect(() => {
    if (still) return;
    history.replaceState(null, '', `${location.pathname}${location.search}#${index + 1}${step ? `.${step}` : ''}`);
    bc?.postMessage({ type: 'state', index, step });
  }, [index, step, bc, still]);
  useEffect(() => {
    if (!bc) return;
    bc.onmessage = (e) => {
      const m = e.data;
      if (m?.type === 'cmd') {
        if (m.cmd === 'next') next();
        else if (m.cmd === 'prev') prev();
        else if (m.cmd === 'goto') go(m.index, m.step ?? 0);
        else if (m.cmd === 'black') setBlack((b) => !b);
        else if (m.cmd === 'demo') setDemo((v) => !v);
        else if (m.cmd === 'hello') bc.postMessage({ type: 'state', index, step });
      }
    };
  }, [bc, next, prev, go, index, step]);

  // typing a slide number into the address bar (#12) jumps there
  useEffect(() => {
    if (still) return;
    const onHash = () => {
      const h = fromHash();
      go(h.i, h.s);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [go, still]);

  // is the live website reachable? (otherwise the demo plays a recorded walkthrough)
  useEffect(() => {
    if (still) return;
    fetch(siteUrl, { mode: 'no-cors', cache: 'no-store' }).then(
      () => setSiteDown(false),
      () => setSiteDown(true),
    );
  }, [siteUrl, demo, still]);

  // keyboard: arrows, space, page keys (clickers), Home/End, O, F, P, B, H, number + Enter
  useEffect(() => {
    if (still) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const key = e.key;
      if (demo) {
        if (key === 'Escape') {
          e.preventDefault();
          setDemo(false);
        }
        return;
      }
      if (overview) {
        if (key === 'Escape' || key === 'o' || key === 'O') setOverview(false);
        else if (key === 'ArrowRight') go(index + 1);
        else if (key === 'ArrowLeft') go(index - 1);
        else if (key === 'ArrowDown') go(index + 5);
        else if (key === 'ArrowUp') go(index - 5);
        else if (key === 'Enter' || key === ' ') setOverview(false);
        e.preventDefault();
        return;
      }
      if (/^\d$/.test(key)) {
        typed.current = (typed.current + key).slice(-2);
        return;
      }
      if (key === 'Enter' && typed.current) {
        go(+typed.current - 1);
        typed.current = '';
        e.preventDefault();
        return;
      }
      typed.current = '';
      switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          next(e.shiftKey);
          break;
        case 'Enter':
          e.preventDefault();
          if (SLIDES[index].id === 'demo') setDemo(true);
          else next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          prev(e.shiftKey);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(SLIDES.length - 1);
          break;
        case 'o':
        case 'O':
        case 'Escape':
          if (key === 'Escape' && (help || black)) {
            setHelp(false);
            setBlack(false);
          } else setOverview((v) => !v);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.();
          break;
        case 'p':
        case 'P':
          window.open(`${location.pathname}?presenter${location.hash}`, 'somna-presenter', 'width=1400,height=860');
          break;
        case 'b':
        case 'B':
        case '.':
          setBlack((b) => !b);
          break;
        case 'h':
        case 'H':
        case '?':
          setHelp((h) => !h);
          break;
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev, go, index, overview, demo, help, black, still]);

  // chrome and cursor disappear while presenting; any mouse movement brings them back
  useEffect(() => {
    if (still) return;
    let t = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 2200);
    };
    wake();
    addEventListener('pointermove', wake);
    return () => {
      removeEventListener('pointermove', wake);
      clearTimeout(t);
    };
  }, [still]);

  // preload the next slide's videos
  useEffect(() => {
    if (still) return;
    const n = index + 1;
    if (n >= SLIDES.length) return;
    const el = document.querySelector<HTMLElement>(`.slide-wrap.is-near[data-index="${n}"]`);
    el?.querySelectorAll('video').forEach((v) => v.load());
  }, [index, still]);

  const ctxFor = (i: number): SlideCtx => ({
    active: i === index && !overview,
    step: i === index ? step : i < index ? SLIDES[i].steps ?? 0 : 0,
    still,
    openDemo: () => setDemo(true),
  });

  const s = SLIDES[index];
  const sections = useMemo(() => {
    const firstII = SLIDES.findIndex((x) => x.part === 'II');
    return { firstII };
  }, []);

  return (
    <div className={`deck ${still ? 'still' : ''} ${idle && !overview ? 'idle' : ''} dir-${dir > 0 ? 'fwd' : 'back'}`} ref={host}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
        {!still && <LiveLayer k={k} paused={demo || overview} upcoming={SLIDES[index].live ? null : SLIDES[index + 1]?.live ?? null} />}
        {SLIDES.map((_, i) => {
          const near = Math.abs(i - index) <= 1 || i === leaving;
          if (!near) return null;
          const state = i === index ? 'active' : i === leaving ? 'leaving' : 'near';
          return (
            <div key={SLIDES[i].id} data-index={i} className={`slide-wrap is-${state}`}>
              <SlideView index={i} ctx={ctxFor(i)} state={state} />
            </div>
          );
        })}
        <div className="grain" aria-hidden="true" />
      </div>

      {!still && (
        <>
          <div className="chrome" aria-hidden={idle}>
            <div className="chrome-left">
              <span className="chrome-mark">
                <Wordmark animate={false} />
              </span>
              <span className="annot">
                {s.part === 'I' ? 'I · The pitch' : 'II · Behind the scenes'} — {s.chapter}
              </span>
            </div>
            <div className="chrome-right">
              <span className="annot chrome-count">
                {pad(index + 1)} / {pad(SLIDES.length)}
              </span>
              <button className="icon-btn" onClick={() => setOverview(true)} aria-label="Overview (O)" title="Overview · O">
                <svg viewBox="0 0 20 20">
                  <path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" />
                </svg>
              </button>
              <button
                className="icon-btn"
                onClick={() => window.open(`${location.pathname}?presenter${location.hash}`, 'somna-presenter', 'width=1400,height=860')}
                aria-label="Presenter view (P)"
                title="Presenter view · P"
              >
                <svg viewBox="0 0 20 20">
                  <path d="M2 4h16v10H2zM7 17h6" />
                </svg>
              </button>
              <button
                className="icon-btn"
                onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
                aria-label="Full screen (F)"
                title="Full screen · F"
              >
                <svg viewBox="0 0 20 20">
                  <path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" />
                </svg>
              </button>
            </div>
          </div>
          <div className="progress" aria-hidden="true">
            <span className="progress-fill" style={{ transform: `scaleX(${(index + 1) / SLIDES.length})` }} />
            <span className="progress-split" style={{ left: `${(sections.firstII / SLIDES.length) * 100}%` }} />
          </div>
          <div className="nav-zones" aria-hidden="true">
            <button className="nav-prev" tabIndex={-1} onClick={() => prev()} />
            <button className="nav-next" tabIndex={-1} onClick={() => next()} />
          </div>
        </>
      )}

      {overview && (
        <div className="overview" role="dialog" aria-label="All slides">
          <div className="ov-head">
            <Wordmark animate={false} />
            <span className="annot">Overview · {SLIDES.length} slides · Enter or click to jump · Esc to close</span>
          </div>
          {(['I', 'II'] as const).map((part) => (
            <div key={part} className="ov-part">
              <h2 className="annot">{part === 'I' ? 'Part I — The pitch' : 'Part II — Behind the scenes'}</h2>
              <div className="ov-grid">
                {SLIDES.map((x, i) =>
                  x.part !== part ? null : (
                    <button
                      key={x.id}
                      className={`ov-item ${i === index ? 'on' : ''}`}
                      onClick={() => {
                        go(i);
                        setOverview(false);
                      }}
                    >
                      <span className="ov-thumb">
                        <img src={M(`thumbs/${pad(i + 1)}.jpg`)} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                        <span className="ov-fallback">{bt(x.title)}</span>
                      </span>
                      <span className="ov-meta">
                        <span className="annot">{pad(i + 1)}</span>
                        <span>{bt(x.title)}</span>
                        <span className="annot ov-who">{TEAM[x.speaker]?.name}</span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {demo && (
        <div className="demo-layer" role="dialog" aria-label="Live website">
          {siteDown ? (
            <div className="demo-offline">
              <Clip name="dream" c={{ active: true, step: 0, still: false, openDemo: () => {} }} />
              <div className="demo-offline-note">
                <span className="annot">The live site is not reachable from here — playing the recorded walkthrough</span>
              </div>
            </div>
          ) : (
            <iframe src={siteUrl} title="SŌMNA website" allow="autoplay; fullscreen; clipboard-write" />
          )}
          <button className="demo-back" onClick={() => setDemo(false)}>
            ← Back to the presentation <kbd>Esc</kbd>
          </button>
        </div>
      )}

      {help && (
        <div className="help" onClick={() => setHelp(false)}>
          <div className="help-card">
            <Wordmark animate={false} />
            <dl>
              {[
                ['→  Space  PgDn', 'Next build or slide'],
                ['←  PgUp', 'Previous'],
                ['Shift + → / ←', 'Skip builds'],
                ['O  ·  Esc', 'Overview'],
                ['P', 'Presenter view (notes, timer, next slide)'],
                ['F', 'Full screen'],
                ['B  ·  .', 'Black screen'],
                ['12 Enter', 'Go to slide 12'],
                ['Enter on the demo slide', 'Open the live website'],
              ].map(([k2, v]) => (
                <div key={k2}>
                  <dt>{k2}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      <div className={`blackout ${black ? 'on' : ''}`} onClick={() => setBlack(false)} />
    </div>
  );
}
