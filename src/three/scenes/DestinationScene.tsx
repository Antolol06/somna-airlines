import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { director, isOn, post, sharedFog } from '../core';
import { dream } from '../../state/runtime';
import { getState, useStore } from '../../state/store';
import { DESTINATION_PHOTOS } from '../../data/destinations';
import type { CityId } from '../../data/cities';

/**
 * Arrival — a real photograph of the destination, brought to life in a full-screen shader:
 * it opens from warm white (the light flooding out of the capsule), settles into the
 * morning, and drifts slowly forward with a hint of depth between sky and city. Sun bloom,
 * morning haze and a little grain make it feel like a moment rather than a still.
 *
 * Rendered outside the tone-mapping chain (see PostFX) so the photograph's colours stay true.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uImgAspect, uScreenAspect, uT, uTime, uReady;
  uniform vec2 uFocal, uSun, uFrame;
  uniform float uHorizon, uSunGain, uBaseZoom, uSide, uScrim;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    float t = uT;
    float e = 1.0 - (1.0 - t) * (1.0 - t); // ease-out
    // cover-fit, framed so the landmark sits where the typography isn't (uFrame, screen space)
    vec2 f = vec2(min(1.0, uScreenAspect / uImgAspect), min(1.0, uImgAspect / uScreenAspect)) / uBaseZoom;
    vec2 o = clamp(uFocal - uFrame * f, vec2(0.0), 1.0 - f);
    vec2 base = o + vUv * f;
    vec2 c = o + uFrame * f;
    // slow push-in toward the landmark; the city comes forward a little more than the sky (2.5D)
    float ground = 1.0 - smoothstep(uHorizon - 0.1, uHorizon + 0.1, base.y);
    float zoom = 1.0 + e * mix(0.03, 0.065, ground);
    vec2 drift = vec2(0.006, 0.003) * e;
    vec2 uv = clamp(c + drift + (base - c) / zoom, vec2(0.0005), vec2(0.9995));
    vec3 col = texture2D(uMap, uv).rgb;

    // the sun: soft bloom, a gentle anamorphic streak and faint rays
    vec2 d = (uv - uSun) * vec2(uImgAspect, 1.0);
    float r = length(d);
    float pulse = 0.85 + 0.15 * sin(uTime * 0.35);
    float bloom = exp(-r * r * 26.0) * 0.55 + exp(-r * 5.5) * 0.16;
    float streak = exp(-abs(d.y) * 60.0) * exp(-abs(d.x) * 2.6) * 0.12;
    float ang = atan(d.y, d.x);
    float rays = smoothstep(0.55, 1.0, noise(vec2(ang * 7.0, uTime * 0.05))) * exp(-r * 2.2) * 0.12;
    vec3 sunCol = vec3(1.0, 0.72, 0.42);
    col += sunCol * (bloom + streak + rays) * uSunGain * pulse * (0.6 + 0.4 * e);

    // morning haze along the horizon, burning off as the scene settles
    float band = exp(-pow(abs(uv.y - uHorizon) * 5.5, 2.0));
    float mist = fbm(vec2(uv.x * 3.0 + uTime * 0.018, uv.y * 7.0 - uTime * 0.006));
    col = mix(col, vec3(1.0, 0.86, 0.7) * 0.95, band * mist * 0.32 * (1.0 - 0.55 * e));

    // warm morning grade and a soft frame
    col *= vec3(1.035, 1.0, 0.95);
    vec2 v = vUv - 0.5;
    col *= 1.0 - 0.42 * smoothstep(0.35, 0.95, length(v * vec2(1.0, 1.15)));
    // a quiet scrim under the typography (left column on wide screens, bottom on tall ones)
    float sx = uSide > 0.0 ? 1.0 - vUv.x : vUv.x;
    float scrim = uScreenAspect > 1.0
      ? smoothstep(0.7, 0.0, sx) * (0.6 + 0.4 * smoothstep(0.9, 0.2, vUv.y)) + 0.35 * smoothstep(0.35, 0.0, vUv.y)
      : smoothstep(0.62, 0.0, vUv.y);
    col *= 1.0 - min(0.82, 0.64 * uScrim * clamp(scrim, 0.0, 1.0));

    // opens from the warm white of the capsule light
    float open = smoothstep(0.0, 0.2, t);
    col = mix(vec3(1.0, 0.93, 0.82) * 1.05, col * mix(1.6, 1.0, open), open);
    col = mix(vec3(0.03, 0.025, 0.02), col, uReady);

    col += (hash(vUv * 1000.0 + fract(uTime) * 61.0) - 0.5) * 0.018;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

/** Loads (and uploads ahead of time) the photograph for the current destination. */
function usePhoto(city: CityId, gl: THREE.WebGLRenderer) {
  const cache = useRef(new Map<CityId, THREE.Texture>());
  const state = useRef<{ city: CityId | null; tex: THREE.Texture | null }>({ city: null, tex: null });
  useEffect(() => {
    let live = true;
    const have = cache.current.get(city);
    if (have) {
      state.current = { city, tex: have };
      return;
    }
    state.current = { city, tex: null };
    const meta = DESTINATION_PHOTOS[city];
    const loader = new THREE.ImageBitmapLoader();
    loader.setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    loader.load(meta.src, (bmp) => {
      const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      const upload = () => {
        gl.initTexture(tex);
        cache.current.set(city, tex);
        if (live && getState().to === city) state.current = { city, tex };
      };
      (window as any).requestIdleCallback ? (window as any).requestIdleCallback(upload, { timeout: 600 }) : setTimeout(upload, 0);
    });
    return () => {
      live = false;
    };
  }, [city, gl]);
  return state;
}

