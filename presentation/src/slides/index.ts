import { PART_ONE } from './partOne';
import { PART_TWO } from './partTwo';

export const SLIDES = [...PART_ONE, ...PART_TWO];

/** Planned start time (seconds) of each slide, for the presenter's pace indicator. */
export const STARTS = SLIDES.reduce<number[]>((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SLIDES[i - 1].seconds);
  return acc;
}, []);
export const TOTAL_SECONDS = STARTS[STARTS.length - 1] + SLIDES[SLIDES.length - 1].seconds;
