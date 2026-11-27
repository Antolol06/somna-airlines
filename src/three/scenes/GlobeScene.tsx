import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CITIES, CITY, latLonToXYZ, type CityId } from '../../data/cities';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, sharedFog } from '../core';
import { domRegistry, pointer, scroll } from '../../state/runtime';
import { getState, useStore } from '../../state/store';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../../lib/math';
import { noiseGLSL } from '../shaders/noise';
import { StarField } from '../models/Atmosphere';
import { MiniPlane } from '../models/Aircraft';
import { glowTexture } from '../textures';

/**
 * Interactive Earth.
 * Performance notes:
 *  - clouds are baked once into an equirectangular texture on the GPU (the previous
 *    version evaluated ~10 octaves of 3D simplex noise per pixel, every frame);
 *  - textures are uploaded as soon as they load, not on first display;
 *  - drag maps screen pixels to arc length on the sphere and keeps time-based inertia;
 *  - DOM labels are only touched when their position or visibility actually changes.
 */
export const globeState = {
  yaw: 0.6,
  pitch: 0.3,
  vy: 0, // rad / s
  vp: 0,
  target: null as null | { yaw: number; pitch: number },
  dragging: false,
  lastX: 0,
  lastY: 0,
  moved: 0,
  pxRadius: 300,
  samples: [] as { t: number; yaw: number; pitch: number }[],
  arc: 0,
  head: 0,
  routeKey: '',
};

const SUN = new THREE.Vector3(-0.92, 0.3, 0.26).normalize();
if (typeof window !== 'undefined') (window as any).__somnaDragging = () => globeState.dragging;

function routeCurve(from: CityId, to: CityId) {
  const a = new THREE.Vector3(...latLonToXYZ(CITY[from].lat, CITY[from].lon, 1));
  const b = new THREE.Vector3(...latLonToXYZ(CITY[to].lat, CITY[to].lon, 1));
  const omega = Math.acos(clamp(a.dot(b), -1, 1));
  const lift = 0.05 + 0.16 * (omega / Math.PI);
  const pts: THREE.Vector3[] = [];
  const n = 72;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3();
    if (omega < 1e-4) p.copy(a);
    else {
      const s = Math.sin(omega);
      p.copy(a).multiplyScalar(Math.sin((1 - t) * omega) / s).add(b.clone().multiplyScalar(Math.sin(t * omega) / s));
    }
    p.normalize().multiplyScalar(1.008 + lift * Math.sin(Math.PI * t));
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // pre-sample positions & tangents so the animation does no curve maths per frame
  const S = 240;
  const samples = new Float32Array((S + 1) * 6);
  const v = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    curve.getPointAt(i / S, v);
    samples.set([v.x, v.y, v.z], i * 6);
    curve.getTangentAt(i / S, v);
    samples.set([v.x, v.y, v.z], i * 6 + 3);
  }
  return { curve, samples, S, a, b, mid: a.clone().add(b).normalize() };
}

export function focusOn(v: THREE.Vector3) {
  const lat = Math.asin(clamp(v.y, -1, 1));
  const lon = Math.atan2(-v.z, v.x);
  globeState.target = { yaw: -Math.PI / 2 - lon + 0.12, pitch: clamp(lat * 0.85, -0.6, 0.6) };
}

