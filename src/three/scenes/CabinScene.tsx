import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { roundedRectPath, roundedRectShape } from '../models/InteriorWindow';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, setPoint, sharedFog } from '../core';
import { TOUR } from '../../data/capsuleOS';
import { dream, scroll } from '../../state/runtime';
import { getState, previewCapsule, useStore } from '../../state/store';
import { clamp, damp, dampAngle, lerp, rng, smoothstep, wrapAngle } from '../../lib/math';
import { ribTexture } from '../textures';
import {
  CAB,
  END_Z,
  SLOTS,
  THRESHOLDS,
  ZONE,
  ZONES,
  blindMaterial,
  cabinU,
  ceilingMaterial,
  coveMaterial,
  fabricMaterial,
  faceX,
  floorMaterial,
  interiorMaterial,
  rowZ,
  withSpill,
  zoneEnd,
  zoneStart,
  type Zone,
} from './cabinShading';
import { DreamCapsule, capsuleFrame } from './DreamCapsule';
import type { TierId } from '../../data/capsules';
import { DOLLY, dreamPose, makePose, mixPose, poseDir, roomLookTarget, shadeOpen, tabletPose, tourPose } from './cabinCamera';

export { CAB as CABIN };

// ---------------------------------------------------------------------------- layout
interface Slot {
  k: number; // global slot index (matches the spill shader)
  n: number; // index within its zone
  zone: Zone;
  i: number;
  side: 1 | -1;
  level: 0 | 1;
  z: number;
  y: number;
  face: number;
  occupied: boolean;
  sleeping: boolean;
  featured: boolean;
  label: string;
}

function buildSlots(): Slot[] {
  const r = rng(31);
  const out: Slot[] = [];
  for (const zone of ZONES) {
    let n = 0;
    for (let i = 0; i < zone.rows; i++)
      for (const side of [1, -1] as const)
        for (let level = 0; level < zone.tiers; level++) {
          const lv = level as 0 | 1;
          const f = zone.featured;
          const featured = f.row === i && f.side === side && f.level === lv;
          const neighbour = Math.abs(i - f.row) <= 1 && side === f.side;
          const occupied = !featured && !neighbour && r() < 0.32;
          const letter = zone.tiers === 2 ? (side > 0 ? (lv ? 'H' : 'K') : lv ? 'C' : 'A') : side > 0 ? 'K' : 'A';
          out.push({
            k: zone.offset + (i * 2 + (side > 0 ? 0 : 1)) * zone.tiers + lv,
            n: n++,
            zone,
            i,
            side,
            level: lv,
            z: rowZ(zone, i),
            y: zone.y[lv],
            face: faceX(zone, lv),
            occupied,
            sleeping: occupied && r() < 0.5,
            featured,
            label: `${zone.firstRow + i} ${letter}`,
          });
        }
  }
  return out;
}

const toWall = (g: THREE.BufferGeometry) => g.rotateY(Math.PI / 2);

function mergeAll(list: THREE.BufferGeometry[]) {
  const flat = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n.getAttribute('uv')) n.deleteAttribute('uv');
    return n;
  });
  const m = mergeGeometries(flat);
  if (!m) throw new Error('cabin: geometry merge failed');
  return m;
}

function vaultY(x: number) {
  const xa = CAB.aisle + CAB.setback;
  const t = clamp(1 - (x / xa) ** 2, 0, 1);
  return CAB.wallTop + (CAB.apex - CAB.wallTop) * Math.pow(t, 0.55);
}

function envelopePath(inset = 0) {
  const xa = CAB.aisle + CAB.setback - inset;
  const p = new THREE.Path();
  p.moveTo(-xa, 0);
  p.lineTo(-xa, CAB.wallTop - inset * 0.5);
  for (let j = 1; j < 24; j++) {
    const x = -xa + (2 * xa * j) / 24;
    p.lineTo(x, vaultY(x * ((CAB.aisle + CAB.setback) / xa)) - inset);
  }
  p.lineTo(xa, CAB.wallTop - inset * 0.5);
  p.lineTo(xa, 0);
  p.lineTo(-xa, 0);
  return p;
}

function textTexture(draw: (x: CanvasRenderingContext2D, c: HTMLCanvasElement) => void, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const paint = () => {
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    draw(x, c);
  };
  paint();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  document.fonts?.ready.then(() => {
    paint();
    t.needsUpdate = true;
  });
  return t;
}

