import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SlideCtx } from './types';

/** Public media path (works in dev and in the built, relocatable deck). */
export const M = (p: string) => `${import.meta.env.BASE_URL}media/${p}`;

type Style = CSSProperties & Record<`--${string}`, string | number>;
export const d = (s: number): Style => ({ '--d': `${s}s` });

/** An element that rises into place when its slide arrives. */
export function Rv({ children, at = 0, className = '', as: Tag = 'div', style }: { children: ReactNode; at?: number; className?: string; as?: any; style?: Style }) {
  return (
    <Tag className={`rv ${className}`} style={{ ...style, '--d': `${at}s` }}>
      {children}
    </Tag>
  );
}

/** Revealed on a build step (presenter presses →). */
export function St({ c, at, children, className = '', as: Tag = 'div', style }: { c: SlideCtx; at: number; children: ReactNode; className?: string; as?: any; style?: Style }) {
  const on = c.still || c.step >= at;
  return (
    <Tag className={`st ${on ? 'on' : ''} ${className}`} style={style}>
      {children}
    </Tag>
  );
}

/** Headline set line by line behind a mask. */
export function Lines({ lines, at = 0, gap = 0.12, className = '' }: { lines: ReactNode[]; at?: number; gap?: number; className?: string }) {
  return (
    <span className={`lines ${className}`}>
      {lines.map((l, i) => (
        <span className="ln" key={i}>
          <span className="lni" style={{ '--d': `${at + i * gap}s` } as Style}>
            {l}
          </span>
        </span>
      ))}
    </span>
  );
}

export const Eyebrow = ({ children, at = 0, className = '' }: { children: ReactNode; at?: number; className?: string }) => (
  <Rv at={at} className={`eyebrow ${className}`}>
    {children}
  </Rv>
);

/** The SŌMNA wordmark — the macron is drawn, exactly as on the website. */
export function Wordmark({ className = '', animate = true }: { className?: string; animate?: boolean }) {
  return (
    <span className={`wm ${animate ? 'wm-anim' : ''} ${className}`} aria-label="SŌMNA" role="img">
      <span>S</span>
      <span className="wm-o">
        O<i />
      </span>
      <span>M</span>
      <span>N</span>
      <span>A</span>
    </span>
  );
}

/**
 * The brand name inside running text. Jost's own “Ō” places the macron over the M (the same
 * bug the website fixed), so the macron is drawn — in the current font, size and colour.
 */
export const Brand = () => (
  <span className="brand" aria-label="SŌMNA">
    S
    <span className="brand-o" aria-hidden="true">
      O<i />
    </span>
    MNA
  </span>
);
/** Render a string with every “SŌMNA” set as <Brand/>. */
export function bt(s: string): ReactNode {
  const parts = s.normalize('NFC').split('SŌMNA');
  if (parts.length === 1) return s;
  return parts.flatMap((p, i) => (i === 0 ? [p] : [<Brand key={i} />, p]));
}

/** A video that only plays while its slide is on screen (and shows its poster in stills). */
export function Clip({ name, c, className = '', loop = true, rate = 1, start = 0, fit = 'cover' }: { name: string; c: SlideCtx; className?: string; loop?: boolean; rate?: number; start?: number; fit?: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (c.active && !c.still) {
      v.playbackRate = rate;
      try {
        v.currentTime = start;
      } catch {}
      v.play().catch(() => {});
    } else v.pause();
  }, [c.active, c.still, rate, start]);
  if (c.still) return <img className={`media ${className}`} style={{ objectFit: fit }} src={M(`clips/${name}.jpg`)} alt="" />;
  // the poster is the clip's own first frame, so nothing jumps when it starts playing
  return <video ref={ref} className={`media ${className}`} style={{ objectFit: fit }} src={M(`clips/${name}.mp4`)} poster={M(`clips/${name}_0.jpg`)} muted playsInline loop={loop} preload="auto" />;
}

export const Img = ({ src, className = '', alt = '', style }: { src: string; className?: string; alt?: string; style?: CSSProperties }) => (
  <img className={`media ${className}`} src={M(src)} alt={alt} style={style} draggable={false} />
);

/** Marks material the team still has to provide — never presented as fact. */
export const Missing = ({ label }: { label: string }) => <span className="missing">To add · {label}</span>;

/** Counts up to a number when the slide arrives. */
export function Counter({ to, c, duration = 1.6, delay = 0, format = (n: number) => Math.round(n).toLocaleString('en-GB') }: { to: number; c: SlideCtx; duration?: number; delay?: number; format?: (n: number) => string }) {
  const [v, setV] = useState(c.still ? to : 0);
  useEffect(() => {
    if (c.still) return setV(to);
    if (!c.active) return setV(0);
    let raf = 0;
    const t0 = performance.now() + delay * 1000;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / (duration * 1000)));
      setV(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [c.active, c.still, to, duration, delay]);
  return <>{format(v)}</>;
}

/** Types a prompt out, character by character, with a caret. */
export function Typewriter({ text, c, cps = 38, delay = 0.4, onDone }: { text: string; c: SlideCtx; cps?: number; delay?: number; onDone?: () => void }) {
  const [n, setN] = useState(c.still ? text.length : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (c.still) return setN(text.length);
    if (!c.active) return setN(0);
    let raf = 0;
    const t0 = performance.now() + delay * 1000;
    const tick = (t: number) => {
      const k = Math.max(0, Math.floor(((t - t0) / 1000) * cps));
      setN(Math.min(text.length, k));
      if (k < text.length) raf = requestAnimationFrame(tick);
      else done.current?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [c.active, c.still, text, cps, delay]);
  return (
    <span className="tw">
      {text.slice(0, n)}
      <span className={`caret ${n >= text.length ? 'idle' : ''}`} aria-hidden="true" />
    </span>
  );
}

/** Drag the divider to compare a genuine earlier version with the final one. */
export function BeforeAfter({ before, after, labels, c, className = '' }: { before: string; after: string; labels: [string, string]; c: SlideCtx; className?: string }) {
  const [x, setX] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  // demonstrate the comparison once when the slide arrives
  useEffect(() => {
    if (c.still || !c.active) return setX(0.5);
    let raf = 0;
    const t0 = performance.now() + 700;
    const tick = (t: number) => {
      if (drag.current) return;
      const k = Math.min(1, Math.max(0, (t - t0) / 2200));
      const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
      // right, then left, then settle in the middle
      setX(0.5 + 0.34 * Math.sin(2 * Math.PI * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [c.active, c.still, before, after]);
  const move = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setX(Math.min(0.98, Math.max(0.02, (clientX - r.left) / r.width)));
  };
  return (
    <div
      ref={box}
      className={`ba ${className}`}
      onPointerDown={(e) => {
        drag.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => drag.current && move(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.stopPropagation();
          setX((v) => Math.min(0.98, Math.max(0.02, v + (e.key === 'ArrowLeft' ? -0.05 : 0.05))));
        }
      }}
      tabIndex={0}
      role="slider"
      aria-label="Compare before and after"
      aria-valuenow={Math.round(x * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Img src={after} className="ba-after" />
      <div className="ba-before" style={{ clipPath: `inset(0 ${(1 - x) * 100}% 0 0)` }}>
        <Img src={before} />
      </div>
      <span className="ba-tag ba-tag-l">{labels[0]}</span>
      <span className="ba-tag ba-tag-r">{labels[1]}</span>
      <span className="ba-line" style={{ left: `${x * 100}%` }}>
        <i />
      </span>
    </div>
  );
}
