import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { scroll } from '../state/runtime';
import { getState } from '../state/store';

export type SceneId =
  | 'hero'
  | 'cabin'
  | 'showcase'
  | 'globe'
  | 'selection'
  | 'booking'
  | 'finale'
  | 'dreamscape'
  | 'destination';

export const director = {
  scene: 'hero' as SceneId,
  prev: 'hero' as SceneId,
  prewarm: 0,
  time: 0,
  aspect: 1,
  width: 1,
  height: 1,
};

export function computeScene(): SceneId {
  const s = getState();
  if (s.mode === 'dream') {
    switch (s.dreamPhase) {
      // boarding, settling in, sleep and waking are one continuous shot in the cabin
      case 'boarding':
      case 'personalize':
      case 'sleep':
      case 'wake':
        return 'cabin';
      case 'dreamscape':
        return 'dreamscape';
      case 'arrival':
        return 'destination';
      default:
        return 'cabin';
    }
  }
  return scroll.active as SceneId;
}

/** True when the object and all its ancestors are visible (i.e. it will be rendered). */
export function shown(o: THREE.Object3D | null | undefined) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

export const isOn = (id: SceneId) => director.prewarm > 0 || director.scene === id;
export const isActive = (id: SceneId) => director.scene === id;

/** A fixed set of lights shared by every scene (constant light count → no shader recompiles). */
export const rig = {
  ambient: null as THREE.AmbientLight | null,
  hemi: null as THREE.HemisphereLight | null,
  key: null as THREE.DirectionalLight | null,
  rim: null as THREE.DirectionalLight | null,
  points: [] as THREE.PointLight[],
  spot: null as THREE.SpotLight | null,
};

export function rigReset() {
  post.raw = false;
  post.bloom = 1;
  if (rig.ambient) rig.ambient.intensity = 0;
  if (rig.hemi) rig.hemi.intensity = 0;
  if (rig.key) rig.key.intensity = 0;
  if (rig.rim) rig.rim.intensity = 0;
  if (rig.spot) rig.spot.intensity = 0;
  rig.points.forEach((p) => (p.intensity = 0));
}

export function setPoint(i: number, color: THREE.ColorRepresentation, intensity: number, x: number, y: number, z: number, distance = 0, decay = 2) {
  const p = rig.points[i];
  if (!p) return;
  p.color.set(color);
  p.intensity = intensity;
  p.position.set(x, y, z);
  p.distance = distance;
  p.decay = decay;
}

const _t = new THREE.Vector3();
/**
 * Place the camera. shiftX / shiftY apply a lens shift (fraction of the screen) so a
 * subject can sit off-centre without perspective distortion (positive = right / down).
 */
export function aimCamera(cam: THREE.PerspectiveCamera, pos: THREE.Vector3, target: THREE.Vector3, fov: number, roll = 0, shiftX = 0, shiftY = 0) {
  cam.position.copy(pos);
  cam.up.set(Math.sin(roll), Math.cos(roll), 0);
  cam.lookAt(target);
  let dirty = Math.abs(cam.fov - fov) > 0.01;
  if (dirty) cam.fov = fov;
  const w = director.width;
  const h = director.height;
  if (Math.abs(shiftX) > 1e-4 || Math.abs(shiftY) > 1e-4) {
    const v = cam.view;
    const ox = -shiftX * w;
    const oy = -shiftY * h;
    if (!v || !v.enabled || Math.abs(v.offsetX - ox) > 0.5 || Math.abs(v.offsetY - oy) > 0.5 || v.fullWidth !== w || v.fullHeight !== h) {
      cam.setViewOffset(w, h, ox, oy, w, h);
      dirty = false;
    }
  } else if (cam.view && cam.view.enabled) {
    cam.clearViewOffset();
    dirty = false;
  }
  if (dirty) cam.updateProjectionMatrix();
}

/** Widen the field of view for portrait screens so subjects stay framed. */
export const fitFov = (fov: number, aspect: number, minAspect = 1.2) => {
  if (aspect >= minAspect) return fov;
  const h = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (minAspect / aspect));
  return Math.min(100, (h * 180) / Math.PI);
};

export const dofTarget = new THREE.Vector3();
/** Per-frame post settings. `raw` renders straight to the screen (no tone mapping) — used for photographs. */
export const post = { bokeh: 0, focusRange: 3, bloom: 1, exposure: 1, vignette: 0.72, raw: false };

// ---------------------------------------------------------------- environments
type EnvId = 'night' | 'studio' | 'cabin' | 'sunrise' | 'space';
export const envs: Partial<Record<EnvId, THREE.Texture>> = {};

export const ENV_FOR: Record<SceneId, EnvId> = {
  hero: 'night',
  cabin: 'cabin',
  showcase: 'studio',
  globe: 'space',
  selection: 'studio',
  booking: 'studio',
  finale: 'sunrise',
  dreamscape: 'space',
  destination: 'sunrise',
};

export const ENV_INTENSITY: Record<SceneId, number> = {
  hero: 0.9,
  cabin: 0.55,
  showcase: 0.55,
  globe: 0.4,
  selection: 0.5,
  booking: 0.45,
  finale: 0.9,
  dreamscape: 0.3,
  destination: 0.8,
};

function gradientEnv(top: string, mid: string, bottom: string, sunDir: THREE.Vector3, sunColor: string, sunSize: number, sunGain: number) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(top) },
      mid: { value: new THREE.Color(mid) },
      bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: sunDir.clone().normalize() },
      sunColor: { value: new THREE.Color(sunColor).multiplyScalar(sunGain) },
      sunSize: { value: sunSize },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top,mid,bottom,sunDir,sunColor; uniform float sunSize; varying vec3 vDir;
      void main(){ float y=vDir.y; vec3 c = y>0.0 ? mix(mid, top, pow(y,0.6)) : mix(mid, bottom, pow(-y,0.5));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunColor * (pow(s, 1.0/sunSize*40.0) + 0.08*pow(s, 6.0));
        gl_FragColor = vec4(c,1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  return scene;
}

export function buildEnvironments(gl: THREE.WebGLRenderer) {
  if (envs.night) return;
  const pmrem = new THREE.PMREMGenerator(gl);
  const room = new RoomEnvironment();
  envs.studio = pmrem.fromScene(room, 0.04).texture;
  envs.night = pmrem.fromScene(
    gradientEnv('#05070d', '#1a2233', '#2c3648', new THREE.Vector3(-0.64, 0.22, 0.74), '#dfe7ff', 0.5, 9),
    0.02,
  ).texture;
  const cab = gradientEnv('#fff0da', '#8e7a63', '#30271f', new THREE.Vector3(0, 1, 0), '#ffe2b8', 2.5, 2.5);
  // warm cove strips
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd6a0').multiplyScalar(4) });
  for (const x of [-1.2, 1.2]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 18), stripMat);
    m.position.set(x, 3, 0);
    cab.add(m);
  }
  envs.cabin = pmrem.fromScene(cab, 0.03).texture;
  envs.sunrise = pmrem.fromScene(
    gradientEnv('#3d5785', '#f0a874', '#5d4a45', new THREE.Vector3(0, 0.08, -1), '#ffd29a', 1.2, 14),
    0.02,
  ).texture;
  envs.space = pmrem.fromScene(
    gradientEnv('#020306', '#0a0f1c', '#020306', new THREE.Vector3(1, 0.2, 0.4), '#fff2dc', 0.4, 10),
    0.02,
  ).texture;
  pmrem.dispose();
}

export const sharedFog = new THREE.Fog('#000000', 1e5, 1e6);
