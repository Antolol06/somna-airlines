// Shared, non-reactive state between the slides and the live 3D layer.
// A slide that wants the website's real 3D asks for a "shot"; the layer renders it.
import type { TierId } from '@site/data/capsules';
import type { LightMode } from '@site/state/store';

export type LiveScene = 'hero' | 'cabin' | 'showcase' | 'finale';

export interface Shot {
  scene: LiveScene;
  /** the chapter's scroll progress is eased from `from` to `to` over `seconds`, then held */
  from: number;
  to: number;
  seconds: number;
  /** wait before the camera starts to move */
  delay?: number;
  /** live parameters, read every frame (changing them never cuts the shot) */
  params: { tier: TierId; light: LightMode; exploded: boolean };
}

/** How a slide describes its shot (declared once, used by the slide and by the preroll). */
export type LiveShot = Omit<Shot, 'params'> & { params?: Partial<Shot['params']> };

export const live = {
  /** the shot the active slide asks for (null: no 3D on screen) */
  want: null as Shot | null,
  /** the next slide's shot, prepared behind the current slide */
  preroll: null as LiveShot | null,
  /**
   * Set when WebGL is unavailable or the 3D layer crashed: slides fall back to recorded clips.
   * `?lite` in the URL forces this (for a weak presentation laptop).
   */
  failed: typeof location !== 'undefined' && new URLSearchParams(location.search).has('lite'),
  /** the 3D layer is mounted and has compiled its scenes */
  ready: false,
};

const subs = new Set<() => void>();
export const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};
export const notify = () => subs.forEach((fn) => fn());

export const makeShot = (s: LiveShot): Shot => ({
  ...s,
  params: { tier: 'signature', light: 'relax', exploded: false, ...s.params },
});

// The deck's four live shots: the website's own camera paths, eased through a range of each
// chapter's scroll progress.
export const SHOTS = {
  hero: { scene: 'hero', from: 0.1, to: 0.36, seconds: 18, delay: 0.2 },
  cabin: { scene: 'cabin', from: 0.03, to: 0.25, seconds: 17, delay: 0.3 },
  showcase: { scene: 'showcase', from: 0.3, to: 0.3, seconds: 1 },
  finale: { scene: 'finale', from: 0.28, to: 0.62, seconds: 16, delay: 0.2 },
} satisfies Record<LiveScene, LiveShot>;
