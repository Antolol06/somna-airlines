import { useEffect, useId, useMemo, useState } from 'react';
import { getState, useStore } from '../../state/store';
import { domRegistry } from '../../state/runtime';
import { Annot, useChapterSection } from '../hooks';
import { LAYOUT, MAX_GUESTS, TIERS, availableCapsule, fareFor, formatEUR, quoteCapsules, type CapsuleSlot, type TierId } from '../../data/capsules';
import { computeJourney } from '../../data/cities';
import { goToChapter } from '../../lib/scroll';
import { audio } from '../../lib/audio';
import { Segmented, Stepper } from '../controls';

const CABIN_ORDER: TierId[] = ['grand', 'signature', 'essential'];
const DECK_LETTERS = ['A', 'C', 'H', 'K'];
const CABINS = CABIN_ORDER.map((id) => {
  const slots = LAYOUT.filter((slot) => slot.tier === id);
  const byRow = new Map<number, CapsuleSlot[]>();
  for (const slot of slots) {
    if (!byRow.has(slot.row)) byRow.set(slot.row, []);
    byRow.get(slot.row)!.push(slot);
  }
  return { id, rows: Array.from(byRow.entries()), available: slots.filter((slot) => !slot.reserved).length };
});

function registerLabel(id: string) {
  return (el: HTMLElement | null) => {
    if (el) domRegistry.set(id, el);
    else domRegistry.delete(id);
  };
}

