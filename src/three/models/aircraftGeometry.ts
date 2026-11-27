import * as THREE from 'three';

/** SŌMNA concept aircraft — procedural geometry. Units: metres. Nose points to −Z. */
export const AC = {
  R: 3.1,
  zNose: -30,
  zNoseEnd: -21,
  zTailStart: 13,
  zTail: 30,
  windowY: 0.45,
  heroWindowZ: -9,
  floorY: -1.0,
};

export const windowPhi = Math.acos(AC.windowY / AC.R); // angle from top

/** Fuselage centre-line offset and radius at z. */
export function fuselageSection(z: number) {
  const { R, zNose, zNoseEnd, zTailStart, zTail } = AC;
  if (z <= zNoseEnd) {
    const t = (z - zNose) / (zNoseEnd - zNose);
    const r = R * Math.pow(1 - Math.pow(1 - t, 2.3), 0.52);
    const yc = -0.42 * Math.pow(1 - t, 2);
    return { r: Math.max(r, 0.0001), yc };
  }
  if (z >= zTailStart) {
    const t = Math.min(1, (z - zTailStart) / (zTail - zTailStart));
    const top = R - 0.7 * Math.pow(t, 2.5);
    const bottom = -R + (2 * R - 0.8) * Math.pow(t, 1.3);
    const r = Math.max((top - bottom) / 2, 0.06);
    return { r, yc: (top + bottom) / 2 };
  }
  return { r: R, yc: 0 };
}

export function fuselageGeometry(nz = 220, nr = 72) {
  const { zNose, zTail } = AC;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const dz = 0.01;
  for (let i = 0; i <= nz; i++) {
    const v = i / nz;
    // denser sampling near the nose
    const s = v < 0.2 ? Math.pow(v / 0.2, 1.6) * 0.2 : v;
    const z = zNose + s * (zTail - zNose);
    const a = fuselageSection(z);
    const b = fuselageSection(Math.min(zTail, z + dz));
    const c = fuselageSection(Math.max(zNose, z - dz));
    const dr = (b.r - c.r) / (2 * dz);
    const dyc = (b.yc - c.yc) / (2 * dz);
    for (let j = 0; j <= nr; j++) {
      const u = j / nr;
      const phi = u * Math.PI * 2;
      const sp = Math.sin(phi);
      const cp = Math.cos(phi);
      pos.push(a.r * sp, a.yc + a.r * cp, z);
      const n = new THREE.Vector3(sp, cp, -(cp * dyc + dr)).normalize();
      if (i === 0) n.set(0, 0, -1);
      nor.push(n.x, n.y, n.z);
      uv.push(u, (z - zNose) / (zTail - zNose));
    }
  }
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < nr; j++) {
      const a = i * (nr + 1) + j;
      const b = (i + 1) * (nr + 1) + j;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Symmetric airfoil half-thickness (NACA 00xx form, unit thickness). */
const yt = (s: number) => 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);

export interface LoftSection {
  p: [number, number, number];
  chord: number;
  thick: number;
}

/**
 * Lofts an airfoil through sections. axis 'x' — horizontal surfaces (span along x,
 * thickness along y). axis 'y' — vertical fin (span along y, thickness along x).
 */