export function DestinationScene() {
  const gl = useThree((s) => s.gl);
  const group = useRef<THREE.Group>(null);
  const to = useStore((s) => s.to);
  const mode = useStore((s) => s.mode);
  // fetch the photograph as soon as the dream begins (or the destination changes during it)
  const want = mode === 'dream' ? to : null;
  const photo = usePhoto(want ?? to, gl);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uMap: { value: null },
          uImgAspect: { value: 1.5 },
          uScreenAspect: { value: 1.6 },
          uT: { value: 0 },
          uTime: { value: 0 },
          uReady: { value: 0 },
          uFocal: { value: new THREE.Vector2(0.5, 0.5) },
          uSun: { value: new THREE.Vector2(0.5, 0.7) },
          uHorizon: { value: 0.5 },
          uSunGain: { value: 1 },
          uFrame: { value: new THREE.Vector2(0.62, 0.52) },
          uBaseZoom: { value: 1.14 },
          uSide: { value: -1 },
          uScrim: { value: 1 },
        },
      }),
    [],
  );

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('destination');
    if (director.scene !== 'destination') return;
    const u = mat.uniforms;
    const p = photo.current;
    const meta = DESTINATION_PHOTOS[getState().to];
    if (p.tex && u.uMap.value !== p.tex) {
      u.uMap.value = p.tex;
      const img = p.tex.image as { width: number; height: number };
      u.uImgAspect.value = img.width / img.height;
    }
    u.uFocal.value.set(...meta.focal);
    u.uSun.value.set(...meta.sun);
    u.uHorizon.value = meta.horizon;
    u.uSunGain.value = meta.sunGain;
    u.uScreenAspect.value = director.aspect;
    const wide = director.aspect > 1;
    const right = meta.side === 'right';
    u.uFrame.value.set(wide ? (right ? 0.36 : 0.64) : 0.5, wide ? 0.5 : 0.64);
    u.uSide.value = right ? 1 : -1;
    u.uScrim.value = meta.scrim ?? 1;
    u.uBaseZoom.value = wide ? 1.16 : 1.0;
    u.uT.value = dream.arrival;
    u.uTime.value += dt;
    u.uReady.value = Math.min(1, u.uReady.value + (p.tex ? dt * 2 : -dt * 2));
    if (u.uReady.value < 0) u.uReady.value = 0;
    s.scene.background = null;
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    post.bokeh = 0;
    post.raw = true;
  });

  return (
    <group ref={group}>
      <mesh material={mat} frustumCulled={false} renderOrder={-10}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </group>
  );
}
