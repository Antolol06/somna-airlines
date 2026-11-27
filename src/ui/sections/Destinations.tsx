import { useMemo, useState } from 'react';
import { getState, useStore } from '../../state/store';
import { domRegistry, scroll } from '../../state/runtime';
import { Annot, Magnetic, Split, useChapterSection, useReveals } from '../hooks';
import { CITIES, computeJourney, formatLocalTime, type CityId } from '../../data/cities';
import { CitySelect, Segmented } from '../controls';
import { startDream } from '../dreamDirector';
import { openCabinMap } from '../../lib/scroll';
import { audio } from '../../lib/audio';
import { Brand } from '../Wordmark';

const reg = (id: string) => (el: HTMLElement | null) => {
  if (el) domRegistry.set(id, el);
  else domRegistry.delete(id);
};


/** Close neighbours on the globe (London / Paris / Rome) get staggered labels so they never overlap. */
const LABEL_PLACE: Partial<Record<CityId, 'above' | 'below'>> = { london: 'above', paris: 'below', rome: 'below' };

export function DestinationsChapter() {
  const section = useChapterSection('globe');
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const date = useStore((s) => s.date);
  const webgl = useStore((s) => s.webgl);
  const root = useReveals(() => scroll.progress.globe);
  const [pickMode, setPickMode] = useState<'to' | 'from'>('to');
  const j = useMemo(() => computeJourney(from, to, date), [from, to, date]);
  const active = chapter === 'globe' && mode === 'scroll';

  const setFrom = (c: CityId) => getState().setRoute(c, c === to ? from : to);
  const setTo = (c: CityId) => getState().setRoute(c === from ? to : from, c);
  const pickCity = (c: CityId) => {
    audio.blip(700);
    if (pickMode === 'to') setTo(c);
    else setFrom(c);
  };
  const swap = () => getState().setRoute(to, from);

  return (
    <>
      <section ref={section} className="chapter" id="destinations" style={{ height: '240vh' }} aria-label="Choose where to wake up" />
      <div className="stage stage-globe" data-active={active} ref={root} inert={!active}>
        <div className="globe-panel reveal" data-in="0.05" data-out="0.97" data-f="0.06">
          <span className="eyebrow">04 — Choose where to wake up</span>
          <h2 className="display-l">
            <Split text="Where would you like to wake up?" />
          </h2>

          <div className="route-pick">
            <CitySelect label="Fall asleep in" value={from} onChange={setFrom} />
            <button className="swap" onClick={swap} aria-label="Swap departure and destination">
              ⇄
            </button>
            <CitySelect label="Wake up in" value={to} onChange={setTo} />
          </div>

          <div className="globe-itinerary" role="region" aria-label="Flight details" tabIndex={0} data-lenis-prevent>
            <div className="journey" aria-live="polite">
              <div className="journey-route">
                <span>{j.from.name.toUpperCase()}</span>
                <span className="arrow" aria-hidden="true" />
                <span>{j.to.name.toUpperCase()}</span>
              </div>
              <p className="journey-tag display-m">{j.tagline}</p>
              <dl className="journey-grid">
                <div>
                  <dt>Flight duration</dt>
                  <dd>{j.approxLabel}</dd>
                </div>
                <div>
                  <dt>Your sleep window</dt>
                  <dd className="hl">{j.sleepLabel}</dd>
                </div>
                <div>
                  <dt>Depart {j.from.code}</dt>
                  <dd>
                    {j.departureLocal} <small>local</small>
                  </dd>
                </div>
                <div>
                  <dt>Wake in {j.to.code}</dt>
                  <dd>
                    {j.arrivalLocal} <small>local{j.dayShift > 0 ? ` · +${j.dayShift} day` : j.dayShift < 0 ? ` · ${j.dayShift} day` : ''}</small>
                  </dd>
                </div>
              </dl>
              <p className="demo-note">Illustrative schedule · conceptual demonstration data. <Brand /> does not operate real flights.</p>
            </div>
          </div>

          <div className="globe-actions">
            <Magnetic className="btn btn-primary btn-lg" onClick={() => startDream()}>
              Dream me there
            </Magnetic>
            <button className="link" onClick={openCabinMap}>
              Choose a capsule
            </button>
          </div>
        </div>

        <div className="globe-hint reveal" data-in="0.08" data-out="0.95" data-f="0.05">
          {webgl ? <Annot>Drag the Earth · tap a city to set your</Annot> : <Annot>Tap a city to set your</Annot>}
          <Segmented<'to' | 'from'>
            small
            label="City tap sets"
            value={pickMode}
            onChange={setPickMode}
            options={[
              { value: 'to', label: 'Destination' },
              { value: 'from', label: 'Departure' },
            ]}
          />
        </div>

        {webgl ? (
          <div className="city-labels">
            {CITIES.map((c) => (
              <button
                key={c.id}
                ref={reg(`city-${c.id}`)}
                className={`city-label ${c.id === to ? 'is-to' : ''} ${c.id === from ? 'is-from' : ''}`}
                data-visible="0"
                data-place={LABEL_PLACE[c.id] ?? 'right'}
                onClick={() => pickCity(c.id)}
                tabIndex={active ? 0 : -1}
              >
                <span className="cl-dot" />
                <span className="cl-text">
                  <strong>{c.name}</strong>
                  <span className="annot">
                    {c.code} · {formatLocalTime(new Date(), c.tz)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="city-list-fallback">
            {CITIES.map((c) => (
              <button key={c.id} className={`chip ${c.id === to ? 'is-on' : ''}`} onClick={() => pickCity(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="globe-legal reveal" data-in="0.08" data-out="0.95" data-f="0.05">
          <Annot>Earth imagery: NASA Blue Marble / Black Marble · Lighting is artistic</Annot>
        </div>
      </div>
    </>
  );
}
