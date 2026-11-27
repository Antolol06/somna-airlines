// The website's own real-time 3D, running inside the deck.
//
// The scenes, models, materials, cameras and lighting values are the website's modules, imported
// read-only through `@site`. LightRig, Director, PostFX and AdaptiveResolution are copied verbatim
// from src/three/Experience.tsx (they are not exported there); only the Canvas wrapper differs, so
// the deck can pause rendering while no 3D slide is on screen. DeckDriver plays the part of the
// website's scroll: it sets the active chapter and its progress, so the website's own camera
// choreography runs exactly as it does when a visitor scrolls.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildEnvironments, computeScene, director, dofTarget, envs, ENV_FOR, ENV_INTENSITY, post, rig, rigReset, sharedFog } from '@site/three/core';
import { HeroScene } from '@site/three/scenes/HeroScene';
import { CabinScene } from '@site/three/scenes/CabinScene';
import { ShowcaseScene } from '@site/three/scenes/ShowcaseScene';
import { FinaleScene } from '@site/three/scenes/BookingFinaleScenes';
import { getState, useStore } from '@site/state/store';
import { scroll } from '@site/state/runtime';
import { PARTS } from '@site/data/capsuleShowcase';
import { firstAvailable } from '@site/data/capsules';
import { detectQuality } from '@site/lib/quality';
import { live, makeShot, notify, SHOTS, type LiveShot, type Shot } from './state';
import { createJSONStorage } from 'zustand/middleware';

// The deck drives the website's store (chosen capsule, light, motion setting). When the deck is
// published inside the website it shares the website's browser storage, so its changes are kept
// apart: they never overwrite a visitor's saved journey, or the demo opened from the deck.
useStore.persist.setOptions({ name: 'somna-deck-journey', storage: createJSONStorage(() => sessionStorage) });

// ---------------------------------------------------------------- verbatim from Experience.tsx
function LightRig() {
  return (
    <>
      <ambientLight ref={(l) => { rig.ambient = l; }} intensity={0} />
      <hemisphereLight ref={(l) => { rig.hemi = l; }} intensity={0} />
      <directionalLight ref={(l) => { rig.key = l; }} intensity={0} />
      <directionalLight ref={(l) => { rig.rim = l; }} intensity={0} />
      {[0, 1, 2, 3].map((i) => (
        <pointLight key={i} ref={(l) => { if (l) rig.points[i] = l; }} intensity={0} decay={2} />
      ))}
      <spotLight ref={(l) => { rig.spot = l; if (l) l.parent?.add(l.target); }} intensity={0} angle={0.5} penumbra={0.9} decay={2} />
    </>
  );
}

function Director() {
  const { gl, scene, size } = useThree();
  useEffect(() => {
    buildEnvironments(gl);
    scene.fog = sharedFog;
    gl.localClippingEnabled = true;
  }, [gl, scene]);
  useFrame((_, dt) => {
    director.time += dt;
    director.aspect = size.width / Math.max(1, size.height);
    director.width = size.width;
    director.height = size.height;
    const sc = computeScene();
    if (sc !== director.scene) {
      director.prev = director.scene;
      director.scene = sc;
    }
    rigReset();
    scene.environment = envs[ENV_FOR[sc]] ?? null;
    scene.environmentIntensity = ENV_INTENSITY[sc];
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    if (director.prewarm > 0) {
      director.prewarm--;
      if (director.prewarm === 0 && !getState().ready) getState().set({ ready: true });
    }
  }, -2);
  return null;
}

function PostFX({ quality }: { quality: 'high' | 'low' }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const vdpr = useThree((s) => s.viewport.dpr);
  const degraded = useStore((s) => s.degraded);
  const rich = quality === 'high' && !degraded;

  const fx = useMemo(() => {
    const composer = new EffectComposer(gl, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: rich ? (vdpr > 1.3 ? 2 : 4) : 0,
    });
    composer.addPass(new RenderPass(scene, camera));
    let dof: DepthOfFieldEffect | null = null;
    let dofPass: EffectPass | null = null;
    if (rich) {
      dof = new DepthOfFieldEffect(camera, { focusRange: 3, bokehScale: 0, resolutionScale: 0.5 });
      dof.target = new THREE.Vector3();
      dofPass = new EffectPass(camera, dof);
      dofPass.enabled = false;
      composer.addPass(dofPass);
    }
    const bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: rich ? 0.85 : 0.8,
      luminanceThreshold: rich ? 0.92 : 0.95,
      luminanceSmoothing: 0.22,
      radius: 0.72,
      resolutionScale: rich ? 0.75 : 0.5,
    });
    const effects: any[] = [bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX }), new VignetteEffect({ offset: 0.28, darkness: 0.72 })];
    if (rich) {
      const noise = new NoiseEffect({ premultiply: true });
      noise.blendMode.opacity.value = 0.14;
      effects.push(noise);
    }
    composer.addPass(new EffectPass(camera, ...effects));
    return { composer, dof, dofPass, bloom, bloomBase: bloom.intensity };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, rich]);

  const applied = useRef({ fx: null as unknown, w: 0, h: 0, r: 0 });
  useEffect(() => () => fx.composer.dispose(), [fx]);

  useFrame((state, dt) => {
    const a = applied.current;
    const r = state.gl.getPixelRatio();
    if (a.fx !== fx || a.w !== state.size.width || a.h !== state.size.height || a.r !== r) {
      fx.composer.setSize(state.size.width, state.size.height);
      a.fx = fx;
      a.w = state.size.width;
      a.h = state.size.height;
      a.r = r;
    }
    const { dof, dofPass, bloom, bloomBase } = fx;
    const bt = bloomBase * post.bloom;
    bloom.intensity += (bt - bloom.intensity) * Math.min(1, dt * 6);
    if (dof && dofPass) {
      const k = THREE.MathUtils.lerp(dof.bokehScale, post.bokeh, 0.12);
      dof.bokehScale = k;
      dofPass.enabled = k > 0.04;
      dof.target!.copy(dofTarget);
      dof.cocMaterial.focusRange = post.focusRange;
    }
    if (post.raw) {
      state.gl.setRenderTarget(null);
      state.gl.render(scene, camera);
    } else fx.composer.render(dt);
  }, 1);
  return null;
}

