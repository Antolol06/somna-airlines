import { useEffect, useMemo, useRef, useState } from 'react';
import { SLIDES, STARTS, TOTAL_SECONDS } from '../slides';
import { CHANNEL, SlideView, useStageScale } from './Deck';
import { Wordmark, bt } from './components';

const pad = (n: number) => String(n).padStart(2, '0');
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${pad(Math.floor(Math.max(0, s) % 60))}`;
const START_KEY = 'somna-deck-start';

/** A static, scaled render of a slide (no motion, final build) for the presenter's previews. */
function Preview({ index, step, label }: { index: number; step: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const k = useStageScale(box);
  return (
    <figure className="pv">
      <div className="pv-box" ref={box}>
        {index < SLIDES.length ? (
          <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
            <div className="slide-wrap is-active">
              <SlideView index={index} ctx={{ active: false, step, still: true, openDemo: () => {} }} state="active" />
            </div>
          </div>
        ) : (
          <div className="pv-end">End of presentation</div>
        )}
      </div>
      <figcaption className="annot">{label}</figcaption>
    </figure>
  );
}

export function Presenter() {
  const bc = useMemo(() => new BroadcastChannel(CHANNEL), []);
  const [st, setSt] = useState({ index: 0, step: 0 });
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    const v = localStorage.getItem(START_KEY);
    return v ? +v : null;
  });

  useEffect(() => {
    bc.onmessage = (e) => e.data?.type === 'state' && setSt({ index: e.data.index, step: e.data.step });
    bc.postMessage({ type: 'cmd', cmd: 'hello' });
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [bc]);

  const cmd = (c: string, extra: object = {}) => {
    if (!startedAt && (c === 'next' || c === 'goto')) {
      const t = Date.now();
      localStorage.setItem(START_KEY, String(t));
      setStartedAt(t);
    }
    bc.postMessage({ type: 'cmd', cmd: c, ...extra });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        cmd('next');
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        cmd('prev');
      } else if (e.key === 'b' || e.key === 'B' || e.key === '.') cmd('black');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const s = SLIDES[st.index];
  const nx = SLIDES[st.index + 1];
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const planned = STARTS[st.index];
  const drift = startedAt ? elapsed - planned : 0;
  // speaking parts are labelled by role (Speaker 1–4), not by name
  const speaker = `Speaker ${s.speaker + 1}`;
  const handover = nx && nx.speaker !== s.speaker ? `Speaker ${nx.speaker + 1}` : null;
  const maxStep = s.steps ?? 0;

  return (
    <div className="presenter">
      <header className="pr-top">
        <Wordmark animate={false} />
        <span className="annot">Presenter view · keys here control the main screen</span>
        <div className="pr-clock">
          <span className="annot">Elapsed</span>
          <strong>{mmss(elapsed)}</strong>
          <span className={`annot pr-drift ${Math.abs(drift) < 20 ? 'ok' : drift > 0 ? 'late' : 'early'}`}>
            {startedAt ? (Math.abs(drift) < 20 ? 'on time' : drift > 0 ? `${mmss(drift)} behind plan` : `${mmss(-drift)} ahead`) : 'starts on first →'}
          </span>
          <span className="annot">
            plan {mmss(TOTAL_SECONDS)} · this slide {mmss(s.seconds)}
          </span>
          <button
            className="pill"
            onClick={() => {
              localStorage.removeItem(START_KEY);
              setStartedAt(null);
            }}
          >
            Reset timer
          </button>
        </div>
      </header>
      <div className="pr-body">
        <div className="pr-now">
          <Preview index={st.index} step={st.step} label={`Now · ${pad(st.index + 1)} / ${pad(SLIDES.length)} · ${s.title}${maxStep ? ` · build ${st.step + 1}/${maxStep + 1}` : ''}`} />
        </div>
        <aside className="pr-side">
          <Preview index={st.index + 1} step={0} label={nx ? `Next · ${nx.title}` : 'Next · —'} />
          <div className="pr-speaker">
            <span className="annot">Speaking</span>
            <strong>{speaker}</strong>
            {handover && (
              <span className="pr-hand">
                Next slide → hand over to <strong>{handover}</strong>
              </span>
            )}
          </div>
          <div className="pr-buttons">
            <button className="pill" onClick={() => cmd('prev')}>
              ← Back
            </button>
            <button className="pill pill-primary" onClick={() => cmd('next')}>
              Next →
            </button>
            <button className="pill" onClick={() => cmd('demo')}>
              Website
            </button>
            <button className="pill" onClick={() => cmd('black')}>
              Black
            </button>
          </div>
        </aside>
      </div>
      <section className="pr-notes">
        <span className="annot">
          {s.part === 'I' ? 'Part I' : 'Part II'} · {s.chapter} · {Math.round(s.seconds)} s
        </span>
        <p>{bt(s.notes)}</p>
      </section>
      <nav className="pr-strip">
        {SLIDES.map((x, i) => (
          <button key={x.id} className={i === st.index ? 'on' : i < st.index ? 'done' : ''} onClick={() => cmd('goto', { index: i })} title={x.title}>
            {pad(i + 1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
