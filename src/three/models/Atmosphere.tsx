import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { noiseGLSL } from '../shaders/noise';
import { cloudPuffTexture, glowTexture } from '../textures';
import { rng } from '../../lib/math';

export interface SkyUniforms {
  uTop: { value: THREE.Color };
  uMid: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uBelow: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uGlow: { value: THREE.Color };
  uSunSize: { value: number };
  uExposure: { value: number };
}

export function makeSkyUniforms(p: { top: string; mid: string; horizon: string; below: string; sunDir: THREE.Vector3; sun: string; glow: string; sunSize: number }): SkyUniforms {
  return {
    uTop: { value: new THREE.Color(p.top) },
    uMid: { value: new THREE.Color(p.mid) },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uBelow: { value: new THREE.Color(p.below) },
    uSunDir: { value: p.sunDir.clone().normalize() },
    uSunColor: { value: new THREE.Color(p.sun) },
    uGlow: { value: new THREE.Color(p.glow) },
    uSunSize: { value: p.sunSize },
    uExposure: { value: 1 },
  };
}

export function SkyDome({ uniforms, radius = 3000 }: { uniforms: SkyUniforms; radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: uniforms as any,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop,uMid,uHorizon,uBelow,uSunDir,uSunColor,uGlow; uniform float uSunSize,uExposure; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, h));
            col = mix(col, uTop, smoothstep(0.18, 0.9, h));
            col = mix(col, uBelow, smoothstep(0.0, -0.25, h));
            float s = max(dot(d, uSunDir), 0.0);
            col += uGlow * (pow(s, 6.0) * 0.55 + pow(s, 48.0) * 0.9);
            float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.7, s);
            col += uSunColor * disc;
            gl_FragColor = vec4(col * uExposure, 1.0);
          }`,
      }),
    [uniforms],
  );
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}

export interface CloudSeaUniforms {
  uTime: { value: number };
  uLightDir: { value: THREE.Vector3 };
  uLight: { value: THREE.Color };
  uShadow: { value: THREE.Color };
  uDeep: { value: THREE.Color };
  uFog: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uFlow: { value: THREE.Vector2 };
  uExposure: { value: number };
  uCoverage: { value: number };
  uScatter: { value: number };
}

export function makeCloudUniforms(p: { lightDir: THREE.Vector3; light: string; shadow: string; deep: string; fog: string; fogNear?: number; fogFar?: number; coverage?: number; scatter?: number }): CloudSeaUniforms {
  return {
    uTime: { value: 0 },
    uLightDir: { value: p.lightDir.clone().normalize() },
    uLight: { value: new THREE.Color(p.light) },
    uShadow: { value: new THREE.Color(p.shadow) },
    uDeep: { value: new THREE.Color(p.deep) },
    uFog: { value: new THREE.Color(p.fog) },
    uFogNear: { value: p.fogNear ?? 200 },
    uFogFar: { value: p.fogFar ?? 2600 },
    uFlow: { value: new THREE.Vector2(0, 0.06) },
    uExposure: { value: 1 },
    uCoverage: { value: p.coverage ?? 0.42 },
    uScatter: { value: p.scatter ?? 0.6 },
  };
}

/** An endless ocean of clouds, lit by the moon or the rising sun. */
export function CloudSea({ uniforms, y = -40, speed = 1, quality = 'high' }: { uniforms: CloudSeaUniforms; y?: number; speed?: number; quality?: 'high' | 'low' }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: uniforms as any,
        fog: false,
        defines: { OCT: quality === 'high' ? 6 : 4 },
        vertexShader: /* glsl */ `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime,uFogNear,uFogFar,uExposure,uCoverage,uScatter; uniform vec3 uLightDir,uLight,uShadow,uDeep,uFog; uniform vec2 uFlow;
          varying vec3 vWorld;
          float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
          float vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
            return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x),mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
          float fbm(vec2 p){ float a=0.5,s=0.0; mat2 r=mat2(0.8,-0.6,0.6,0.8); for(int i=0;i<OCT;i++){ s+=a*vnoise(p); p=r*p*2.03+vec2(3.1,1.7); a*=0.5;} return s; }
          float gDetail;
          float dens(vec2 p){
            vec2 q = p*0.0042 + uFlow*uTime;
            float b = fbm(q);
            gDetail = fbm(q*3.1 + vec2(b*1.6, -b) + uFlow*uTime*1.7);
            return b*0.7 + gDetail*0.42;
          }
          void main(){
            vec2 p = vWorld.xz;
            float dist = length(vWorld - cameraPosition);
            float d = dens(p);
            vec2 l2 = normalize(uLightDir.xz + 1e-4) * 26.0;
            // light probe: re-sample only the broad layer, reuse the detail layer
            float dl = fbm((p + l2) * 0.0042 + uFlow * uTime) * 0.7 + gDetail * 0.42;
            float cover = smoothstep(uCoverage, uCoverage + 0.28, d);
            float lit = clamp(0.55 + (d - dl) * 3.2, 0.0, 1.4);
            vec3 viewDir = normalize(vWorld - cameraPosition);
            float fwd = pow(max(dot(viewDir, normalize(uLightDir * vec3(1.0, -1.0, 1.0))), 0.0), 10.0);
            float rim = pow(max(dot(normalize(vec3(viewDir.x, 0.0, viewDir.z)), normalize(vec3(uLightDir.x, 0.0, uLightDir.z))), 0.0), 6.0);
            vec3 col = mix(uShadow, uLight, lit * (0.5 + 0.5 * uLightDir.y));
            col += uLight * (1.0 - cover) * rim * uScatter * 0.8;
            col += uLight * fwd * 0.25;
            col = mix(uDeep, col, cover);
            // fine detail sparkle on crests
            col *= 0.92 + 0.16 * smoothstep(0.55, 0.9, d);
            float f = smoothstep(uFogNear, uFogFar, dist);
            col = mix(col, uFog, f);
            gl_FragColor = vec4(col * uExposure, 1.0);
          }`,
      }),
    [uniforms, quality],
  );
  useFrame((_, dt) => {
    uniforms.uTime.value += dt * speed;
  });
  return (
    <mesh material={mat} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[9000, 9000, 1, 1]} />
    </mesh>
  );
}

/** Billboard cloud puffs drifting past the camera for parallax and speed. */
export function CloudPuffs({
  count = 60,
  box = [260, 60, 520] as [number, number, number],
  center = [0, -26, 0] as [number, number, number],
  speed = 28,
  color = '#9fb0cf',
  shade = '#2b3550',
  lightDir = new THREE.Vector3(-0.8, 0.4, 0.3),
  avoid = 40,
  size = [18, 46] as [number, number],
  opacity = 0.55,
}: {
  count?: number;
  box?: [number, number, number];
  center?: [number, number, number];
  speed?: number;
  color?: string;
  shade?: string;
  lightDir?: THREE.Vector3;
  avoid?: number;
  size?: [number, number];
  opacity?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { geo, mat } = useMemo(() => {
    const r = rng(11);
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const offs = new Float32Array(count * 3);
    const data = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      let x = 0;
      do x = (r() - 0.5) * box[0];
      while (Math.abs(x) < avoid && r() < 0.85);
      offs[i * 3] = x;
      offs[i * 3 + 1] = (r() - 0.5) * box[1];
      offs[i * 3 + 2] = (r() - 0.5) * box[2];
      data[i * 2] = size[0] + r() * (size[1] - size[0]);
      data[i * 2 + 1] = r();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 3));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 2));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: cloudPuffTexture() },
        uColor: { value: new THREE.Color(color) },
        uShade: { value: new THREE.Color(shade) },
        uLightDir: { value: lightDir.clone().normalize() },
        uBox: { value: new THREE.Vector3(...box) },
        uCenter: { value: new THREE.Vector3(...center) },
        uSpeed: { value: speed },
        uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec2 aData;
        uniform float uTime, uSpeed; uniform vec3 uBox, uCenter;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        void main(){
          vec3 o = aOffset;
          o.z = mod(o.z + uTime * uSpeed + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;
          vFade = smoothstep(0.5, 0.38, abs(o.z / uBox.z));
          vec3 wp = uCenter + o;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          float s = aData.x;
          float rot = aData.y * 6.283;
          vec2 c = position.xy;
          c = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * c * vec2(1.6, 1.0);
          mv.xy += c * s;
          vUv = uv; vSeed = aData.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor, uShade; uniform float uOpacity;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        void main(){
          vec2 uv = vUv;
          vec4 t = texture2D(uMap, uv);
          float a = t.a * uOpacity * vFade;
          if (a < 0.004) discard;
          vec3 col = mix(uShade, uColor, smoothstep(0.1, 0.9, uv.y) * 0.8 + 0.2 * vSeed);
          gl_FragColor = vec4(col, a);
        }`,
    });
    return { geo, mat };
  }, [count]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

