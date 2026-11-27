import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CapsuleModel, blendControls, makeControls } from '../models/CapsuleModel';
import { StarField } from '../models/Atmosphere';
import { aimCamera, director, fitFov, isOn, post, rig, setPoint, sharedFog } from '../core';
import { domRegistry, scroll } from '../../state/runtime';
import { getState, previewCapsule, useStore } from '../../state/store';
import { clamp, damp, dampAngle, lerp, smoothstep, wrapAngle } from '../../lib/math';
import { TIERS } from '../../data/capsules';
import type { PartId } from '../../data/capsuleShowcase';

const BACKGROUND = new THREE.Color('#10131a');
const ORBIT_TARGET: [number, number, number] = [0, 0.12, 0];

export function ShowcaseScene() {
  const group = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const plinth = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>(null);
  const stars = useRef<THREE.Group>(null);
  const anchors = useRef<Partial<Record<PartId, THREE.Vector3>>>({});
  const rotation = useRef({ angle: 0, velocity: 0, pointerId: -1, x: 0, time: 0 });
  const returningFromOrbit = useRef(false);
  const wasActive = useRef(false);
  const tier = useStore((s) => previewCapsule(s).tier);
  const explore = useStore((s) => s.explore);
  const reduced = useStore((s) => s.reducedMotion);
  const gl = useThree((s) => s.gl);
  const controls = useMemo(() => makeControls('relax'), []);
  const vectors = useMemo(() => ({ position: new THREE.Vector3(), target: new THREE.Vector3(...ORBIT_TARGET), marker: new THREE.Vector3() }), []);
  const dims = TIERS[tier].dims;

  useEffect(() => {
    const el = gl.domElement;
    const drag = rotation.current;
    const down = (event: PointerEvent) => {
      const st = getState();
      if (director.scene !== 'showcase' || st.explore || event.button !== 0 || drag.pointerId !== -1) return;
      Object.assign(drag, { pointerId: event.pointerId, x: event.clientX, time: event.timeStamp, velocity: 0 });
    };
    const move = (event: PointerEvent) => {
      if (drag.pointerId !== event.pointerId) return;
      const delta = (event.clientX - drag.x) * 0.006;
      drag.angle = wrapAngle(drag.angle + delta);
      drag.velocity = clamp(delta / Math.max(0.012, (event.timeStamp - drag.time) / 1000), -2, 2);
      drag.x = event.clientX;
      drag.time = event.timeStamp;
    };
    const up = (event: PointerEvent) => {
      if (drag.pointerId !== event.pointerId) return;
      if (event.type === 'pointercancel' || event.timeStamp - drag.time > 80) drag.velocity = 0;
      drag.pointerId = -1;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  const floorUniforms = useMemo(() => ({ uFade: { value: 1 } }), []);
  useFrame((s, dt) => {
    group.current!.visible = isOn('showcase');
    const marker = domRegistry.get('capsule-part-marker');
    if (director.scene !== 'showcase') {
      if (wasActive.current) {
        wasActive.current = false;
        Object.assign(rotation.current, { angle: 0, velocity: 0, pointerId: -1 });
        returningFromOrbit.current = false;
        if (marker) marker.dataset.visible = '0';
      }
      return;
    }

    const st = getState();
    const p = scroll.progress.showcase;
    const wantExploded = st.showcasePart ? 1 : 0;
    const drag = rotation.current;
    const m = model.current!;
    const step = Math.min(dt, 0.065);
    const entering = !wasActive.current;
    wasActive.current = true;
    controls.explode = entering || st.reducedMotion ? wantExploded : damp(controls.explode, wantExploded, 6, step);
    if (Math.abs(controls.explode - wantExploded) < 0.001) controls.explode = wantExploded;
    const exploded = controls.explode;
    blendControls(controls, st.showcaseLight, st.reducedMotion ? 1 : step);
    if (plinth.current) {
      const opacity = 1 - smoothstep(0.04, 0.42, exploded);
      plinth.current.material.opacity = opacity;
      plinth.current.material.depthWrite = opacity === 1;
      plinth.current.visible = opacity > 0.002;
    }

    if (drag.pointerId === -1) {
      if (!st.reducedMotion && !st.explore) drag.angle = wrapAngle(drag.angle + drag.velocity * step);
      drag.velocity = damp(drag.velocity, 0, 8, step);
    }
    m.rotation.y = entering || st.reducedMotion ? drag.angle : dampAngle(m.rotation.y, drag.angle, 12, step);

    const cam = s.camera as THREE.PerspectiveCamera;
    const { width, height } = s.size;
    const stacked = width <= 760;
    const compact = stacked ? 1 - smoothstep(640, 825, height) : 0;
    const space = st.reducedMotion ? 0 : smoothstep(0.77, 1.0, p);
    const azimuth = lerp(0.42, 0.55, exploded);
    const elevation = lerp(0.22, 0.30, exploded);
    const mobileClearance = stacked ? lerp(1.0 * compact, 0.9 + 2.3 * compact, exploded) : 0;
    const radius = lerp(6.2, 8.8, exploded) + (dims.w - 1.32) * 1.65 + mobileClearance + space * 3;
    vectors.target.set(0, lerp(0.02, 0.52, exploded), 0);
    vectors.position.set(Math.sin(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius + vectors.target.y, Math.cos(azimuth) * Math.cos(elevation) * radius);
    if (st.explore) {
      vectors.target.set(...ORBIT_TARGET);
      vectors.position.copy(cam.position);
      returningFromOrbit.current = true;
    } else if (returningFromOrbit.current && !st.reducedMotion) {
      if (cam.position.distanceToSquared(vectors.position) < 0.001) returningFromOrbit.current = false;
      else vectors.position.lerp(cam.position, Math.exp(-8 * step));
    } else {
      returningFromOrbit.current = false;
    }
    const fov = fitFov(32, director.aspect, stacked ? 0.86 : 1.2);
    const shiftX = stacked ? lerp(0.055, 0.025, exploded) : lerp(0.19, 0.16, exploded);
    const shiftY = stacked ? lerp(-0.035 + 0.017 * compact, -0.092, exploded) : lerp(0.02, 0.045, exploded);
    aimCamera(cam, vectors.position, vectors.target, fov, 0, shiftX, shiftY);
    if (cam.near !== 0.05 || cam.far !== 4000) {
      cam.near = 0.05;
      cam.far = 4000;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    rig.spot!.color.set('#ffe9d6');
    rig.spot!.intensity = 37;
    rig.spot!.position.set(-2.8, 4.6, 3.5);
    rig.spot!.angle = 0.73;
    rig.spot!.penumbra = 1;
    rig.spot!.distance = 15;
    rig.spot!.target.position.set(0, 0, 0);
    rig.spot!.target.updateMatrixWorld();
    rig.rim!.color.set('#aebedf');
    rig.rim!.intensity = 0.9;
    rig.rim!.position.set(1.8, 3, -4);
    rig.key!.color.set('#f5ede4');
    rig.key!.intensity = 0.75;
    rig.key!.position.set(4, 2, 3);
    rig.hemi!.color.set('#8d9ab6');
    rig.hemi!.groundColor.set('#322820');
    rig.hemi!.intensity = 0.45;
    setPoint(0, controls.fill, 3.8 * controls.level, 0, 0.14, -0.35, 3.5);
    setPoint(1, controls.fill, 1.3 * controls.level, 0, 0.24, dims.l / 2 - 0.15, 3.5);
    s.scene.environmentIntensity = 0.28;
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    s.scene.background = BACKGROUND;
    post.bokeh = 0;
    post.bloom = 0.35;
    floorUniforms.uFade.value = 1 - space;

    if (stars.current) {
      stars.current.visible = space > 0.01;
      const sky = stars.current.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
      sky.material.uniforms.uOpacity.value = space;
    }
    if (!marker) return;
    const anchor = st.showcasePart && anchors.current[st.showcasePart];
    if (anchor && exploded > 0.4) {
      const v = vectors.marker.copy(anchor).project(cam);
      const visible = v.z < 1 && Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.96;
      marker.style.transform = `translate3d(${((v.x + 1) / 2) * width}px, ${((1 - v.y) / 2) * height}px, 0)`;
      marker.dataset.visible = visible ? '1' : '0';
    } else {
      marker.dataset.visible = '0';
    }
  });

  return (
    <group ref={group}>
      <group ref={model}>
        <CapsuleModel tier={tier} controls={controls} anchors={anchors} label="SMN" />
        <RoundedBox ref={plinth} args={[dims.w + 0.36, 0.10, dims.l + 0.17]} radius={0.035} smoothness={3} position={[0, -dims.h / 2 - 0.22, 0]}>
          <meshStandardMaterial color="#23252d" roughness={0.64} metalness={0.18} transparent />
        </RoundedBox>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -dims.h / 2 - 0.28, 0]}>
        <planeGeometry args={[12, 12]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          uniforms={floorUniforms}
          vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
          fragmentShader={/* glsl */ `uniform float uFade; varying vec2 vUv;
            void main() {
              vec2 p = (vUv - 0.5) * 2.0;
              float pool = exp(-dot(p, p) * 5.0);
              vec2 contact = p * vec2(6.0, 4.0);
              float shadow = exp(-dot(contact, contact));
              vec3 colour = mix(vec3(0.085, 0.096, 0.12), vec3(0.012, 0.014, 0.021), shadow);
              gl_FragColor = vec4(colour, pool * (1.0 - smoothstep(0.55, 1.0, length(p))) * uFade);
            }`}
        />
      </mesh>
      <group ref={stars}>
        <StarField count={900} radius={900} minY={-1} size={1.3} opacity={0} />
      </group>
      {explore && <OrbitControls makeDefault target={ORBIT_TARGET} enablePan={false} minDistance={2.5} maxDistance={11} maxPolarAngle={Math.PI * 0.52} enableDamping={!reduced} dampingFactor={0.08} />}
    </group>
  );
}