/** One-time GPU bake of two cloud layers (R & G) into an equirectangular target. */
function bakeClouds(gl: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget) {
  const mat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${noiseGLSL}
      float cfbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*snoise(p); p=p*2.07+vec3(1.3,7.1,2.9); a*=0.5; } return s; }
      void main(){
        // same mapping as THREE.SphereGeometry
        float phi = vUv.x * 6.28318530718;
        float theta = (1.0 - vUv.y) * 3.14159265359;
        vec3 o = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
        float lat = o.y;
        vec3 q = o * 2.3;
        float warp = cfbm(q * 0.8);
        float d1 = cfbm(q + warp * 0.6);
        float d2 = cfbm(o * 3.4 + vec3(4.1, -2.3, 7.7) + warp * 0.4);
        float bands = 0.1 * cos(lat * 9.0) + 0.08 * exp(-(lat * 9.0) * (lat * 9.0)) - 0.06;
        gl_FragColor = vec4(d1 * 0.5 + 0.5 + bands, d2 * 0.5 + 0.5 + bands, 0.0, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.render(sc, cam);
  gl.setRenderTarget(prev);
  mat.dispose();
  quad.geometry.dispose();
}

export function GlobeScene() {
  const group = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Group>(null);
  const quality = useStore((s) => s.quality);
  const from = useStore((s) => s.from);
  const to = useStore((s) => s.to);
  const gl = useThree((s) => s.gl);
  // ImageBitmapLoader decodes the 4K JPEGs off the main thread (no decode stall on first upload)
  const bitmaps = useLoader(THREE.ImageBitmapLoader, ['/textures/earth-blue-marble.jpg', '/textures/earth-night.jpg', '/textures/earth-water.png'], (l) =>
    (l as THREE.ImageBitmapLoader).setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' }),
  ) as unknown as ImageBitmap[];
  const high = quality === 'high';
  const [day, night, water] = useMemo(
    () =>
      bitmaps.map((b, i) => {
        const t = new THREE.Texture(b as any);
        t.flipY = false;
        t.colorSpace = i < 2 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = i < 2 ? (high ? 8 : 4) : 2;
        t.needsUpdate = true;
        return t;
      }),
    [bitmaps, high],
  );
  // upload one texture per idle slot rather than all at once
  useEffect(() => {
    const ric: (cb: () => void) => number = (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 60));
    let alive = true;
    [day, night, water].forEach((t, i) => window.setTimeout(() => ric(() => alive && gl.initTexture(t)), i * 120));
    return () => {
      alive = false;
    };
  }, [gl, day, night, water]);

  // clouds are baked once, during an idle moment, into a mip-mapped texture
  const clouds = useMemo(
    () =>
      new THREE.WebGLRenderTarget(high ? 2048 : 1024, high ? 1024 : 512, {
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
      }),
    [high],
  );
  useEffect(() => {
    const ric: (cb: () => void) => number = (window as any).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 80));
    let alive = true;
    window.setTimeout(() => ric(() => alive && bakeClouds(gl, clouds)), 400);
    return () => {
      alive = false;
      clouds.dispose();
    };
  }, [gl, clouds]);

  const uniforms = useMemo(
    () => ({
      uDay: { value: day },
      uNight: { value: night },
      uWater: { value: water },
      uClouds: { value: clouds.texture },
      uSun: { value: SUN.clone() },
      uTime: { value: 0 },
    }),
    [day, night, water, clouds],
  );

  const mats = useMemo(() => {
    const earthMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uDay, uNight, uWater, uClouds; uniform vec3 uSun; uniform float uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){
          vec3 n0 = normalize(vN);
          vec3 n = n0;
          vec3 V = normalize(cameraPosition - vP);
          float mu = dot(n0, uSun);
          float dayMix = smoothstep(-0.16, 0.22, mu);
          vec3 dayCol = texture2D(uDay, vUv).rgb;
          vec3 nightCol = texture2D(uNight, vUv, 0.8).rgb; // biased mip: no sub-pixel sparkle
          float w = texture2D(uWater, vUv).r;
          // soft cloud shadows from the baked layer
          float cs = smoothstep(0.5, 0.8, texture2D(uClouds, vUv + vec2(uTime * 0.0016 + 0.004, 0.0)).r);
          float diff = max(dot(n, uSun), 0.0);
          // diffuse land/sea stays under the bloom threshold (bright deserts must not halo);
          // only the small ocean glint and city lights are allowed to bloom
          vec3 col = min(dayCol * (diff * 1.35 + 0.015) * (1.0 - cs * 0.35), vec3(0.88));
          vec3 H = normalize(uSun + V);
          float sp = pow(max(dot(n0, H), 0.0), 70.0) * w;
          col += vec3(1.0, 0.86, 0.66) * sp * 0.85 * dayMix;
          col = mix(col, col * vec3(0.78, 0.9, 1.08), w * 0.35);
          float tq = (mu - 0.02) * 7.0; float term = exp(-tq * tq);
          col += dayCol * vec3(1.0, 0.42, 0.18) * term * 0.22;
          vec3 lights = min(pow(nightCol, vec3(1.5)) * vec3(1.0, 0.72, 0.42) * 2.2, vec3(1.15));
          col += lights * (1.0 - dayMix) * (1.0 - w * 0.8);
          float fres = pow(1.0 - max(dot(n0, V), 0.0), 2.6);
          vec3 haze = mix(vec3(0.02, 0.05, 0.12), vec3(0.36, 0.6, 1.0), smoothstep(-0.25, 0.4, mu));
          haze = mix(haze, vec3(1.0, 0.5, 0.25), term * 0.6);
          col = mix(col, haze, fres * 0.75);
          gl_FragColor = vec4(clamp(col, 0.0, 4.0), 1.0);
        }`,
    });
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun, uTime: uniforms.uTime, uClouds: uniforms.uClouds },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime; uniform sampler2D uClouds;
        varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){
          float a = texture2D(uClouds, vUv + vec2(uTime * 0.0016, 0.0)).r;
          float b = texture2D(uClouds, vUv + vec2(uTime * 0.0009 + 0.37, 0.0)).g;
          float c = smoothstep(0.5, 0.8, a * 0.62 + b * 0.42);
          vec3 N = normalize(vN);
          float mu = dot(N, uSun);
          float lit = smoothstep(-0.12, 0.3, mu);
          vec3 V = normalize(cameraPosition - vP);
          // lit cloud tops stay just under the bloom threshold: large cloud masses must never
          // flare into soft white halos as they rotate into the sun
          vec3 col = mix(vec3(0.05, 0.06, 0.09), vec3(0.86, 0.87, 0.89), lit);
          col = mix(col, vec3(0.9, 0.56, 0.36), exp(-((mu - 0.03) * 7.0) * ((mu - 0.03) * 7.0)) * 0.6);
          float edge = smoothstep(0.0, 0.25, dot(N, V));
          gl_FragColor = vec4(clamp(col, 0.0, 0.9), clamp(c * 0.74 * edge, 0.0, 1.0));
        }`,
    });
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      vertexShader: /* glsl */ `varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vP;
        void main(){
          vec3 C = cameraPosition; vec3 D = normalize(vP - C);
          float t = -dot(C, D);
          vec3 P = C + D * t;
          float d = length(P);
          float x = clamp((d - 1.0) / 0.16, 0.0, 1.0);
          float glow = pow(1.0 - x, 3.2) * step(1.0, d + 0.002);
          float mu = dot(normalize(P), uSun);
          vec3 col = mix(vec3(0.02, 0.04, 0.1), vec3(0.32, 0.58, 1.0), smoothstep(-0.3, 0.35, mu));
          col = mix(col, vec3(1.0, 0.52, 0.26), exp(-(mu * 5.0) * (mu * 5.0)) * 0.7);
          gl_FragColor = vec4(clamp(col * glow * 1.6, 0.0, 3.0), 1.0);
        }`,
    });
    return { earthMat, cloudMat, atmoMat };
  }, [uniforms, high]);

  // route
  const route = useMemo(() => routeCurve(from, to), [from, to]);
  const arcGeo = useMemo(() => new THREE.TubeGeometry(route.curve, 120, 0.0042, 6, false), [route]);
  const ghostGeo = useMemo(() => new THREE.TubeGeometry(route.curve, 80, 0.0016, 4, false), [route]);
  useEffect(
    () => () => {
      arcGeo.dispose();
      ghostGeo.dispose();
    },
    [arcGeo, ghostGeo],
  );
  const arcMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uP: { value: 0 }, uHead: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `uniform float uP, uHead; varying vec2 vUv;
          void main(){ float s = vUv.x; float drawn = 1.0 - smoothstep(uP - 0.02, uP, s);
            float pq = (s - uHead) * 22.0; float pulse = exp(-pq * pq);
            vec3 col = vec3(1.0, 0.78, 0.5) * (0.9 + pulse * 3.5);
            gl_FragColor = vec4(col, drawn * (0.55 + pulse * 0.45)); }`,
      }),
    [],
  );

  useEffect(() => {
    const key = `${from}-${to}`;
    if (globeState.routeKey !== key) {
      globeState.routeKey = key;
      globeState.arc = 0;
      focusOn(route.mid);
    }
  }, [from, to, route]);

  // drag — pixels map to arc length on the visible sphere, release keeps the real velocity
  useEffect(() => {
    const el = gl.domElement;
    const sample = () => {
      const now = performance.now();
      const s = globeState.samples;
      s.push({ t: now, yaw: globeState.yaw, pitch: globeState.pitch });
      while (s.length > 2 && now - s[0].t > 100) s.shift();
    };
    const down = (e: PointerEvent) => {
      if (director.scene !== 'globe') return;
      globeState.dragging = true;
      globeState.lastX = e.clientX;
      globeState.lastY = e.clientY;
      globeState.moved = 0;
      globeState.vy = globeState.vp = 0;
      globeState.samples.length = 0;
      sample();
    };
    const move = (e: PointerEvent) => {
      if (!globeState.dragging) return;
      const dx = e.clientX - globeState.lastX;
      const dy = e.clientY - globeState.lastY;
      globeState.lastX = e.clientX;
      globeState.lastY = e.clientY;
      globeState.moved += Math.abs(dx) + Math.abs(dy);
      if (globeState.moved > 4) globeState.target = null;
      const k = 1 / Math.max(80, globeState.pxRadius);
      globeState.yaw += dx * k;
      if (e.pointerType !== 'touch') globeState.pitch = clamp(globeState.pitch + dy * k * 0.85, -1.1, 1.1);
      sample();
    };
    const up = () => {
      if (!globeState.dragging) return;
      globeState.dragging = false;
      const s = globeState.samples;
      if (s.length >= 2) {
        const a = s[0];
        const b = s[s.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        globeState.vy = clamp((b.yaw - a.yaw) / dt, -6, 6);
        globeState.vp = clamp((b.pitch - a.pitch) / dt, -4, 4);
        if (performance.now() - b.t > 90) globeState.vy = globeState.vp = 0;
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  const markers = useMemo(
    () =>
      CITIES.map((c) => {
        const v = new THREE.Vector3(...latLonToXYZ(c.lat, c.lon, 1.0025));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
        return {
          id: c.id,
          v,
          q,
          ring: new THREE.MeshBasicMaterial({ color: new THREE.Color('#E7AE70').multiplyScalar(1.6), toneMapped: false, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
          last: { x: -1, y: -1, vis: '' },
        };
      }),
    [],
  );
  const markerMats = useMemo(
    () => ({
      dot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#F2EDE4').multiplyScalar(1.4), toneMapped: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      sel: new THREE.MeshBasicMaterial({ color: new THREE.Color('#E7AE70').multiplyScalar(2.2), toneMapped: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      sun: new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color('#fff1d6').multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      ghost: new THREE.MeshBasicMaterial({ color: '#C8AD85', transparent: true, opacity: 0.18, depthWrite: false }),
    }),
    [],
  );
  const ringRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const plane = useRef<THREE.Group>(null);
  const tmp = useMemo(
    () => ({ v: new THREE.Vector3(), n: new THREE.Vector3(), up: new THREE.Vector3(), tgt: new THREE.Vector3(), p: new THREE.Vector3(), t: new THREE.Vector3(), m: new THREE.Matrix4(), o: new THREE.Vector3() }),
    [],
  );
  const wasActive = useRef(false);

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('globe');
    const active = director.scene === 'globe';
    if (!active) {
      if (wasActive.current) {
        markers.forEach((mk) => {
          const el = domRegistry.get(`city-${mk.id}`);
          if (el) el.dataset.visible = '0';
          mk.last.vis = '0';
        });
      }
      wasActive.current = false;
      return;
    }
    if (!wasActive.current) {
      wasActive.current = true;
      globeState.arc = 0;
      if (!globeState.target) focusOn(route.mid);
    }
    const st = getState();
    const p = scroll.progress.globe;
    const step = Math.min(dt, 1 / 20);
    uniforms.uTime.value += step;

    // rotation
    if (!globeState.dragging) {
      if (globeState.target) {
        globeState.yaw = dampAngle(globeState.yaw, globeState.target.yaw, 3.2, step);
        globeState.pitch = damp(globeState.pitch, globeState.target.pitch, 3.2, step);
        globeState.vy = globeState.vp = 0;
      } else {
        globeState.yaw += globeState.vy * step;
        globeState.pitch = clamp(globeState.pitch + globeState.vp * step, -1.1, 1.1);
        const decay = Math.exp(-2.6 * step);
        globeState.vy *= decay;
        globeState.vp *= decay;
        if (Math.abs(globeState.vy) < 0.02 && !st.reducedMotion) globeState.yaw += step * 0.025;
      }
    }
    const e = earth.current!;
    e.rotation.set(globeState.pitch, wrapAngle(globeState.yaw), 0, 'XYZ');
    e.updateMatrixWorld();

    // camera
    const portrait = director.aspect < 1;
    const dist = lerp(9.5, portrait ? 5.6 : 4.55, smoothstep(0.0, 0.2, p)) + smoothstep(0.86, 1.0, p) * 1.8;
    pointer.sx = damp(pointer.sx, pointer.x, 2, step);
    pointer.sy = damp(pointer.sy, pointer.y, 2, step);
    tmp.p.set(pointer.sx * 0.08, 0.04 + pointer.sy * 0.05, dist);
    tmp.t.set(0, 0, 0);
    const fov = fitFov(34, director.aspect, 0.9);
    aimCamera(s.camera as THREE.PerspectiveCamera, tmp.p, tmp.t, fov, 0, portrait ? 0 : 0.2, portrait ? -0.2 : 0.0);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.01) {
      cam.near = 0.01;
      cam.far = 500;
      cam.updateProjectionMatrix();
    }
    globeState.pxRadius = s.size.height / 2 / (dist * Math.tan((fov * Math.PI) / 360));

    // arc + miniature aircraft (pre-sampled path)
    globeState.arc = Math.min(1, globeState.arc + step * 0.55);
    globeState.head = (globeState.head + step * 0.16) % 1;
    const drawn = smoothstep(0.25, 1.0, globeState.arc);
    arcMat.uniforms.uP.value = drawn * 1.02;
    const head = drawn >= 0.999 ? globeState.head : drawn * 0.98;
    arcMat.uniforms.uHead.value = head;
    const pl = plane.current;
    if (pl) {
      const fi = head * route.S;
      const i0 = Math.min(route.S - 1, Math.floor(fi));
      const f = fi - i0;
      const a = route.samples;
      const o = i0 * 6;
      tmp.v.set(a[o] + (a[o + 6] - a[o]) * f, a[o + 1] + (a[o + 7] - a[o + 1]) * f, a[o + 2] + (a[o + 8] - a[o + 2]) * f);
      tmp.n.set(a[o + 3], a[o + 4], a[o + 5]);
      pl.position.copy(tmp.v);
      tmp.up.copy(tmp.v).normalize();
      tmp.tgt.copy(tmp.v).add(tmp.n);
      tmp.m.lookAt(tmp.v, tmp.tgt, tmp.up);
      pl.quaternion.setFromRotationMatrix(tmp.m);
      pl.visible = drawn > 0.05;
    }

    // marker pulses + labels (DOM writes only on change)
    const w = s.size.width;
    const h = s.size.height;
    const t = s.clock.elapsedTime;
    for (const mk of markers) {
      const sel = mk.id === st.from || mk.id === st.to;
      const ring = ringRefs.current[mk.id];
      if (ring) {
        const k = (t * 0.6 + (mk.id === st.to ? 0.5 : 0)) % 1;
        ring.visible = sel;
        if (sel) {
          ring.scale.setScalar(1 + k * 2.6);
          mk.ring.opacity = (1 - k) * 0.9;
        }
      }
      const el = domRegistry.get(`city-${mk.id}`);
      if (!el) continue;
      tmp.v.copy(mk.v).applyMatrix4(e.matrixWorld);
      tmp.n.copy(tmp.v).normalize();
      const facing = tmp.n.dot(tmp.o.copy(cam.position).sub(tmp.v).normalize());
      const vis = facing > 0.18 && p > 0.04 && p < 0.97 ? '1' : '0';
      if (vis !== mk.last.vis) {
        el.dataset.visible = vis;
        mk.last.vis = vis;
      }
      if (vis === '1') {
        tmp.v.project(cam);
        const x = Math.round(((tmp.v.x + 1) / 2) * w * 2) / 2;
        const y = Math.round(((1 - tmp.v.y) / 2) * h * 2) / 2;
        if (x !== mk.last.x || y !== mk.last.y) {
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          mk.last.x = x;
          mk.last.y = y;
        }
      }
    }

    rig.ambient!.intensity = 0.0;
    s.scene.environmentIntensity = 0.3;
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    s.scene.background = _bg;
    dofTarget.set(0, 0, 0);
    post.bokeh = 0;
  });

  const ringGeo = useMemo(() => new THREE.RingGeometry(0.012, 0.0145, 40), []);
  const dotGeo = useMemo(() => new THREE.CircleGeometry(0.0085, 20), []);
  const seg = high ? [128, 64] : [80, 40];

  return (
    <group ref={group}>
      <StarField count={high ? 2400 : 1200} radius={80} minY={-1} size={1.4} />
      <sprite material={markerMats.sun} position={SUN.clone().multiplyScalar(60)} scale={[22, 22, 1]} />
      <mesh material={mats.atmoMat} scale={1.17}>
        <sphereGeometry args={[1, 64, 32]} />
      </mesh>
      <group ref={earth}>
        <mesh material={mats.earthMat}>
          <sphereGeometry args={[1, seg[0], seg[1]]} />
        </mesh>
        <mesh material={mats.cloudMat} scale={1.012}>
          <sphereGeometry args={[1, seg[0], seg[1]]} />
        </mesh>
        {markers.map((mk) => (
          <group key={mk.id} position={mk.v} quaternion={mk.q}>
            <mesh geometry={dotGeo} material={mk.id === from || mk.id === to ? markerMats.sel : markerMats.dot} />
            <mesh ref={(r) => (ringRefs.current[mk.id] = r)} geometry={ringGeo} material={mk.ring} position={[0, 0, 0.0012]} renderOrder={3} />
          </group>
        ))}
        <mesh geometry={ghostGeo} material={markerMats.ghost} />
        <mesh geometry={arcGeo} material={arcMat} />
        <group ref={plane} scale={0.034}>
          <MiniPlane />
        </group>
      </group>
    </group>
  );
}

const _bg = new THREE.Color('#020306');
