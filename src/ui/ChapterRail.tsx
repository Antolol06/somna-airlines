import { useRef } from 'react';
import { useStore, type ChapterId } from '../state/store';
import { goToChapter, openCabinMap } from '../lib/scroll';
import { CHAPTERS, scroll } from '../state/runtime';
import { useFrameUpdate } from './hooks';
import { SHOWCASE_ENTRY } from '../data/capsuleShowcase';

const LABELS: Record<ChapterId, string> = {
  hero: 'Beyond flying',
  cabin: 'The cabin',
  showcase: 'The capsule',
  globe: 'Destinations',
  selection: 'Your space',
  booking: 'Book',
  finale: 'Arrive',
};
const CHAPTER_ENTRY: Partial<Record<ChapterId, number>> = { showcase: SHOWCASE_ENTRY, globe: 0.2, booking: 0 };

export function ChapterRail() {
  const chapter = useStore((s) => s.chapter);
  const entered = useStore((s) => s.entered);
  const mode = useStore((s) => s.mode);
  const fill = useRef<HTMLSpanElement>(null);
  useFrameUpdate(() => {
    const i = CHAPTERS.indexOf(scroll.active);
    const p = (i + scroll.progress[scroll.active]) / CHAPTERS.length;
    if (fill.current) fill.current.style.transform = `scaleY(${p.toFixed(4)})`;
  });
  return (
    <nav className={`rail ${entered && mode === 'scroll' ? 'is-in' : ''}`} aria-label="Chapters" inert={!entered || mode !== 'scroll'}>
      <span className="rail-track" aria-hidden="true">
        <span ref={fill} className="rail-fill" />
      </span>
      <ol>
        {CHAPTERS.map((c, i) => (
          <li key={c}>
            <button className={c === chapter ? 'is-active' : ''} onClick={() => c === 'selection' ? openCabinMap() : goToChapter(c, CHAPTER_ENTRY[c] ?? 0.05)} aria-current={c === chapter ? 'step' : undefined}>
              <span className="rail-num">0{i + 1}</span>
              <span className="rail-label">{LABELS[c]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
