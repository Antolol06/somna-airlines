import { useEffect, useId, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import { getState, previewCapsule, useStore } from '../state/store';
import { aimRoomView, domRegistry, dream, roomLook, TABLET_SURFACE, type RoomView } from '../state/runtime';
import { computeJourney, formatLocalTime } from '../data/cities';
import { CapsuleOS } from './CapsuleOS';
import { SoundToggle } from './Nav';
import { exitDream, goodNight, skipDream, startDream } from './dreamDirector';
import { useFrameUpdate } from './hooks';
import { DESTINATION_PHOTOS } from '../data/destinations';
import { Wordmark } from './Wordmark';
import { clamp, wrapAngle } from '../lib/math';

function regionFor(lat: number, lon: number) {
  if (lat > 66) return 'the Arctic';
  if (lon < -100 || lon > 145) return 'the Pacific';
  if (lon >= -100 && lon < -60) return lat > 25 ? 'North America' : 'the Caribbean';
  if (lon >= -60 && lon < -12) return 'the Atlantic';
  if (lon >= -12 && lon < 40) return lat > 36 ? 'Europe' : lat > 20 ? 'the Mediterranean' : 'Africa';
  if (lon >= 40 && lon < 75) return lat > 30 ? 'Central Asia' : lat > 12 ? 'Arabia' : 'the Indian Ocean';
  if (lon >= 75 && lon <= 145) return lat > 30 ? 'the steppe and the Gobi' : lat > 12 ? 'the Bay of Bengal' : 'the Indian Ocean';
  return 'the clouds';
}

const ROOM_VIEWS: { id: RoomView; label: string }[] = [
  { id: 'room', label: 'Reset view' }, { id: 'bed', label: 'Bed' }, { id: 'window', label: 'Window' }, { id: 'entrance', label: 'Entrance' },
];
const LOOK_KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

function registerTablet(el: HTMLDivElement | null) {
  if (el) domRegistry.set(TABLET_SURFACE.id, el);
  else domRegistry.delete(TABLET_SURFACE.id);
}

function CapsuleRoom() {
  const controlsOpen = useStore((s) => s.capsuleControlsOpen);
  const webgl = useStore((s) => s.webgl);
  const hintId = useId();
  const tabletId = useId();
  const drag = useRef({ id: -1, x: 0, y: 0 });
  const controlsToggle = useRef<HTMLButtonElement>(null);
  const returnedFromTablet = useRef(false);
  const setOpen = (open: boolean) => getState().set({ capsuleControlsOpen: open });

  useEffect(() => {
    if (!controlsOpen && returnedFromTablet.current) controlsToggle.current?.focus();
    returnedFromTablet.current = controlsOpen;
  }, [controlsOpen]);

  const turn = (yaw: number, pitch: number) => {
    if (controlsOpen) setOpen(false);
    roomLook.yaw = wrapAngle(roomLook.yaw + yaw);
    roomLook.pitch = clamp(roomLook.pitch + pitch, -1.05, 1.05);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current.id !== -1) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d.id !== event.pointerId) return;
    turn((d.x - event.clientX) * 0.005, (event.clientY - d.y) * 0.005);
    d.x = event.clientX;
    d.y = event.clientY;
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current.id !== event.pointerId) return;
    drag.current.id = -1;
    event.currentTarget.dataset.dragging = 'false';
  };
  const onLookKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const direction = LOOK_KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    turn(direction[0] * 0.15, direction[1] * 0.15);
  };

  return (
    <div className="capsule-room" data-controls={controlsOpen}>
      {webgl && (
        <div className="room-look-surface" role="region" aria-label="Look around the capsule" aria-describedby={hintId} tabIndex={0}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} onKeyDown={onLookKey} />
      )}
      <div className="room-view-tools">
        {webgl && <p id={hintId}>Drag to look around <span>· Arrow keys also work</span></p>}
        <div className="room-view-buttons" role="group" aria-label="Capsule view options">
          {webgl && ROOM_VIEWS.map(({ id, label }) => (
            <button key={id} className="btn btn-ghost btn-sm" type="button" onClick={() => { aimRoomView(id); setOpen(false); }}>{label}</button>
          ))}
          {!controlsOpen && (
            <>
              <button ref={controlsToggle} className="btn btn-ghost btn-sm" type="button" aria-expanded={false} aria-controls={tabletId} onClick={() => setOpen(true)}>
                {webgl ? 'Open tablet' : 'Show controls'}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={goodNight}>Good night</button>
            </>
          )}
        </div>
      </div>
      {webgl ? (
        <div className="room-tablet-projection" ref={registerTablet} data-visible="false"
          style={{ width: TABLET_SURFACE.width, height: TABLET_SURFACE.height }}>
          <div className="room-tablet-content" inert={!controlsOpen}>
            <CapsuleOS id={tabletId} open onClose={() => setOpen(false)} />
          </div>
          {!controlsOpen && <button className="room-tablet-opener" type="button" aria-label="Tap the wall tablet" onClick={() => setOpen(true)} />}
        </div>
      ) : <CapsuleOS id={tabletId} open={controlsOpen} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The boarding caption recedes as the guest steps through the capsule opening. */
function BoardingCaption({ capsule }: { capsule: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFrameUpdate(() => {
    const el = ref.current;
    if (!el) return;
    const o = (1 - Math.min(1, dream.enter * 3)).toFixed(3);
    if (el.style.opacity !== o) el.style.opacity = o;
  });
  return (
    <div className="dream-caption" ref={ref}>
      <span className="eyebrow">Boarding</span>
      <p className="display-m">Capsule {capsule} is ready for you.</p>
    </div>
  );
}

function DreamText() {
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const j = useMemo(() => computeJourney(from, to), [from, to]);
  const bar = useRef<HTMLSpanElement>(null);
  const rem = useRef<HTMLSpanElement>(null);
  const where = useRef<HTMLParagraphElement>(null);
  const mid = useMemo(() => {
    const lat = (j.from.lat + j.to.lat) / 2;
    let dl = j.to.lon - j.from.lon;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    return { lat, lon: j.from.lon + dl / 2 };
  }, [j]);
  useFrameUpdate(() => {
    const p = dream.scape;
    if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(3)})`;
    const left = Math.max(0, j.hours * (1 - p));
    const h = Math.floor(left);
    const m = Math.floor((left - h) * 60);
    if (rem.current) rem.current.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} until ${j.to.name}`;
    if (where.current) where.current.style.opacity = String(Math.min(1, p * 4) * (1 - Math.max(0, (p - 0.8) * 5)));
  });
  return (
    <div className="dream-scape-ui">
      <p className="display-m" ref={where}>
        Somewhere over {regionFor(mid.lat, mid.lon)}…
      </p>
      <div className="scape-progress">
        <span className="annot">{j.from.code}</span>
        <span className="sp-track">
          <span ref={bar} />
        </span>
        <span className="annot">{j.to.code}</span>
      </div>
      <span className="annot" ref={rem} />
    </div>
  );
}

