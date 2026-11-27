import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CapsuleModel, makeControls, tempColor } from '../models/CapsuleModel';
import { LIGHT_MODES } from '../../data/capsuleShowcase';
import { Aircraft } from '../models/Aircraft';
import { CloudPuffs, CloudSea, makeCloudUniforms, makeSkyUniforms, SkyDome } from '../models/Atmosphere';
import { TIERS } from '../../data/capsules';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, setPoint, sharedFog } from '../core';
import { pointer, scroll } from '../../state/runtime';
import { getState, previewCapsule, useStore } from '../../state/store';
import { clamp, damp, easeInOut, lerp, smoothstep } from '../../lib/math';

/** Booking backdrop: your chosen capsule, lit with your chosen night. */
export function BookingScene() {
  const group = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const { tier, id: capsuleId } = useStore(previewCapsule);
  const controls = useMemo(() => makeControls('relax'), []);
  const dims = TIERS[tier].dims;
  const _p = useMemo(() => new THREE.Vector3(), []);
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _c = useMemo(() => new THREE.Color(), []);
  const floorMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTint: { value: new THREE.Color('#ffcf96') } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTint; varying vec2 vUv; void main(){ vec2 p = (vUv-0.5)*2.0; float r = length(p); float sh = exp(-pow(length(p*vec2(1.0,0.7))*4.0,2.0));
          vec3 c = vec3(0.03,0.032,0.04) + uTint*exp(-r*r*5.0)*0.04; c *= 1.0 - sh*0.6; gl_FragColor = vec4(c, smoothstep(1.0, 0.2, r)); }`,
      }),
    [],
  );

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('booking');
    if (director.scene !== 'booking') return;
    const st = getState();
    const t = s.clock.elapsedTime;
    const mode = LIGHT_MODES[st.prefs.lighting];
    const k = 1 - Math.exp(-3 * dt);
    controls.strip.lerp(_c.set(mode.strip), k);
    controls.fill.lerp(_c.set(mode.fill), k);
    controls.fill.lerp(tempColor(st.prefs.temperature, _c), 0.1);
    controls.level += (mode.level - controls.level) * k;
    controls.blind = 0;
    model.current!.rotation.y = -0.65 + (st.reducedMotion ? 0 : Math.sin(t * 0.12) * 0.25);
    const portrait = director.aspect < 1;
    pointer.sx = damp(pointer.sx, pointer.x, 2, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 2, dt);
    const p = scroll.progress.booking;
    _p.set(pointer.sx * 0.25, 0.9 + pointer.sy * 0.15, portrait ? 9 : 8.4 - p * 0.6);
    _t.set(0, 0.0, 0);
    aimCamera(s.camera as THREE.PerspectiveCamera, _p, _t, fitFov(30, director.aspect, 1.0), 0, portrait ? 0 : -0.25, portrait ? -0.28 : 0.2);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.05 || cam.far !== 100) {
      cam.near = 0.05;
      cam.far = 100;
      cam.updateProjectionMatrix();
    }
    const lv = controls.level;
    rig.spot!.color.set('#ffe9cf');
    rig.spot!.intensity = 45;
    rig.spot!.position.set(0.5, 6, 2.5);
    rig.spot!.angle = 0.5;
    rig.spot!.penumbra = 0.9;
    rig.spot!.distance = 20;
    rig.spot!.target.position.set(0, 0, 0);
    rig.spot!.target.updateMatrixWorld();
    rig.rim!.color.set('#9fb4e6');
    rig.rim!.intensity = 1.2;
    rig.rim!.position.set(-3, 3, -6);
    rig.hemi!.color.set('#2a2f3c');
    rig.hemi!.groundColor.set('#050608');
    rig.hemi!.intensity = 0.35;
    setPoint(0, controls.fill, 3.2 * lv, 0, 0.12, -0.2, 3.5);
    setPoint(1, controls.fill, 1.4 * lv, 0, 0, dims.l / 2 + 0.7, 3.5);
    setPoint(2, '#C8AD85', 2.0, 2.6, 1.2, -1.6, 7);
    s.scene.environmentIntensity = 0.4;
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    s.scene.background = _bgB;
    floorMat.uniforms.uTint.value.copy(controls.fill);
    dofTarget.set(0, 0, 0);
    post.bokeh = 0;
  });

  return (
    <group ref={group}>
      <group ref={model}>
        <CapsuleModel tier={tier} controls={controls} label={capsuleId} />
      </group>
      <mesh material={floorMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -dims.h / 2 - 0.12, 0]}>
        <planeGeometry args={[12, 12]} />
      </mesh>
    </group>
  );
}
const _bgB = new THREE.Color('#090b10');

export const SUNRISE_DIR = new THREE.Vector3(0.0, 0.035, -1).normalize();

/** Final scene: the aircraft flies toward the sunrise over an ocean of clouds. */
export function FinaleScene() {
  const group = useRef<THREE.Group>(null);
  const plane = useRef<THREE.Group>(null);
  const quality = useStore((s) => s.quality);
  const sky = useMemo(
    () => makeSkyUniforms({ top: '#1c2c55', mid: '#b87a72', horizon: '#ffb57c', below: '#6d5060', sunDir: SUNRISE_DIR, sun: '#fff0d4', glow: '#ff8a45', sunSize: 0.0012 }),
    [],
  );
  useMemo(() => {
    sky.uSunColor.value.multiplyScalar(7);
    sky.uGlow.value.multiplyScalar(0.75);
  }, [sky]);
  const clouds = useMemo(
    () =>
      makeCloudUniforms({
        lightDir: new THREE.Vector3(0, 0.12, -1),
        light: '#ffc48e',
        shadow: '#4a3d5e',
        deep: '#2c2340',
        fog: '#e7a27a',
        fogNear: 500,
        fogFar: 5200,
        coverage: 0.38,
        scatter: 1.4,
      }),
    [],
  );
  const trailMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uO: { value: 0.0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uO; varying vec2 vUv; void main(){ float along = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.4, vUv.y); float sa = sin(vUv.x*3.14159); float across = sa * sa;
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.76) * 1.2, along * across * uO * 0.16); }`,
      }),
    [],
  );
  const _p = useMemo(() => new THREE.Vector3(), []);
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _a = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('finale');
    if (director.scene !== 'finale') return;
    const st = getState();
    const p = scroll.progress.finale;
    const t = s.clock.elapsedTime;
    const u = easeInOut(clamp(p));
    // aircraft flies away toward the sun
    const ac = plane.current!;
    const away = Math.pow(u, 1.6);
    ac.position.set(0, 2 + away * 90 + Math.sin(t * 0.4) * 0.3, -away * 2600);
    ac.rotation.z = Math.sin(t * 0.25) * 0.02;
    ac.rotation.x = -0.02 * away;
    // camera pulls away
    pointer.sx = damp(pointer.sx, pointer.x, 2, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 2, dt);
    _p.set(lerp(26, 4, u) + pointer.sx * 3, lerp(7, 34, u) + pointer.sy * 2, lerp(58, 150, u));
    _a.copy(ac.position);
    _t.copy(_a).lerp(new THREE.Vector3(0, 160, -3000), smoothstep(0.3, 1, u));
    _t.y += 6 * (1 - u);
    aimCamera(s.camera as THREE.PerspectiveCamera, _p, _t, fitFov(lerp(34, 36, u), director.aspect, 1.3), Math.sin(t * 0.15) * 0.008, director.aspect < 1 ? 0 : 0.12, 0.06);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.1 || cam.far !== 9000) {
      cam.near = 0.1;
      cam.far = 9000;
      cam.updateProjectionMatrix();
    }
    sky.uExposure.value = 1;
    trailMat.uniforms.uO.value = 0.4 + 0.6 * smoothstep(0.05, 0.4, p);
    rig.key!.color.set('#ffc48f');
    rig.key!.intensity = 2.2;
    rig.key!.position.set(0, 80, -1500);
    rig.rim!.color.set('#ffdcb8');
    rig.rim!.intensity = 1.2;
    rig.rim!.position.set(40, 30, -200);
    rig.hemi!.color.set('#8d97c0');
    rig.hemi!.groundColor.set('#ffbe8c');
    rig.hemi!.intensity = 0.7;
    s.scene.environmentIntensity = 0.42;
    sharedFog.color.set('#efb07f');
    sharedFog.near = 1200;
    sharedFog.far = 5200;
    s.scene.background = null;
    dofTarget.copy(_a);
    post.bokeh = 0;
  });

  return (
    <group ref={group}>
      <SkyDome uniforms={sky} />
      <CloudSea uniforms={clouds} y={-46} speed={1.4} quality={quality} />
      <CloudPuffs count={quality === 'high' ? 60 : 28} center={[0, -26, -300]} box={[600, 30, 1400]} speed={26} color="#ffd1a8" shade="#7a5a6c" opacity={0.5} avoid={40} size={[24, 60]} />
      <group ref={plane}>
        <Aircraft navLights windowGlow={0.6} />
        {[10.2, -10.2].map((x) => (
          <mesh key={x} material={trailMat} position={[x, -3.1, 8 + 55]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 110, 1, 1]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
