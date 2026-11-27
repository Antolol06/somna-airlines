import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { TIERS, type TierId } from '../../data/capsules';
import { LIGHT_MODES, PARTS, type PartId } from '../../data/capsuleShowcase';
import { labelTexture, quiltTexture, ribTexture } from '../textures';
import { roundedRectPath, roundedRectShape } from './InteriorWindow';
import { smoothstep } from '../../lib/math';
import { shown } from '../core';
import type { LightMode } from '../../state/store';

export interface CapsuleControls {
  explode: number;
  blind: number;
  level: number;
  strip: THREE.Color;
  fill: THREE.Color;
  climate: THREE.Color;
  screen: number;
  /** 0 = night sky in the back window, 1 = sunrise */
  dawn: number;
  /** electrochromic window tint 0..1 */
  tint: number;
  /** reading light 0..1 */
  reading: number;
}

export const makeControls = (mode: LightMode = 'relax'): CapsuleControls => ({
  explode: 0,
  blind: 0,
  level: LIGHT_MODES[mode].level,
  strip: new THREE.Color(LIGHT_MODES[mode].strip),
  fill: new THREE.Color(LIGHT_MODES[mode].fill),
  climate: new THREE.Color('#9fd4ff'),
  screen: 1,
  dawn: 0,
  tint: 0,
  reading: 0,
});

const COOL = new THREE.Color('#a9c8ff');
const NEUTRAL = new THREE.Color('#ffe4c2');
const WARM = new THREE.Color('#ffb36e');
/** Cabin temperature (18–24 °C) → light tint. */
export function tempColor(t: number, out = new THREE.Color()) {
  const k = (t - 18) / 6;
  if (k < 0.5) return out.copy(COOL).lerp(NEUTRAL, k * 2);
  return out.copy(NEUTRAL).lerp(WARM, (k - 0.5) * 2);
}

/** Smoothly move live controls toward a lighting mode. */
export function blendControls(c: CapsuleControls, mode: LightMode, dt: number, levelMul = 1) {
  const m = LIGHT_MODES[mode];
  const k = 1 - Math.exp(-3 * dt);
  c.strip.lerp(_c.set(m.strip), k);
  c.fill.lerp(_c.set(m.fill), k);
  c.level += (m.level * levelMul - c.level) * k;
}
const _c = new THREE.Color();

export interface ScreenData {
  title: string;
  lines: string[];
  accent?: string;
}

