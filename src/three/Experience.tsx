import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildEnvironments, computeScene, director, dofTarget, envs, ENV_FOR, ENV_INTENSITY, post, rig, rigReset, sharedFog } from './core';
import { HeroScene } from './scenes/HeroScene';
import { CabinScene } from './scenes/CabinScene';
import { ShowcaseScene } from './scenes/ShowcaseScene';
import { SelectionScene } from './scenes/SelectionScene';
import { BookingScene, FinaleScene } from './scenes/BookingFinaleScenes';
import { DreamscapeScene } from './scenes/DreamscapeScene';
import { DestinationScene } from './scenes/DestinationScene';
import { getState, useStore } from '../state/store';

const GlobeScene = lazy(() => import('./scenes/GlobeScene').then((m) => ({ default: m.GlobeScene })));

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
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    buildEnvironments(gl);
    scene.fog = sharedFog;
    gl.localClippingEnabled = true;
    if (import.meta.env.DEV) (window as any).__somna = { gl, scene, camera, director, THREE };
  }, [gl, scene, camera]);
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

/**
 * Post-processing built directly on `postprocessing` so the depth-of-field pass can be
 * skipped entirely (not just set to zero) whenever a scene doesn't use it.
 */
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
    // vdpr only matters for the initial MSAA choice
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
    // scenes can ease the bloom down (e.g. reading the capsule touchscreen up close)
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
      // photographs keep their own colours: straight to the screen, no tone mapping or bloom
      state.gl.setRenderTarget(null);
      state.gl.render(scene, camera);
    } else fx.composer.render(dt);
    if (import.meta.env.DEV && (window as any).__probe) (window as any).__probe(gl);
  }, 1);
  return null;
}

/**
 * Adaptive resolution. Measures sustained frame rate and lowers the pixel ratio in at most
 * two steps (never back up, so it can't oscillate), and never while the visitor is dragging.
 */
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
    const busy = (window as any).__somnaDragging?.() || getState().explore || getState().mode === 'dream';
    if (st.low >= 2 && st.steps < 2 && !busy) {
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

/** Mounts the globe lazily without re-rendering the rest of the 3D tree on chapter changes. */
function GlobeGate() {
  const [load, setLoad] = useState(false);
  useEffect(() => {
    if (load) return;
    let timer = 0;
    const check = () => {
      const st = getState();
      if (st.chapter !== 'hero' || st.mode === 'dream') return setLoad(true);
      if (st.entered && !timer) timer = window.setTimeout(() => setLoad(true), 3500);
    };
    check();
    const unsub = useStore.subscribe(check);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [load]);
  if (!load) return null;
  return (
    <Suspense fallback={null}>
      <GlobeScene />
    </Suspense>
  );
}

function Experience() {
  const quality = useStore((s) => s.quality);
  const maxDpr = Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1.25);
  const [dpr, setDpr] = useState<number>(maxDpr);

  useEffect(() => {
    director.prewarm = 4;
  }, []);

  return (
    <Canvas
      className="webgl"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true }}
      camera={{ fov: 30, near: 0.1, far: 9000, position: [58, 11, -44] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <color attach="background" args={['#05060a']} />
      <AdaptiveResolution max={maxDpr} onChange={setDpr} />
      <Director />
      <LightRig />
      <HeroScene />
      <CabinScene />
      <ShowcaseScene />
      <GlobeGate />
      <SelectionScene />
      <BookingScene />
      <FinaleScene />
      <DreamscapeScene />
      <DestinationScene />
      <PostFX quality={quality} />
    </Canvas>
  );
}

/** Memoised: chapter changes in the DOM layer never re-render the 3D scene graph. */
export default memo(Experience);