export function StarField({ count = 2600, radius = 2400, minY = -0.05, size = 1.6, opacity = 1 }: { count?: number; radius?: number; minY?: number; size?: number; opacity?: number }) {
  const { geo, mat } = useMemo(() => {
    const r = rng(5);
    const pos = new Float32Array(count * 3);
    const dat = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      let v: THREE.Vector3;
      do v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      while (v.lengthSq() > 1 || v.lengthSq() < 0.05 || v.normalize().y < minY);
      v.multiplyScalar(radius);
      pos.set([v.x, v.y, v.z], i * 3);
      dat[i * 2] = Math.pow(r(), 6) * 2.6 + 0.4;
      dat[i * 2 + 1] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(dat, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uSize: { value: size * Math.min(window.devicePixelRatio, 2) }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */ `
        attribute vec2 aData; uniform float uTime, uSize; varying float vA; varying float vT;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * aData.x;
          vA = 0.55 + 0.45 * sin(uTime * (0.6 + aData.y * 2.2) + aData.y * 40.0);
          vT = aData.y;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vA; varying float vT;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 c = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), vT);
          gl_FragColor = vec4(c * 1.6, a * vA * uOpacity);
        }`,
    });
    return { geo, mat };
  }, [count, radius]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-9} />;
}

export function Moon({ dir, distance = 2200, size = 70, intensity = 1 }: { dir: THREE.Vector3; distance?: number; size?: number; intensity?: number | (() => number) }) {
  const { disc, halo } = useMemo(() => {
    const disc = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uI: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uI; varying vec2 vUv;
        ${noiseGLSL}
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float limb = pow(1.0 - r * r, 0.25);
          float maria = fbm2(p * 3.0 + 4.0);
          vec3 c = vec3(1.0, 0.97, 0.92) * (0.8 + 0.25 * smoothstep(0.35, 0.75, maria));
          c *= limb;
          float edge = smoothstep(1.0, 0.96, r);
          gl_FragColor = vec4(c * 6.0 * uI, edge);
        }`,
    });
    const halo = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color('#a9bbdf').multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    return { disc, halo };
  }, []);
  const pos = dir.clone().normalize().multiplyScalar(distance);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.quaternion.copy(camera.quaternion);
    const v = typeof intensity === 'function' ? intensity() : intensity;
    disc.uniforms.uI.value = v;
    halo.opacity = v;
  });
  return (
    <group position={pos}>
      <mesh ref={ref} material={disc} renderOrder={-8}>
        <planeGeometry args={[size, size]} />
      </mesh>
      <sprite material={halo} scale={[size * 9, size * 9, 1]} renderOrder={-8} />
    </group>
  );
}