function paintScreen(c: HTMLCanvasElement, d: ScreenData) {
  const x = c.getContext('2d')!;
  const w = c.width;
  const h = c.height;
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0b0e16');
  g.addColorStop(1, '#141a28');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(200,173,133,0.35)';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(w * 0.82, h * 0.5, h * 0.3, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = d.accent ?? '#C8AD85';
  x.beginPath();
  x.arc(w * 0.82, h * 0.5, h * 0.05, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#F2EDE4';
  x.font = `300 ${h * 0.2}px Jost, Helvetica, sans-serif`;
  x.textBaseline = 'top';
  x.fillText(d.title, w * 0.07, h * 0.14);
  x.font = `400 ${h * 0.085}px "IBM Plex Mono", monospace`;
  x.fillStyle = 'rgba(242,237,228,0.72)';
  d.lines.forEach((l, i) => x.fillText(l.toUpperCase(), w * 0.07, h * (0.48 + i * 0.13)));
}

function buildGeometry(tier: TierId) {
  const { w: W, h: H, l: L } = TIERS[tier].dims;
  const r = Math.min(W, H) * 0.34;
  const t = 0.07;
  const curve = 16;
  // shell (tube with rounded section)
  const shellShape = roundedRectShape(W + 2 * t, H + 2 * t, r + t);
  shellShape.holes.push(roundedRectPath(W, H, r));
  const shell = new THREE.ExtrudeGeometry(shellShape, { depth: L, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: curve });
  shell.translate(0, 0, -L / 2);
  // entrance bezel — generous, organic bevel
  const bz = 0.2;
  const bezelShape = roundedRectShape(W + 2 * bz, H + 2 * bz, r + bz);
  bezelShape.holes.push(roundedRectPath(W - 0.02, H - 0.02, r - 0.01));
  const bezel = new THREE.ExtrudeGeometry(bezelShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 8, curveSegments: curve });
  bezel.translate(0, 0, L / 2 - 0.1);
  const trimPath = roundedRectPath(W + 0.015, H + 0.015, r + 0.01).getPoints(14);
  const trimCurve = new THREE.CatmullRomCurve3(trimPath.slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y, L / 2 + 0.042)), true);
  const trim = new THREE.TubeGeometry(trimCurve, 104, 0.008, 6, true);
  const back = new THREE.ShapeGeometry(roundedRectShape(W + 2 * t, H + 2 * t, r + t), curve);
  // acoustic liner
  const linerShape = roundedRectShape(W - 0.005, H - 0.005, r - 0.003);
  linerShape.holes.push(roundedRectPath(W - 0.05, H - 0.05, r - 0.03));
  const liner = new THREE.ExtrudeGeometry(linerShape, { depth: L - 0.14, bevelEnabled: false, curveSegments: curve });
  liner.translate(0, 0, -L / 2 + 0.03);
  // liner UVs: repeat ribs along length
  const linerBack = new THREE.ShapeGeometry(roundedRectShape(W - 0.05, H - 0.05, r - 0.03), curve);
  linerBack.translate(0, 0, -L / 2 + 0.035);
  // light strip around entrance
  const pathPts = roundedRectPath(W - 0.1, H - 0.1, r - 0.06).getPoints(18);
  const stripCurve = new THREE.CatmullRomCurve3(pathPts.map((p) => new THREE.Vector3(p.x, p.y, 0)), true);
  const strip = new THREE.TubeGeometry(stripCurve, 160, 0.007, 6, true);
  strip.translate(0, 0, L / 2 - 0.16);
  const cove = new THREE.BoxGeometry(0.018, 0.012, L - 0.5);
  // mattress
  const mattressH = 0.19;
  const mattress = new RoundedBoxGeometry(W - 0.16, mattressH, L - 0.2, 4, 0.06);
  const pillowWidth = Math.min(0.7, W * 0.54);
  const pillow = new RoundedBoxGeometry(pillowWidth, 0.14, 0.4, 5, 0.065);
  const seamPath = roundedRectPath(pillowWidth - 0.01, 0.39, 0.075).getPoints(10);
  const seamCurve = new THREE.CatmullRomCurve3(seamPath.slice(0, -1).map((p) => new THREE.Vector3(p.x, 0.002, p.y)), true);
  const pillowSeam = new THREE.TubeGeometry(seamCurve, 64, 0.003, 5, true);
  const blanket = new RoundedBoxGeometry(W - 0.19, 0.058, 0.82, 4, 0.028);
  const blanketFold = new RoundedBoxGeometry(W - 0.22, 0.062, 0.23, 4, 0.028);
  const headboard = new RoundedBoxGeometry(W - 0.16, 0.35, 0.05, 4, 0.024);
  // climate unit
  const climate = new RoundedBoxGeometry(W * 0.62, 0.2, 0.09, 3, 0.025);
  const vent = new THREE.BoxGeometry(W * 0.5, 0.008, 0.012);
  // entertainment display (gently curved)
  const sw = W * 0.62;
  const sh = sw * 0.42;
  const screen = new THREE.PlaneGeometry(sw, sh, 24, 1);
  const sp = screen.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    sp.setZ(i, -Math.pow(x / sw, 2) * 0.12);
  }
  screen.computeVertexNormals();
  const screenFrame = new RoundedBoxGeometry(sw + 0.03, sh + 0.03, 0.02, 2, 0.01);
  // storage
  const storage = new RoundedBoxGeometry(0.12, H * 0.32, 0.5, 3, 0.02);
  const drawerLine = new THREE.BoxGeometry(0.005, 0.004, 0.42);
  // air duct along the upper right corner
  const ductPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -L / 2 + 0.12),
    new THREE.Vector3(0, 0, -L / 2 + 0.6),
    new THREE.Vector3(0, 0, L / 2 - 0.35),
  ]);
  const duct = new THREE.TubeGeometry(ductPath, 40, 0.028, 12, false);
  const ventRing = new THREE.TorusGeometry(0.03, 0.006, 8, 20);
  // blind (roll-down privacy panel), pivot at top
  const blind = new THREE.PlaneGeometry(W - 0.03, H - 0.03, 1, 1);
  blind.translate(0, -(H - 0.03) / 2, 0);
  const roller = new THREE.CylinderGeometry(0.03, 0.03, W - 0.04, 16);
  roller.rotateZ(Math.PI / 2);
  // signage + handle + step
  const plate = new RoundedBoxGeometry(0.22, 0.07, 0.012, 2, 0.006);
  const handle = new THREE.TorusGeometry(0.11, 0.012, 10, 28, Math.PI);
  const step = new RoundedBoxGeometry(0.42, 0.035, 0.16, 3, 0.015);
  return { W, H, L, r, shell, bezel, trim, back, liner, linerBack, strip, cove, mattress, mattressH, pillow, pillowSeam, blanket, blanketFold, headboard, climate, vent, screen, screenFrame, storage, drawerLine, duct, ventRing, blind, roller, plate, handle, step, sw, sh };
}

