import { useEffect, useRef, useState } from 'react';
import { getState, previewCapsule, useStore, type LightMode } from '../../state/store';
import { domRegistry } from '../../state/runtime';
import { Annot, useChapterSection } from '../hooks';
import { Segmented } from '../controls';
import { lockScroll } from '../../lib/scroll';
import { LIGHT_MODES, PARTS } from '../../data/capsuleShowcase';
import { TIERS } from '../../data/capsules';
import { BrandText } from '../Wordmark';

function registerMarker(el: HTMLSpanElement | null) {
  if (el) domRegistry.set('capsule-part-marker', el);
  else domRegistry.delete('capsule-part-marker');
}

export function ShowcaseChapter() {
  const section = useChapterSection('showcase');
  const chapter = useStore((s) => s.chapter);
  const mode = useStore((s) => s.mode);
  const light = useStore((s) => s.showcaseLight);
  const explore = useStore((s) => s.explore);
  const tier = useStore((s) => previewCapsule(s).tier);
  const part = useStore((s) => s.showcasePart);
  const webgl = useStore((s) => s.webgl);
  const [showAll, setShowAll] = useState(false);
  const exploreButton = useRef<HTMLButtonElement>(null);
  const active = chapter === 'showcase' && mode === 'scroll';
  const feature = PARTS.find((item) => item.id === part);
  const { name, dims } = TIERS[tier];

  useEffect(() => {
    if (active) return;
    if (explore || part) getState().set({ explore: false, showcasePart: null });
    if (explore && mode === 'scroll') lockScroll(false);
    setShowAll(false);
  }, [active, explore, mode, part]);

  useEffect(() => {
    if (!active || !explore) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      getState().set({ explore: false });
      lockScroll(false);
      exploreButton.current?.focus();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [active, explore]);

  const toggleParts = () => {
    getState().set({ showcasePart: feature ? null : PARTS[0].id });
    setShowAll(false);
  };

  return (
    <>
      <section ref={section} className="chapter chapter-showcase" id="capsule" aria-labelledby="capsule-title" />
      <div className="stage stage-showcase" data-active={active} data-exploded={!!feature} data-webgl={webgl} inert={!active}>
        <div className="show-intro">
          <h2 className="show-title display-xl" id="capsule-title">
            Your own world.<br />
            <em>At 35,000 feet.</em>
          </h2>
          <p className="lede">A private room with a full-length bed and lighting that follows your night.</p>
          <div className="show-meta">
            <span className="show-tier"><BrandText text={name} /></span>
            <Annot>{dims.l.toFixed(2)} × {dims.w.toFixed(2)} × {dims.h.toFixed(2)} m · interior</Annot>
          </div>
        </div>

        <span className="show-part-marker" ref={registerMarker} data-visible="0" aria-hidden="true" />

        <div className="show-controls" data-lenis-prevent>
          <div className="show-view-actions">
            {webgl && (
              <button
                ref={exploreButton}
                className="btn btn-ghost"
                aria-pressed={explore}
                onClick={() => {
                  getState().set({ explore: !explore });
                  lockScroll(!explore);
                }}
              >
                {explore ? 'Exit exploration' : 'Explore in 3D'}
              </button>
            )}
            <button className="btn btn-ghost" aria-expanded={!!feature} aria-controls="capsule-features" onClick={toggleParts}>
              {webgl ? (feature ? 'Assemble capsule' : 'Exploded view') : (feature ? 'Hide features' : 'Capsule features')}
            </button>
          </div>
          <div className="show-features" id="capsule-features" hidden={!feature}>
            <Segmented
              label="Capsule feature"
              value={part ?? PARTS[0].id}
              onChange={(id) => getState().set({ showcasePart: id })}
              options={(showAll ? PARTS : PARTS.slice(0, 3)).map(({ id, label }) => ({ value: id, label }))}
            />
            <div className="show-feature-copy" aria-live="polite">
              <strong>{feature?.title}</strong>
              <p>{feature?.note}</p>
            </div>
            <button className="link" aria-expanded={showAll} onClick={() => {
              if (showAll && PARTS.findIndex(({ id }) => id === part) >= 3) getState().set({ showcasePart: PARTS[0].id });
              setShowAll(!showAll);
            }}>
              {showAll ? 'Show fewer features' : 'Show all 8 features'}
            </button>
          </div>
          {webgl && (
            <>
              <div className="show-light">
                <Segmented<LightMode>
                  label="Capsule lighting mode"
                  value={light}
                  onChange={(value) => getState().set({ showcaseLight: value })}
                  options={[
                    { value: 'relax', label: 'Relax' },
                    { value: 'dream', label: 'Dream' },
                    { value: 'wake', label: 'Wake' },
                  ]}
                />
                <span className="light-desc" aria-live="polite">{LIGHT_MODES[light].label}</span>
              </div>
              <p className="show-hint">{explore ? 'Drag to orbit. Scroll or pinch to zoom. Esc to exit.' : 'Drag the capsule to rotate it.'}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
