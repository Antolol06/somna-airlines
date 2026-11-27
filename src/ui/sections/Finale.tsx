import { useStore } from '../../state/store';
import { scroll } from '../../state/runtime';
import { Magnetic, Split, useChapterSection, useReveals } from '../hooks';
import { goToChapter } from '../../lib/scroll';

export function FinaleChapter() {
  const section = useChapterSection('finale');
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const root = useReveals(() => scroll.progress.finale);
  return (
    <>
      <section ref={section} className="chapter" id="arrive" style={{ height: '320vh' }} aria-label="Arrive differently" />
      <div className="stage stage-finale" data-active={chapter === 'finale' && mode === 'scroll'} ref={root}>
        <div className="finale-lines">
          <p className="display-xxl reveal" data-in="0.08" data-out="0.98" data-f="0.08">
            <Split text="Go further." />
          </p>
          <p className="display-xxl reveal" data-in="0.28" data-out="0.98" data-f="0.08">
            <Split text="Dream deeper." />
          </p>
          <p className="display-xxl em reveal" data-in="0.48" data-out="0.98" data-f="0.08">
            <Split text="Arrive differently." />
          </p>
        </div>
        <div className="finale-cta reveal" data-in="0.66" data-out="1.2" data-f="0.08">
          <Magnetic className="btn btn-primary btn-lg" onClick={() => goToChapter('booking', 0)}>
            Book your dream
          </Magnetic>
          <button className="link" onClick={() => goToChapter('hero', 0)}>
            Begin again
          </button>
        </div>
      </div>
    </>
  );
}