function Arrival() {
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const date = useStore((s) => s.date);
  const j = useMemo(() => computeJourney(from, to, date), [from, to, date]);
  const shift = Math.round(j.tzShiftHours);
  const capsuleId = useStore((s) => previewCapsule(s).id);
  const photo = DESTINATION_PHOTOS[to];
  return (
    <div className={`dream-arrival ${photo.side === 'right' ? 'is-right' : ''}`}>
      <p className="arr-kicker">
        <span className="annot">
          Preview capsule {capsuleId} · {j.from.code} → {j.to.code}
        </span>
        <span className="arr-kicker-rule" aria-hidden="true" />
        <span className="annot">Arrived {j.arrivalDate}</span>
      </p>
      <h2 className="display-xxl arr-title">
        <span className="line">Good morning,</span>
        <em className="line">{j.to.name}.</em>
      </h2>
      <p className="display-m arr-sub">While you were dreaming, the world moved.</p>
      <dl className="arr-facts">
        <div>
          <dt>Local time</dt>
          <dd>{j.arrivalLocal}</dd>
        </div>
        <div>
          <dt>Time zones crossed</dt>
          <dd>{shift === 0 ? 'None' : `${shift > 0 ? '+' : '−'}${Math.abs(shift)} h`}</dd>
        </div>
        <div>
          <dt>You slept</dt>
          <dd>{j.sleepLabel.replace('up to ', '≈ ')}</dd>
        </div>
        <div>
          <dt>Right now in {j.to.name}</dt>
          <dd>{formatLocalTime(new Date(), j.to.tz)}</dd>
        </div>
      </dl>
      <p className="arr-morning lede">{j.to.morning}</p>
      <div className="arr-actions">
        <button className="btn btn-primary btn-lg" onClick={() => exitDream('selection')}>
          Choose your capsule
        </button>
        <button className="link" onClick={() => startDream()}>
          Dream again
        </button>
        <button className="link" onClick={() => exitDream('globe', 0.25)}>
          Choose another city
        </button>
      </div>
      <p className="demo-note">Conceptual demonstration — illustrative times based on a fictional schedule.</p>
      <p className="arr-credit">
        {photo.landmark} · Photograph by{' '}
        <a href={photo.credit.url} target="_blank" rel="noopener noreferrer">
          {photo.credit.name}
        </a>{' '}
        on Unsplash
      </p>
    </div>
  );
}

export function DreamOverlay() {
  const mode = useStore((s) => s.mode);
  const phase = useStore((s) => s.dreamPhase);
  const dreamUi = useStore((s) => s.dreamUi);
  const capsule = useStore((s) => previewCapsule(s).id);
  const webgl = useStore((s) => s.webgl);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'dream') return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = getState();
      if (st.dreamPhase === 'personalize' && st.dreamUi && st.capsuleControlsOpen) st.set({ capsuleControlsOpen: false });
      else if (st.dreamPhase === 'arrival') exitDream('globe', 0.25);
      else skipDream();
    };
    window.addEventListener('keydown', key);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', key);
  }, [mode]);

  if (mode !== 'dream') return null;
  return (
    <div className={`dream phase-${phase}`} role="dialog" aria-modal="true" aria-label="The dream sequence" ref={ref} tabIndex={-1}>
      {!webgl && <div className={`dream-fallback phase-${phase}`} aria-hidden="true" />}
      <div className="dream-top">
        <span className="dream-brand">
          <Wordmark />
        </span>
        <span className="annot dream-phase">
          {phase === 'boarding' && 'I · Boarding'}
          {phase === 'personalize' && 'II · Your night'}
          {(phase === 'sleep' || phase === 'dreamscape') && 'III · Asleep'}
          {(phase === 'wake' || phase === 'arrival') && 'IV · Awake'}
        </span>
        <div className="dream-tools">
          <SoundToggle compact />
          {phase === 'arrival' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => exitDream('globe', 0.25)}>
              Close
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={skipDream} aria-label="Skip the dream sequence">
              Skip
            </button>
          )}
        </div>
      </div>
      {phase === 'boarding' && <BoardingCaption capsule={capsule} />}
      {phase === 'personalize' && dreamUi && <CapsuleRoom />}
      {phase === 'sleep' && (
        <div className="dream-caption center">
          <p className="display-m soft">Good night.</p>
        </div>
      )}
      {phase === 'dreamscape' && <DreamText />}
      {phase === 'arrival' && <Arrival />}
    </div>
  );
}
