import { useRef } from 'react';
import { dream, veil } from '../state/runtime';
import { getState } from '../state/store';
import { useFrameUpdate } from './hooks';

/** Full-screen colour veil used for every scene transition (scroll cuts and the dream sequence). */
export function Veil() {
  const ref = useRef<HTMLDivElement>(null);
  const breath = useRef<HTMLDivElement>(null);
  const last = useRef({ o: -1, c: '' });
  useFrameUpdate(() => {
    const el = ref.current;
    if (!el) return;
    const st = getState();
    const scrollV = st.mode === 'scroll' && st.webgl ? veil.scroll : 0;
    const o = Math.max(scrollV, dream.veil);
    const c = dream.veil > scrollV ? dream.veilColor : veil.scrollColor;
    if (Math.abs(o - last.current.o) > 0.001) {
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o < 0.002 ? 'hidden' : 'visible';
      last.current.o = o;
    }
    if (c !== last.current.c) {
      el.style.backgroundColor = c;
      last.current.c = c;
    }
    const b = breath.current;
    if (b) {
      b.style.opacity = dream.breath.toFixed(3);
      b.style.transform = `translate(-50%, -50%) scale(${(0.6 + dream.breath * 0.55).toFixed(3)})`;
    }
  });
  return (
    <>
      <div ref={ref} className="veil" aria-hidden="true" />
      <div ref={breath} className="breath" aria-hidden="true" />
    </>
  );
}