// ---------------------------------------------------------------------------- scene
export function CabinScene() {
  const group = useRef<THREE.Group>(null);
  const quality = useStore((s) => s.quality);
  const { tier, id: capsuleId } = useStore(previewCapsule);
  const slots = useMemo(buildSlots, []);
  const high = quality === 'high';
  const range = high ? 2 : 1;
  const levels = useRef(new Float32Array(SLOTS).fill(0.1));

  const res = useMemo(() => {
    const L_total = CAB.portalZ - END_Z;
    const zMid = (CAB.portalZ + END_Z) / 2;
    // ---------------- per-zone instanced resources
    const zones = ZONES.map((z) => {
      const zs = slots.filter((s) => s.zone === z);
      const panelH = z.tiers === 2 ? 1.11 : CAB.wallTop;
      const holeDy = z.tiers === 2 ? 0 : z.y[0] - CAB.wallTop / 2;
      const bz = z.id === 'grand' ? 0.1 : z.id === 'signature' ? 0.12 : 0.11;
      const panelShape = roundedRectShape(z.pitch - 0.012, panelH - 0.012, 0.012);
      panelShape.holes.push(roundedRectPath(z.openW + bz + 0.04, z.openH + bz + 0.04, z.openR + 0.1, 0, holeDy));
      const panel = toWall(new THREE.ExtrudeGeometry(panelShape, { depth: 0.025, bevelEnabled: false, curveSegments: 16 }));
      const bezelShape = roundedRectShape(z.openW + bz, z.openH + bz, z.openR + bz / 2);
      bezelShape.holes.push(roundedRectPath(z.openW, z.openH, z.openR));
      const bezel = toWall(
        new THREE.ExtrudeGeometry(bezelShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.035, bevelSize: z.id === 'grand' ? 0.022 : 0.03, bevelSegments: 8, curveSegments: 24 }),
      );
      const { w, h, l } = z.inner;
      const r = Math.min(w, h) * 0.34;
      const tubeShape = roundedRectShape(w + 0.04, h + 0.04, r + 0.02);
      tubeShape.holes.push(roundedRectPath(w, h, r));
      const tube = new THREE.ExtrudeGeometry(tubeShape, { depth: l, bevelEnabled: false, curveSegments: 14 });
      const cap = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 14);
      cap.translate(0, 0, l - 0.004);
      const interior = toWall(mergeAll([tube, cap]));
      interior.translate(0.02, 0, 0);
      const bed = new RoundedBoxGeometry(l - 0.2, 0.19, w - 0.16, 3, 0.05);
      const pillow = new RoundedBoxGeometry(0.34, 0.11, Math.min(0.62, w * 0.5) * (z.id === 'grand' ? 1.6 : 1), 3, 0.045);
      const blanket = new RoundedBoxGeometry(0.4, 0.07, w - 0.24, 4, 0.03);
      const ringPts = roundedRectPath(w - 0.1, h - 0.1, Math.max(0.1, r - 0.05)).getPoints(16);
      const strip = toWall(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts.map((p) => new THREE.Vector3(p.x, p.y, 0)), true), 140, 0.006, 5, true));
      strip.translate(0.12, 0, 0);
      const blind = new THREE.PlaneGeometry(z.openW - 0.06, z.openH - 0.06);
      blind.translate(0, -(z.openH - 0.06) / 2, 0); // pivot at the roller (top)
      blind.rotateY(-Math.PI / 2);
      const pal =
        z.id === 'essential'
          ? { bezel: '#f1ebe1', panel: '#cdbfac', bump: 2.6, liner: '#eee5d6', band: '#e2d6c2', bed: '#f3eee6', blanket: '#c8b294', metal: false }
          : z.id === 'signature'
            ? { bezel: '#efe7da', panel: '#5b4030', bump: 7.5, liner: '#e8dcc6', band: '#7a5338', bed: '#f4efe7', blanket: '#8a5a3c', metal: false }
            : { bezel: '#c9ae86', panel: '#222a3b', bump: 3.2, liner: '#e4d6bf', band: '#2b3448', bed: '#f4efe7', blanket: '#2c3446', metal: true };
      const rib = ribTexture().clone();
      rib.repeat.set(pal.bump, 1);
      rib.needsUpdate = true;
      const panelMat = withSpill(new THREE.MeshStandardMaterial({ color: pal.panel, roughness: z.id === 'signature' ? 0.6 : 0.94, bumpMap: rib, bumpScale: 0.9 }), { wash: true, gain: 1.15, range });
      const lipHalf: [number, number] = [z.openW / 2 - 0.04, z.openH / 2 - 0.04];
      const bezelMat = withSpill(
        pal.metal
          ? new THREE.MeshStandardMaterial({ color: pal.bezel, metalness: 0.85, roughness: 0.3 })
          : high
            ? new THREE.MeshPhysicalMaterial({ color: pal.bezel, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.28 })
            : new THREE.MeshStandardMaterial({ color: pal.bezel, roughness: 0.32 }),
        { lip: { half: lipHalf, r: z.openR - 0.03 }, wash: true, gain: pal.metal ? 0.6 : 1.0, range },
      );
      const lv = new THREE.InstancedBufferAttribute(new Float32Array(zs.length * 3), 3);
      return {
        z,
        zs,
        panel,
        bezel,
        interior,
        bed,
        pillow,
        blanket,
        strip,
        blind,
        panelMat,
        bezelMat,
        interiorMat: interiorMaterial(z, pal.liner, pal.band),
        bedMat: fabricMaterial(pal.bed, true),
        pillowMat: fabricMaterial('#fbf8f2'),
        blanketMat: fabricMaterial(pal.blanket),
        stripMat: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
        blindMat: blindMaterial(),
        lv,
        occupied: zs.filter((s) => s.occupied),
      };
    });

    // ---------------- architecture
    const metalMat = withSpill(new THREE.MeshStandardMaterial({ color: '#c9ae86', metalness: 0.9, roughness: 0.26 }), { gain: 0.6, range });
    const ivoryMat = withSpill(new THREE.MeshStandardMaterial({ color: '#ebe3d6', roughness: 0.4 }), { wash: true, gain: 0.9, range });
    const walnutMat = withSpill(new THREE.MeshStandardMaterial({ color: '#4a3224', roughness: 0.5 }), { wash: true, gain: 0.9, range });
    const ribMat = withSpill(new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.35, metalness: 0.15 }), { gain: 0.9, range });
    const kickMat = new THREE.MeshStandardMaterial({ color: '#191510', roughness: 0.55 });
    const walnut = new THREE.MeshPhysicalMaterial({ color: '#3b291d', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 });
    const walnutDark = new THREE.MeshStandardMaterial({ color: '#21170f', roughness: 0.7 });

    const E = ZONE.essential;
    const S = ZONE.signature;
    const eLen = zoneStart(E) - zoneEnd(E);
    const eMid = (zoneStart(E) + zoneEnd(E)) / 2;
    const sLen = zoneStart(S) - zoneEnd(S);
    const sMid = (zoneStart(S) + zoneEnd(S)) / 2;
    const metal: THREE.BufferGeometry[] = [];
    const ivory: THREE.BufferGeometry[] = [];
    const wood: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      // Essential: integrated steps, rails, tier ledge & handrail
      for (let i = -1; i < E.rows; i++) {
        const seam = rowZ(E, i) - E.pitch / 2;
        for (const y of [0.4, 0.86]) metal.push(new RoundedBoxGeometry(0.12, 0.028, 0.15, 2, 0.012).translate(side * (CAB.aisle - 0.055), y, seam));
        metal.push(new THREE.CylinderGeometry(0.013, 0.013, 0.78, 10).translate(side * (CAB.aisle + CAB.setback - 0.055), 1.66, seam));
      }
      metal.push(new THREE.CylinderGeometry(0.017, 0.017, eLen, 12).rotateX(Math.PI / 2).translate(side * (CAB.aisle - 0.05), 1.165, eMid));
      ivory.push(new RoundedBoxGeometry(0.13, 0.045, eLen, 2, 0.015).translate(side * (CAB.aisle + 0.025), 1.125, eMid));
      // Signature: walnut overhead-cabinet ledge with a concealed light
      wood.push(new RoundedBoxGeometry(0.1, 0.05, sLen, 2, 0.015).translate(side * (CAB.aisle - 0.02), 1.345, sMid));
      // cornice along the whole cabin
      ivory.push(new RoundedBoxGeometry(0.14, 0.06, L_total, 2, 0.02).translate(side * (CAB.aisle + CAB.setback - 0.02), CAB.wallTop - 0.03, zMid));
      // filler walls between cabins and at the bulkhead
      const gaps: [number, number][] = [
        [zoneEnd(ZONES[0]), zoneStart(ZONES[1])],
        [zoneEnd(ZONES[1]), zoneStart(ZONES[2])],
        [zoneEnd(ZONES[2]), END_Z],
      ];
      for (const [a, b] of gaps) {
        const len = a - b;
        ivory.push(new THREE.BoxGeometry(0.06, CAB.wallTop, len).translate(side * (CAB.aisle + 0.03), CAB.wallTop / 2, (a + b) / 2));
      }
    }
    const metals = mergeAll(metal);
    const ivories = mergeAll(ivory);
    const woods = mergeAll(wood);
    const plinth = new THREE.BoxGeometry(0.03, 0.1, L_total);

    // vaulted ceiling with inward normals
    const xa = CAB.aisle + CAB.setback;
    const z1 = CAB.portalZ + 0.05;
    const z2 = END_Z - 0.05;
    const nx = 28;
    const cPos: number[] = [];
    const cNor: number[] = [];
    const cIdx: number[] = [];
    for (let j = 0; j <= nx; j++) {
      const x = -xa + (2 * xa * j) / nx;
      const y = vaultY(x);
      const e = 0.001;
      const dydx = (vaultY(Math.min(xa, x + e)) - vaultY(Math.max(-xa, x - e))) / (2 * e);
      const n = new THREE.Vector3(dydx, -1, 0).normalize();
      for (const z of [z1, z2]) {
        cPos.push(x, y, z);
        cNor.push(n.x, n.y, n.z);
      }
      if (j < nx) {
        const a = j * 2;
        cIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const ceiling = new THREE.BufferGeometry();
    ceiling.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    ceiling.setAttribute('normal', new THREE.Float32BufferAttribute(cNor, 3));
    ceiling.setIndex(cIdx);

    // ribs at module seams (rhythm changes with each cabin)
    const ribZ: number[] = [];
    for (let i = 0; i <= E.rows; i += 2) ribZ.push(rowZ(E, i) + E.pitch / 2);
    for (let i = 0; i <= S.rows; i++) ribZ.push(rowZ(S, i) + S.pitch / 2);
    const G = ZONE.grand;
    for (let i = 0; i <= G.rows; i++) ribZ.push(rowZ(G, i) + G.pitch / 2);
    const ribParts = ribZ.map((z) => {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 24; j++) {
        const x = -xa + 0.02 + ((2 * xa - 0.04) * j) / 24;
        pts.push(new THREE.Vector3(x, vaultY(x) - 0.02, z));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.02, 8, false);
    });
    const ribs = mergeAll(ribParts);

    // light lines
    const coveTop = new THREE.BoxGeometry(0.02, 0.006, L_total);
    const ledLine = new THREE.BoxGeometry(0.02, 0.006, eLen);
    const sigLine = new THREE.BoxGeometry(0.02, 0.006, sLen);
    const floorLed = new THREE.BoxGeometry(0.012, 0.01, L_total);

    // entrance portal & thresholds (walnut frames with a champagne inlay)
    const frame = (inset: number, depth: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-1.6, -0.05);
      shape.lineTo(1.6, -0.05);
      shape.lineTo(1.6, 3.35);
      shape.lineTo(-1.6, 3.35);
      shape.lineTo(-1.6, -0.05);
      shape.holes.push(envelopePath(inset));
      return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 6 });
    };
    const inlayCurve = (inset: number) => {
      const xi = CAB.aisle + CAB.setback - inset + 0.012;
      const pts: THREE.Vector3[] = [new THREE.Vector3(-xi, 0.02, 0), new THREE.Vector3(-xi, CAB.wallTop * 0.5, 0), new THREE.Vector3(-xi, CAB.wallTop - inset * 0.5, 0)];
      for (let j = 1; j < 24; j++) {
        const x = -xi + (2 * xi * j) / 24;
        pts.push(new THREE.Vector3(x, vaultY(x * ((CAB.aisle + CAB.setback) / xi)) - inset + 0.012, 0));
      }
      pts.push(new THREE.Vector3(xi, CAB.wallTop - inset * 0.5, 0), new THREE.Vector3(xi, CAB.wallTop * 0.5, 0), new THREE.Vector3(xi, 0.02, 0));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08), 240, 0.007, 6, false);
    };
    const portal = frame(0, 0.36);
    const portalInlay = inlayCurve(-0.01);
    const arch = frame(0.075, 0.26);
    const archInlay = inlayCurve(0.075);
    const endWall = new THREE.ShapeGeometry(new THREE.Shape(envelopePath(0).getPoints(4)), 4);
    const archLabels = ['SIGNATURE', 'GRAND'].map((t) =>
      textTexture(
        (x, c) => {
          x.fillStyle = '#d8bf96';
          x.textAlign = 'center';
          x.textBaseline = 'middle';
          x.font = '400 44px "IBM Plex Mono", monospace';
          (x as any).letterSpacing = '18px';
          x.fillText(t, c.width / 2 + 9, c.height / 2 + 2);
        },
        640,
        80,
      ),
    );

    // signage atlas (featured plates are personalised separately)
    const plateSlots = slots.filter((s) => !s.featured);
    const cols = 8;
    const cw = 160;
    const ch = 56;
    const atlasTex = textTexture(
      (x) => {
        x.fillStyle = '#C8AD85';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.font = '400 30px Jost, "Helvetica Neue", Arial, sans-serif';
        plateSlots.forEach((s, n) => x.fillText(s.label, (n % cols) * cw + cw / 2, Math.floor(n / cols) * ch + ch / 2 + 2));
      },
      cols * cw,
      Math.ceil(plateSlots.length / cols) * ch,
    );
    const aw = cols * cw;
    const ah = Math.ceil(plateSlots.length / cols) * ch;
    const plates = mergeGeometries(
      plateSlots.map((s, n) => {
        const g = new THREE.PlaneGeometry(0.16, 0.056);
        const cx = (n % cols) * cw;
        const cy = Math.floor(n / cols) * ch;
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let v = 0; v < uv.count; v++) uv.setXY(v, (cx + uv.getX(v) * cw) / aw, 1 - (cy + (1 - uv.getY(v)) * ch) / ah);
        g.rotateY(-s.side * (Math.PI / 2));
        g.translate(s.side * (s.face - 0.046), s.y + s.zone.openH / 2 + 0.052, s.z);
        return g;
      }),
    )!;
    const plateMat = new THREE.MeshBasicMaterial({ map: atlasTex, transparent: true, color: new THREE.Color(1.5, 1.35, 1.15), toneMapped: false, depthWrite: false });

    // dust motes in the warm light
    const mN = high ? 420 : 180;
    const mPos = new Float32Array(mN * 3);
    const mSeed = new Float32Array(mN);
    const mr = rng(77);
    for (let n = 0; n < mN; n++) {
      mPos.set([(mr() - 0.5) * 1.2, 0.2 + mr() * 2.4, lerp(CAB.portalZ, END_Z, mr())], n * 3);
      mSeed[n] = mr();
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(mSeed, 1));
    const moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: cabinU.uTime, uPx: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uPx; varying float vA;
        void main(){ vec3 p = position; p.y += sin(uTime * 0.12 + aSeed * 30.0) * 0.12; p.x += sin(uTime * 0.09 + aSeed * 17.0) * 0.08; p.z += cos(uTime * 0.07 + aSeed * 11.0) * 0.1;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float d = -mv.z; gl_PointSize = uPx * (1.0 + aSeed * 1.6) * (2.2 / max(d, 0.1));
          vA = smoothstep(0.4, 1.2, d) * smoothstep(9.0, 3.0, d) * (0.45 + 0.25 * sin(uTime * (0.4 + aSeed) + aSeed * 50.0)); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * 1.4, smoothstep(0.5, 0.0, d) * vA * 0.55); }`,
    });

    return {
      zones, metals, ivories, woods, plinth, ceiling, ribs, coveTop, ledLine, sigLine, floorLed, portal, portalInlay, arch, archInlay, endWall, archLabels,
      plates, plateMat, moteGeo, moteMat, metalMat, ivoryMat, walnutMat, ribMat, kickMat, walnut, walnutDark,
      ceilingMat: ceilingMaterial(range),
      floorMat: floorMaterial(range),
      coveMat: coveMaterial('#ffd29e', 3.4),
      ledMat: coveMaterial('#ffc88c', 2.4),
      floorLedMat: coveMaterial('#ffbd80', 2.1, false),
      inlayMat: coveMaterial('#e7c99a', 1.5, false),
      logoMat: coveMaterial('#ffd8a6', 2.4, false),
      featuredBlindMats: ZONES.map(() => blindMaterial(new THREE.Color('#ffc890'))),
      L_total,
      zMid,
      eLen,
      eMid,
      sLen,
      sMid,
    };
  }, [slots, high, range]);

  // personalised plates on the featured capsules (the one you board shows your capsule number)
  const featuredPlates = useMemo(
    () =>
      ZONES.map((z) => {
        const s = slots.find((x) => x.zone === z && x.featured)!;
        const text = capsuleId && z.id === tier ? capsuleId.replace(/^(\d+)/, '$1 ') : s.label;
        return {
          s,
          tex: textTexture(
            (x, c) => {
              x.fillStyle = '#E7C99A';
              x.textAlign = 'center';
              x.textBaseline = 'middle';
              x.font = '400 34px Jost, "Helvetica Neue", Arial, sans-serif';
              x.fillText(text, c.width / 2, c.height / 2 + 2);
            },
            192,
            64,
          ),
        };
      }),
    [slots, capsuleId, tier],
  );

  // ------------------------------------------------------------------ instancing
  const zoneMeshes = useRef<Record<string, Record<string, THREE.InstancedMesh | null>>>({});
  const blindRefs = useRef<(THREE.Mesh | null)[]>([]);
  const hiddenTarget = useRef<string>('');

  const placeAll = (zi: number, kind: string, mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    (zoneMeshes.current[zi] ??= {})[kind] = mesh;
    if (mesh.userData.ready) return;
    const zr = res.zones[zi];
    const list = kind === 'blind' ? zr.occupied : zr.zs;
    const m = new THREE.Matrix4();
    list.forEach((s, n) => {
      composeSlot(m, s, kind);
      mesh.setMatrixAt(n, m);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (kind === 'strip' || kind === 'blind') for (let n = 0; n < list.length; n++) mesh.setColorAt(n, new THREE.Color(0.1, 0.1, 0.1));
    else if (kind !== 'panel') mesh.instanceColor = zr.lv;
    mesh.userData.ready = true;
  };

  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _pos = useMemo(() => new THREE.Vector3(), []);
  const ONE = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const ZERO = useMemo(() => new THREE.Vector3(1e-4, 1e-4, 1e-4), []);
  function composeSlot(m: THREE.Matrix4, s: Slot, kind: string, hide = false) {
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.side > 0 ? 0 : Math.PI);
    const z = s.zone;
    const fx = s.side * s.face;
    const floorY = s.y - z.inner.h / 2 + 0.025;
    const top = floorY + 0.19;
    switch (kind) {
      case 'bed':
        _pos.set(s.side * (s.face + 0.02 + 0.1 + (z.inner.l - 0.2) / 2), floorY + 0.095, s.z);
        break;
      case 'pillow':
        _pos.set(s.side * (s.face + z.inner.l - 0.3), top + 0.05, s.z);
        break;
      case 'blanket':
        _pos.set(s.side * (s.face + 0.5), top + 0.03, s.z);
        break;
      case 'blind':
        _pos.set(s.side * (s.face + 0.035), s.y + (z.openH - 0.06) / 2, s.z);
        break;
      case 'panel':
        _pos.set(fx, z.tiers === 2 ? s.y : CAB.wallTop / 2, s.z);
        break;
      default:
        _pos.set(fx, s.y, s.z);
    }
    m.compose(_pos, _q, hide ? ZERO : ONE);
  }

  // ------------------------------------------------------------------ frame
  const v = useMemo(
    () => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Color(), w: new THREE.Color('#ffc890'), bl: new THREE.Color('#6f80d8'), m: new THREE.Matrix4() }),
    [],
  );
  const cam3 = useRef({ pc: -1, tablet: 0, wasHere: false, look: { yaw: 0, pitch: 0 }, lookTarget: { yaw: 0, pitch: 0 }, pose: makePose(), t1: makePose(), t2: makePose() });
  const _dir = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('cabin');
    const c3 = cam3.current;
    if (director.scene !== 'cabin') {
      c3.wasHere = false;
      return;
    }
    const st = getState();
    const t = s.clock.elapsedTime;
    const step = Math.min(dt, 1 / 20);
    cabinU.uTime.value = t;
    const inDream = st.mode === 'dream';
    const p = scroll.progress.cabin;
    const preview = previewCapsule(st);
    const fr = capsuleFrame(preview.tier);

    // ---------------- camera
    // The dolly follows scroll through a critically damped follower: wheel steps and
    // trackpad bursts become one smooth move. Arriving from elsewhere (or a long jump)
    // places it directly, so it can never lag behind or swing in from far away.
    if (!c3.wasHere || Math.abs(p - c3.pc) > 0.2) c3.pc = p;
    else c3.pc = damp(c3.pc, p, 5.5, step);
    c3.wasHere = true;
    const aspect = director.aspect;
    const landscape = aspect >= 1;
    const pose = c3.pose;
    let sigma = 0;
    let showTier: string | null = null;
    if (!inDream) {
      c3.tablet = 0;
      const r = tourPose(c3.pc, landscape, pose, c3.t1);
      sigma = r.sigma;
      showTier = r.stop;
    } else {
      const looking = st.dreamPhase === 'personalize' && st.dreamUi;
      const showTablet = Number(looking && st.capsuleControlsOpen);
      c3.tablet = st.reducedMotion ? showTablet : damp(c3.tablet, showTablet, 7, step);
      if (looking) {
        roomLookTarget(fr, preview.tier, landscape, c3.lookTarget);
        c3.look.yaw = st.reducedMotion ? c3.lookTarget.yaw : dampAngle(c3.look.yaw, c3.lookTarget.yaw, 13, step);
        c3.look.pitch = st.reducedMotion ? c3.lookTarget.pitch : damp(c3.look.pitch, c3.lookTarget.pitch, 13, step);
      } else if (st.dreamPhase !== 'sleep') {
        c3.look.yaw = 0;
        c3.look.pitch = 0;
      }
      dreamPose(fr, preview.tier, aspect, c3.look, pose, c3.t1, c3.t2);
      if (c3.tablet > 0.001) {
        tabletPose(fr, preview.tier, aspect, c3.t1);
        c3.t1.yaw = pose.yaw + wrapAngle(c3.t1.yaw - pose.yaw);
        mixPose(pose, pose, c3.t1, c3.tablet);
      }
    }
    v.t.copy(pose.p).addScaledVector(poseDir(pose.yaw, pose.pitch, _dir), 4);
    aimCamera(s.camera as THREE.PerspectiveCamera, pose.p, v.t, fitFov(pose.fov, aspect, 1.0));
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.02 || cam.far !== 120) {
      cam.near = 0.02;
      cam.far = 120;
      cam.updateProjectionMatrix();
    }

    // ---------------- reveal & night service
    const reveal = inDream ? 1 : smoothstep(0.01, 0.17, c3.pc);
    cabinU.uWave.value = inDream ? -100 : lerp(CAB.portalZ + 1.4, END_Z - 3, reveal);
    cabinU.uCove.value = inDream ? 1 : 0.25 + 0.75 * reveal;
    const ph = st.dreamPhase;
    const night = !inDream ? 0 : ph === 'boarding' ? 0.4 : ph === 'personalize' ? 0.6 : ph === 'wake' ? 0.85 * (1 - dream.wake) : 0.85;
    cabinU.uNight.value = damp(cabinU.uNight.value, night, 2, step);

    // ---------------- capsule lights
    const camZ = cam.position.z;
    const slotU = cabinU.uSlot.value;
    const lv = levels.current;
    // each featured capsule's shade rises as its showcase begins, and stays open behind us
    const open = (id: TierId) => (inDream ? 0 : shadeOpen(id, c3.pc));
    const showE = open('essential');
    const showS = open('signature');
    const showG = open('grand');
    for (let zi = 0; zi < res.zones.length; zi++) {
      const zr = res.zones[zi];
      const arr = zr.lv.array as Float32Array;
      const strips = zoneMeshes.current[zi]?.strip;
      const blinds = zoneMeshes.current[zi]?.blind;
      let bn = 0;
      for (const sl of zr.zs) {
        const ahead = camZ - sl.z;
        const waveOn = smoothstep(cabinU.uWave.value - 1, cabinU.uWave.value + 1, sl.z);
        let target = (0.12 + 0.85 * smoothstep(6.5, 1.0, ahead) * (ahead > -3 ? 1 : 0.7)) * (0.35 + 0.65 * waveOn);
        if (ahead < -3) target = Math.max(target, 0.5);
        if (sl.occupied) target = sl.sleeping ? 0.5 : 0.42;
        if (sl.featured) {
          const sh = sl.zone.id === 'essential' ? showE : sl.zone.id === 'signature' ? showS : showG;
          target = Math.max(target, 0.25 + 0.95 * sh);
        }
        if (inDream) target = sl.occupied ? target * 0.8 : Math.min(target, 0.55);
        lv[sl.k] = damp(lv[sl.k], target, 3, step);
        const l = lv[sl.k];
        const hue = sl.sleeping ? 1 : 0;
        arr[sl.n * 3] = l;
        arr[sl.n * 3 + 1] = hue;
        slotU[sl.k * 2] = sl.occupied ? l * 0.45 : l;
        slotU[sl.k * 2 + 1] = hue;
        if (strips) {
          v.c.copy(hue ? v.bl : v.w).multiplyScalar(0.12 + 3.2 * l * l);
          strips.setColorAt(sl.n, v.c);
        }
        if (sl.occupied && blinds) {
          // awake guests glow warm behind the shade; sleeping guests show only a faint night light
          if (hue) v.c.copy(v.w).multiplyScalar(0.09 + 0.08 * l).lerp(v.bl, 0.22);
          else v.c.copy(v.w).multiplyScalar(0.25 + 0.75 * l);
          blinds.setColorAt(bn++, v.c);
        }
      }
      zr.lv.needsUpdate = true;
      if (strips?.instanceColor) strips.instanceColor.needsUpdate = true;
      if (blinds?.instanceColor) blinds.instanceColor.needsUpdate = true;
    }

    // featured blinds rise as their shot arrives (scroll) — the boarded one is driven by the dream
    res.zones.forEach((zr, zi) => {
      const b = blindRefs.current[zi];
      if (!b) return;
      const sh = zr.z.id === 'essential' ? showE : zr.z.id === 'signature' ? showS : showG;
      const closed = inDream ? (zr.z.id === preview.tier ? 0 : 1) : 1 - sh;
      b.scale.y = Math.max(0.001, closed);
      b.visible = closed > 0.01 && !(inDream && zr.z.id === preview.tier);
      const sl = zr.zs.find((x) => x.featured)!;
      res.featuredBlindMats[zi].uniforms.uGlow.value.copy(v.w).multiplyScalar(0.35 + 0.95 * lv[sl.k]);
    });

    // in the dream the detailed capsule replaces the instanced one in the wall
    const hideKey = inDream ? preview.tier : '';
    if (hideKey !== hiddenTarget.current) {
      res.zones.forEach((zr, zi) => {
        const sl = zr.zs.find((x) => x.featured)!;
        const hide = zr.z.id === hideKey;
        for (const kind of ['interior', 'bed', 'pillow', 'blanket', 'strip']) {
          const mesh = zoneMeshes.current[zi]?.[kind];
          if (!mesh) continue;
          composeSlot(v.m, sl, kind, hide);
          mesh.setMatrixAt(sl.n, v.m);
          mesh.instanceMatrix.needsUpdate = true;
        }
      });
      hiddenTarget.current = hideKey;
    }

    // ---------------- lights
    const cove = cabinU.uCove.value * (1 - 0.5 * cabinU.uNight.value);
    if (!inDream) {
      setPoint(0, '#ffd3a0', 2.1 * (0.5 + 0.5 * cove), 0, 2.35, camZ - 0.9, 7);
      setPoint(1, '#ffc88c', 2.6 * cove, 0, 2.4, camZ - 3.8, 8);
      // a soft key light inside the showcased capsule, faded with the turn (never moved while lit)
      if (showTier && sigma > 0.001) {
        const ff = capsuleFrame(showTier as TierId);
        v.a.copy(ff.at(0.35, ff.yc + 0.1));
        setPoint(3, '#ffcf9a', 3.2 * sigma, v.a.x, v.a.y, v.a.z, 3.5);
      }
    }
    // once inside the capsule its own light takes over: the cabin's general light recedes,
    // so changing the ambient colour on the touchscreen visibly transforms the interior
    const inside = inDream ? Math.min(1, Math.max(dream.lie, dream.enter * 0.8)) * (1 - Math.min(1, Math.max(0, (dream.exit - 0.45) / 0.55))) : 0;
    setPoint(2, '#ffc88c', 2.4 * cove * (1 - 0.85 * inside), 0, 2.4, camZ - (inDream ? 1.5 : 7.2), 8);
    rig.hemi!.color.set('#fff1df');
    rig.hemi!.groundColor.set('#5a4535');
    rig.hemi!.intensity = (0.5 + 0.55 * cove) * (inDream ? lerp(0.75, 0.12, inside) : 1);
    rig.ambient!.color.set('#ffe6c8');
    rig.ambient!.intensity = 0.05 * (1 - 0.8 * inside);
    s.scene.environmentIntensity = (0.35 + 0.3 * cove) * (1 - 0.6 * inside);
    sharedFog.color.copy(cabinU.uFogColor.value);
    sharedFog.near = cabinU.uFogNear.value;
    sharedFog.far = cabinU.uFogFar.value;
    s.scene.background = _bg;

    dofTarget.copy(pose.focus);
    const turning = inDream ? Math.sin(Math.PI * Math.min(1, dream.exit / 0.45)) : 0;
    post.bokeh = high ? (inDream ? 0.42 * (1 - 0.9 * turning) * (st.dreamPhase === 'personalize' ? 0 : 1) : 1.2) : 0;
    post.focusRange = inDream ? 1.2 : 2.4;
    post.bloom = inDream && st.dreamPhase === 'personalize' ? 0.4 : 1;
  });

  return (
    <group ref={group}>
      <mesh material={res.floorMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (CAB.zStart + 2.5 + END_Z) / 2]}>
        <planeGeometry args={[3.2, CAB.zStart + 2.5 - END_Z]} />
      </mesh>
      <mesh geometry={res.ceiling} material={res.ceilingMat} />
      <mesh geometry={res.ribs} material={res.ribMat} />

      {res.zones.map((zr, zi) => (
        <group key={zr.z.id}>
          <instancedMesh ref={(m) => placeAll(zi, 'panel', m)} args={[zr.panel, zr.panelMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'bezel', m)} args={[zr.bezel, zr.bezelMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'interior', m)} args={[zr.interior, zr.interiorMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'bed', m)} args={[zr.bed, zr.bedMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'pillow', m)} args={[zr.pillow, zr.pillowMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'blanket', m)} args={[zr.blanket, zr.blanketMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'strip', m)} args={[zr.strip, zr.stripMat, zr.zs.length]} />
          <instancedMesh ref={(m) => placeAll(zi, 'blind', m)} args={[zr.blind, zr.blindMat, Math.max(1, zr.occupied.length)]} />
          {(() => {
            const sl = zr.zs.find((x) => x.featured)!;
            return (
              <mesh
                ref={(m) => (blindRefs.current[zi] = m)}
                geometry={zr.blind}
                material={res.featuredBlindMats[zi]}
                position={[sl.side * (sl.face + 0.035), sl.y + (zr.z.openH - 0.06) / 2, sl.z]}
                rotation={[0, sl.side > 0 ? 0 : Math.PI, 0]}
              />
            );
          })()}
        </group>
      ))}
      <mesh geometry={res.plates} material={res.plateMat} />
      {featuredPlates.map(({ s: sl, tex }) => (
        <mesh key={sl.k} position={[sl.side * (sl.face - 0.046), sl.y + sl.zone.openH / 2 + 0.052, sl.z]} rotation={[0, -sl.side * (Math.PI / 2), 0]}>
          <planeGeometry args={[0.16, 0.056]} />
          <meshBasicMaterial map={tex} transparent color={new THREE.Color(2.0, 1.8, 1.45)} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}

      <mesh geometry={res.metals} material={res.metalMat} />
      <mesh geometry={res.ivories} material={res.ivoryMat} />
      <mesh geometry={res.woods} material={res.walnutMat} />
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh geometry={res.plinth} material={res.kickMat} position={[side * (CAB.aisle + 0.015), 0.05, res.zMid]} />
          <mesh geometry={res.floorLed} material={res.floorLedMat} position={[side * (CAB.aisle - 0.004), 0.012, res.zMid]} />
          <mesh geometry={res.ledLine} material={res.ledMat} position={[side * (CAB.aisle - 0.02), 1.1, res.eMid]} />
          <mesh geometry={res.sigLine} material={res.ledMat} position={[side * (CAB.aisle - 0.04), 1.318, res.sMid]} />
          <mesh geometry={res.coveTop} material={res.coveMat} position={[side * (CAB.aisle + CAB.setback - 0.04), CAB.wallTop + 0.003, res.zMid]} />
        </group>
      ))}

      {/* entrance portal and vestibule */}
      <group position={[0, 0, CAB.portalZ]}>
        <mesh geometry={res.portal} material={res.walnut} />
        <mesh geometry={res.portalInlay} material={res.inlayMat} position={[0, 0, 0.39]} />
        <group position={[0, 3.0, 0.4]}>
          <mesh material={res.logoMat}>
            <torusGeometry args={[0.1, 0.005, 8, 64]} />
          </mesh>
          <mesh material={res.logoMat} position={[0, 0.16, 0]}>
            <boxGeometry args={[0.1, 0.009, 0.004]} />
          </mesh>
        </group>
      </group>
      {[1, -1].map((side) => (
        <mesh key={side} material={res.walnutDark} position={[side * 1.6, 1.65, CAB.portalZ + 2.6]} rotation={[0, -side * (Math.PI / 2), 0]}>
          <planeGeometry args={[4.6, 3.4]} />
        </mesh>
      ))}
      <mesh material={res.walnutDark} position={[0, 3.35, CAB.portalZ + 2.6]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 4.6]} />
      </mesh>

      {/* thresholds between cabins */}
      {THRESHOLDS.map((tz, i) => (
        <group key={tz} position={[0, 0, tz - 0.13]}>
          <mesh geometry={res.arch} material={res.walnut} />
          <mesh geometry={res.archInlay} material={res.inlayMat} position={[0, 0, 0.29]} />
          <mesh position={[0, CAB.apex - 0.112, 0.292]}>
            <planeGeometry args={[0.48, 0.06]} />
            <meshBasicMaterial map={res.archLabels[i]} transparent color={new THREE.Color(1.6, 1.4, 1.1)} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      ))}

      {/* forward bulkhead */}
      <mesh geometry={res.endWall} material={res.walnut} position={[0, 0, END_Z]} />
      <group position={[0, 1.62, END_Z + 0.02]}>
        <mesh material={res.inlayMat}>
          <torusGeometry args={[0.11, 0.005, 8, 72]} />
        </mesh>
        <mesh material={res.inlayMat} position={[0, 0.17, 0]}>
          <boxGeometry args={[0.11, 0.008, 0.004]} />
        </mesh>
      </group>

      <points geometry={res.moteGeo} material={res.moteMat} frustumCulled={false} />
      <DreamCapsule />
    </group>
  );
}

const _bg = new THREE.Color('#150f0a');

// ---------------------------------------------------------------------------- dream choreography
/**
 * Boarding → settling in → sleep → waking, as one physically believable camera move:
 * glide down the aisle, stop at the capsule, a three-quarter reveal while the enclosure
 * opens, align with the entrance, pass through it on its centre line (never touching the
 * geometry), then lower onto the pillow and tilt up toward the ceiling display.
 * Waking reverses it: sit up, turn calmly toward the opening, and step out into the light.
 */
function dreamCamera(
  fr: ReturnType<typeof capsuleFrame>,
  v: { p: THREE.Vector3; t: THREE.Vector3; a: THREE.Vector3; b: THREE.Vector3 },
  cache: { key: string; curve: THREE.CatmullRomCurve3 | null },
) {
  const { side, yc, zc, floorY, l, h } = fr;
  const s = smoothstep;
  const head = floorY + 0.19 + 0.21;
  const reveal = new THREE.Vector3(-side * 0.42, yc + 0.32, zc + 1.45);
  // 1 · glide down the aisle at a steady eye height
  const board = s(0, 1, dream.boardT);
  v.p.set(0, lerp(1.52, 1.46, board), lerp(CAB.zStart, zc + 2.4, board));
  v.t.set(0, 1.34, v.p.z - 8);
  v.t.lerp(fr.at(0.45, yc - 0.05, 0, v.a), s(0.55, 1, board) * 0.35);
  // 2 · three-quarter reveal while the enclosure opens
  const door = s(0, 1, dream.door);
  v.p.lerp(reveal, door);
  v.t.lerp(fr.at(0.45, yc - 0.05, 0, v.a), door);
  // 3 · align with the entrance and pass through it on its centre line
  const enter = s(0, 1, dream.enter);
  if (enter > 0) {
    const key = `${fr.zone.id}`;
    if (cache.key !== key || !cache.curve) {
      cache.key = key;
      cache.curve = new THREE.CatmullRomCurve3(
        [reveal.clone(), new THREE.Vector3(-side * 0.3, yc + 0.12, zc + 0.42), fr.at(-0.24, yc + 0.03), fr.at(0.34, yc)],
        false,
        'centripetal',
      );
    }
    cache.curve.getPoint(enter, v.b);
    v.p.copy(v.b);
    v.t.copy(fr.at(lerp(0.45, 2.6, s(0.2, 1, enter)), yc - 0.05, 0, v.a));
  }
  // 4 · settle: lower onto the pillow and look up along the capsule toward the display
  const lie = s(0, 1, dream.lie);
  if (lie > 0) {
    v.p.lerp(fr.at(0.3, head), lie);
    v.t.lerp(fr.at(l * 0.95, yc + h * 0.27), lie);
  }
  // 5 · waking: sit up, turn toward the opening (watching the shade rise), step out
  const ex = dream.exit;
  if (ex > 0) {
    const sit = s(0, 0.45, ex);
    const out = s(0.45, 1, ex);
    v.p.lerp(fr.at(l * 0.42, floorY + 0.19 + 0.44), sit);
    const th = Math.PI * sit;
    // a calm yaw about the vertical axis; the gaze lifts to the ceiling light line as it
    // sweeps past the side wall, then settles level on the opening
    v.a.set(side * Math.cos(th), -0.05 + 0.5 * Math.sin(th), Math.sin(th) * 0.9).normalize();
    v.t.lerp(v.b.copy(v.p).addScaledVector(v.a, 2.2), sit);
    // step out, rise to standing height and turn to look down the warm aisle
    v.p.lerp(fr.at(-0.85, lerp(yc + 0.1, 1.42, s(0.2, 1, out))), out);
    v.t.lerp(fr.at(-fr.face, 1.36, -5), out);
  }
  const fov = lerp(lerp(46, 50, enter), 58, lie) - 6 * s(0.45, 1, ex);
  // while resting, leave room for the capsule controls beside the view
  const shift = lie * (1 - s(0, 0.3, ex));
  return { fov, sx: -0.1 * shift, sy: -0.12 * shift };
}
