import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  AC,
  coreGeometry,
  finSections,
  fuselageGeometry,
  loftAirfoil,
  mirrorX,
  nacelleGeometry,
  paintLivery,
  spinnerGeometry,
  stabSections,
  tailMarkTexture,
  windowPhi,
  wingSections,
  wordmarkTexture,
  wrapDecal,
} from './aircraftGeometry';
import { fanTexture, glowTexture } from '../textures';
import { InteriorWindow } from './InteriorWindow';

let shared: ReturnType<typeof buildShared> | null = null;

function buildShared() {
  const fuselage = fuselageGeometry();
  const wingR = loftAirfoil(wingSections(), 'x', 28, 0.025);
  const wingL = mirrorX(wingR);
  const stabR = loftAirfoil(stabSections(), 'x', 20, 0);
  const stabL = mirrorX(stabR);
  const fin = loftAirfoil(finSections(), 'y', 24, 0);
  const nacelle = nacelleGeometry();
  const core = coreGeometry();
  const spinner = spinnerGeometry();
  const fairing = new THREE.SphereGeometry(1, 48, 24);
  fairing.scale(3.0, 1.35, 12.5);
  const pylon = new THREE.BoxGeometry(0.42, 1.5, 7.4, 1, 1, 4);
  const lip = new THREE.TorusGeometry(1.33, 0.06, 12, 72);
  const fanDisc = new THREE.CircleGeometry(1.2, 48);
  const liv = paintLivery({ heroWindowDark: true });
  const word = wordmarkTexture();
  const tail = tailMarkTexture();
  const decalPhi = windowPhi - 0.36;
  const wordR = wrapDecal(9.5, 1.19, -12.5, decalPhi, 1);
  const wordL = wrapDecal(9.5, 1.19, -12.5, decalPhi, -1);
  return { fuselage, wingR, wingL, stabR, stabL, fin, nacelle, core, spinner, fairing, pylon, lip, fanDisc, liv, word, tail, wordR, wordL };
}

export interface AircraftProps {
  windowGlow?: number;
  navLights?: boolean;
  heroWindow?: boolean;
  cutaway?: THREE.Plane | null;
  paint?: string;
}