function CabinMap({ filter, assignments, activeGuest, km }: { filter: TierId | 'all'; assignments: (string | null)[]; activeGuest: number; km: number }) {
  const titleId = useId();
  return (
    <section className="deck-panel" aria-labelledby={titleId}>
      <header className="deck-header">
        <h3 id={titleId}>Cabin map</h3>
        <span className="annot">Nose → Tail</span>
      </header>
      <div className="deck-legend" aria-label="Map legend">
        <span>Available</span><span>Reserved</span><span>Your group</span>
      </div>
      <div className="deck-scroll" data-lenis-prevent>
        <div className="deck-map" data-filter={filter}>
          {CABINS.filter(({ id }) => filter === 'all' || id === filter).map(({ id, rows, available }) => (
            <section className="deck-cabin" aria-label={`${TIERS[id].short} cabin`} key={id} data-tier={id}>
              <header>
                <strong>{TIERS[id].short}</strong>
                <span>{available} available</span>
              </header>
              <div className="deck-rows">
                {rows.map(([row, slots]) => (
                  <div className="deck-row" key={row}>
                    <span className="deck-row-number">{String(row).padStart(2, '0')}</span>
                    {DECK_LETTERS.map((letter) => {
                      const slot = slots.find((item) => item.letter === letter);
                      if (!slot) return <span className="deck-empty" key={letter} aria-hidden="true" />;
                      const guest = assignments.indexOf(slot.id);
                      const assigned = guest >= 0;
                      const fare = formatEUR(fareFor(km, id, slot.id));
                      const label = `Capsule ${slot.id}, ${TIERS[id].short}${id === 'essential' ? (slot.level ? ', upper tier' : ', lower tier') : ''}${slot.reserved ? ', reserved' : `, ${fare}`}${assigned ? `, Guest ${guest + 1}` : ''}`;
                      return (
                        <button
                          key={letter}
                          type="button"
                          className="deck-seat"
                          disabled={slot.reserved || (assigned && guest !== activeGuest)}
                          aria-pressed={guest === activeGuest}
                          data-assigned={assigned}
                          aria-label={label}
                          title={`${slot.id} · ${slot.position} · ${slot.reserved ? 'Reserved' : fare}${assigned ? ` · Guest ${guest + 1}` : ''}`}
                          onClick={() => {
                            if (getState().selectCapsule(slot.id)) audio.blip(720);
                          }}
                        >
                          {letter}{assigned && assignments.length > 1 && <sup aria-hidden="true">{guest + 1}</sup>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="deck-note">In Essential, C and H are the upper capsules. Tap an available letter to select its row and capsule.</p>
    </section>
  );
}

export function SelectionChapter() {
  const section = useChapterSection('selection');
  const active = useStore((s) => s.chapter === 'selection' && s.mode === 'scroll');
  const assignments = useStore((s) => s.guestCapsules);
  const activeGuest = useStore((s) => s.activeGuest);
  const setGuestCount = useStore((s) => s.setGuestCount);
  const setActiveGuest = useStore((s) => s.setActiveGuest);
  const focus = useStore((s) => s.selectionFocus);
  const view = useStore((s) => s.selectionView);
  const topDown = useStore((s) => s.selectionTopDown);
  const upperDeck = useStore((s) => s.selectionUpperDeck);
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const date = useStore((s) => s.date);
  const webgl = useStore((s) => s.webgl);
  const [filter, setFilter] = useState<TierId | 'all'>('all');
  useEffect(() => {
    if (!active) setFilter('all');
  }, [active]);
  const j = useMemo(() => computeJourney(from, to, date), [from, to, date]);
  const selected: CapsuleSlot | undefined = availableCapsule(assignments[activeGuest]);
  const quote = quoteCapsules(assignments, j.km);
  const aircraft = webgl && view === 'aircraft';
  const setView = (next: 'map' | 'aircraft') => getState().set({
    selectionView: next,
    selectionFocus: false,
    selectionUpperDeck: selected?.tier !== 'essential' || selected.level === 1,
  });

  return (
    <>
      <section ref={section} className="chapter chapter-selection" id="space" aria-labelledby="selection-heading" />
      <div className="stage stage-selection" data-active={active} data-view={aircraft ? 'aircraft' : 'map'} inert={!active}>
        <div className="sel-panel" data-lenis-prevent>
          <span className="eyebrow">{j.from.code} → {j.to.code}</span>
          <h2 className="display-l" id="selection-heading">Choose a capsule</h2>
          <p className="sel-intro">{j.from.name} to {j.to.name} · {j.sleepLabel} to sleep</p>
          <div className="sel-guests">
            <Stepper label="Guests" value={assignments.length} min={1} max={MAX_GUESTS} onChange={setGuestCount} />
            {assignments.length > 1 && (
              <div className="sel-guest-choices" role="group" aria-label="Assign a capsule to a guest">
                {assignments.map((id, guest) => (
                  <button key={guest} type="button" aria-pressed={guest === activeGuest} onClick={() => setActiveGuest(guest)}>
                    Guest {guest + 1}<small>{id ?? 'Choose'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {webgl && (
            <Segmented<'map' | 'aircraft'> label="Aircraft view" value={view} onChange={setView} options={[
              { value: 'map', label: 'Cabin map' }, { value: 'aircraft', label: '3D aircraft' },
            ]} />
          )}
          {aircraft ? (
            <div className="sel-aircraft-tools">
              <div>
                <button className="btn btn-ghost btn-sm" onClick={() => getState().set({ selectionTopDown: !topDown, selectionFocus: false })}>
                  {topDown ? 'Angled view' : 'Top view'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => getState().set({ selectionUpperDeck: !upperDeck, selectionFocus: false })}>
                  {upperDeck ? 'Show lower tier' : 'Show upper tier'}
                </button>
              </div>
              <p className="sel-intro">{focus ? 'Look inside the selected capsule.' : 'Drag to rotate. Tap an available capsule to select it.'}</p>
            </div>
          ) : (
            <Segmented<TierId | 'all'> label="Filter cabins" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All cabins' }, ...CABIN_ORDER.map((id) => ({ value: id, label: TIERS[id].short })),
            ]} />
          )}
        </div>

        {!aircraft && <CabinMap filter={filter} assignments={assignments} activeGuest={activeGuest} km={j.km} />}

        <aside className="sel-summary" aria-label="Capsule selection">
          <div className="sel-summary-copy" aria-live="polite">
            <strong>{quote.complete ? 'Group total' : 'Assigned subtotal'} <span>{formatEUR(quote.total)}</span></strong>
            <span>{quote.assigned} of {assignments.length} assigned{selected ? ` · ${selected.position}` : ` · Choose for Guest ${activeGuest + 1}`}</span>
            {quote.assignments.some(({ slot }) => slot) && (
              <ul className="sel-fares" aria-label="Capsule fares">
                {quote.assignments.map(({ guest, slot, fare }) => slot && fare !== null && (
                  <li key={guest}><span>Guest {guest + 1} · {slot.id} · {TIERS[slot.tier].short}</span><b>{formatEUR(fare)}</b></li>
                ))}
              </ul>
            )}
          </div>
          <div className="sel-summary-actions">
            {aircraft && selected && (
              <button className="link" onClick={() => getState().set({ selectionFocus: !focus })}>
                {focus ? 'Show entire aircraft' : 'Preview interior'}
              </button>
            )}
            {selected && <button className="link" onClick={() => getState().selectCapsule(null)}>Clear Guest {activeGuest + 1}</button>}
            <button className="btn btn-primary" disabled={!quote.complete} onClick={() => goToChapter('booking', 0)}>
              Continue to booking
            </button>
          </div>
        </aside>

        {aircraft && (
          <>
            <div className="zone-labels" aria-hidden="true">
              {CABIN_ORDER.map((id) => (
                <span key={id} className="zone-label" ref={registerLabel(`zone-${id}`)} data-visible="0">
                  <Annot>{TIERS[id].short}</Annot>
                </span>
              ))}
            </div>
            <div className="sel-tip" ref={registerLabel('sel-tip')} data-visible="0" aria-hidden="true">
              <strong data-k="id" /><span data-k="desc" className="annot" />
            </div>
          </>
        )}
      </div>
    </>
  );
}
