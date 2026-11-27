import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CityId } from '../data/cities';
import { todayPlus } from '../data/cities';
import { availableCapsule, firstAvailable, MAX_GUESTS } from '../data/capsules';
import { SCENE, type Airflow, type AmbientId } from '../data/capsuleOS';
import type { PartId } from '../data/capsuleShowcase';

export type ChapterId = 'hero' | 'cabin' | 'showcase' | 'globe' | 'selection' | 'booking' | 'finale';
export type LightMode = 'relax' | 'dream' | 'wake';
export type SoundChoice = 'none' | 'rain' | 'ocean' | 'white' | 'hum';
export type WakeChoice = 'arrival' | '30' | '60';
export type DreamPhase = 'idle' | 'boarding' | 'personalize' | 'sleep' | 'dreamscape' | 'wake' | 'arrival';
export type Quality = 'high' | 'low';

export interface Prefs {
  temperature: number;
  /** lighting scene (sets colour + intensity, which can then be fine-tuned) */
  lighting: LightMode;
  ambient: AmbientId;
  /** 0–100 */
  ambientLevel: number;
  /** electrochromic window tint, 0 (clear) – 100 (dark) */
  windowTint: number;
  reading: boolean;
  airflow: Airflow;
  sound: SoundChoice;
  wake: WakeChoice;
  wakeIntensity: number;
}

const DEFAULT_PREFS: Prefs = {
  temperature: 21,
  lighting: 'relax',
  ambient: 'champagne',
  ambientLevel: 80,
  windowTint: 0,
  reading: false,
  airflow: 'auto',
  sound: 'none',
  wake: 'arrival',
  wakeIntensity: 70,
};

export interface Confirmation {
  ref: string;
  createdAt: number;
}

interface State {
  // runtime
  ready: boolean;
  entered: boolean;
  webgl: boolean;
  quality: Quality;
  /** set when the performance monitor gives up on the rich pipeline */
  degraded: boolean;
  chapter: ChapterId;
  mode: 'scroll' | 'dream';
  dreamPhase: DreamPhase;
  /** capsule controls are shown only once the camera has come to rest */
  dreamUi: boolean;
  capsuleControlsOpen: boolean;
  explore: boolean;
  hoverCapsule: string | null;
  selectionFocus: boolean;
  selectionView: 'map' | 'aircraft';
  selectionTopDown: boolean;
  selectionUpperDeck: boolean;
  showcasePart: PartId | null;
  // preferences / journey (persisted)
  soundOn: boolean;
  reducedMotion: boolean;
  from: CityId;
  to: CityId;
  guestCapsules: (string | null)[];
  activeGuest: number;
  showcaseLight: LightMode;
  prefs: Prefs;
  date: string;
  confirmation: Confirmation | null;

  set: (p: Partial<State>) => void;
  setPrefs: (p: Partial<Prefs>) => void;
  setRoute: (from: CityId, to: CityId) => void;
  selectCapsule: (id: string | null) => boolean;
  setGuestCount: (count: number) => void;
  setActiveGuest: (guest: number) => void;
}

export const previewCapsule = (s: Pick<State, 'guestCapsules'>) => availableCapsule(s.guestCapsules.find((id) => id !== null) ?? null) ?? firstAvailable('signature');

const clampGuestCount = (count: number) => Number.isFinite(count) ? Math.min(MAX_GUESTS, Math.max(1, Math.trunc(count))) : 1;

const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ready: false,
      entered: false,
      webgl: true,
      quality: 'high',
      degraded: false,
      chapter: 'hero',
      mode: 'scroll',
      dreamPhase: 'idle',
      dreamUi: false,
      capsuleControlsOpen: true,
      explore: false,
      hoverCapsule: null,
      selectionFocus: false,
      selectionView: 'map',
      selectionTopDown: false,
      selectionUpperDeck: true,
      showcasePart: null,

      soundOn: false,
      reducedMotion: !!prefersReduced,
      from: 'rome',
      to: 'tokyo',
      guestCapsules: [null],
      activeGuest: 0,
      showcaseLight: 'relax',
      prefs: DEFAULT_PREFS,
      date: todayPlus(21),
      confirmation: null,

      set: (p) => set(p as State),
      setPrefs: (p) => {
        const next = { ...get().prefs, ...p };
        // choosing a lighting scene applies its colour and intensity (unless given explicitly)
        if (p.lighting && p.ambient === undefined) next.ambient = SCENE[p.lighting].ambient;
        if (p.lighting && p.ambientLevel === undefined) next.ambientLevel = SCENE[p.lighting].level;
        set({ prefs: next, confirmation: null });
      },
      setRoute: (from, to) => set({ from, to, confirmation: null }),
      setGuestCount: (count) => {
        const st = get();
        const length = clampGuestCount(count);
        if (length === st.guestCapsules.length) return;
        const guestCapsules = Array.from({ length }, (_, i) => st.guestCapsules[i] ?? null);
        const nextUnassigned = guestCapsules.findIndex((id) => id === null);
        const activeGuest = length > st.guestCapsules.length && nextUnassigned >= 0 ? nextUnassigned : Math.min(st.activeGuest, length - 1);
        set({ guestCapsules, activeGuest, selectionFocus: false, confirmation: null });
      },
      setActiveGuest: (guest) => {
        if (Number.isInteger(guest) && guest >= 0 && guest < get().guestCapsules.length) set({ activeGuest: guest, selectionFocus: false });
      },
      selectCapsule: (id) => {
        const { guestCapsules, activeGuest } = get();
        if (id !== null && (!availableCapsule(id) || guestCapsules.some((value, i) => i !== activeGuest && value === id))) return false;
        if (guestCapsules[activeGuest] === id) return false;
        const next = guestCapsules.map((value, i) => i === activeGuest ? id : value);
        const nextUnassigned = next.findIndex((value) => value === null);
        set({ guestCapsules: next, activeGuest: id && nextUnassigned >= 0 ? nextUnassigned : activeGuest, selectionFocus: false, confirmation: null });
        return true;
      },
    }),
    {
      name: 'somna-journey-v1',
      merge: (persisted, current) => {
        const { capsuleId, guests, ...p } = (persisted ?? {}) as Partial<State> & { capsuleId?: string | null; guests?: number };
        const saved = Array.isArray(p.guestCapsules) ? p.guestCapsules : [capsuleId ?? null];
        const length = clampGuestCount(p.guestCapsules?.length ?? guests ?? 1);
        const used = new Set<string>();
        const guestCapsules = Array.from({ length }, (_, i) => {
          const slot = availableCapsule(saved[i]);
          if (!slot || used.has(slot.id)) return null;
          used.add(slot.id);
          return slot.id;
        });
        const next = guestCapsules.indexOf(null);
        return { ...current, ...p, guestCapsules, activeGuest: Math.max(0, next), prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}) } };
      },
      partialize: (s) => ({
        from: s.from,
        to: s.to,
        guestCapsules: s.guestCapsules,
        prefs: s.prefs,
        date: s.date < todayPlus(1) ? todayPlus(21) : s.date,
        reducedMotion: s.reducedMotion,
        showcaseLight: s.showcaseLight,
      }),
    },
  ),
);

export const getState = () => useStore.getState();