export function loftAirfoil(sections: LoftSection[], axis: 'x' | 'y' = 'x', n = 28, camber = 0.02) {
  const ring: { s: number; side: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    ring.push({ s: (1 - Math.cos(Math.PI * (1 - t))) / 2, side: 1 }); // TE -> LE (upper)
  }
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    ring.push({ s: (1 - Math.cos(Math.PI * t)) / 2, side: -1 }); // LE -> TE (lower)
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const m = ring.length;
  sections.forEach((sec, k) => {
    for (let i = 0; i < m; i++) {
      const { s, side } = ring[i];
      const th = yt(s) * sec.thick * sec.chord * side;
      const cam = axis === 'x' ? camber * sec.chord * 4 * s * (1 - s) : 0;
      const along = sec.p[2] + s * sec.chord;
      if (axis === 'x') pos.push(sec.p[0], sec.p[1] + th + cam, along);
      else pos.push(sec.p[0] + th, sec.p[1], along);
      uv.push(i / (m - 1), k / (sections.length - 1));
    }
  });
  for (let k = 0; k < sections.length - 1; k++) {
    for (let i = 0; i < m - 1; i++) {
      const a = k * m + i;
      const b = (k + 1) * m + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function mirrorX(g: THREE.BufferGeometry) {
  const m = g.clone();
  m.scale(-1, 1, 1);
  // flip winding
  const index = m.getIndex()!;
  const arr = index.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = t;
  }
  index.needsUpdate = true;
  m.computeVertexNormals();
  return m;
}

export const wingSections = (): LoftSection[] => {
  const sweep = Math.tan((31 * Math.PI) / 180);
  const z0 = -7.5;
  const sec = (x: number, y: number, chord: number, thick: number, extra = 0): LoftSection => ({
    p: [x, y, z0 + (x - 2.4) * sweep + extra],
    chord,
    thick,
  });
  return [
    sec(2.2, -1.75, 11.5, 0.14),
    sec(5.5, -1.55, 9.2, 0.13),
    sec(10.5, -1.15, 6.4, 0.115),
    sec(18, -0.45, 4.4, 0.1),
    sec(26, 0.35, 2.8, 0.09),
    sec(29.6, 0.75, 1.9, 0.085, 0.5),
    sec(31.4, 1.0, 0.95, 0.07, 1.6),
    sec(32.1, 1.08, 0.3, 0.05, 2.6),
    sec(32.25, 1.1, 0.05, 0.03, 2.9),
  ];
};

export const stabSections = (): LoftSection[] => {
  const sweep = Math.tan((36 * Math.PI) / 180);
  const sec = (x: number, y: number, chord: number, thick: number): LoftSection => ({
    p: [x, y, 20.6 + (x - 0.5) * sweep],
    chord,
    thick,
  });
  return [sec(0.4, 1.6, 6.2, 0.11), sec(4, 1.95, 4.2, 0.1), sec(8.6, 2.4, 2.0, 0.085), sec(9.4, 2.45, 0.8, 0.06), sec(9.6, 2.46, 0.08, 0.03)];
};

export const finSections = (): LoftSection[] => {
  const sweep = Math.tan((40 * Math.PI) / 180);
  const sec = (y: number, chord: number, thick: number, extra = 0): LoftSection => ({
    p: [0, y, 18.6 + (y - 2.3) * sweep + extra],
    chord,
    thick,
  });
  return [sec(2.0, 9.6, 0.12), sec(4.5, 7.6, 0.115), sec(8.5, 5.0, 0.1), sec(11.6, 3.2, 0.09), sec(12.0, 2.6, 0.05, 0.25), sec(12.12, 1.6, 0.02, 0.8)];
};

/** Turbofan nacelle profile, revolved around the Z axis. Intake at local z=0. */
export function nacelleGeometry() {
  const pts: THREE.Vector2[] = [];
  // (radius, z) — outer skin from lip to nozzle, then around to inner intake
  const outer: [number, number][] = [
    [1.18, 0.55], [1.2, 0.3], [1.27, 0.08], [1.36, 0.0], [1.45, 0.12], [1.52, 0.5], [1.56, 1.3], [1.55, 2.6], [1.49, 3.9],
    [1.38, 4.9], [1.24, 5.6], [1.16, 5.9],
  ];
  outer.forEach(([r, z]) => pts.push(new THREE.Vector2(r, z)));
  const g = new THREE.LatheGeometry(pts, 72);
  // Lathe revolves around Y — rotate so the axis lies along +Z (intake forward at z=0)
  g.rotateX(Math.PI / 2);
  return g;
}

export function coreGeometry() {
  const pts = [
    [0.02, 8.0], [0.35, 7.6], [0.7, 6.9], [0.86, 6.1], [0.9, 5.4],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts.reverse(), 48);
  g.rotateX(Math.PI / 2);
  return g;
}

export function spinnerGeometry() {
  const pts = [[0.001, -0.25], [0.18, -0.18], [0.32, 0.05], [0.4, 0.4]].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, 32);
  g.rotateX(Math.PI / 2);
  return g;
}

/** A strip of geometry wrapped onto the fuselage cylinder, for decals (wordmark). */
export function wrapDecal(width: number, height: number, zCenter: number, phiCenter: number, side: 1 | -1, lift = 0.012) {
  const g = new THREE.PlaneGeometry(width, height, 48, 8);
  const p = g.attributes.position as THREE.BufferAttribute;
  const R = AC.R + lift;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const phi = phiCenter - py / R;
    const z = side > 0 ? zCenter - px : zCenter + px;
    p.setXYZ(i, side * R * Math.sin(phi), R * Math.cos(phi), z);
  }
  g.computeVertexNormals();
  return g;
}

