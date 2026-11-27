import { Component, lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { domRegistry } from '@site/state/runtime';
import { hasWebGL2 } from '@site/lib/quality';
import { Clip, Img } from '../components';
import type { SlideCtx } from '../types';
import { live, makeShot, notify, subscribe, type LiveShot, type Shot } from './state';

const WebsiteCanvas = lazy(() => import('./WebsiteCanvas'));

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[deck] live 3D failed — slides fall back to the recorded clips', error);
    live.failed = true;
    live.want = null;
    notify();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const useLive = <T,>(read: () => T) => useSyncExternalStore(subscribe, read);

/**
 * One full-stage layer behind the slides, rendering the website's real 3D at the screen's own
 * resolution (it is counter-scaled inside the 1920 × 1080 stage). Slides that use it are
 * transparent; every other slide covers it, and it stops rendering shortly after it is covered.
 */
export function LiveLayer({ k, paused, upcoming }: { k: number; paused: boolean; upcoming: LiveShot | null }) {
  const want = useLive(() => live.want);
  const ready = useLive(() => live.ready);
  const failed = useLive(() => live.failed);
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(true);
  const veil = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLElement>(null);
  const note = useRef<HTMLElement>(null);
  const refs = useRef({ veil, marker, title, note }).current;

  useEffect(() => {
    if (!hasWebGL2()) {
      live.failed = true;
      notify();
    }
  }, []);
  // mount at once if a 3D slide is showing; otherwise shortly after load, so the shaders compile
  // before anyone presses →
  useEffect(() => {
    if (mounted || failed) return;
    if (want) return setMounted(true);
    const t = window.setTimeout(() => setMounted(true), 900);
    return () => clearTimeout(t);
  }, [want, mounted, failed]);
  // the slide after this one is a 3D slide: get its scene ready behind the current slide, so
  // pressing → never has to wake the renderer mid-transition
  useEffect(() => {
    live.preroll = upcoming;
  }, [upcoming]);
  // render while a 3D slide is on screen (or is next); stop once a still slide has covered it
  const needed = (!!want || !!upcoming) && !paused;
  useEffect(() => {
    if (needed || !ready) return setRunning(true);
    const t = window.setTimeout(() => setRunning(false), 1400);
    return () => clearTimeout(t);
  }, [needed, ready]);
  // the website's showcase scene places this marker on the part it is explaining
  useEffect(() => {
    const m = marker.current;
    if (!m) return;
    domRegistry.set('capsule-part-marker', m);
    return () => {
      if (domRegistry.get('capsule-part-marker') === m) domRegistry.delete('capsule-part-marker');
    };
  }, [failed]);

  if (failed) return null;
  const style = { width: 1920 * k, height: 1080 * k, transform: `scale(${1 / k})`, '--k': k } as CSSProperties;
  return (
    <div className="live3d" style={style} data-interactive={want?.scene === 'showcase'} aria-hidden="true">
      {mounted && (
        <Boundary>
          <Suspense fallback={null}>
            <WebsiteCanvas frameloop={running ? 'always' : 'never'} refs={refs} />
          </Suspense>
        </Boundary>
      )}
      <div className="live-marker" ref={marker} data-visible="0" data-side="right">
        <span className="live-cap">
          <b ref={title} />
          <small ref={note} />
        </span>
      </div>
      <div className="live-veil" ref={veil} />
    </div>
  );
}

/**
 * Placed in a slide: asks the live layer for a shot while the slide is on screen. In stills
 * (PDF, overview, presenter view) it shows a frame captured from the website; if WebGL is not
 * available it plays the recorded clip instead.
 */
export function Live3D({ c, shot, poster, clip, params }: { c: SlideCtx; shot: LiveShot; poster: string; clip?: string; params?: Partial<Shot['params']> }) {
  const failed = useLive(() => live.failed);
  const cur = useRef<Shot | null>(null);
  useEffect(() => {
    if (!c.active || c.still || failed) return;
    const s = makeShot(shot);
    if (params) Object.assign(s.params, params);
    cur.current = s;
    live.want = s;
    notify();
    return () => {
      cur.current = null;
      if (live.want === s) {
        live.want = null;
        notify();
      }
    };
    // a new shot only when the slide arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.active, c.still, failed]);
  // live parameters (capsule tier, light, exploded) follow the slide without restarting the shot
  useEffect(() => {
    if (cur.current && params) Object.assign(cur.current.params, params);
  });
  if (c.still) return <Img src={poster} className="bg live-poster" />;
  if (failed) return clip ? <Clip name={clip} c={c} className="bg" /> : <Img src={poster} className="bg live-poster" />;
  return null;
}
