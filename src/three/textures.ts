import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Soft radial glow, white — tint via material colour. */
export function glowTexture(size = 128) {
  const key = `glow${size}`;
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** Elliptical floor light pool. */
export function poolTexture() {
  const key = 'pool';
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** Ribbed acoustic panel bump map. */
export function ribTexture() {
  const key = 'rib';
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) {
    const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0);
    g.addColorStop(0, '#404040');
    g.addColorStop(0.5, '#d0d0d0');
    g.addColorStop(1, '#404040');
    x.fillStyle = g;
    x.fillRect(i * 16, 0, 16, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Quilted mattress bump map. */
export function quiltTexture() {
  const key = 'quilt';
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(256, 256);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const g = x.createRadialGradient(i * 64 + 32, j * 64 + 32, 4, i * 64 + 32, j * 64 + 32, 46);
      g.addColorStop(0, '#d8d8d8');
      g.addColorStop(1, '#5a5a5a');
      x.fillStyle = g;
      x.fillRect(i * 64, j * 64, 64, 64);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

/** Soft noise texture used for cloud puffs & dream particles. */
export function cloudPuffTexture() {
  const key = 'puff';
  if (cache.has(key)) return cache.get(key)!;
  const S = 256;
  const [c, x] = canvas(S, S);
  const img = x.createImageData(S, S);
  // layered value noise
  const rnd = (i: number, j: number, s: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (px: number, py: number, s: number) => {
    const i = Math.floor(px), j = Math.floor(py);
    const fx = px - i, fy = py - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = rnd(i, j, s), b = rnd(i + 1, j, s), cc = rnd(i, j + 1, s), d = rnd(i + 1, j + 1, s);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0; y < S; y++)
    for (let xx = 0; xx < S; xx++) {
      const nx = xx / S - 0.5, ny = y / S - 0.5;
      const r = Math.sqrt(nx * nx + ny * ny) * 2;
      let n = 0, amp = 0.5, f = 3;
      for (let o = 0; o < 5; o++) {
        n += noise(nx * f + 10, ny * f + 10, o) * amp;
        amp *= 0.5;
        f *= 2.1;
      }
      const fall = Math.max(0, 1 - r);
      const a = Math.max(0, Math.min(1, (n * 1.25 - 0.32) * 1.6)) * Math.pow(fall, 1.4);
      const k = (y * S + xx) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = a * 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** Small engraved label (capsule numbers, signage). */
export function labelTexture(text: string, opts: { color?: string; bg?: string; w?: number; h?: number; font?: string; sub?: string } = {}) {
  const key = `label:${text}:${opts.color}:${opts.bg}:${opts.sub}`;
  if (cache.has(key)) return cache.get(key)!;
  const w = opts.w ?? 256;
  const h = opts.h ?? 128;
  const [c, x] = canvas(w, h);
  if (opts.bg) {
    x.fillStyle = opts.bg;
    x.fillRect(0, 0, w, h);
  }
  x.fillStyle = opts.color ?? '#C8AD85';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = opts.font ?? `300 ${Math.round(h * 0.46)}px Jost, Helvetica, Arial, sans-serif`;
  x.fillText(text, w / 2, opts.sub ? h * 0.42 : h / 2);
  if (opts.sub) {
    x.font = `400 ${Math.round(h * 0.16)}px "IBM Plex Mono", monospace`;
    x.globalAlpha = 0.7;
    x.fillText(opts.sub, w / 2, h * 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Vertical gradient (used for indirect-lit capsule interiors). */
export function interiorGradient() {
  const key = 'igrad';
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(4, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.08, '#fff3e2');
  g.addColorStop(0.3, '#b9a588');
  g.addColorStop(0.75, '#6d5e4c');
  g.addColorStop(1, '#3c342b');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Fan blade face for engines. */
export function fanTexture() {
  const key = 'fan';
  if (cache.has(key)) return cache.get(key)!;
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#0a0c10';
  x.fillRect(0, 0, 256, 256);
  x.translate(128, 128);
  for (let i = 0; i < 22; i++) {
    x.rotate((Math.PI * 2) / 22);
    const g = x.createLinearGradient(0, 0, 120, 0);
    g.addColorStop(0, '#2a2e36');
    g.addColorStop(1, '#5a606b');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(18, -3);
    x.quadraticCurveTo(70, -14, 124, -10);
    x.lineTo(124, 4);
    x.quadraticCurveTo(70, 2, 18, 4);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
