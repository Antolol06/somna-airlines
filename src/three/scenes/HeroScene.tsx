import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Aircraft } from '../models/Aircraft';
import { CloudPuffs, CloudSea, makeCloudUniforms, makeSkyUniforms, Moon, SkyDome, StarField } from '../models/Atmosphere';
import { heroWindowUniforms } from '../models/InteriorWindow';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, sharedFog } from '../core';
import { intro, pointer, scroll } from '../../state/runtime';
import { getState, useStore } from '../../state/store';
import { clamp, damp, easeInOut, smoothstep } from '../../lib/math';

export const MOON_DIR = new THREE.Vector3(-0.64, 0.22, 0.74).normalize();

/** Camera keyframes: progress → position / target / fov / lens shift. */
const HERO_KEYS = [
  { p: 0.0, pos: [92, 10, -76], tgt: [-2, -3.0, -6], fov: 27, sx: 0.02, sy: -0.05 },
  { p: 0.2, pos: [62, 4, -30], tgt: [0, -1.2, -6], fov: 27, sx: 0.1, sy: 0.12 },
  { p: 0.42, pos: [36, 1.8, -15], tgt: [1, 0.1, -8.6], fov: 28, sx: 0.06, sy: 0.12 },
  { p: 0.62, pos: [15, 0.9, -9.8], tgt: [2.6, 0.45, -9], fov: 32, sx: 0.0, sy: -0.06 },
  { p: 0.84, pos: [5.4, 0.56, -9.07], tgt: [3.0, 0.45, -9], fov: 38, sx: 0.0, sy: -0.04 },
  { p: 1.0, pos: [3.23, 0.47, -9.0], tgt: [2.2, 0.44, -9], fov: 42, sx: 0.0, sy: 0 },
].map((k) => ({ ...k, pos: new THREE.Vector3(...(k.pos as [number, number, number])), tgt: new THREE.Vector3(...(k.tgt as [number, number, number])) }));
const posCurve = new THREE.CatmullRomCurve3(HERO_KEYS.map((k) => k.pos), false, 'centripetal');
const tgtCurve = new THREE.CatmullRomCurve3(HERO_KEYS.map((k) => k.tgt), false, 'centripetal');

function sampleHero(p: number, outPos: THREE.Vector3, outTgt: THREE.Vector3) {
  const n = HERO_KEYS.length - 1;
  let i = 0;
  while (i < n - 1 && p > HERO_KEYS[i + 1].p) i++;
  const a = HERO_KEYS[i];
  const b = HERO_KEYS[i + 1];
  const t = clamp((p - a.p) / (b.p - a.p));
  const u = (i + t) / n;
  posCurve.getPoint(u, outPos);
  tgtCurve.getPoint(u, outTgt);
  const e = t * t * (3 - 2 * t);
  return { fov: a.fov + (b.fov - a.fov) * e, sx: a.sx + (b.sx - a.sx) * e, sy: a.sy + (b.sy - a.sy) * e };
}

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _o = new THREE.Vector3();

