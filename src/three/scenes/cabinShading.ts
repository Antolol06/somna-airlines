import * as THREE from 'three';
import { TIERS, type TierId } from '../../data/capsules';

/**
 * SŌMNA cabin — layout & lighting model.
 *
 * The aircraft interior is a single continuous corridor made of three cabins, aft to
 * forward: Essential (two-tier capsules), Signature (single-tier, larger capsules) and
 * Grand (full-height suites). Every capsule entrance acts as a small area light whose
 * warm (or, for sleeping guests, deep-blue) glow spills onto the floor, the opposite wall,
 * the lacquered bezels and the vaulted ceiling. Only the rows nearest each pixel are
 * evaluated, so the cost stays flat regardless of cabin length.
 */
export const CAB = {
  aisle: 0.65, // half width of the aisle
  setback: 0.07, // the Essential upper tier steps back with the fuselage curve
  wallTop: 2.22,
  apex: 2.76,
  portalZ: 0.27,
  zStart: 3.0,
};

export interface Zone {
  id: TierId;
  name: string;
  tiers: 1 | 2;
  rows: number;
  pitch: number;
  z0: number; // centre z of row 0
  openW: number;
  openH: number;
  openR: number;
  inner: { w: number; h: number; l: number };
  y: [number, number]; // centre height of tier 0 / tier 1
  offset: number; // first slot index
  gain: number; // light output of each opening
  featured: { row: number; side: 1 | -1; level: 0 | 1 };
  firstRow: number;
}

const ess = TIERS.essential.dims;
const sig = TIERS.signature.dims;
const grd = TIERS.grand.dims;

export const ZONES: Zone[] = [
  {
    id: 'essential', name: 'Essential', tiers: 2, rows: 6, pitch: 1.32, z0: -0.4,
    openW: 0.96, openH: 0.84, openR: 0.32, inner: { w: ess.w, h: ess.h, l: ess.l },
    y: [0.035 + ess.h / 2, 1.145 + ess.h / 2], offset: 0, gain: 1, featured: { row: 3, side: 1, level: 0 }, firstRow: 14,
  },
  {
    id: 'signature', name: 'Signature', tiers: 1, rows: 4, pitch: 1.72, z0: -9.16,
    openW: 1.22, openH: 1.12, openR: 0.42, inner: { w: sig.w, h: sig.h, l: sig.l },
    y: [0.04 + sig.h / 2, 0], offset: 24, gain: 1.25, featured: { row: 1, side: 1, level: 0 }, firstRow: 6,
  },
  {
    id: 'grand', name: 'Grand', tiers: 1, rows: 3, pitch: 2.4, z0: -17.08,
    openW: 1.76, openH: 1.6, openR: 0.56, inner: { w: grd.w, h: grd.h, l: grd.l },
    y: [0.04 + grd.h / 2, 0], offset: 32, gain: 1.5, featured: { row: 1, side: 1, level: 0 }, firstRow: 1,
  },
];
export const ZONE: Record<TierId, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<TierId, Zone>;
export const SLOTS = 38;
export const zoneStart = (z: Zone) => z.z0 + z.pitch / 2;
export const zoneEnd = (z: Zone) => z.z0 - (z.rows - 1) * z.pitch - z.pitch / 2;
export const rowZ = (z: Zone, i: number) => z.z0 - i * z.pitch;
export const END_Z = zoneEnd(ZONES[2]) - 0.5;
/** Thresholds (archways) between cabins. */
export const THRESHOLDS = [zoneEnd(ZONES[0]) - 0.3, zoneEnd(ZONES[1]) - 0.3];
export const faceX = (z: Zone, level: number) => CAB.aisle + (level === 1 ? CAB.setback : 0);

