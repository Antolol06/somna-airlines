import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { AC, windowPhi } from './aircraftGeometry';

/** Rounded-rectangle shape helper. */
export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function roundedRectPath(w: number, h: number, r: number, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const x = cx - w / 2;
  const y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

export const heroWindowUniforms = { uGlow: { value: 2.2 }, uTime: { value: 0 } };

/**
 * The hero window — an interior-mapped "room" shader that reveals a warm
 * capsule behind the glass with real parallax as the camera approaches.
 */
export function InteriorWindow() {
  const { matrix, frameGeo, glassGeo, glassMat, frameMat } = useMemo(() => {
    const phi = windowPhi;
    const Z = new THREE.Vector3(Math.sin(phi), Math.cos(phi), 0);
    const Y = new THREE.Vector3(-Math.cos(phi), Math.sin(phi), 0);
    const X = new THREE.Vector3(0, 0, -1);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    m.setPosition(Z.clone().multiplyScalar(AC.R + 0.004).add(new THREE.Vector3(0, 0, AC.heroWindowZ)));

    const W = 0.3;
    const H = 0.44;
    const outer = roundedRectShape(W + 0.12, H + 0.13, 0.2);
    outer.holes.push(roundedRectPath(W, H, 0.145));
    const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 18 });
    frameGeo.translate(0, 0, -0.02);
    const glassGeo = new THREE.ShapeGeometry(roundedRectShape(W, H, 0.145), 18);
    // shape geometry UVs from positions
    const frameMat = new THREE.MeshPhysicalMaterial({ color: '#1a1d24', metalness: 0.85, roughness: 0.3, clearcoat: 1 });
    const glassMat = new THREE.ShaderMaterial({
      uniforms: heroWindowUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vPos; varying vec3 vCam;
        void main(){
          vPos = position;
          vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow; uniform float uTime;
        varying vec3 vPos; varying vec3 vCam;
        float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
        void main(){
          vec3 ro = vec3(vPos.xy, 0.0);
          vec3 rd = normalize(vec3(vPos.xy, 0.0) - vCam);
          vec3 bmin = vec3(-0.75, -0.5, -2.2);
          vec3 bmax = vec3(0.75, 0.6, 0.0);
          vec3 t1 = (bmin - ro) / rd;
          vec3 t2 = (bmax - ro) / rd;
          vec3 tf = max(t1, t2);
          float t = min(min(tf.x, tf.y), tf.z);
          vec3 h = ro + rd * t;
          vec3 ivory = vec3(0.92, 0.86, 0.76);
          vec3 warm = vec3(1.0, 0.72, 0.42);
          float light = 0.3 + 0.7 * smoothstep(-0.5, 0.6, h.y);
          vec3 col;
          if (t == tf.z) {
            // far end: capsule opening onto the warm aisle
            float d = rbox(h.xy - vec2(0.0, 0.02), vec2(0.5, 0.42), 0.22);
            float open = 1.0 - smoothstep(-0.01, 0.02, d);
            col = mix(ivory * (0.6 + 0.5 * light), warm * 2.1, open);
            col += warm * 0.6 * exp(-abs(d) * 18.0);
          } else if (t == tf.y) {
            if (rd.y > 0.0) {
              // ceiling with a soft light line
              float sx = h.x * 9.0; float strip = exp(-sx * sx);
              col = ivory * 0.9 + warm * strip * 2.2;
            } else {
              // bed
              float pillow = smoothstep(0.5, 0.0, length((h.xz - vec2(0.0, -0.35)) * vec2(1.5, 3.0)));
              col = vec3(0.95, 0.9, 0.82) * (0.55 + 0.35 * smoothstep(-2.2, 0.0, h.z)) + pillow * 0.15;
            }
          } else {
            col = ivory * (0.6 + 0.5 * light) * (0.8 + 0.2 * smoothstep(-2.2, 0.0, h.z));
          }
          // depth warmth
          col *= mix(vec3(1.0), warm, 0.35);
          col *= uGlow;
          // glass reflection
          float fres = pow(1.0 - abs(rd.z), 3.0);
          col = mix(col, vec3(0.6, 0.68, 0.85), fres * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
      toneMapped: false,
    });
    return { matrix: m, frameGeo, glassGeo, glassMat, frameMat };
  }, []);

  useFrame((s) => {
    heroWindowUniforms.uTime.value = s.clock.elapsedTime;
  });

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={frameGeo} material={frameMat} />
      <mesh geometry={glassGeo} material={glassMat} position={[0, 0, -0.008]} />
    </group>
  );
}
