import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { getState, previewCapsule, useStore, type LightMode, type SoundChoice, type WakeChoice } from '../state/store';
import { AIRFLOWS, AMBIENT, AMBIENTS, SCENES, WINDOW_PRESETS } from '../data/capsuleOS';
import { TIERS } from '../data/capsules';
import { SOUND_LABEL } from '../data/labels';
import { Segmented, Slider } from './controls';
import { goodNight, previewWake } from './dreamDirector';

const TABS = ['Light', 'Climate', 'Window', 'Sound', 'Sleep'] as const;
const SOUNDS = Object.entries(SOUND_LABEL).map(([value, label]) => ({ value: value as SoundChoice, label }));
const WAKES: { value: WakeChoice; label: string }[] = [
  { value: '60', label: '60 min early' }, { value: '30', label: '30 min early' }, { value: 'arrival', label: 'On arrival' },
];

export function CapsuleOS({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const capsule = useStore(previewCapsule);
  const soundOn = useStore((s) => s.soundOn);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Light');
  const heading = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const previouslyOpen = useRef(open);
  const setPrefs = getState().setPrefs;

  useEffect(() => {
    if (open && !previouslyOpen.current) tabButtons.current[TABS.indexOf(tab)]?.focus();
    previouslyOpen.current = open;
  }, [open, tab]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length :
      event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length :
      event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next]);
    tabButtons.current[next]?.focus();
  };

  return (
    <section className="capsule-tablet" id={id} aria-labelledby={heading} hidden={!open}>
      <header className="tablet-header">
        <div>
          <span className="annot">{TIERS[capsule.tier].short} · {capsule.id}</span>
          <h2 id={heading}>Capsule controls</h2>
        </div>
        <button className="link" onClick={onClose}>Look around</button>
      </header>
      <div className="tablet-tabs" role="tablist" aria-label="Capsule settings">
        {TABS.map((name, index) => (
          <button
            ref={(el) => { tabButtons.current[index] = el; }}
            key={name}
            type="button"
            role="tab"
            id={`${id}-${name}`}
            aria-selected={tab === name}
            aria-controls={`${id}-panel`}
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(event) => onTabKey(event, index)}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="tablet-content" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} key={tab}>
        {tab === 'Light' && (
          <>
            <Segmented<LightMode> label="Lighting scene" value={prefs.lighting} onChange={(lighting) => setPrefs({ lighting })}
              options={SCENES.map(({ id: value, name: label }) => ({ value, label }))} />
            <label className="tablet-field">
              <span>Light colour</span>
              <select value={prefs.ambient} onChange={(event) => {
                const ambient = AMBIENTS.find(({ id }) => id === event.target.value);
                if (ambient) setPrefs({ ambient: ambient.id });
              }}>
                {AMBIENTS.map(({ id: value, name }) => <option value={value} key={value}>{name}</option>)}
              </select>
            </label>
            <Slider label="Light intensity" min={5} max={100} step={5} value={prefs.ambientLevel} format={(v) => `${v}%`} onChange={(ambientLevel) => setPrefs({ ambientLevel })} />
            <div className="tablet-switch">
              <span>Reading light</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={prefs.reading} aria-label="Reading light" onClick={() => setPrefs({ reading: !prefs.reading })}>{prefs.reading ? 'On' : 'Off'}</button>
            </div>
          </>
        )}
        {tab === 'Climate' && (
          <>
            <Slider label="Temperature" min={18} max={24} step={0.5} value={prefs.temperature} format={(v) => `${v.toFixed(1)} °C`} onChange={(temperature) => setPrefs({ temperature })} />
            <div className="tablet-field">
              <span>Airflow</span>
              <Segmented label="Airflow" value={prefs.airflow} onChange={(airflow) => setPrefs({ airflow })}
                options={AIRFLOWS.map(({ id: value, name: label }) => ({ value, label }))} />
            </div>
            <p className="tablet-note">Airflow changes the movement of the air particles inside the capsule.</p>
          </>
        )}
        {tab === 'Window' && (
          <>
            <div className="tablet-presets" aria-label="Window presets">
              {WINDOW_PRESETS.map(({ id: value, name, value: windowTint }) => (
                <button key={value} className="btn btn-ghost btn-sm" type="button" aria-pressed={prefs.windowTint === windowTint}
                  onClick={() => setPrefs({ windowTint })}>{name}</button>
              ))}
            </div>
            <Slider label="Window tint" min={0} max={100} step={5} value={prefs.windowTint} format={(v) => `${v}%`} onChange={(windowTint) => setPrefs({ windowTint })} />
            <p className="tablet-note">Use the Window camera view to see the tint change.</p>
          </>
        )}
        {tab === 'Sound' && (
          <>
            <label className="tablet-field">
              <span>Soundscape</span>
              <select value={prefs.sound} onChange={(event) => {
                const sound = SOUNDS.find(({ value }) => value === event.target.value)?.value;
                if (!sound) return;
                setPrefs({ sound });
                if (sound !== 'none') getState().set({ soundOn: true });
              }}>
                {SOUNDS.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <p className="tablet-note" role="status">{soundOn ? `Playing ${prefs.sound === 'none' ? 'cabin ambience' : SOUND_LABEL[prefs.sound].toLowerCase()}` : 'Sound is off. Enable it with the sound control at the top.'}</p>
          </>
        )}
        {tab === 'Sleep' && (
          <>
            <div className="tablet-field">
              <span>Wake-up time</span>
              <Segmented<WakeChoice> label="Wake-up time" value={prefs.wake} onChange={(wake) => setPrefs({ wake })} options={WAKES} />
            </div>
            <Slider label="Sunrise light" min={10} max={100} step={5} value={prefs.wakeIntensity} format={(v) => `${v}%`} onChange={(wakeIntensity) => setPrefs({ wakeIntensity })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={previewWake}>Preview sunrise</button>
          </>
        )}
      </div>
      <footer className="tablet-footer">
        <span>{(AMBIENT[prefs.ambient] ?? AMBIENTS[0]).name} · {prefs.ambientLevel}%</span>
        <button type="button" className="btn btn-primary" onClick={goodNight}>Good night</button>
      </footer>
    </section>
  );
}
