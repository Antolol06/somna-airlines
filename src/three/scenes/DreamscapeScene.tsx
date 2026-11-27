import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CloudPuffs, StarField } from '../models/Atmosphere';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, sharedFog } from '../core';
import { dream, pointer } from '../../state/runtime';
import { getState, useStore } from '../../state/store';
import { damp, rng } from '../../lib/math';

/** The abstract dream: soft clouds, drifting motes, stars and slow flowing light. */
export function DreamscapeScene() {
  const group = useRef<THREE.Group>(null);
  const quality = useStore((s) => s.quality);

  const res = useMemo(() => {
    const r = rng(42);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vD;
        void main(){ vec3 d = normalize(vD);
          vec3 col = mix(vec3(0.02,0.025,0.06), vec3(0.06,0.06,0.16), smoothstep(-0.4, 0.6, d.y));
          float bq = (d.y - 0.12 + 0.08 * sin(d.x * 3.0 + uTime * 0.1)) * 5.0; float band = exp(-bq * bq);
          col += vec3(0.2, 0.18, 0.42) * band * 0.5;
          col += vec3(0.5, 0.32, 0.2) * exp(-((d.y + 0.2) * 4.0) * ((d.y + 0.2) * 4.0)) * 0.12;
          gl_FragColor = vec4(col * uFade, 1.0); }`,
    });
    // drifting motes
    const n = quality === 'high' ? 2200 : 900;
    const pos = new Float32Array(n * 3);
    const dat = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 60;
      pos[i * 3 + 1] = (r() - 0.5) * 30;
      pos[i * 3 + 2] = -r() * 160 + 10;
      dat[i * 2] = r();
      dat[i * 2 + 1] = r();
    }
    const motes = new THREE.BufferGeometry();
    motes.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    motes.setAttribute('aData', new THREE.BufferAttribute(dat, 2));
    const moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio, 2) } },
      vertexShader: /* glsl */ `attribute vec2 aData; uniform float uTime, uPx; varying float vA; varying float vW;
        void main(){ vec3 p = position; p.y += sin(uTime * 0.2 + aData.x * 20.0) * 0.6; p.x += cos(uTime * 0.15 + aData.y * 20.0) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.5 + aData.x * 5.0) * (14.0 / -mv.z);
          vA = 0.5 + 0.5 * sin(uTime * (0.5 + aData.y) + aData.x * 30.0); vW = aData.y; }`,
      fragmentShader: `uniform float uFade; varying float vA; varying float vW; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
          vec3 c = mix(vec3(0.7, 0.75, 1.0), vec3(1.0, 0.8, 0.55), vW); gl_FragColor = vec4(c * 1.5, a * vA * uFade * 0.8); }`,
    });
    // flowing light ribbons
    const ribbons: { geo: THREE.TubeGeometry; color: THREE.Color; speed: number }[] = [];
    const cols = ['#E7AE70', '#C8AD85', '#8f8cff'];
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      const ph = r() * 6;
      for (let i = 0; i <= 24; i++) {
        const z = 12 - i * 7;
        pts.push(new THREE.Vector3(Math.sin(i * 0.45 + ph) * (5 + k * 2), -3 + Math.cos(i * 0.32 + ph) * 2.5 + k * 1.4, z));
      }
      ribbons.push({ geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05 + k * 0.02, 8, false), color: new THREE.Color(cols[k]), speed: 0.03 + k * 0.012 });
    }
    const ribbonMats = ribbons.map(
      (rb) =>
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: { value: 0 }, uColor: { value: rb.color }, uSpeed: { value: rb.speed }, uFade: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: /* glsl */ `uniform float uTime, uSpeed, uFade; uniform vec3 uColor; varying vec2 vUv;
            void main(){ float s = vUv.x; float flow = 0.5 + 0.5 * sin((s * 18.0 - uTime * uSpeed * 60.0));
              float k = pow(flow, 6.0); float edge = sin(vUv.y * 3.14159);
              gl_FragColor = vec4(uColor * (0.4 + 2.2 * k), (0.12 + 0.6 * k) * edge * uFade); }`,
        }),
    );
    return { bgMat, motes, moteMat, ribbons, ribbonMats };
  }, [quality]);

  const _p = useMemo(() => new THREE.Vector3(), []);
  const _t = useMemo(() => new THREE.Vector3(), []);

  useFrame((s, dt) => {
    const g = group.current!;
    g.visible = isOn('dreamscape');
    if (director.scene !== 'dreamscape') return;
    const st = getState();
    const t = s.clock.elapsedTime;
    const f = dream.scapeFade;
    res.bgMat.uniforms.uTime.value = t;
    res.bgMat.uniforms.uFade.value = f;
    res.moteMat.uniforms.uTime.value = t;
    res.moteMat.uniforms.uFade.value = f;
    res.ribbonMats.forEach((m) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uFade.value = f;
    });
    pointer.sx = damp(pointer.sx, pointer.x, 1.5, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 1.5, dt);
    const z = 8 - dream.scape * 70;
    const calm = st.reducedMotion ? 0.2 : 1;
    _p.set(Math.sin(t * 0.13) * 0.8 * calm + pointer.sx * 0.8, Math.cos(t * 0.11) * 0.4 * calm + pointer.sy * 0.5, z);
    _t.set(_p.x * 0.5, _p.y * 0.5 - 0.4, z - 12);
    aimCamera(s.camera as THREE.PerspectiveCamera, _p, _t, fitFov(58, director.aspect, 1.0), Math.sin(t * 0.07) * 0.05 * calm);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.far !== 600) {
      cam.near = 0.1;
      cam.far = 600;
      cam.updateProjectionMatrix();
    }
    rig.ambient!.intensity = 0;
    s.scene.environmentIntensity = 0.2;
    sharedFog.color.set('#05060f');
    sharedFog.near = 20;
    sharedFog.far = 110;
    s.scene.background = _bg;
    dofTarget.set(_t.x, _t.y, z - 10);
    post.bokeh = quality === 'high' ? 2.5 : 0;
    post.focusRange = 8;
  });

  return (
    <group ref={group}>
      <mesh material={res.bgMat} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>
      <StarField count={1600} radius={280} minY={-1} size={1.2} />
      <CloudPuffs count={quality === 'high' ? 40 : 20} center={[0, -7, -40]} box={[90, 14, 120]} speed={3.5} color="#4a4f96" shade="#10132e" lightDir={new THREE.Vector3(0, 1, 0)} avoid={10} size={[12, 26]} opacity={0.14} />
      <points geometry={res.motes} material={res.moteMat} frustumCulled={false} />
      {res.ribbons.map((rb, i) => (
        <mesh key={i} geometry={rb.geo} material={res.ribbonMats[i]} frustumCulled={false} />
      ))}
    </group>
  );
}

const _bg = new THREE.Color('#03040a');
