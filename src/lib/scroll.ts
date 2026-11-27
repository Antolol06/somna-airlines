import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CHAPTERS, dream, emitScrollFrame, scroll, veil } from '../state/runtime';
import type { ChapterId } from '../state/store';
import { getState } from '../state/store';
import { clamp, smoothstep } from './math';

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
const triggers = new Map<ChapterId, ScrollTrigger>();
let started = false;

/** Veil (scene transition) lengths in viewport heights, and colours. */
const VEIL: Record<ChapterId, { inVh: number; outVh: number; inColor: string; outColor: string }> = {
  // the hero flies into the warm window and the cabin opens from the same warm tone — a mid
  // walnut-amber close to the cabin's own average, so the hand-over never flashes bright
  hero: { inVh: 0, outVh: 0.5, inColor: '#090B10', outColor: '#7a5f46' },
  cabin: { inVh: 0.45, outVh: 0.55, inColor: '#7a5f46', outColor: '#07080C' },
  showcase: { inVh: 0.45, outVh: 0.6, inColor: '#07080C', outColor: '#04050A' },
  globe: { inVh: 0.5, outVh: 0.45, inColor: '#04050A', outColor: '#07080C' },
  selection: { inVh: 0.45, outVh: 0.4, inColor: '#07080C', outColor: '#090B10' },
  booking: { inVh: 0.35, outVh: 0.45, inColor: '#090B10', outColor: '#0B0D14' },
  finale: { inVh: 0.5, outVh: 0, inColor: '#0B0D14', outColor: '#0B0D14' },
};

export function initScroll() {
  if (started) return;
  started = true;
  const reduced = getState().reducedMotion;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.85, touchMultiplier: 1.1 });
    lenis.on('scroll', ScrollTrigger.update);
  }
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  if (import.meta.env.DEV) {
    const w = window as any;
    w.__jump = (y: number) => scrollToY(y, true);
    w.__scroll = scroll;
    w.__dream = dream;
    w.__store = getState;
    w.__chapter = (id: ChapterId, p: number) => {
      const r = chapterRange(id);
      if (r) scrollToY(r.start + (r.end - r.start) * p, true);
    };
  }
}

/** Enable / disable smooth scrolling at runtime (reduced-motion toggle). */
export function setSmooth(on: boolean) {
  if (on && !lenis) {
    lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.85, touchMultiplier: 1.1 });
    lenis.on('scroll', ScrollTrigger.update);
  } else if (!on && lenis) {
    lenis.destroy();
    lenis = null;
  }
}

export function registerChapter(id: ChapterId, el: HTMLElement) {
  triggers.get(id)?.kill();
  const t = ScrollTrigger.create({ trigger: el, start: 'top top', end: 'bottom top' });
  triggers.set(id, t);
  return () => {
    t.kill();
    triggers.delete(id);
  };
}

function tick(time: number) {
  lenis?.raf(time * 1000);
  const y = lenis ? lenis.scroll : window.scrollY;
  scroll.velocity = y - scroll.y;
  scroll.y = y;
  scroll.vh = window.innerHeight;
  let active: ChapterId | null = null;
  for (const id of CHAPTERS) {
    const t = triggers.get(id);
    if (!t) continue;
    const len = Math.max(1, t.end - t.start);
    const p = (y - t.start) / len;
    scroll.raw[id] = p;
    scroll.progress[id] = clamp(p);
    if (p >= 0 && p < 1) active = id;
  }
  const heroT = triggers.get('hero');
  if (!active && heroT && y < heroT.start + 1) active = 'hero';
  if (!active) active = scroll.active;
  if (active !== scroll.active) {
    scroll.active = active;
    getState().set({ chapter: active });
  }
  // scroll veil
  const t = triggers.get(active);
  if (t) {
    const cfg = VEIL[active];
    const len = Math.max(1, t.end - t.start);
    const p = scroll.raw[active];
    const inLen = (cfg.inVh * scroll.vh) / len;
    const outLen = (cfg.outVh * scroll.vh) / len;
    const vin = inLen > 0 ? 1 - smoothstep(0, inLen, p) : 0;
    const vout = outLen > 0 ? smoothstep(1 - outLen, 1, p) : 0;
    veil.scroll = Math.max(vin, vout);
    veil.scrollColor = vin > vout ? cfg.inColor : cfg.outColor;
    if (active === 'finale' && p >= 1) veil.scroll = 0;
  }
  emitScrollFrame();
}

export function chapterRange(id: ChapterId) {
  const t = triggers.get(id);
  return t ? { start: t.start, end: t.end } : null;
}

export function scrollToY(y: number, immediate = false, duration = 1.6) {
  if (lenis) lenis.scrollTo(y, { immediate, duration, force: true });
  else window.scrollTo({ top: y, behavior: immediate || getState().reducedMotion ? 'auto' : 'smooth' });
}

/** Jump to a chapter. Long jumps cut through a brief veil instead of scrubbing every scene. */
export function goToChapter(id: ChapterId, at = 0.0, opts: { cut?: boolean } = {}) {
  const r = chapterRange(id);
  if (!r) return;
  const target = r.start + (r.end - r.start) * at + 2;
  if (getState().reducedMotion) return scrollToY(target, true);
  const distance = Math.abs(target - scroll.y);
  const cut = opts.cut ?? distance > scroll.vh * 1.6;
  if (!cut) return scrollToY(target, false, 1.4);
  gsap.killTweensOf(dream, 'veil');
  dream.veilColor = '#07080C';
  gsap.to(dream, {
    veil: 1,
    duration: 0.28,
    ease: 'power2.in',
    onComplete: () => {
      scrollToY(target, true);
      ScrollTrigger.update();
      gsap.to(dream, { veil: 0, duration: 0.55, ease: 'power2.out' });
    },
  });
}

export const CABIN_MAP_ENTRY = 0.2;

export function resetCabinMap() {
  getState().set({ selectionView: 'map', selectionFocus: false, selectionTopDown: false, selectionUpperDeck: true });
}

export function openCabinMap() {
  resetCabinMap();
  goToChapter('selection', CABIN_MAP_ENTRY);
}

export function goToElement(el: HTMLElement | null, offset = -80) {
  if (!el) return;
  const y = el.getBoundingClientRect().top + scroll.y + offset;
  const distance = Math.abs(y - scroll.y);
  if (distance < scroll.vh * 1.6) return scrollToY(y);
  dream.veilColor = '#07080C';
  gsap.to(dream, {
    veil: 1,
    duration: 0.45,
    onComplete: () => {
      scrollToY(y, true);
      gsap.to(dream, { veil: 0, duration: 0.9, delay: 0.15 });
    },
  });
}

export function lockScroll(lock: boolean) {
  if (lenis) lock ? lenis.stop() : lenis.start();
  document.documentElement.classList.toggle('scroll-locked', lock);
}

export function refreshScroll() {
  ScrollTrigger.refresh();
}

export { gsap, ScrollTrigger };