const geoCache = new Map<TierId, ReturnType<typeof buildGeometry>>();
export const capsuleGeometry = (t: TierId) => {
  if (!geoCache.has(t)) geoCache.set(t, buildGeometry(t));
  return geoCache.get(t)!;
};

export interface CapsuleModelProps {
  tier: TierId;
  controls: CapsuleControls;
  label?: string;
  screen?: ScreenData;
  anchors?: React.MutableRefObject<Partial<Record<PartId, THREE.Vector3>>>;
  showStep?: boolean;
  /** inside the cabin wall: no bezel, plate or handle (the wall provides them) + a back window */
  bare?: boolean;
  /** pillow by the entrance, display over the bed facing it — the natural resting layout */
  headAtFront?: boolean;
}

export function CapsuleModel({ tier, controls, label = '07A', screen, anchors, showStep = false, bare = false, headAtFront = false }: CapsuleModelProps) {
  const g = capsuleGeometry(tier);
  const pal = TIERS[tier].palette;
  const parts = useRef<Partial<Record<PartId, THREE.Group>>>({});

  const screenTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 320;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => {
    paintScreen(screenTex.image as HTMLCanvasElement, screen ?? { title: 'Good evening', lines: ['FL350 · cabin 21.0 °C', 'Sleep window · 9 h'] });
    screenTex.needsUpdate = true;
  }, [screen, screenTex]);

  const m = useMemo(() => {
    const rib = ribTexture().clone();
    rib.repeat.set(1.2, 1);
    rib.needsUpdate = true;
    const quilt = quiltTexture().clone();
    quilt.repeat.set(1, 2);
    quilt.needsUpdate = true;
    return {
      shell: new THREE.MeshPhysicalMaterial({ color: pal.shell, roughness: 0.55, clearcoat: 0.18, clearcoatRoughness: 0.5 }),
      bezel: new THREE.MeshPhysicalMaterial({ color: pal.shell, roughness: 0.47, clearcoat: 0.23, clearcoatRoughness: 0.4 }),
      trim: new THREE.MeshStandardMaterial({ color: pal.accent, metalness: 0.72, roughness: 0.47 }),
      liner: new THREE.MeshStandardMaterial({ color: pal.liner, roughness: 0.92, bumpMap: rib, bumpScale: 1.2, side: THREE.DoubleSide }),
      strip: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      cove: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      bed: new THREE.MeshPhysicalMaterial({ color: pal.bed, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.6, bumpMap: quilt, bumpScale: 0.6 }),
      pillow: new THREE.MeshPhysicalMaterial({ color: '#f5efe4', roughness: 0.92, sheen: 0.72, sheenColor: new THREE.Color('#fff5e8') }),
      seam: new THREE.MeshStandardMaterial({ color: '#d8cbb8', roughness: 0.95 }),
      blanket: new THREE.MeshPhysicalMaterial({ color: pal.blanket, roughness: 0.94, sheen: 0.65, sheenColor: new THREE.Color(pal.accent), bumpMap: quilt, bumpScale: 0.15 }),
      fold: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(pal.blanket).lerp(new THREE.Color('#f4e7d4'), 0.18), roughness: 0.96, sheen: 0.65, sheenColor: new THREE.Color(pal.accent) }),
      headboard: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(pal.wood).lerp(new THREE.Color(pal.liner), 0.22), roughness: 0.88, sheen: 0.34, sheenColor: new THREE.Color(pal.accent), bumpMap: rib, bumpScale: 0.12 }),
      accent: new THREE.MeshStandardMaterial({ color: pal.accent, metalness: 1, roughness: 0.25 }),
      wood: new THREE.MeshStandardMaterial({ color: pal.wood, roughness: 0.55, metalness: 0 }),
      dark: new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.4, metalness: 0.6 }),
      led: new THREE.MeshBasicMaterial({ color: '#9fd4ff', toneMapped: false }),
      reading: new THREE.MeshBasicMaterial({ color: '#ffe6c4', toneMapped: false }),
      screen: new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
      blind: new THREE.MeshPhysicalMaterial({ color: '#f3ede2', roughness: 0.7, transparent: true, opacity: 0.94, side: THREE.DoubleSide, emissive: new THREE.Color('#ffcf96'), emissiveIntensity: 0.15 }),
      plate: new THREE.MeshStandardMaterial({ map: labelTexture(label, { color: '#2a2218', bg: '#C8AD85', w: 256, h: 80 }), metalness: 0.6, roughness: 0.35 }),
      sky: new THREE.ShaderMaterial({
        toneMapped: false,
        uniforms: { uDawn: { value: 0 }, uTime: { value: 0 }, uTint: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform float uDawn, uTime, uTint; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          void main(){
            vec3 night = mix(vec3(0.01, 0.015, 0.04), vec3(0.05, 0.08, 0.2), vUv.y);
            vec3 dawn = mix(vec3(1.0, 0.62, 0.34) * 1.6, vec3(0.42, 0.55, 0.8), smoothstep(0.1, 0.95, vUv.y));
            vec3 c = mix(night, dawn, uDawn);
            float st = step(0.992, h(floor(vUv * vec2(40.0, 56.0)))) * (1.0 - uDawn) * (0.6 + 0.4 * sin(uTime * 2.0 + vUv.x * 30.0));
            c += vec3(st);
            float cloud = smoothstep(0.35, 0.0, abs(vUv.y - 0.28 - 0.04 * sin(vUv.x * 9.0 + uTime * 0.05)));
            c = mix(c, vec3(1.0, 0.8, 0.62) * 1.2, cloud * 0.35 * uDawn);
            // electrochromic glass: darkens toward a smoky blue-grey
            c = mix(c, c * 0.06 + vec3(0.012, 0.016, 0.026), uTint);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    };
  }, [tier, label, screenTex]);

  const { W, H, L } = g;
  const floor = -H / 2 + 0.025;
  const pillowZ = headAtFront ? L / 2 - 0.38 : -L / 2 + 0.35;
  const blanketZ = headAtFront ? -L / 2 + 0.63 : L / 2 - 0.63;
  const partPoints = useMemo<Record<PartId, [number, number, number]>>(() => ({
    enclosure: [0, H / 2 + 0.16, L / 2],
    mattress: [0, floor + g.mattressH + 0.04, 0.2],
    lighting: [W * 0.34, H / 2 - 0.14, L / 2 - 0.17],
    acoustic: [0, H / 2 - 0.04, 0.1],
    entertainment: [0, H / 2 - 0.13, -L * 0.16],
    storage: [-W / 2 + 0.085, floor + H * 0.20, -0.3],
    air: [W / 2 - 0.11, H / 2 - 0.1, -0.1],
    climate: [0, H / 2 - 0.17, -L / 2 + 0.14],
  }), [W, H, L, floor, g.mattressH]);
  /** height of the liner's inner ceiling at lateral position x */
  const innerY = (x: number) => {
    const ax = Math.abs(x);
    const edge = W / 2 - g.r;
    if (ax <= edge) return H / 2 - 0.025;
    const dx = ax - edge;
    return H / 2 - g.r + Math.sqrt(Math.max(0, g.r * g.r - dx * dx)) - 0.025;
  };
  const _v = useMemo(() => new THREE.Vector3(), []);
  const win = useMemo(() => {
    const ww = Math.min(0.26, W * 0.24);
    const wh = ww * 1.4;
    const glass = new THREE.ShapeGeometry(roundedRectShape(ww, wh, ww * 0.45), 16);
    const uv = glass.attributes.uv as THREE.BufferAttribute;
    const pos = glass.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / ww + 0.5, pos.getY(i) / wh + 0.5);
    const frameShape = roundedRectShape(ww + 0.05, wh + 0.05, ww * 0.5);
    frameShape.holes.push(roundedRectPath(ww, wh, ww * 0.45));
    const frame = new THREE.ExtrudeGeometry(frameShape, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 16 });
    return { glass, frame, wh };
  }, [W]);

  useFrame((_, dt) => {
    if (!shown(root.current)) return;
    const c = controls;
    // exploded view
    PARTS.forEach((pt, i) => {
      const grp = parts.current[pt.id];
      if (!grp) return;
      const e = smoothstep(i * 0.055, i * 0.055 + 0.6, c.explode);
      const k = Math.max(W, H) * 0.95;
      grp.position.set(pt.dir[0] * e * k, pt.dir[1] * e * k, pt.dir[2] * e * k * 1.2);
      if (anchors) {
        const a = (anchors.current[pt.id] ??= new THREE.Vector3());
        grp.localToWorld(a.set(...partPoints[pt.id]));
      }
    });
    // light
    const lv = Math.max(0, c.level);
    m.strip.color.copy(c.strip).multiplyScalar(2.6 * lv);
    m.cove.color.copy(c.strip).multiplyScalar(1.7 * lv);
    m.screen.color.setScalar(0.85 * c.screen);
    m.sky.uniforms.uDawn.value = c.dawn;
    m.sky.uniforms.uTint.value = c.tint;
    m.reading.color.setRGB(1, 0.9, 0.77).multiplyScalar(0.25 + 3.2 * c.reading);
    m.sky.uniforms.uTime.value += dt;
    m.led.color.copy(c.climate).multiplyScalar(2.2);
    m.blind.emissive.copy(c.fill);
    m.blind.emissiveIntensity = 0.12 + 0.35 * lv;
    m.liner.emissive.copy(c.fill);
    m.liner.emissiveIntensity = 0.22 * lv;
    m.bed.emissive.copy(c.strip);
    m.bed.emissiveIntensity = 0.08 * lv;
    // blind
    const b = Math.max(0.001, c.blind);
    const blindMesh = blindRef.current;
    if (blindMesh) {
      blindMesh.scale.y = b;
      blindMesh.visible = c.blind > 0.002;
    }
  });

  const root = useRef<THREE.Group>(null);
  const blindRef = useRef<THREE.Mesh>(null);
  const reg = (id: PartId) => (o: THREE.Group | null) => {
    if (o) parts.current[id] = o;
  };

  const ribs = tier !== 'essential';
  return (
    <group ref={root}>
      {/* 1 — privacy enclosure */}
      <group ref={reg('enclosure')}>
        {/* inside the cabin wall the outer shell is never seen — and would poke into the capsule above */}
        {!bare && <mesh geometry={g.shell} material={m.shell} />}
        {!bare && <mesh geometry={g.bezel} material={m.bezel} />}
        {!bare && <mesh geometry={g.trim} material={m.trim} />}
        {!bare && <mesh geometry={g.back} material={m.shell} position={[0, 0, -L / 2 - 0.012]} rotation={[0, Math.PI, 0]} />}
        <mesh geometry={g.roller} material={m.dark} position={[0, H / 2 - 0.045, L / 2 - 0.06]} />
        <mesh ref={blindRef} geometry={g.blind} material={m.blind} position={[0, H / 2 - 0.05, L / 2 - 0.065]} />
        {!bare && <mesh geometry={g.plate} material={m.plate} position={[0, H / 2 + 0.135, L / 2 + 0.05]} />}
        {!bare && <mesh geometry={g.handle} material={m.accent} position={[W / 2 + 0.12, 0.02, L / 2 + 0.04]} rotation={[0, -Math.PI / 2, -Math.PI / 2]} />}
        {showStep && <mesh geometry={g.step} material={m.accent} position={[0, -H / 2 - 0.32, L / 2 + 0.1]} />}
        {tier !== 'essential' && !bare && (
          <mesh material={m.wood} position={[0, -H / 2 + 0.006, L / 2 - 0.08]}>
            <boxGeometry args={[W - 0.06, 0.012, 0.09]} />
          </mesh>
        )}
      </group>
      {/* 2 — acoustic insulation */}
      <group ref={reg('acoustic')}>
        <mesh geometry={g.liner} material={m.liner} />
        <mesh geometry={g.linerBack} material={m.liner} />
        {bare && (
          <group position={[0, H * 0.12, -L / 2 + 0.042]}>
            <mesh geometry={win.glass} material={m.sky} position={[0, 0, 0.002]} />
            <mesh geometry={win.frame} material={m.dark} position={[0, 0, -0.004]} />
          </group>
        )}
        <mesh geometry={g.headboard} material={m.headboard} position={[0, floor + 0.43, -L / 2 + 0.065]} />
      </group>
      {/* 3 — adaptive ambient lighting */}
      <group ref={reg('lighting')}>
        <mesh geometry={g.strip} material={m.strip} />
        <mesh geometry={g.cove} material={m.cove} position={[-(W / 2 - g.r * 0.85), innerY(W / 2 - g.r * 0.85) - 0.012, -0.05]} />
        <mesh geometry={g.cove} material={m.cove} position={[W / 2 - g.r * 0.85, innerY(W / 2 - g.r * 0.85) - 0.012, -0.05]} />
        <mesh material={headAtFront ? m.reading : m.strip} position={[headAtFront ? W * 0.22 : 0, headAtFront ? innerY(W * 0.22) - 0.006 : H / 2 - 0.03, headAtFront ? L / 2 - 0.5 : -L / 2 + 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.035, 24]} />
        </mesh>
      </group>
      {/* 4 — mattress */}
      <group ref={reg('mattress')}>
        <mesh geometry={g.mattress} material={m.bed} position={[0, floor + g.mattressH / 2, -0.02]} />
        {(tier === 'grand' ? [-0.42, 0.42] : [0]).map((x) => (
          <group key={x} position={[x, floor + g.mattressH + 0.059, pillowZ]} rotation={[headAtFront ? -0.12 : 0.12, x * 0.2, 0]}>
            <mesh geometry={g.pillow} material={m.pillow} />
            <mesh geometry={g.pillowSeam} material={m.seam} />
          </group>
        ))}
        <mesh geometry={g.blanket} material={m.blanket} position={[0, floor + g.mattressH + 0.025, blanketZ]} />
        <mesh geometry={g.blanketFold} material={m.fold} position={[0, floor + g.mattressH + 0.055, blanketZ + (headAtFront ? 0.29 : -0.29)]} />
      </group>
      {/* 5 — climate */}
      <group ref={reg('climate')}>
        <group position={[bare ? W * 0.28 : 0, H / 2 - 0.17, -L / 2 + 0.09]} scale={bare ? 0.55 : 1}>
          <mesh geometry={g.climate} material={m.dark} />
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} geometry={g.vent} material={m.accent} position={[0, -0.06 + i * 0.04, 0.05]} />
          ))}
          <mesh material={m.led} position={[W * 0.27, 0.0, 0.05]}>
            <circleGeometry args={[0.012, 16]} />
          </mesh>
        </group>
      </group>
      {/* 6 — entertainment */}
      <group ref={reg('entertainment')}>
        <group position={[0, innerY(0) - 0.13, headAtFront ? -L / 2 + 0.85 : L / 2 - 0.72]} rotation={headAtFront ? [Math.PI / 2 - 0.55, 0, 0] : [-(Math.PI / 2 - 0.55), Math.PI, 0]}>
          <mesh geometry={g.screenFrame} material={m.dark} position={[0, 0, -0.046]} />
          <mesh geometry={g.screen} material={m.screen} />
        </group>
      </group>
      {/* 7 — storage */}
      <group ref={reg('storage')}>
        <group position={[-W / 2 + 0.085, floor + g.mattressH + H * 0.18, headAtFront ? -L / 2 + 0.42 : L / 2 - 0.55]}>
          <mesh geometry={g.storage} material={ribs ? m.wood : m.shell} />
          <mesh geometry={g.drawerLine} material={m.accent} position={[0.062, 0.03, 0]} />
          <mesh geometry={g.drawerLine} material={m.dark} position={[0.062, -0.04, 0]} />
        </group>
      </group>
      {/* 8 — air circulation */}
      <group ref={reg('air')}>
        <group position={[W / 2 - g.r * 0.55, innerY(W / 2 - g.r * 0.55) - 0.04, 0]}>
          <mesh geometry={g.duct} material={m.shell} />
          {[-0.4, 0, 0.4].map((z) => (
            <mesh key={z} geometry={g.ventRing} material={m.accent} position={[-0.02, -0.025, z]} rotation={[Math.PI / 2, 0, 0]} />
          ))}
        </group>
      </group>
    </group>
  );
}
