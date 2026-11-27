import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CITIES, CITY, type CityId } from '../data/cities';
import { audio } from '../lib/audio';

export function CitySelect({ label, value, onChange, exclude }: { label: string; value: CityId; onChange: (c: CityId) => void; exclude?: CityId }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () => CITIES.filter((c) => c.id !== exclude && `${c.name} ${c.code} ${c.country}`.toLowerCase().includes(q.trim().toLowerCase())),
    [q, exclude],
  );
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    setTimeout(() => input.current?.focus(), 10);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const pick = (c: CityId) => {
    audio.blip(720);
    onChange(c);
    setOpen(false);
    setQ('');
  };
  const city = CITY[value];
  return (
    <div className={`city-select ${open ? 'is-open' : ''}`} ref={box}>
      <span className="field-label" id={`${id}-l`}>
        {label}
      </span>
      <button type="button" className="city-current" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => setOpen(!open)}>
        <span className="city-code">{city.code}</span>
        <span className="city-name" id={`${id}-v`}>
          {city.name}
        </span>
        <span className="chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="city-pop">
          <input
            ref={input}
            className="city-search"
            placeholder="Search cities"
            value={q}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={list[active] ? `${id}-${list[active].id}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(list.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && list[active]) {
                e.preventDefault();
                pick(list[active].id);
              } else if (e.key === 'Escape') setOpen(false);
            }}
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label}>
            {list.map((c, i) => (
              <li
                key={c.id}
                id={`${id}-${c.id}`}
                role="option"
                aria-selected={c.id === value}
                className={`${i === active ? 'is-active' : ''} ${c.id === value ? 'is-selected' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(c.id)}
              >
                <span className="city-code">{c.code}</span>
                <span>{c.name}</span>
                <span className="city-country">{c.country}</span>
              </li>
            ))}
            {list.length === 0 && <li className="empty">No city in the demonstration network</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, small }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className={`segmented ${small ? 'is-small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => {
            audio.blip(o.value === value ? 600 : 840);
            onChange(o.value);
          }}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step, format, onChange, onCommit }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void; onCommit?: () => void }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <output htmlFor={id} className="slider-value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as any]: `${pct}%` }}
        onChange={(e) => onChange(+e.target.value)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <span className="field-label">{label}</span>
      <div className="stepper-ctl">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}
