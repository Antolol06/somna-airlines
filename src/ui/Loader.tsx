import { useEffect, useState } from 'react';
import { getState, useStore } from '../state/store';
import { audio } from '../lib/audio';
import { Brand, Wordmark } from './Wordmark';

export function Loader() {
  const ready = useStore((s) => s.ready);
  const entered = useStore((s) => s.entered);
  const webgl = useStore((s) => s.webgl);
  const [fonts, setFonts] = useState(false);

  useEffect(() => {
    document.fonts?.ready.then(() => setFonts(true)) ?? setFonts(true);
    const t = setTimeout(() => setFonts(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const canEnter = ready && fonts;

  const enter = (sound: boolean) => {
    if (sound) audio.setEnabled(true);
    getState().set({ entered: true, soundOn: sound });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('scroll-locked', !entered);
  }, [entered]);

  return (
    <div className={`loader ${entered ? 'is-leaving' : ''}`} role="dialog" aria-modal={!entered} aria-hidden={entered} inert={entered} aria-label="SŌMNA — welcome">
      <div className="loader-inner">
        <div className="loader-mark" aria-hidden="true">
          <span className="macron" />
          <span className="ring" />
        </div>
        <h1 className="loader-word">
          <Wordmark />
        </h1>
        <p className="loader-tag">Depart. Dream. Arrive.</p>
        <div className={`loader-bar ${canEnter ? 'is-ready' : ''}`} aria-hidden="true">
          <span />
        </div>
        <div className={`loader-actions ${canEnter ? 'is-ready' : ''}`}>
          <button className="btn btn-primary" onClick={() => enter(false)} disabled={!canEnter}>
            Begin in silence
          </button>
          <button className="btn btn-ghost" onClick={() => enter(true)} disabled={!canEnter}>
            Begin with sound
          </button>
        </div>
        <p className="loader-note" role="status">
          {canEnter ? (webgl ? 'Headphones recommended. Scroll to travel.' : 'A simplified experience is ready.') : 'Preparing the cabin…'}
        </p>
      </div>
      <p className="loader-legal">
        A conceptual airline experience. <Brand /> is fictional — no real flights, fares or bookings.
      </p>
    </div>
  );
}
