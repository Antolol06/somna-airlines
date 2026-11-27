import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CapsuleModel, makeControls, tempColor, type ScreenData } from '../models/CapsuleModel';
import { LIGHT_MODES } from '../../data/capsuleShowcase';
import { CAB, ZONE, faceX, rowZ } from './cabinShading';
import { dream } from '../../state/runtime';
import { getState, previewCapsule, useStore } from '../../state/store';
import { computeJourney } from '../../data/cities';
import { SOUND_LABEL, WAKE_LABEL } from '../../data/labels';
import { AIRFLOWS, AMBIENT, AMBIENTS } from '../../data/capsuleOS';
import type { TierId } from '../../data/capsules';
import { director, rig, setPoint } from '../core';
import { CapsulePanel, panelLayout } from './CapsulePanel';

/** Geometry of the capsule a guest boards for a given tier (the featured slot of that cabin). */
export function capsuleFrame(tier: TierId) {
  const z = ZONE[tier];
  const f = z.featured;
  const side = f.side;
  const face = faceX(z, f.level);
  const yc = z.y[f.level];
  const zc = rowZ(z, f.row);
  const floorY = yc - z.inner.h / 2 + 0.025;
  const l = z.inner.l;
  const cx = side * (face + l / 2);
  return {
    zone: z,
    side,
    face, // |x| of the opening plane
    yc,
    zc,
    floorY,
    w: z.inner.w,
    h: z.inner.h,
    l,
    /** world point at a given depth into the capsule (0 = opening plane), height & lateral offset */
    at(depth: number, y: number, lateral = 0, out = new THREE.Vector3()) {
      return out.set(side * (face + depth), y, zc + lateral);
    },
    /** capsule-model local (entrance +z, guest's right +x) → world */
    toWorld(v: THREE.Vector3, out = new THREE.Vector3()) {
      return out.set(cx - side * v.z, yc + v.y, zc + side * v.x);
    },
    dirToWorld(v: THREE.Vector3, out: THREE.Vector3) {
      return out.set(-side * v.z, v.y, side * v.x);
    },
  };
}
export type CapsuleFrame = ReturnType<typeof capsuleFrame>;

/**
 * The detailed capsule used for the Dream Sequence. It sits inside the cabin wall in place
 * of the instanced capsule, so boarding, settling in, sleeping and waking are one
 * continuous shot — no cut, no second scene. Its lighting follows the touchscreen live.
 */