export function Aircraft({ windowGlow = 1, navLights = true, heroWindow = false, cutaway = null, paint = '#ffffff' }: AircraftProps) {
  if (!shared) shared = buildShared();
  const g = shared;
  const strobes = useRef<THREE.Sprite[]>([]);
  const beacons = useRef<THREE.Sprite[]>([]);
  const fans = useRef<THREE.Mesh[]>([]);

  const mats = useMemo(() => {
    const clip = cutaway ? [cutaway] : null;
    const side = cutaway ? THREE.DoubleSide : THREE.FrontSide;
    const body = new THREE.MeshPhysicalMaterial({
      color: paint,
      map: g.liv.map,
      emissiveMap: g.liv.emissiveMap,
      emissive: new THREE.Color('#ffc890'),
      emissiveIntensity: 2.4 * windowGlow,
      metalness: 0.55,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      side,
      clippingPlanes: clip,
    });
    const skin = new THREE.MeshPhysicalMaterial({
      color: '#0f1420',
      metalness: 0.6,
      roughness: 0.34,
      clearcoat: 0.85,
      clearcoatRoughness: 0.1,
      side,
      clippingPlanes: clip,
    });
    const belly = new THREE.MeshPhysicalMaterial({ color: '#151c2a', metalness: 0.55, roughness: 0.38, clearcoat: 0.6, side, clippingPlanes: clip });
    const champagne = new THREE.MeshStandardMaterial({ color: '#C8AD85', metalness: 1, roughness: 0.26, clippingPlanes: clip });
    const dark = new THREE.MeshStandardMaterial({ color: '#0b0d12', metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: clip });
    const fan = new THREE.MeshStandardMaterial({ map: fanTexture(), metalness: 0.7, roughness: 0.35 });
    const word = new THREE.MeshStandardMaterial({
      map: g.word,
      transparent: true,
      emissive: new THREE.Color('#C8AD85'),
      emissiveMap: g.word,
      emissiveIntensity: 0.35,
      metalness: 0.9,
      roughness: 0.28,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
      clippingPlanes: clip,
    });
    const tail = new THREE.MeshStandardMaterial({
      map: g.tail,
      transparent: true,
      emissive: new THREE.Color('#E7C99A'),
      emissiveMap: g.tail,
      emissiveIntensity: 0.9,
      metalness: 0.8,
      roughness: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    });
    const lining = new THREE.MeshStandardMaterial({ color: '#d9cfbf', roughness: 0.85, side: THREE.BackSide, clippingPlanes: clip });
    return { body, skin, belly, champagne, dark, fan, word, tail, lining };
  }, [cutaway, windowGlow, paint]);

  const glow = glowTexture();
  const spriteMat = (color: string, intensity: number) =>
    new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color(color).multiplyScalar(intensity),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
  const lightMats = useMemo(
    () => ({
      red: spriteMat('#ff2a2a', 6),
      green: spriteMat('#2aff7a', 5),
      white: spriteMat('#ffffff', 10),
      beacon: spriteMat('#ff3b2a', 8),
      engine: spriteMat('#ff9a50', 1.2),
    }),
    [],
  );

  useFrame((state, dt) => {
    if (!navLights) return;
    const t = state.clock.elapsedTime;
    const strobe = (t % 1.3 < 0.06) || (t % 1.3 > 0.16 && t % 1.3 < 0.21) ? 1 : 0;
    strobes.current.forEach((s) => s && (s.material.opacity = strobe));
    const beacon = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.1)), 8);
    beacons.current.forEach((s) => s && (s.material.opacity = beacon));
    fans.current.forEach((f) => f && (f.rotation.z += dt * 9));
  });

  const tipR: [number, number, number] = [32.25, 1.1, 13.5];
  const tipL: [number, number, number] = [-32.25, 1.1, 13.5];
  const engines = [10.2, -10.2];

  return (
    <group>
      <mesh geometry={g.fuselage} material={mats.body} />
      {cutaway && <mesh geometry={g.fuselage} material={mats.lining} scale={[0.985, 0.985, 0.995]} />}
      <mesh geometry={g.fairing} material={mats.belly} position={[0, -2.15, -1.2]} />
      <mesh geometry={g.wingR} material={mats.skin} />
      <mesh geometry={g.wingL} material={mats.skin} />
      <mesh geometry={g.stabR} material={mats.skin} />
      <mesh geometry={g.stabL} material={mats.skin} />
      <mesh geometry={g.fin} material={mats.skin} />
      <mesh geometry={g.wordR} material={mats.word} />
      <mesh geometry={g.wordL} material={mats.word} />
      {/* tail mark on both sides of the fin */}
      <mesh material={mats.tail} position={[0.29, 7.2, 25.4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
      </mesh>
      <mesh material={mats.tail} position={[-0.29, 7.2, 25.4]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.8, 2.8]} />
      </mesh>
      {engines.map((x, i) => (
        <group key={x} position={[x, -3.15, -12.2]}>
          <mesh geometry={g.nacelle} material={mats.skin} />
          <mesh geometry={g.lip} material={mats.champagne} position={[0, 0, 0.02]} />
          <mesh geometry={g.core} material={mats.dark} />
          <mesh geometry={g.fanDisc} material={mats.fan} position={[0, 0, 0.85]} ref={(m) => { if (m) fans.current[i] = m; }} />
          <mesh geometry={g.spinner} material={mats.dark} position={[0, 0, 0.7]} />
          <mesh geometry={g.pylon} material={mats.skin} position={[0, 1.55, 6.6]} />
          {navLights && <sprite material={lightMats.engine} position={[0, 0, 8.4]} scale={[2.2, 2.2, 1]} />}
        </group>
      ))}
      {navLights && (
        <group>
          <sprite material={lightMats.green} position={tipR} scale={[1.6, 1.6, 1]} />
          <sprite material={lightMats.red} position={tipL} scale={[1.6, 1.6, 1]} />
          <sprite material={lightMats.white.clone()} position={[32.3, 1.1, 13.9]} scale={[3.4, 3.4, 1]} ref={(s) => { if (s) strobes.current[0] = s; }} />
          <sprite material={lightMats.white.clone()} position={[-32.3, 1.1, 13.9]} scale={[3.4, 3.4, 1]} ref={(s) => { if (s) strobes.current[1] = s; }} />
          <sprite material={lightMats.white.clone()} position={[0, 2.2, 30.2]} scale={[2.6, 2.6, 1]} ref={(s) => { if (s) strobes.current[2] = s; }} />
          <sprite material={lightMats.beacon.clone()} position={[0, AC.R + 0.12, -3]} scale={[1.8, 1.8, 1]} ref={(s) => { if (s) beacons.current[0] = s; }} />
          <sprite material={lightMats.beacon.clone()} position={[0, -AC.R - 0.75, 2]} scale={[1.8, 1.8, 1]} ref={(s) => { if (s) beacons.current[1] = s; }} />
        </group>
      )}
      {heroWindow && <InteriorWindow />}
    </group>
  );
}

/** Tiny, low-poly aircraft used on the globe. */
export function MiniPlane({ color = '#F2EDE4' }: { color?: string }) {
  const geo = useMemo(() => {
    const body = new THREE.CapsuleGeometry(0.12, 0.9, 4, 10);
    body.rotateX(Math.PI / 2);
    const wing = new THREE.BufferGeometry();
    const v = new Float32Array([-0.9, 0, 0.25, 0.9, 0, 0.25, 0, 0, -0.25, 0, 0, -0.25, 0.9, 0, 0.25, -0.9, 0, 0.25]);
    wing.setAttribute('position', new THREE.BufferAttribute(v, 3));
    wing.computeVertexNormals();
    const tail = new THREE.BufferGeometry();
    const tv = new Float32Array([-0.32, 0, 0.62, 0.32, 0, 0.62, 0, 0, 0.42, 0, 0, 0.42, 0.32, 0, 0.62, -0.32, 0, 0.62, 0, 0, 0.42, 0, 0.3, 0.66, 0, 0, 0.66]);
    tail.setAttribute('position', new THREE.BufferAttribute(tv, 3));
    tail.computeVertexNormals();
    return { body, wing, tail };
  }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), side: THREE.DoubleSide, toneMapped: false }), [color]);
  return (
    <group>
      <mesh geometry={geo.body} material={mat} />
      <mesh geometry={geo.wing} material={mat} />
      <mesh geometry={geo.tail} material={mat} />
    </group>
  );
}