/** Shared uniforms: one update per frame drives every cabin material. */
export const cabinU = {
  uSlot: { value: new Float32Array(SLOTS * 2) }, // (level, hue) per capsule
  uZone: { value: ZONES.map((z) => new THREE.Vector4(z.z0, z.pitch, z.rows, z.offset)) },
  uZoneY: { value: ZONES.map((z) => new THREE.Vector4(z.y[0], z.y[1], z.tiers, z.gain)) },
  uAisle: { value: CAB.aisle },
  uSetback: { value: CAB.setback },
  uWarm: { value: new THREE.Color('#ffc58a') },
  uBlue: { value: new THREE.Color('#6f80d8') },
  uWave: { value: 10 },
  uCove: { value: 1 },
  uNight: { value: 0 }, // dream "night service" dimming
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color('#150f0a') },
  uFogNear: { value: 8 },
  uFogFar: { value: 30 },
};

const ZONE_B1 = THRESHOLDS[0].toFixed(3);
const ZONE_B2 = THRESHOLDS[1].toFixed(3);

export const spillGLSL = (range: number) => /* glsl */ `
uniform vec2 uSlot[${SLOTS}];
uniform vec4 uZone[3];
uniform vec4 uZoneY[3];
uniform float uAisle, uSetback, uWave, uCove, uNight, uTime;
uniform vec3 uWarm, uBlue;
vec3 capsuleSpill(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int zi = 0; zi < 3; zi++) {
    vec4 Z = uZone[zi];
    vec4 Y = uZoneY[zi];
    float zEnd = Z.x - (Z.z - 1.0) * Z.y;
    if (p.z > Z.x + 3.5 || p.z < zEnd - 3.5) continue;
    int rows = int(Z.z + 0.5);
    int off = int(Z.w + 0.5);
    int tiers = int(Y.z + 0.5);
    int c = int(floor((Z.x - p.z) / Z.y + 0.5));
    for (int k = -${range}; k <= ${range}; k++) {
      int i = c + k;
      if (i < 0 || i >= rows) continue;
      float z = Z.x - float(i) * Z.y;
      for (int s = 0; s < 2; s++) {
        float side = s == 0 ? 1.0 : -1.0;
        for (int l = 0; l < 2; l++) {
          if (l >= tiers) continue;
          vec2 slot = uSlot[off + (i * 2 + s) * tiers + l];
          if (slot.x < 0.01) continue;
          vec3 lp = vec3(side * (uAisle + (l == 1 ? uSetback : 0.0) + 0.06), l == 1 ? Y.y : Y.x, z);
          vec3 L = lp - p;
          float d2 = dot(L, L);
          vec3 ld = L * inversesqrt(d2);
          float emit = max(side * ld.x, 0.0);
          float recv = max(dot(n, ld), 0.0);
          acc += mix(uWarm, uBlue, slot.y) * slot.x * Y.w * emit * emit * recv / (0.3 + d2 * 2.2);
        }
      }
    }
  }
  return acc;
}
// concealed architectural line lights (per cabin): tier ledge, overhead-cabinet underside, cornice
vec3 wallWash(vec3 p) {
  float on = smoothstep(uWave - 0.7, uWave + 0.7, p.z) * uCove * (1.0 - 0.55 * uNight);
  float inE = step(${ZONE_B1}, p.z);
  float inS = step(${ZONE_B2}, p.z) * (1.0 - inE);
  float ledgeY = mix(1.32, 1.105, inE);
  float ledge = exp(-max(ledgeY - p.y, 0.0) * 6.5) * step(p.y, ledgeY) * (inE + inS);
  float top = exp(-max(2.19 - p.y, 0.0) * 5.5) * step(ledgeY + 0.02, p.y);
  return uWarm * (ledge * 0.32 + top * 0.26) * on;
}
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;

/** Adds capsule spill light (and optionally wall washes / bezel lip glow) to a standard material. */
export function withSpill(
  mat: THREE.MeshStandardMaterial,
  opts: { wash?: boolean; lip?: { half: [number, number]; r: number }; gain?: number; range?: number } = {},
) {
  const gain = (opts.gain ?? 1).toFixed(3);
  const range = opts.range ?? 2;
  const lipKey = opts.lip ? `${opts.lip.half[0].toFixed(3)}_${opts.lip.half[1].toFixed(3)}_${opts.lip.r.toFixed(3)}` : '';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, cabinU);
    const decl = `varying vec3 vSpillPos; varying vec3 vSpillN;${opts.lip ? ' varying vec2 vBezelQ;' : ''}`;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${decl}`).replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 spP = vec4(transformed, 1.0);
      vec3 spN = objectNormal;
      #ifdef USE_INSTANCING
        spP = instanceMatrix * spP;
        spN = mat3(instanceMatrix) * spN;
      #endif
      vSpillPos = (modelMatrix * spP).xyz;
      vSpillN = normalize(mat3(modelMatrix) * spN);
      ${opts.lip ? 'vBezelQ = vec2(-position.z, position.y);' : ''}`,
    );
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${decl}\n${spillGLSL(range)}`);
    const lip = opts.lip
      ? `{
          #ifdef USE_INSTANCING_COLOR
            float lv = vColor.r; float hue = vColor.g;
          #else
            float lv = 0.0; float hue = 0.0;
          #endif
          float dd = sdRoundBox(vBezelQ, vec2(${opts.lip.half[0].toFixed(4)}, ${opts.lip.half[1].toFixed(4)}), ${opts.lip.r.toFixed(4)});
          totalEmissiveRadiance += mix(uWarm, uBlue, hue) * lv * exp(-max(dd, 0.0) * 22.0) * 0.75;
        }`
      : '';
    frag = frag.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += (capsuleSpill(vSpillPos, normalize(vSpillN))${opts.wash ? ' + wallWash(vSpillPos)' : ''}) * diffuseColor.rgb * ${gain};
      ${lip}`,
    );
    if (opts.lip) frag = frag.replace('#include <color_fragment>', '');
    shader.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => `spill-${opts.wash ? 'w' : ''}${lipKey}-${gain}-${range}`;
  return mat;
}

const fogGLSL = /* glsl */ `
uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
vec3 applyFog(vec3 col, vec3 w) { return mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(w - cameraPosition))); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
`;

const worldVS = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

/** Charcoal wool carpet with a lighter runner, champagne inlay and LED path light. */
export function floorMaterial(range: number) {
  return new THREE.ShaderMaterial({
    uniforms: cabinU as any,
    vertexShader: worldVS,
    fragmentShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      ${fogGLSL}
      ${spillGLSL(range)}
      void main(){
        vec3 p = vW;
        float n1 = vnoise(p.xz * 9.0);
        float fib = hash12(floor(p.xz * 420.0));
        vec3 base = vec3(0.125, 0.11, 0.098) * (0.86 + 0.14 * n1) * (0.93 + 0.07 * fib);
        float runner = 1.0 - smoothstep(0.355, 0.362, abs(p.x));
        base = mix(base, vec3(0.205, 0.182, 0.158) * (0.9 + 0.1 * n1) * (0.95 + 0.05 * fib), runner);
        float inlay = 1.0 - smoothstep(0.0, 0.005, abs(abs(p.x) - 0.37));
        float on = smoothstep(uWave - 0.8, uWave + 0.8, p.z) * uCove * (1.0 - 0.5 * uNight);
        vec3 light = vec3(0.09, 0.075, 0.062);
        light += capsuleSpill(p, vec3(0.0, 1.0, 0.0)) * 1.5;
        float inCabin = 1.0 - smoothstep(0.25, 0.65, p.z);
        light += vec3(1.0, 0.72, 0.42) * exp(-abs(uAisle - abs(p.x)) * 10.0) * 0.7 * inCabin;
        light += vec3(1.0, 0.86, 0.66) * 0.16 * on;
        vec3 col = base * light * 2.3 + vec3(0.85, 0.68, 0.45) * inlay * (0.08 + 0.3 * on);
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

/** Vaulted fabric ceiling washed by the coves, with a fibre-optic starlight field. */
export function ceilingMaterial(range: number) {
  return new THREE.ShaderMaterial({
    uniforms: cabinU as any,
    side: THREE.DoubleSide,
    vertexShader: worldVS,
    fragmentShader: /* glsl */ `
      varying vec3 vW; varying vec3 vN;
      ${fogGLSL}
      ${spillGLSL(range)}
      void main(){
        float ax = clamp(abs(vW.x) / (uAisle + uSetback), 0.0, 1.0);
        float on = smoothstep(uWave - 0.8, uWave + 0.8, vW.z) * uCove * (1.0 - 0.55 * uNight);
        float wash = exp(-(1.0 - ax) * 3.4);
        vec3 fabric = vec3(0.88, 0.82, 0.74) * (0.96 + 0.04 * vnoise(vW.xz * 30.0));
        vec3 col = fabric * (0.035 + (0.1 + 1.05 * wash) * on);
        col += capsuleSpill(vW, normalize(vN)) * fabric * 0.9;
        vec2 g = vW.xz * 22.0;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float r = hash12(id);
        float d = length(f - (vec2(hash12(id + 7.1), hash12(id + 3.3)) - 0.5) * 0.5);
        float tw = 0.55 + 0.45 * sin(uTime * (0.7 + r * 2.4) + r * 40.0);
        float star = step(0.982, r) * smoothstep(0.16, 0.0, d) * tw;
        star *= smoothstep(0.8, 0.35, ax) * (1.0 - smoothstep(8.0, 18.0, length(vW - cameraPosition)));
        col += vec3(1.0, 0.92, 0.8) * star * (1.2 + 0.8 * on + 0.8 * uNight);
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

/** Self-lit capsule interiors (instanced): liner, cove line, ceiling display, back window. */
export function interiorMaterial(z: Zone, liner: string, band: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...cabinU,
      uHalf: { value: new THREE.Vector2(z.inner.w / 2, z.inner.h / 2) },
      uDepth: { value: z.inner.l },
      uLiner: { value: new THREE.Color(liner) },
      uBand: { value: new THREE.Color(band) },
    } as any,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vColor; varying vec3 vW;
      void main(){
        vLocal = position;
        vColor = vec3(0.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vColor; varying vec3 vW;
      uniform vec2 uHalf; uniform float uDepth; uniform vec3 uWarm, uBlue, uLiner, uBand; uniform float uTime;
      ${fogGLSL}
      float sdRB(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        float depth = clamp(vLocal.x / uDepth, 0.0, 1.0);
        vec2 q = vec2(-vLocal.z, vLocal.y);
        float lv = vColor.r;
        vec3 tint = mix(uWarm, uBlue, vColor.g);
        float hy = clamp(q.y / uHalf.y * 0.5 + 0.5, 0.0, 1.0);
        float b = 0.2 + 0.62 * pow(hy, 1.25);
        float cq = (hy - 0.93) * 16.0;
        b += 0.95 * exp(-cq * cq) * (1.0 - depth * 0.45);
        b *= 0.62 + 0.38 * (1.0 - depth);
        float corner = (abs(q.x) / uHalf.x) * (abs(q.y) / uHalf.y);
        b *= 1.0 - 0.38 * smoothstep(0.5, 0.95, corner);
        float side = step(uHalf.x * 0.9, abs(q.x));
        b *= 0.965 + 0.035 * sin((side > 0.5 ? q.y : q.x) * 150.0);
        // lower band (headboard / upholstered dado) in the cabin's accent material
        vec3 liner = mix(uBand, uLiner, smoothstep(0.24, 0.3, hy));
        liner = mix(liner, vec3(1.0), 0.12 * hy);
        vec3 col = liner * b * mix(vec3(1.0), tint, 0.62) * (0.1 + 1.12 * lv);
        float onTop = smoothstep(0.86, 0.97, hy);
        float scr = onTop * step(0.2, depth) * step(depth, 0.38) * step(abs(q.x), uHalf.x * 0.36);
        vec3 scrCol = vec3(0.06, 0.07, 0.11) + tint * 0.22 * (0.6 + 0.4 * sin(uTime * 0.7));
        col = mix(col, scrCol * (0.3 + lv), scr * 0.92);
        if (depth > 0.992) {
          vec2 wq = q - vec2(0.0, uHalf.y * 0.24);
          vec2 wb = vec2(uHalf.x * 0.21, uHalf.x * 0.3);
          float win = 1.0 - smoothstep(0.0, 0.008, sdRB(wq, wb, wb.x * 0.8));
          vec3 sky = mix(vec3(0.015, 0.02, 0.05), vec3(0.07, 0.1, 0.22), clamp(wq.y * 2.6 + 0.4, 0.0, 1.0));
          float st = step(0.985, hash12(floor(q * 90.0))) * 0.8;
          float frame = 1.0 - smoothstep(0.0, 0.012, abs(sdRB(wq, wb, wb.x * 0.8) + 0.006));
          col = mix(col, sky + st, win);
          col = mix(col, liner * 0.55 * (0.2 + lv), frame * 0.6);
        }
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

/** Instanced soft goods (mattress, pillow, blanket) lit by their capsule. */
export function fabricMaterial(base: string, quilt = false) {
  return new THREE.ShaderMaterial({
    uniforms: { ...cabinU, uBase: { value: new THREE.Color(base) } } as any,
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vColor; varying vec3 vW; varying vec3 vNl;
      void main(){
        vLocal = position; vNl = normal;
        vColor = vec3(0.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vColor; varying vec3 vW; varying vec3 vNl;
      uniform vec3 uBase, uWarm, uBlue;
      ${fogGLSL}
      void main(){
        float lv = vColor.r;
        vec3 tint = mix(vec3(1.0), mix(uWarm, uBlue, vColor.g), 0.55);
        float top = smoothstep(-0.2, 0.9, vNl.y);
        float b = 0.32 + 0.68 * top;
        ${quilt ? 'b *= 0.9 + 0.1 * smoothstep(0.0, 0.08, abs(fract(vLocal.x * 3.2) - 0.5)) * smoothstep(0.0, 0.08, abs(fract(vLocal.z * 3.2) - 0.5));' : ''}
        vec3 col = uBase * b * tint * (0.12 + 1.05 * lv);
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

/** Frosted privacy blinds / suite doors glowing from within (instanced colour = glow). */
export function blindMaterial(glow?: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...cabinU, uGlow: { value: glow ?? new THREE.Color(1, 1, 1) }, uSingle: { value: glow ? 1 : 0 } } as any,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vColor; varying vec3 vW;
      void main(){
        vUv = uv;
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vColor; varying vec3 vW;
      uniform vec3 uGlow; uniform float uSingle;
      ${fogGLSL}
      void main(){
        vec3 glowC = mix(vColor, uGlow, uSingle);
        // a fabric shade, lit from behind: brighter toward the hem, darker under the roller,
        // soft pleats and shaded edges — never a flat field of colour (no high-frequency
        // detail: it would alias into shimmer as the camera moves)
        float g = 0.5 + 0.5 * smoothstep(0.95, 0.05, vUv.y);
        float pleat = 0.9 + 0.1 * smoothstep(0.15, 0.5, abs(fract(vUv.y * 12.0) - 0.5));
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        vec3 fabric = vec3(0.2, 0.17, 0.14);
        vec3 col = (fabric * 0.55 + glowC * 0.75) * g * pleat * (0.78 + 0.22 * edge);
        col += glowC * 0.45 * smoothstep(0.07, 0.0, vUv.y);
        gl_FragColor = vec4(applyFog(col, vW), 1.0);
      }`,
  });
}

/** Wave-gated emissive lines (coves, LED strips). */
export function coveMaterial(color: string, gain: number, gated = true) {
  return new THREE.ShaderMaterial({
    uniforms: { ...cabinU, uColor: { value: new THREE.Color(color).multiplyScalar(gain) } } as any,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vW; uniform vec3 uColor; uniform float uWave, uCove, uNight;
      ${fogGLSL}
      void main(){
        float on = ${gated ? 'smoothstep(uWave - 0.4, uWave + 0.4, vW.z) * uCove * (1.0 - 0.5 * uNight)' : '1.0'};
        gl_FragColor = vec4(applyFog(uColor * (0.04 + 0.96 * on), vW), 1.0);
      }`,
  });
}
