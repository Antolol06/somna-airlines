/**
 * Mutable, non-reactive runtime state shared between the DOM layer and the
 * WebGL render loop. Written every frame — never put this in React state.
 */
import type { ChapterId } from './store';

export const CHAPTERS: ChapterId[] = ['hero', 'cabin', 'showcase', 'globe', 'selection', 'booking', 'finale'];

export const scroll = {
  y: 0,
  vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  velocity: 0,
  active: 'hero' as ChapterId,
  progress: Object.fromEntries(CHAPTERS.map((c) => [c, 0])) as Record<ChapterId, number>,
  /** progress values beyond [0,1] for the chapters adjacent to the active one */
  raw: Object.fromEntries(CHAPTERS.map((c) => [c, -1])) as Record<ChapterId, number>,
};

export const pointer = { x: 0, y: 0, sx: 0, sy: 0, down: false };

export type RoomView = 'room' | 'window' | 'bed' | 'entrance';
export const roomLook = { view: 'room' as RoomView, yaw: 0, pitch: 0 };

export function aimRoomView(view: RoomView) {
  Object.assign(roomLook, { view, yaw: 0, pitch: 0 });
}

/** Dream sequence timeline values, animated by GSAP, read by the scenes. */
export const dream = {
  boardT: 0, // 0..1 travel along corridor toward capsule
  door: 0, // 0 = closed, 1 = open (target capsule in cabin)
  enter: 0, // push into capsule
  lie: 0, // settle into the resting (sitting up) position
  recline: 0, // lie back to sleep (0 = sitting up, 1 = lying down)
  interiorLight: 1, // master light level inside the capsule
  enclosure: 0, // privacy enclosure: 0 = open, 1 = closed
  breath: 0, // breathing light intensity
  scape: 0, // dreamscape progress 0..1
  scapeFade: 0,
  wake: 0, // sunrise level inside capsule
  exit: 0, // camera leaving capsule
  arrival: 0, // destination reveal progress
  previewWake: 0, // transient sunrise preview when adjusting wake intensity
  veil: 0,
  veilColor: '#090B10',
};

export const intro = { t: 0, level: 0, beacon: 0, started: false };

export const veil = { scroll: 0, scrollColor: '#090B10' };

/** DOM elements registered for per-frame projection from 3D scenes. */
export const domRegistry = new Map<string, HTMLElement>();
export const TABLET_SURFACE = { width: 640, height: 430, id: 'capsule-tablet-surface' };

type FrameCb = () => void;
const frameCbs = new Set<FrameCb>();
export const onScrollFrame = (cb: FrameCb) => {
  frameCbs.add(cb);
  return () => frameCbs.delete(cb);
};
export const emitScrollFrame = () => frameCbs.forEach((cb) => cb());

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true },
  );
  window.addEventListener('pointerdown', () => (pointer.down = true), { passive: true });
  window.addEventListener('pointerup', () => (pointer.down = false), { passive: true });
  // gentle gyroscope-free touch parallax: follow touch position softly
  window.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      pointer.x = ((t.clientX / window.innerWidth) * 2 - 1) * 0.6;
      pointer.y = (-(t.clientY / window.innerHeight) * 2 + 1) * 0.4;
    },
    { passive: true },
  );
}