export function DreamCapsule() {
  const group = useRef<THREE.Group>(null);
  const { tier, id: label } = useStore(previewCapsule);
  const sound = useStore((s) => s.prefs.sound);
  const wakeChoice = useStore((s) => s.prefs.wake);
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const phase = useStore((s) => s.dreamPhase);
  const controls = useMemo(() => makeControls('relax'), []);
  const fr = useMemo(() => capsuleFrame(tier), [tier]);
  const lay = useMemo(() => panelLayout(tier), [tier]);
  const j = useMemo(() => computeJourney(from, to), [from, to]);
  const base = useRef(0.9);
  const air = useRef({ speed: 1, t: 0 });
  const v = useMemo(() => ({ c: new THREE.Color(), c2: new THREE.Color(), a: new THREE.Vector3(), b: new THREE.Vector3() }), []);

  const screen: ScreenData = useMemo(() => {
    if (phase === 'wake' || phase === 'arrival')
      return { title: 'Good morning', lines: [`${j.to.name} · local ${j.arrivalLocal}`, `Slept ${j.sleepLabel.replace('up to ', '')}`], accent: '#E7AE70' };
    if (phase === 'sleep') return { title: 'Good night', lines: [`${j.from.code} → ${j.to.code} · ${j.durationLabel}`, `Waking ${WAKE_LABEL[wakeChoice]}`], accent: '#7d8fd8' };
    return {
      title: j.to.name,
      lines: [`${j.from.code} → ${j.to.code} · sleep ${j.sleepLabel.replace('up to ', '')}`, `${SOUND_LABEL[sound]} · wake ${WAKE_LABEL[wakeChoice]}`],
      accent: '#C8AD85',
    };
  }, [phase, sound, wakeChoice, j]);

  // conditioned air, visible in the capsule light
  const particles = useMemo(() => {
    const n = 110;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * fr.w * 0.8;
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = (Math.random() - 0.5) * fr.l * 0.85;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffffff') }, uO: { value: 0.5 }, uH: { value: fr.h } },
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uH; varying float vA;
        void main(){ vec3 p = position; float t = fract(aSeed + uTime * (0.025 + aSeed * 0.025));
          p.y = (uH * 0.42) - t * uH * 0.8; p.x += sin(uTime * 0.4 + aSeed * 30.0) * 0.04; p.z += cos(uTime * 0.3 + aSeed * 20.0) * 0.05;
          vA = sin(t * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.0 + aSeed * 2.0) * (1.0 / max(0.05, -mv.z)); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uO; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA * uO); }`,
    });
    return { geo, mat };
  }, [fr.w, fr.l, fr.h]);

  useFrame((_, dt) => {
    const g = group.current!;
    const st = getState();
    const inDream = st.mode === 'dream';
    // compiled during the start-up prewarm so the first boarding never hitches
    g.visible = inDream || director.prewarm > 0;
    if (!inDream) return;
    const pr = st.prefs;
    const step = Math.min(dt, 1 / 20);

    // airflow
    const af = AIRFLOWS.find((a) => a.id === pr.airflow)?.speed ?? 1;
    air.current.speed += (af - air.current.speed) * (1 - Math.exp(-2 * step));
    air.current.t += step * air.current.speed;
    particles.mat.uniforms.uTime.value = air.current.t;

    // ambient light: colour and intensity glide to the touchscreen's settings
    const amb = AMBIENT[pr.ambient] ?? AMBIENTS[0];
    const k = st.reducedMotion ? 1 : 1 - Math.exp(-5 * step);
    base.current += ((pr.ambientLevel / 100) * 1.15 - base.current) * k;
    tempColor(pr.temperature, v.c);
    controls.climate.copy(v.c);
    const wakeI = pr.wakeIntensity / 100;
    const wake = Math.max(dream.wake, dream.previewWake);
    controls.strip.lerp(v.c2.set(amb.strip), k);
    controls.strip.lerp(v.c2.set(LIGHT_MODES.wake.strip), k * wake);
    controls.fill.lerp(v.c2.set(amb.fill).lerp(v.c, 0.12), k);
    controls.fill.lerp(v.c2.set('#ff9a68'), k * wake);
    // the interior warms up as the enclosure opens during boarding
    const boarding = st.dreamPhase === 'boarding' ? 0.35 + 0.65 * dream.door : 1;
    const lv = Math.max(0, base.current * dream.interiorLight * boarding + wake * (0.5 + 1.4 * wakeI));
    controls.level = lv;
    controls.blind = dream.enclosure;
    controls.screen = 0.25 + 0.75 * Math.max(dream.interiorLight, wake);
    controls.dawn = Math.max(dream.wake, dream.previewWake * 0.6);
    // the window tint clears at sunrise so the dawn can be seen
    const tintTarget = (pr.windowTint / 100) * (1 - wake);
    controls.tint += (tintTarget - controls.tint) * k;
    const readOn = pr.reading && st.dreamPhase === 'personalize' ? 1 : 0;
    controls.reading += (readOn - controls.reading) * (1 - Math.exp(-4 * step));

    particles.mat.uniforms.uColor.value.copy(v.c).multiplyScalar(0.9);
    particles.mat.uniforms.uO.value = 0.5 * Math.max(0.15, dream.interiorLight) * Math.max(dream.lie, dream.enter * 0.5) * (0.7 + 0.3 * air.current.speed);
    if (st.reducedMotion) particles.mat.uniforms.uO.value *= 0.35;

    // lights inside the capsule (shared rig, so no shader recompiles). Smaller capsules put
    // the lights closer to every surface — keep the exposure even across tiers.
    const inside = Math.max(dream.lie, dream.enter * 0.6);
    const size = Math.min(1.5, Math.max(0.5, Math.pow(fr.h / 1.25, 3)));
    fr.toWorld(v.a.set(0, fr.h * 0.2, 0), v.b);
    setPoint(0, controls.fill, (1.2 + 2.4 * inside) * lv * size, v.b.x, v.b.y, v.b.z, 3);
    fr.toWorld(v.a.set(0, fr.h * 0.3, fr.l / 2 - 0.35), v.b);
    setPoint(1, controls.strip, (0.6 + 0.6 * inside) * lv * size, v.b.x, v.b.y, v.b.z, 2);
    fr.toWorld(v.a.set(fr.w * 0.25, fr.h * 0.3, -fr.l / 2 + 0.2), v.b);
    setPoint(3, controls.climate, 0.35 * dream.interiorLight, v.b.x, v.b.y, v.b.z, 1.5);
    // reading light: a warm, soft-edged pool over the pillow and the guest's lap
    const spot = rig.spot;
    if (spot && controls.reading > 0.003) {
      fr.toWorld(v.a.set(fr.w * 0.22, fr.h / 2 - 0.05, fr.l / 2 - 0.5), spot.position);
      fr.toWorld(v.a.set(lay.eye.x * 0.5, lay.floor + 0.22, fr.l / 2 - 1.05), spot.target.position);
      spot.target.updateMatrixWorld();
      spot.color.set('#ffe0b8');
      spot.intensity = 9 * controls.reading * size;
      spot.angle = 0.62;
      spot.penumbra = 0.85;
      spot.distance = 2.4;
    }
  });

  const rotY = fr.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  return (
    <group ref={group} visible={false}>
      <group position={[fr.side * (fr.face + fr.l / 2), fr.yc, fr.zc]} rotation={[0, rotY, 0]}>
        <CapsuleModel tier={tier} controls={controls} screen={screen} label={label} bare headAtFront />
        <CapsulePanel tier={tier} />
        <points geometry={particles.geo} material={particles.mat} frustumCulled={false} />
      </group>
    </group>
  );
}

export { CAB };
