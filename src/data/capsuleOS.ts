/**
 * Capsule environment presets and the cabin tour schedule.
 * Pure data (no three.js) so both the DOM layer and the 3D scenes can share it.
 */
import type { TierId } from './capsules';

export type AmbientId = 'champagne' | 'amber' | 'rose' | 'lavender' | 'midnight' | 'aurora';
export type Airflow = 'low' | 'auto' | 'high';
export type SceneId = 'relax' | 'dream' | 'wake';

/** Ambient light colours: `strip` is the visible light line, `fill` the light it casts. */
export const AMBIENTS: { id: AmbientId; name: string; strip: string; fill: string; kelvin: string }[] = [
  { id: 'champagne', name: 'Champagne', strip: '#ffcf96', fill: '#ffbe7a', kelvin: '2,700 K' },
  { id: 'amber', name: 'Amber', strip: '#ffb064', fill: '#ff9a52', kelvin: '2,200 K' },
  { id: 'rose', name: 'Rose', strip: '#ffb7a6', fill: '#f08a7e', kelvin: 'Rose' },
  { id: 'lavender', name: 'Lavender', strip: '#c8b6ff', fill: '#8e78dc', kelvin: 'Lavender' },
  { id: 'midnight', name: 'Midnight', strip: '#6d80ff', fill: '#2d3f9a', kelvin: 'Midnight' },
  { id: 'aurora', name: 'Aurora', strip: '#9ae6cf', fill: '#3f9f88', kelvin: 'Aurora' },
];
export const AMBIENT = Object.fromEntries(AMBIENTS.map((a) => [a.id, a])) as Record<AmbientId, (typeof AMBIENTS)[number]>;

/** Lighting scenes set a colour and an intensity, which can then be fine-tuned. */
export const SCENES: { id: SceneId; name: string; spec: string; ambient: AmbientId; level: number }[] = [
  { id: 'relax', name: 'Relax', spec: 'Warm · 80 %', ambient: 'champagne', level: 80 },
  { id: 'dream', name: 'Dream', spec: 'Midnight · 35 %', ambient: 'midnight', level: 35 },
  { id: 'wake', name: 'Wake', spec: 'Sunrise · 100 %', ambient: 'amber', level: 100 },
];
export const SCENE = Object.fromEntries(SCENES.map((s) => [s.id, s])) as Record<SceneId, (typeof SCENES)[number]>;

export const AIRFLOWS: { id: Airflow; name: string; speed: number }[] = [
  { id: 'low', name: 'Low', speed: 0.55 },
  { id: 'auto', name: 'Auto', speed: 1 },
  { id: 'high', name: 'High', speed: 1.8 },
];

export const WINDOW_PRESETS: { id: string; name: string; value: number }[] = [
  { id: 'clear', name: 'Clear', value: 0 },
  { id: 'dim', name: 'Dim', value: 55 },
  { id: 'dark', name: 'Dark', value: 100 },
];

// ---------------------------------------------------------------- cabin tour
/**
 * The cabin chapter as a dolly schedule over scroll progress (0..1). The camera travels
 * straight down the aisle between marks; at each mark it stops and turns to showcase the
 * featured capsule of that cabin, then returns to the centre line and continues.
 */
export interface TourStop {
  tier: TierId;
  /** scroll window of the showcase: [turn starts, fully turned, turn back starts, back on axis] */
  show: [number, number, number, number];
}
export const TOUR: { stops: TourStop[]; end: number } = {
  stops: [
    { tier: 'essential', show: [0.19, 0.245, 0.305, 0.36] },
    { tier: 'signature', show: [0.47, 0.525, 0.585, 0.64] },
    { tier: 'grand', show: [0.74, 0.795, 0.845, 0.9] },
  ],
  end: 1,
};
/** Where each cabin's information panel is shown (inside the held part of its showcase). */
export const TOUR_PANELS: Record<TierId, [number, number]> = {
  essential: [0.215, 0.335],
  signature: [0.495, 0.615],
  grand: [0.765, 0.875],
};
/** Cabin boundaries along the tour (for the HUD). */
export const TOUR_SEGMENTS: { id: TierId; a: number; b: number }[] = [
  { id: 'essential', a: 0, b: 0.43 },
  { id: 'signature', a: 0.43, b: 0.7 },
  { id: 'grand', a: 0.7, b: 1 },
];