export function HeroScene() {
  const group = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Group>(null);
  const quality = useStore((s) => s.quality);
  const sky = useMemo(
    () =>
      makeSkyUniforms({
        top: '#020308',
        mid: '#060a14',
        horizon: '#17213a',
        below: '#0c1424',
        sunDir: MOON_DIR,
        sun: '#000000',
        glow: '#23345e',
        sunSize: 0.001,
      }),
    [],
  );
  const clouds = useMemo(
    () =>
      makeCloudUniforms({
        lightDir: MOON_DIR,
        light: '#8a9cc4',
        shadow: '#141b2b',
        deep: '#070a12',
        fog: '#141d33',
        fogNear: 300,
        fogFar: 3600,
        coverage: 0.4,
        scatter: 0.9,
      }),
    [],
  );
  const state = useRef({ level: 0, moon: 0, cam: new THREE.Vector3(58, 11, -44), orbit: 0 });

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('hero');
    if (director.scene !== 'hero') return;
    const st = getState();
    const p = scroll.progress.hero;
    const t = s.clock.elapsedTime;

    // ---------------------------------------------------------------- intro
    if (st.entered) {
      intro.t += dt;
      if (st.reducedMotion || p > 0.015) intro.t = Math.max(intro.t, 2.6);
    }
    intro.beacon = smoothstep(0.12, 0.55, intro.t);
    const level = st.entered ? 0.62 + 0.38 * smoothstep(0.2, 2.2, intro.t) : 0;
    intro.level = level;

    // ---------------------------------------------------------------- aircraft motion
    const ac = plane.current!;
    const calm = st.reducedMotion ? 0 : 1;
    ac.position.y = Math.sin(t * 0.42) * 0.28 * calm * (1 - smoothstep(0.6, 0.9, p));
    ac.rotation.z = Math.sin(t * 0.23) * 0.022 * calm * (1 - smoothstep(0.5, 0.85, p));
    ac.rotation.x = Math.sin(t * 0.31) * 0.007 * calm;
    ac.visible = st.entered || director.prewarm > 0;

    // ---------------------------------------------------------------- camera
    const k = sampleHero(easeInOut(clamp(p / 0.98)) * 0.25 + clamp(p / 0.98) * 0.75, _p, _t);
    const free = 1 - smoothstep(0.0, 0.55, p);
    // slow cinematic orbit + intro dolly
    const dolly = 1 + (1 - smoothstep(0, 2.2, intro.t)) * 0.12 * calm;
    _o.copy(_p).sub(_t).multiplyScalar(dolly);
    const orbit = st.reducedMotion ? 0 : Math.sin(t * 0.045) * 0.2 * free;
    _o.applyAxisAngle(THREE.Object3D.DEFAULT_UP, orbit);
    _p.copy(_t).add(_o);
    // pointer parallax
    pointer.sx = damp(pointer.sx, pointer.x, 2.2, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 2.2, dt);
    const par = calm * (0.15 + 0.85 * free);
    _p.x += -pointer.sx * 3.2 * par * (p > 0.8 ? 0.02 : 1);
    _p.z += pointer.sx * 4.5 * par * (p > 0.8 ? 0.02 : 1);
    _p.y += pointer.sy * 2.2 * par * (p > 0.8 ? 0.02 : 1);
    const fov = fitFov(k.fov, director.aspect, 1.3);
    const portrait = director.aspect < 1;
    aimCamera(s.camera as THREE.PerspectiveCamera, _p, _t, fov, Math.sin(t * 0.2) * 0.01 * free * calm, portrait ? 0 : k.sx, portrait ? -0.06 * free : k.sy);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.08) {
      cam.near = 0.08;
      cam.far = 9000;
      cam.updateProjectionMatrix();
    }

    // ---------------------------------------------------------------- lighting
    rig.key!.color.set('#c2d2ff');
    rig.key!.intensity = 2.4 * level;
    rig.key!.position.copy(MOON_DIR).multiplyScalar(120);
    rig.rim!.color.set('#7f9ad8');
    rig.rim!.intensity = 1.4 * level;
    rig.rim!.position.set(-30, 40, 60);
    rig.hemi!.color.set('#2a3756');
    rig.hemi!.groundColor.set('#5b6784');
    rig.hemi!.intensity = 1.25 * level;
    rig.ambient!.intensity = 0.04;
    // soft moonlit fill above the camera, revealing the paint as we approach
    const near = smoothstep(0.3, 0.75, p) * level;
    rig.points[0] && (rig.points[0].castShadow = false);
    const cam0 = s.camera.position;
    rig.points[0]?.position.set(cam0.x + 2, cam0.y + 7, cam0.z - 3);
    if (rig.points[0]) {
      rig.points[0].color.set('#9fb4ea');
      rig.points[0].intensity = 420 * near;
      rig.points[0].distance = 60;
      rig.points[0].decay = 2;
    }
    s.scene.environmentIntensity = 0.95 * level;

    sky.uExposure.value = 0.25 + 0.75 * level;
    clouds.uExposure.value = 0.08 + 0.92 * level;
    state.current.moon = level;
    heroWindowUniforms.uGlow.value = 2.0 + 3.5 * smoothstep(0.78, 1.0, p);

    sharedFog.color.set('#0b1222');
    sharedFog.near = 400;
    sharedFog.far = 4000;
    s.scene.background = null;

    // depth of field: focus on the aircraft / the window
    dofTarget.set(_t.x, _t.y, _t.z);
    post.bokeh = 1.2 + 2.5 * smoothstep(0.6, 0.95, p);
    post.focusRange = THREE.MathUtils.lerp(30, 1.2, smoothstep(0.4, 0.9, p));
  });

  return (
    <group ref={group}>
      <SkyDome uniforms={sky} />
      <StarField count={quality === 'high' ? 3200 : 1600} />
      <Moon dir={MOON_DIR} distance={2400} size={74} intensity={() => 0.15 + 0.85 * intro.level} />
      <CloudSea uniforms={clouds} y={-46} speed={1} quality={quality} />
      <CloudPuffs count={quality === 'high' ? 70 : 34} center={[0, -30, 0]} box={[420, 34, 700]} speed={34} color="#7484a8" shade="#1a2235" opacity={0.5} avoid={60} />
      <group ref={plane}>
        <Aircraft heroWindow navLights />
      </group>
    </group>
  );
}

