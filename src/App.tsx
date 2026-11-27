import { Suspense, lazy, useEffect, useState } from 'react';
import { getState, useStore } from './state/store';
import { detectQuality, hasWebGL2 } from './lib/quality';
import { initScroll } from './lib/scroll';
import { audio, CHAPTER_MIX, type Mix } from './lib/audio';
import { Loader } from './ui/Loader';
import { Nav } from './ui/Nav';
import { Veil } from './ui/Veil';
import { ChapterRail } from './ui/ChapterRail';
import { HeroChapter } from './ui/sections/Hero';
import { CabinChapter } from './ui/sections/Cabin';
import { ShowcaseChapter } from './ui/sections/Showcase';
import { DestinationsChapter } from './ui/sections/Destinations';
import { SelectionChapter } from './ui/sections/Selection';
import { BookingSection } from './ui/sections/Booking';
import { FinaleChapter } from './ui/sections/Finale';
import { Footer } from './ui/sections/Footer';
import { DreamOverlay } from './ui/DreamOverlay';

const Experience = lazy(() => import('./three/Experience'));

function useAudioMix() {
  useEffect(() => {
    const apply = () => {
      const s = getState();
      let mix: Mix = { ...(CHAPTER_MIX[s.chapter] ?? {}) };
      if (s.mode === 'dream') {
        const snd = s.prefs.sound;
        const chosen: Mix = snd !== 'none' ? { [snd]: snd === 'white' ? 0.22 : snd === 'hum' ? 0.5 : 0.4 } : {};
        switch (s.dreamPhase) {
          case 'boarding':
            mix = { cabin: 0.4, pad: 0.1 };
            break;
          case 'personalize':
            mix = { cabin: 0.14, pad: 0.12, ...chosen };
            break;
          case 'sleep':
            mix = { pad: 0.22, ...chosen };
            break;
          case 'dreamscape':
            mix = { space: 0.32, pad: 0.3, ...Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, (v as number) * 0.5])) };
            break;
          case 'wake':
            mix = { pad: 0.18, morning: 0.2 };
            break;
          case 'arrival':
            mix = { pad: 0.16, morning: 0.45 };
            break;
        }
      }
      audio.setMix(mix);
    };
    apply();
    return useStore.subscribe((s, p) => {
      if (s.chapter !== p.chapter || s.mode !== p.mode || s.dreamPhase !== p.dreamPhase || s.prefs.sound !== p.prefs.sound) apply();
      if (s.soundOn !== p.soundOn) audio.setEnabled(s.soundOn);
    });
  }, []);
}

export default function App() {
  const webgl = useStore((s) => s.webgl);
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const reduced = useStore((s) => s.reducedMotion);
  const [boot, setBoot] = useState(false);

  useEffect(() => {
    const gl = hasWebGL2();
    getState().set({ webgl: gl, quality: detectQuality(), ...(gl ? {} : { ready: true }) });
    initScroll();
    setBoot(true);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  useAudioMix();

  useEffect(() => {
    document.documentElement.dataset.chapter = chapter;
    document.documentElement.dataset.mode = mode;
    document.documentElement.classList.toggle('reduced-motion', reduced);
  }, [chapter, mode, reduced]);

  return (
    <>
      {boot && webgl && (
        <div className="webgl-layer" aria-hidden="true">
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        </div>
      )}
      {boot && !webgl && <div className="fallback-backdrop" aria-hidden="true" />}
      <Veil />
      <Nav />
      <ChapterRail />
      <main id="main" inert={mode === 'dream'}>
        <HeroChapter />
        <CabinChapter />
        <ShowcaseChapter />
        <DestinationsChapter />
        <SelectionChapter />
        <BookingSection />
        <FinaleChapter />
      </main>
      <Footer inactive={mode === 'dream'} />
      <DreamOverlay />
      <Loader />
    </>
  );
}
