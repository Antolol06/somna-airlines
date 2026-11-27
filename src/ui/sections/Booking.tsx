import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { getState, useStore, type LightMode, type SoundChoice, type WakeChoice } from '../../state/store';
import { useChapterSection } from '../hooks';
import { computeJourney, todayPlus, type CityId } from '../../data/cities';
import { TIERS, MAX_GUESTS, quoteCapsules, formatEUR } from '../../data/capsules';
import { CitySelect, Segmented, Slider, Stepper } from '../controls';
import { goToChapter, openCabinMap, refreshScroll } from '../../lib/scroll';
import { startDream } from '../dreamDirector';
import { SOUND_LABEL, WAKE_LABEL } from '../../data/labels';
import { Checkout } from '../Checkout';
import type { BoardingPass } from '../../lib/boardingPass';
import { BoardingPassLink } from '../BoardingPassLink';

export function BookingSection() {
  const section = useChapterSection('booking');
  const s = useStore();
  const j = useMemo(() => computeJourney(s.from, s.to, s.date), [s.from, s.to, s.date]);
  const quote = useMemo(() => quoteCapsules(s.guestCapsules, j.km), [s.guestCapsules, j.km]);
  const [touched, setTouched] = useState(false);
  const [checkout, setCheckout] = useState<Omit<BoardingPass, 'reference'> | null>(null);
  const inner = useRef<HTMLDivElement>(null);
  const dateValid = s.date >= todayPlus(1);
  const confirm = useCallback((ref: string) => getState().set({ confirmation: { ref, createdAt: Date.now() } }), []);

  useEffect(() => {
    refreshScroll();
  }, [s.confirmation]);

  useEffect(() => {
    const el = inner.current;
    if (!el || s.reducedMotion) return;
    const items = el.querySelectorAll('.bk-step, .bk-summary');
    const tw = gsap.fromTo(
      items,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.1, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 75%' } },
    );
    return () => {
      tw.scrollTrigger?.kill();
      tw.kill();
      gsap.set(items, { clearProps: 'all' });
    };
  }, [s.confirmation, s.reducedMotion]);

  const set = getState().set;
  const setFrom = (c: CityId) => getState().setRoute(c, c === s.to ? s.from : s.to);
  const setTo = (c: CityId) => getState().setRoute(c === s.from ? s.to : s.from, c);

  const book = () => {
    if (!quote.complete) {
      openCabinMap();
      return;
    }
    setTouched(true);
    if (!dateValid) return;
    setCheckout({ journey: j, quote, prefs: s.prefs });
  };

  return (
    <section ref={section} className="booking" id="book" aria-labelledby="book-title">
      <div className="booking-inner" ref={inner}>
        <header className="bk-head">
          <span className="eyebrow">06 — Book your dream</span>
          <h2 className="display-xl" id="book-title">
            Your night,
            <br />
            <em>arranged.</em>
          </h2>
          <p className="lede">Review your route, capsule assignments and sleep settings before continuing to demo payment.</p>
          {!s.confirmation && (
            <div className="bk-preview">
              <span>{j.from.name} → {j.to.name}</span>
              <strong>{quote.assigned} of {s.guestCapsules.length} capsules assigned</strong>
              <span>{formatEUR(quote.total)} {quote.complete ? 'illustrative total' : 'assigned subtotal'}</span>
              <button className="link" onClick={openCabinMap}>{quote.complete ? 'Change capsules' : 'Browse cabin map'}</button>
            </div>
          )}
          <p className="demo-note strong">Working prototype · no payment is processed and no real flight can be purchased.</p>
        </header>

        {s.confirmation ? (
          <div className="bk-confirm" role="status">
            <span className="eyebrow">Demonstration reservation</span>
            <p className="display-l">Your dream is reserved.</p>
            <p className="bk-ref">
              <span className="annot">Reference</span>
              <strong>{s.confirmation.ref}</strong>
            </p>
            <p className="lede">
              {j.from.name} → {j.to.name} · {j.departureDate}, {j.departureLocal}. Capsules {s.guestCapsules.join(', ')}. You will wake in {j.to.name} at {j.arrivalLocal} local time.
            </p>
            <p className="demo-note strong">Your boarding passes are for this demonstration. No charge was made.</p>
            <div className="bk-confirm-actions">
              <button className="btn btn-primary" onClick={() => startDream()}>
                Replay the dream
              </button>
              <BoardingPassLink reference={s.confirmation.ref} journey={j} quote={quote} prefs={s.prefs} />
              <button className="link" onClick={() => set({ confirmation: null })}>
                Plan another journey
              </button>
            </div>
          </div>
        ) : (
          <form
            className="bk-form"
            onSubmit={(e) => {
              e.preventDefault();
              book();
            }}
          >
            <fieldset className="bk-step">
              <legend>
                <span className="annot">01</span> Choose where to wake up
              </legend>
              <div className="bk-row">
                <CitySelect label="Departure — fall asleep in" value={s.from} onChange={setFrom} />
                <CitySelect label="Destination — wake up in" value={s.to} onChange={setTo} />
              </div>
              <div className="bk-row">
                <label className="field">
                  <span className="field-label">Travel date</span>
                  <input type="date" value={s.date} min={todayPlus(1)} onChange={(e) => set({ date: e.target.value, confirmation: null })} aria-invalid={touched && !dateValid} />
                  {touched && !dateValid && <span className="field-error">Choose a date from tomorrow onward.</span>}
                </label>
                <Stepper label="Guests" value={s.guestCapsules.length} min={1} max={MAX_GUESTS} onChange={s.setGuestCount} />
              </div>
            </fieldset>

            <fieldset className="bk-step">
              <legend>
                <span className="annot">02</span> Capsule assignments
              </legend>
              <div className="bk-capsule">
                <div>
                  <ul className="booking-fares">
                    {quote.assignments.map(({ guest, slot, fare }) => (
                      <li key={guest}><span>Guest {guest + 1}</span><strong>{slot ? `${slot.id} · ${TIERS[slot.tier].short}` : 'Unassigned'}</strong><span>{fare === null ? '—' : formatEUR(fare)}</span></li>
                    ))}
                  </ul>
                </div>
                <button type="button" className="btn btn-ghost" onClick={openCabinMap}>
                  {quote.complete ? 'Change capsules' : 'Choose from map'}
                </button>
              </div>
            </fieldset>

            <fieldset className="bk-step">
              <legend>
                <span className="annot">03</span> Your night — sleep preferences
              </legend>
              <Slider label="Cabin temperature" value={s.prefs.temperature} min={18} max={24} step={0.5} format={(v) => `${v.toFixed(1)} °C`} onChange={(v) => getState().setPrefs({ temperature: v })} />
              <div className="bk-row">
                <div className="field">
                  <span className="field-label">Ambient lighting</span>
                  <Segmented<LightMode>
                    label="Ambient lighting"
                    value={s.prefs.lighting}
                    onChange={(v) => getState().setPrefs({ lighting: v })}
                    options={[
                      { value: 'relax', label: 'Relax' },
                      { value: 'dream', label: 'Dream' },
                      { value: 'wake', label: 'Wake' },
                    ]}
                  />
                </div>
                <label className="field">
                  <span className="field-label">Background sound</span>
                  <select value={s.prefs.sound} onChange={(e) => getState().setPrefs({ sound: e.target.value as SoundChoice })}>
                    {Object.entries(SOUND_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="bk-row">
                <label className="field">
                  <span className="field-label">Wake-up time</span>
                  <select value={s.prefs.wake} onChange={(e) => getState().setPrefs({ wake: e.target.value as WakeChoice })}>
                    {Object.entries(WAKE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        Wake {v}
                      </option>
                    ))}
                  </select>
                </label>
                <Slider label="Wake-up light" value={s.prefs.wakeIntensity} min={10} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => getState().setPrefs({ wakeIntensity: v })} />
              </div>
            </fieldset>

            <aside className="bk-summary" aria-live="polite">
              <span className="eyebrow">Your night</span>
              <div className="sum-route">
                <span>{j.from.code}</span>
                <span className="arrow" aria-hidden="true" />
                <span>{j.to.code}</span>
              </div>
              <p className="sum-tag">{j.tagline}</p>
              <dl className="sum-grid">
                <div>
                  <dt>Depart</dt>
                  <dd>
                    {j.departureDate} · {j.departureLocal}
                    <small>{j.from.name} local</small>
                  </dd>
                </div>
                <div>
                  <dt>Wake up</dt>
                  <dd>
                    {j.arrivalDate} · {j.arrivalLocal}
                    <small>{j.to.name} local</small>
                  </dd>
                </div>
                <div>
                  <dt>Flight</dt>
                  <dd>
                    {j.durationLabel}
                    <small>{Math.round(j.km).toLocaleString('en-US')} km</small>
                  </dd>
                </div>
                <div>
                  <dt>Sleep window</dt>
                  <dd className="hl">{j.sleepLabel}</dd>
                </div>
                <div>
                  <dt>Assignments</dt>
                  <dd>
                    {quote.assigned} of {s.guestCapsules.length} assigned
                  </dd>
                </div>
                <div>
                  <dt>{quote.complete ? 'Group total' : 'Assigned subtotal'}</dt>
                  <dd>
                    {formatEUR(quote.total)}
                  </dd>
                </div>
              </dl>
              <button type="submit" className="btn btn-primary btn-lg btn-block">
                {quote.complete ? 'Continue to demo payment' : 'Assign capsules on the map'}
              </button>
              <p className="demo-note">Try the sample card or enter fictional details. All prices and schedules are illustrative.</p>
            </aside>
          </form>
        )}
      </div>
      {checkout && (
        <Checkout journey={checkout.journey} quote={checkout.quote} prefs={checkout.prefs} reducedMotion={s.reducedMotion} onClose={() => setCheckout(null)} onComplete={confirm}
          onFarewell={() => { setCheckout(null); requestAnimationFrame(() => goToChapter('finale', 0.22)); }} />
      )}
    </section>
  );
}

