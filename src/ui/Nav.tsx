import { useState } from 'react';
import { getState, useStore } from '../state/store';
import { CABIN_MAP_ENTRY, goToChapter, openCabinMap, setSmooth } from '../lib/scroll';
import { audio } from '../lib/audio';
import type { ChapterId } from '../state/store';
import { Wordmark } from './Wordmark';
import { SHOWCASE_ENTRY } from '../data/capsuleShowcase';

const LINKS: { label: string; chapter: ChapterId; at: number }[] = [
  { label: 'Experience', chapter: 'cabin', at: 0.06 },
  { label: 'The Capsule', chapter: 'showcase', at: SHOWCASE_ENTRY },
  { label: 'Destinations', chapter: 'globe', at: 0.2 },
  { label: 'Cabin map', chapter: 'selection', at: CABIN_MAP_ENTRY },
];

export function SoundToggle({ compact = false }: { compact?: boolean }) {
  const on = useStore((s) => s.soundOn);
  return (
    <button
      className={`sound-toggle ${on ? 'is-on' : ''}`}
      onClick={() => {
        const next = !getState().soundOn;
        audio.setEnabled(next);
        getState().set({ soundOn: next });
      }}
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
    >
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {!compact && <span className="label">{on ? 'Sound on' : 'Sound off'}</span>}
    </button>
  );
}

export function MotionToggle() {
  const reduced = useStore((s) => s.reducedMotion);
  return (
    <button
      className="motion-toggle"
      onClick={() => {
        getState().set({ reducedMotion: !reduced });
        setSmooth(reduced);
      }}
      aria-pressed={reduced}
    >
      {reduced ? 'Reduced motion · on' : 'Reduced motion · off'}
    </button>
  );
}

export function Nav() {
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const entered = useStore((s) => s.entered);
  const [open, setOpen] = useState(false);
  const go = (c: ChapterId, at: number) => {
    setOpen(false);
    audio.blip(760);
    if (c === 'selection') openCabinMap();
    else goToChapter(c, at);
  };
  const book = () => {
    setOpen(false);
    audio.blip(760);
    goToChapter('booking', 0.0);
  };
  return (
    <header className={`nav ${entered ? 'is-in' : ''} ${mode === 'dream' ? 'is-hidden' : ''} ${open ? 'is-open' : ''}`} inert={!entered || mode === 'dream'}>
      <button className="nav-logo" onClick={() => go('hero', 0)} aria-label="SŌMNA — back to the beginning">
        <Wordmark title="" />
      </button>
      <nav className="nav-links" aria-label="Primary">
        {LINKS.map((l) => (
          <button key={l.label} className={`nav-link ${chapter === l.chapter ? 'is-active' : ''}`} onClick={() => go(l.chapter, l.at)}>
            {l.label}
          </button>
        ))}
        <button className={`nav-link nav-cta ${chapter === 'booking' ? 'is-active' : ''}`} onClick={book}>
          Book a Dream
        </button>
      </nav>
      <div className="nav-tools">
        <SoundToggle />
        <button className="nav-burger" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label="Menu">
          <span />
          <span />
        </button>
      </div>
      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        {LINKS.map((l, i) => (
          <button key={l.label} className="mobile-link" style={{ ['--i' as any]: i }} onClick={() => go(l.chapter, l.at)}>
            <span className="annot">0{i + 1}</span>
            {l.label}
          </button>
        ))}
        <button className="mobile-link" style={{ ['--i' as any]: 3 }} onClick={book}>
          <span className="annot">0{LINKS.length + 1}</span>Book a Dream
        </button>
        <div className="mobile-tools">
          <SoundToggle />
          <MotionToggle />
        </div>
      </div>
    </header>
  );
}