/** Livery & window textures painted on canvases. u = around (0 top, .25 starboard), v = along (0 nose). */
export function paintLivery(opts: { heroWindowDark?: boolean } = {}) {
  const W = 1024;
  const H = 4096;
  const L = AC.zTail - AC.zNose;
  const C = 2 * Math.PI * AC.R;
  const toY = (z: number) => (1 - (z - AC.zNose) / L) * H;
  const uS = windowPhi / (Math.PI * 2);
  const uP = 1 - uS;

  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const b = base.getContext('2d')!;
  // body colour — midnight upper, deep navy belly
  const grad = b.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#0d121c');
  grad.addColorStop(0.3, '#0e131e');
  grad.addColorStop(0.42, '#141b29');
  grad.addColorStop(0.5, '#171f2e');
  grad.addColorStop(0.58, '#141b29');
  grad.addColorStop(0.7, '#0e131e');
  grad.addColorStop(1, '#0d121c');
  b.fillStyle = grad;
  b.fillRect(0, 0, W, H);

  const emis = document.createElement('canvas');
  emis.width = W;
  emis.height = H;
  const e = emis.getContext('2d')!;
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  const rough = document.createElement('canvas');
  rough.width = 64;
  rough.height = H / 4;

  // champagne cheatlines just below the windows
  const lineU = 0.026;
  b.fillStyle = '#b89a6e';
  for (const u of [uS + lineU, uP - lineU]) b.fillRect(u * W - 1.5, toY(AC.zTail - 3), 3, toY(AC.zNose + 6) - toY(AC.zTail - 3));
  b.fillStyle = 'rgba(200,173,133,0.35)';
  for (const u of [uS + lineU + 0.006, uP - lineU - 0.006]) b.fillRect(u * W - 0.6, toY(AC.zTail - 6), 1.2, toY(AC.zNose + 7) - toY(AC.zTail - 6));

  const winW = (0.3 / C) * W;
  const winH = (0.44 / L) * H;
  const doors = [-18.6, -2.2, 11.8];
  const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let z = -19.6; z <= 13.6; z += 0.98) {
    if (doors.some((d) => Math.abs(d - z) < 0.9)) continue;
    for (const u of [uS, uP]) {
      const x = u * W - winW / 2;
      const y = toY(z) - winH / 2;
      // window surround & glass on base
      b.fillStyle = '#05070b';
      rr(b, x - 1.5, y - 1.5, winW + 3, winH + 3, winW * 0.5);
      b.fill();
      if (opts.heroWindowDark && u === uS && Math.abs(z - AC.heroWindowZ) < 0.5) continue;
      const lit = rnd();
      const level = lit < 0.18 ? 0.18 : lit < 0.45 ? 0.55 : 1;
      const warm = lit < 0.18 ? '120,110,150' : '255,196,130';
      e.fillStyle = `rgba(${warm},${level})`;
      rr(e, x, y, winW, winH, winW * 0.48);
      e.fill();
    }
  }
  // doors — thin outlines
  b.strokeStyle = 'rgba(200,173,133,0.22)';
  b.lineWidth = 1.2;
  for (const d of doors) {
    for (const u of [uS + 0.004, uP - 0.004]) {
      const w = (1.1 / C) * W;
      const h = (1.9 / L) * H;
      rr(b, u * W - w / 2, toY(d) - h / 2, w, h, 6);
      b.stroke();
    }
  }

  const map = new THREE.CanvasTexture(base);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(emis);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 8;
  return { map, emissiveMap };
}

/**
 * Fuselage wordmark. Letters are set individually and the macron is drawn as a bar
 * centred over the O (the composed “Ō” glyph isn't reliable across font subsets).
 * Redrawn once web fonts have loaded so the livery always uses Jost.
 */
export function wordmarkTexture(color = '#C8AD85') {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const draw = () => {
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = color;
    x.textBaseline = 'alphabetic';
    const size = 168;
    x.font = `300 ${size}px Jost, "Helvetica Neue", Arial, sans-serif`;
    const letters = ['S', 'O', 'M', 'N', 'A'];
    const track = size * 0.62;
    const widths = letters.map((l) => x.measureText(l).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (letters.length - 1);
    const base = c.height / 2 + size * 0.36;
    let cx = c.width / 2 - total / 2;
    letters.forEach((l, i) => {
      x.fillText(l, cx, base);
      if (l === 'O') {
        const m = x.measureText('O');
        const cap = m.actualBoundingBoxAscent || size * 0.7;
        const w = size * 0.5;
        const h = Math.max(3, size * 0.055);
        const y = base - cap - size * 0.13;
        x.beginPath();
        x.roundRect(cx + widths[i] / 2 - w / 2, y, w, h, h / 2);
        x.fill();
      }
      cx += widths[i] + track;
    });
  };
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts?.ready.then(() => {
    draw();
    t.needsUpdate = true;
  });
  return t;
}

export function tailMarkTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#E7C99A');
  g.addColorStop(1, '#B8976A');
  x.strokeStyle = g;
  x.fillStyle = g;
  x.lineWidth = 22;
  x.beginPath();
  x.arc(256, 300, 140, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.roundRect(156, 92, 200, 26, 13);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
