import type { ReactNode } from 'react';
import type { LiveShot } from './live/state';

export interface SlideCtx {
  /** the slide is on screen */
  active: boolean;
  /** current build step within the slide (0-based) */
  step: number;
  /** rendering a still (PDF export, thumbnails, presenter previews): no motion, final state */
  still: boolean;
  openDemo: () => void;
}

export interface SlideDef {
  id: string;
  part: 'I' | 'II';
  chapter: string;
  title: string;
  /** index into TEAM */
  speaker: number;
  /** planned speaking time */
  seconds: number;
  /** extra build steps on this slide (0 = none) */
  steps?: number;
  notes: string;
  className?: string;
  /** the slide shows the website's live 3D (lets the deck prepare it one slide ahead) */
  live?: LiveShot;
  render: (c: SlideCtx) => ReactNode;
}
