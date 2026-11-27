import gsap from 'gsap';
import { aimRoomView, dream } from '../state/runtime';
import { getState, previewCapsule, type ChapterId } from '../state/store';
import { CABIN_MAP_ENTRY, chapterRange, lockScroll, resetCabinMap, scrollToY } from '../lib/scroll';
import { audio } from '../lib/audio';
import { clamp } from '../lib/math';
import { CAB, ZONE, rowZ } from '../three/scenes/cabinShading';

let tl: gsap.core.Timeline | null = null;

const kill = () => {
  tl?.kill();
  tl = null;
  gsap.killTweensOf(dream);
};

const RESET = { boardT: 0, door: 0, enter: 0, lie: 0, recline: 0, interiorLight: 1, enclosure: 0, breath: 0, scape: 0, scapeFade: 0, wake: 0, exit: 0, arrival: 0, previewWake: 0 };
const ARRIVAL_VEIL = '#37271f';

/** How far down the aisle the boarded capsule is — the glide takes longer for the forward cabins. */
function aisleSeconds() {
  const z = ZONE[previewCapsule(getState()).tier];
  const dist = CAB.zStart - rowZ(z, z.featured.row);
  return clamp(2.5 + dist * 0.145, 3.1, 5.5);
}

/**
 * Phase A — boarding. Launched by “Dream me there”. One continuous camera move, no cuts:
 * glide straight down the centre of the aisle to the capsule's mark → crane down and turn
 * to the entrance while the shade rises and the interior warms → through the opening on
 * its centre line → settle against the pillow. The capsule's touchscreen becomes usable
 * only after the camera has come to rest.
 */
export function startDream() {
  const st = getState();
  kill();
  audio.blip(520);
  lockScroll(true);
  const reduced = st.reducedMotion || !st.webgl;
  const already = st.mode === 'dream';
  dream.veilColor = '#07080C';
  tl = gsap.timeline();
  tl.to(dream, { veil: 1, duration: already ? 0.26 : 0.48, ease: 'power2.in' })
    .add(() => {
      Object.assign(dream, RESET, { enclosure: 1, interiorLight: 0.55 });
      aimRoomView('room');
      getState().set({ mode: 'dream', dreamPhase: 'boarding', dreamUi: false, capsuleControlsOpen: !st.webgl, showcasePart: null, explore: false });
    })
    .to(dream, { veil: 0, duration: 0.85, ease: 'power2.out' });
  if (!reduced) {
    const glide = aisleSeconds();
    tl.to(dream, { boardT: 1, duration: glide, ease: 'sine.inOut' }, '<')
      // approach: crane down and turn to the entrance; the shade rises as it comes into view
      .to(dream, { door: 1, duration: 2.5, ease: 'sine.inOut' }, '-=0.3')
      .to(dream, { enclosure: 0, duration: 1.75, ease: 'power2.inOut' }, '-=2.2')
      .to(dream, { interiorLight: 1, duration: 1.95, ease: 'sine.inOut' }, '<')
      // a beat on the threshold, then in along the entrance's centre line
      .to(dream, { enter: 1, duration: 1.9, ease: 'sine.inOut' }, '+=0.12')
      .add(() => getState().set({ dreamPhase: 'personalize' }), '-=0.4')
      // settle against the pillow
      .to(dream, { lie: 1, duration: 1.85, ease: 'sine.inOut' }, '-=0.4');
  } else {
    tl.set(dream, { boardT: 1, door: 1, enclosure: 0, interiorLight: 1, enter: 1, lie: 1 }, '<')
      .add(() => getState().set({ dreamPhase: 'personalize' }), '<');
  }
  tl.add(() => getState().set({ dreamUi: true }), '+=0.1');
}