function AdaptiveResolution({ max, onChange }: { max: number; onChange: (d: number) => void }) {
  const s = useRef({ t: 0, frames: 0, low: 0, steps: 0, cooldown: 3, dpr: max, scene: '' });
  useFrame((_, dt) => {
    const st = s.current;
    if (st.scene !== director.scene) {
      st.scene = director.scene;
      st.cooldown = 2;
      st.t = st.frames = 0;
    }
    st.cooldown -= dt;
    if (st.cooldown > 0 || dt > 0.25) return;
    st.t += dt;
    st.frames++;
    if (st.t < 2) return;
    const fps = st.frames / st.t;
    st.t = 0;
    st.frames = 0;
    st.low = fps < 46 ? st.low + 1 : 0;
    if (st.low >= 2 && st.steps < 2) {
      st.steps++;
      st.low = 0;
      st.cooldown = 3;
      st.dpr = Math.max(0.75, Math.round((st.dpr - 0.25) * 100) / 100);
      onChange(st.dpr);
      if (st.steps >= 2) getState().set({ degraded: true });
    }
  });
  return null;
}

// ---------------------------------------------------------------- the deck's "scroll"
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const PART_SECONDS = 3.4;

export interface DriverRefs {
  veil: React.RefObject<HTMLDivElement | null>;
  marker: React.RefObject<HTMLDivElement | null>;
  title: React.RefObject<HTMLElement | null>;
  note: React.RefObject<HTMLElement | null>;
}

function enter(shot: Shot) {
  const st = getState();
  st.set({
    entered: true,
    mode: 'scroll',
    dreamPhase: 'idle',
    explore: false,
    reducedMotion: false,
    showcasePart: null,
    showcaseLight: shot.params.light,
  });
  const slot = firstAvailable(shot.params.tier).id;
  if (st.guestCapsules.length !== 1 || st.guestCapsules[0] !== slot) st.set({ guestCapsules: [slot], activeGuest: 0 });
  scroll.active = shot.scene;
  scroll.progress[shot.scene] = shot.from;
}

/**
 * Before anything is shown, every state the slides use is rendered once behind the veil, so the
 * GPU compiles its shaders and uploads its textures at load time, never in the middle of a slide.
 */
const WARM_UP: { scene: Shot['scene']; p: number; part?: (typeof PARTS)[number]['id']; light?: 'relax' | 'dream' | 'wake' }[] = [
  // four points along each camera path, so everything that comes into view is already on the GPU
  ...(['hero', 'cabin', 'finale'] as const).flatMap((id) => [0, 1 / 3, 2 / 3, 1].map((k) => ({ scene: id, p: SHOTS[id].from + (SHOTS[id].to - SHOTS[id].from) * k }))),
  { scene: 'showcase', p: 0.3, part: 'mattress', light: 'dream' },
  { scene: 'showcase', p: 0.3, part: 'enclosure', light: 'wake' },
  { scene: 'showcase', p: 0.3, light: 'relax' },
];
const WARM_FRAMES = 4;
/** The website's own scene-change veil colours (src/lib/scroll.ts): the hero flies into the warm
 *  window and the cabin opens from the same warm tone. */
const veilColour = (from: Shot['scene'] | undefined, to: Shot['scene']) => (from === 'hero' && to === 'cabin' ? '#7a5f46' : '#090B10');

