import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import gsap from 'gsap';
import { registerChapter } from '../lib/scroll';
import { onScrollFrame } from '../state/runtime';
import type { ChapterId } from '../state/store';
import { smoothstep } from '../lib/math';
import { audio } from '../lib/audio';

export function useChapterSection(id: ChapterId) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    return registerChapter(id, ref.current);
  }, [id]);
  return ref;
}

/** Run a callback on every scroll/animation frame (GSAP ticker). */
export function useFrameUpdate(cb: () => void) {
  const r = useRef(cb);
  r.current = cb;
  useEffect(() => {
    const off = onScrollFrame(() => r.current());
    return () => {
      off();
    };
  }, []);
}

/** Drives `--in` / `--out` CSS variables on every [data-in] element inside root, from a 0..1 progress value. */
export function useReveals(getProgress: () => number) {
  const root = useRef<HTMLDivElement>(null);
  const els = useRef<HTMLElement[]>([]);
  useEffect(() => {
    els.current = root.current ? Array.from(root.current.querySelectorAll<HTMLElement>('[data-in]')) : [];
  });
  useFrameUpdate(() => {
    const p = getProgress();
    for (const el of els.current) {
      const a = +(el.dataset.in ?? 0);
      const b = +(el.dataset.out ?? 9);
      const f = +(el.dataset.f ?? 0.06);
      const vin = smoothstep(a, a + f, p);
      const vout = smoothstep(b - f, b, p);
      const vi = vin.toFixed(3);
      const vo = vout.toFixed(3);
      if (el.dataset.vi !== vi) {
        el.style.setProperty('--in', vi);
        el.dataset.vi = vi;
      }
      if (el.dataset.vo !== vo) {
        el.style.setProperty('--out', vo);
        el.dataset.vo = vo;
      }
      const shown = vin > 0.02 && vout < 0.98 ? '1' : '0';
      if (el.dataset.shown !== shown) el.dataset.shown = shown;
    }
  });
  return root;
}

/** Word-by-word masked reveal, driven by the parent's --in variable. */
export function Split({ text, className = '', style }: { text: string; className?: string; style?: CSSProperties }) {
  const words = text.split(' ');
  return (
    <span className={`split ${className}`} style={{ ...style, ['--n' as any]: words.length }} aria-label={text} role="text">
      {words.map((w, i) => (
        <span className="w" key={i} aria-hidden="true" style={{ ['--i' as any]: i }}>
          <span className="wi">{w}</span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/** Subtle magnetic pull toward the cursor. */
export function Magnetic({ children, strength = 0.28, className = '', ...rest }: { children: ReactNode; strength?: number; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(pointer: coarse)').matches) return;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * strength);
      yTo((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    const enter = () => audio.blip(980);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerenter', enter);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerenter', enter);
    };
  }, [strength]);
  return (
    <button ref={ref} className={`magnetic ${className}`} {...rest}>
      <span className="magnetic-inner">{children}</span>
    </button>
  );
}

export function Annot({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`annot ${className}`}>{children}</span>;
}