/** Phase C & D — fall asleep, dream, wake somewhere new. */
export function goodNight() {
  const st = getState();
  const reduced = st.reducedMotion || !st.webgl;
  const k = reduced ? 0.55 : 1;
  kill();
  Object.assign(dream, { boardT: 1, door: 1, enter: 1, lie: 1 });
  dream.previewWake = 0;
  audio.blip(440);
  getState().set({ dreamPhase: 'sleep', dreamUi: false });
  tl = gsap.timeline();
  // lie back as the lights dim and the shade closes
  tl.to(dream, { recline: 1, duration: 3.0 * k, ease: 'sine.inOut' }, 0.3 * k)
    .to(dream, { interiorLight: 0.06, duration: 3.0 * k, ease: 'power1.inOut' }, 0.6 * k)
    .to(dream, { enclosure: 1, duration: 2.4 * k, ease: 'power2.inOut' }, 0.9 * k)
    .add(() => {
      dream.veilColor = '#000000';
    }, 3.2 * k)
    .to(dream, { veil: 1, duration: 1.6 * k, ease: 'power1.in' }, 3.2 * k)
    .to(dream, { breath: 0.8, duration: reduced ? 0.55 : 1.4, ease: 'sine.inOut', yoyo: true, repeat: 1 }, '>-0.2')
    .add(() => {
      dream.scape = 0;
      dream.scapeFade = 0;
      getState().set({ dreamPhase: 'dreamscape' });
    })
    .to(dream, { scapeFade: 1, duration: 2.4, ease: 'power1.out' })
    .to(dream, { veil: 0, duration: 2.2, ease: 'power1.out' }, '<')
    .to(dream, { scape: 1, duration: 9 * k, ease: 'none' }, '<')
    .to(dream, { veil: 1, duration: 1.8, ease: 'power1.in' }, '-=1.8')
    // waking: warm morning light fills the closed capsule while you are still lying down …
    .add(() => {
      Object.assign(dream, { boardT: 1, door: 1, enter: 1, lie: 1, recline: 1, interiorLight: 0.02, enclosure: 1, wake: 0, exit: 0, breath: 0 });
      getState().set({ dreamPhase: 'wake' });
      audio.chime();
    })
    .to(dream, { veil: 0, duration: 2.2, ease: 'power1.out' }, '+=0.4')
    .to(dream, { wake: 1, duration: 3.6 * k, ease: 'sine.inOut' }, '<')
    // … you sit up …
    .to(dream, { recline: 0, duration: 2.4 * k, ease: 'sine.inOut' }, '-=1.4')
    // … turn calmly toward the entrance as the shade rises onto the morning-lit aisle …
    .to(dream, { exit: 0.45, duration: 2.8 * k, ease: 'sine.inOut' }, '-=0.3')
    .to(dream, { enclosure: 0, duration: 2.2 * k, ease: 'power2.inOut' }, '-=1.6')
    // … and step out into the light.
    .to(dream, { exit: 1, duration: 2.6 * k, ease: 'sine.inOut' }, '-=0.2')
    .add(() => {
      dream.veilColor = ARRIVAL_VEIL;
    }, '-=0.78')
    .to(dream, { veil: 1, duration: 0.68, ease: 'power1.in' }, '-=0.78')
    // … which opens onto the destination.
    .add(() => {
      dream.arrival = 0;
      getState().set({ dreamPhase: 'arrival' });
    })
    .to(dream, { veil: 0, duration: 1.15, ease: 'power2.out' })
    .to(dream, { arrival: 1, duration: reduced ? 0.01 : 12, ease: 'power1.out' }, '<');
}

/** Skip straight to waking up at the destination. */
export function skipDream() {
  kill();
  const reduced = getState().reducedMotion;
  dream.veilColor = ARRIVAL_VEIL;
  tl = gsap
    .timeline()
    .to(dream, { veil: 1, duration: 0.35, ease: 'power2.in' })
    .add(() => {
      Object.assign(dream, RESET, { arrival: 0 });
      getState().set({ dreamPhase: 'arrival', dreamUi: false });
    })
    .to(dream, { veil: 0, duration: 0.8, ease: 'power2.out' })
    .to(dream, { arrival: 1, duration: reduced ? 0.01 : 12, ease: 'power1.out' }, '<');
}

export function jumpToChapter(id: ChapterId, at = 0) {
  const r = chapterRange(id);
  if (!r) return;
  scrollToY(r.start + (r.end - r.start) * at + 2, true);
}

/** Leave the dream and land at a chapter. */
export function exitDream(target: ChapterId = 'globe', at = target === 'selection' ? CABIN_MAP_ENTRY : 0.2) {
  kill();
  dream.veilColor = '#07080C';
  tl = gsap
    .timeline()
    .to(dream, { veil: 1, duration: 0.6, ease: 'power2.in' })
    .add(() => {
      Object.assign(dream, RESET);
      if (target === 'selection') resetCabinMap();
      getState().set({ mode: 'scroll', dreamPhase: 'idle', dreamUi: false });
      lockScroll(false);
      jumpToChapter(target, at);
    })
    .to(dream, { veil: 0, duration: 1.1, ease: 'power2.out' }, '+=0.3');
}

export function previewWake() {
  gsap.killTweensOf(dream, 'previewWake');
  const duration = getState().reducedMotion ? 0.01 : 0.7;
  gsap.timeline()
    .to(dream, { previewWake: 1, duration, ease: 'power2.out' })
    .to(dream, { previewWake: 0, duration, ease: 'power2.inOut' }, '+=2.6');
}