function DeckDriver({ refs }: { refs: DriverRefs }) {
  const s = useRef({ cur: null as Shot | null, prepared: null as LiveShot | null, t: 0, frames: 0, veil: 1, onScreen: false, exploded: 0, part: '', warm: 0, warmFrames: 0 });
  useFrame((_, dt) => {
    const d = s.current;
    const want = live.want;
    const step = Math.min(dt, 0.05);
    // warm-up, behind the veil (also when the deck is reloaded on a 3D slide: about a second)
    if (!live.ready && director.prewarm === 0) {
      const w = WARM_UP[d.warm];
      if (w) {
        d.veil = 1;
        if (refs.veil.current) refs.veil.current.style.opacity = '1';
        scroll.active = w.scene;
        scroll.progress[w.scene] = w.p;
        const st = getState();
        if (st.showcasePart !== (w.part ?? null)) st.set({ showcasePart: w.part ?? null });
        if (w.light && st.showcaseLight !== w.light) st.set({ showcaseLight: w.light });
        if (++d.warmFrames >= WARM_FRAMES) {
          d.warm++;
          d.warmFrames = 0;
        }
        return;
      }
      getState().set({ showcasePart: null, showcaseLight: 'relax' });
      live.ready = true;
      notify();
    }
    // nothing on screen, but the next slide is a 3D slide: hold its first frame behind the slide
    const pre = !want ? live.preroll : null;
    if (pre && d.prepared !== pre) {
      d.prepared = pre;
      enter(makeShot(pre));
    }
    if (pre) {
      d.onScreen = false;
      d.veil = 1;
      if (refs.veil.current) refs.veil.current.style.opacity = '1';
      return;
    }
    d.prepared = null;
    if (want && want !== d.cur) {
      // a different shot: dip to dark (instantly if the 3D was off screen), cut, then rise
      if (!d.cur || !d.onScreen || d.veil >= 0.999) {
        if (refs.veil.current) refs.veil.current.style.background = veilColour(d.onScreen ? d.cur?.scene : undefined, want.scene);
        d.cur = want;
        d.t = 0;
        d.frames = 0;
        d.veil = 1;
        d.exploded = 0;
        d.part = '';
        enter(want);
      } else {
        // quick, so the cut lands before the next slide's words start to move
        if (refs.veil.current && d.veil === 0) refs.veil.current.style.background = veilColour(d.cur.scene, want.scene);
        d.veil = Math.min(1, d.veil + step / 0.22);
      }
    } else if (want && want === d.cur) {
      d.frames++;
      // a few frames to settle the website's damped cameras before the veil lifts
      if (d.frames > 6) d.veil = Math.max(0, d.veil - step / 0.8);
    }
    d.onScreen = !!want;
    if (refs.veil.current) refs.veil.current.style.opacity = d.veil.toFixed(3);

    const sh = d.cur;
    if (!sh) return;
    if (want === sh) d.t += step;
    const k = Math.min(1, Math.max(0, (d.t - (sh.delay ?? 0)) / sh.seconds));
    scroll.active = sh.scene;
    scroll.progress[sh.scene] = sh.from + (sh.to - sh.from) * ease(k);

    if (sh.scene !== 'showcase') return;
    const st = getState();
    const p = sh.params;
    if (st.showcaseLight !== p.light) st.set({ showcaseLight: p.light });
    const slot = firstAvailable(p.tier).id;
    if (st.guestCapsules[0] !== slot) st.set({ guestCapsules: [slot], activeGuest: 0 });
    // exploded: walk through the capsule's systems, one at a time, as the website does on click
    if (p.exploded) {
      d.exploded += step;
      const part = PARTS[Math.floor(d.exploded / PART_SECONDS) % PARTS.length];
      if (part.id !== d.part) {
        d.part = part.id;
        st.set({ showcasePart: part.id });
        if (refs.title.current) refs.title.current.textContent = part.title;
        if (refs.note.current) refs.note.current.textContent = part.note;
        const cap = refs.marker.current?.firstElementChild as HTMLElement | null;
        if (cap) {
          // replay the caption's entrance for each new part
          cap.style.animation = 'none';
          void cap.offsetWidth;
          cap.style.animation = '';
        }
      }
    } else if (d.part) {
      d.part = '';
      d.exploded = 0;
      st.set({ showcasePart: null });
    }
    // keep the caption on the open side of the marker
    const m = refs.marker.current;
    if (m) {
      const x = /translate3d\(([-\d.]+)px/.exec(m.style.transform);
      const right = x ? +x[1] > (director.width || 1) * 0.72 : false;
      if ((m.dataset.side === 'left') !== right) m.dataset.side = right ? 'left' : 'right';
    }
  }, -3);
  return null;
}

export default function WebsiteCanvas({ frameloop, refs }: { frameloop: 'always' | 'never'; refs: DriverRefs }) {
  const quality = useStore((s) => s.quality);
  const maxDpr = Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1.25);
  const [dpr, setDpr] = useState<number>(maxDpr);
  useEffect(() => {
    getState().set({ webgl: true, quality: detectQuality(), entered: true, reducedMotion: false });
    // render every scene once up front, so no shader compiles while presenting
    director.prewarm = 4;
  }, []);
  return (
    <Canvas
      className="live-canvas"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'inherit' }}
      frameloop={frameloop}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true }}
      camera={{ fov: 30, near: 0.1, far: 9000, position: [58, 11, -44] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <color attach="background" args={['#05060a']} />
      <AdaptiveResolution max={maxDpr} onChange={setDpr} />
      <DeckDriver refs={refs} />
      <Director />
      <LightRig />
      <HeroScene />
      <CabinScene />
      <ShowcaseScene />
      <FinaleScene />
      <PostFX quality={quality} />
    </Canvas>
  );
}
