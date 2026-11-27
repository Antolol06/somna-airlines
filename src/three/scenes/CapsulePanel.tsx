import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { TIERS, type TierId } from '../../data/capsules';
import { clamp } from '../../lib/math';
import { labelTexture } from '../textures';
import { AMBIENT, AMBIENTS } from '../../data/capsuleOS';
import { getState, useStore } from '../../state/store';
import { domRegistry, TABLET_SURFACE } from '../../state/runtime';

const DEG = Math.PI / 180;

/** Position of the tablet and the seated guest in capsule-local coordinates. */
export function panelLayout(tier: TierId) {
  const { w: W, h: H, l: L } = TIERS[tier].dims;
  const pw = clamp(W * 0.31, 0.31, 0.43);
  const ph = pw * TABLET_SURFACE.height / TABLET_SURFACE.width;
  const floor = -H / 2 + 0.025;
  const flat = H / 2 - Math.min(W, H) * 0.34;
  const yaw = 12 * DEG;
  const cy = clamp(floor + 0.52, -flat + ph / 2 + 0.02, flat - ph / 2 - 0.02);
  const cx = W / 2 - 0.041 - (pw / 2) * Math.sin(yaw);
  const euler = new THREE.Euler(-10 * DEG, -(Math.PI / 2 - yaw), 0, 'YXZ');
  return {
    center: new THREE.Vector3(cx, cy, L / 2 - 0.98),
    euler,
    normal: new THREE.Vector3(0, 0, 1).applyEuler(euler),
    pw,
    ph,
    eye: new THREE.Vector3(Math.max(0, W / 2 - 0.52), floor + 0.71, L / 2 - 0.45),
    floor,
  };
}

/** Match the interactive HTML screen to the physical glass in the WebGL camera. */
export function CapsulePanel({ tier }: { tier: TierId }) {
  const glass = useRef<THREE.Mesh>(null);
  const layout = useMemo(() => panelLayout(tier), [tier]);
  const ambient = useStore((s) => AMBIENT[s.prefs.ambient] ?? AMBIENTS[0]);
  const screen = useMemo(() => labelTexture(ambient.name, { w: 512, h: 320, bg: '#121823', color: ambient.strip, font: '400 68px Jost, sans-serif', sub: 'AMBIENT LIGHT' }), [ambient]);
  const projection = useMemo(() => ({
    viewport: new THREE.Matrix4(),
    matrix: new THREE.Matrix4(),
    point: new THREE.Vector3(),
    eye: new THREE.Vector3(),
    plane: new THREE.Matrix4().set(
      layout.pw / TABLET_SURFACE.width, 0, 0, -layout.pw / 2,
      0, -layout.ph / TABLET_SURFACE.height, 0, layout.ph / 2,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ),
  }), [layout]);

  useFrame(({ camera, size }) => {
    const el = domRegistry.get(TABLET_SURFACE.id);
    if (!el || !glass.current) return;
    const st = getState();
    const mesh = glass.current;
    const available = st.mode === 'dream' && st.dreamPhase === 'personalize' && st.dreamUi;
    if (!available) { el.dataset.visible = 'false'; return; }
    camera.updateMatrixWorld();
    mesh.updateWorldMatrix(true, false);
    const p = projection;
    if (mesh.worldToLocal(p.eye.copy(camera.position)).z <= 0.025) {
      el.dataset.visible = 'false';
      return;
    }
    const w = size.width / 2;
    const h = size.height / 2;
    p.viewport.set(w, 0, 0, w, 0, -h, 0, h, 0, 0, 1, 0, 0, 0, 0, 1);
    p.matrix.copy(p.viewport).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(mesh.matrixWorld).multiply(p.plane);
    const m = p.matrix.elements;
    const maxX = TABLET_SURFACE.width;
    const maxY = TABLET_SURFACE.height;
    if (Math.min(m[15], m[15] + m[3] * maxX, m[15] + m[7] * maxY, m[15] + m[3] * maxX + m[7] * maxY) <= 0.04) {
      el.dataset.visible = 'false';
      return;
    }
    // Keep the screen inert when it has left the viewport, including while looking over a shoulder.
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const x of [0, maxX]) for (const y of [0, maxY]) {
      p.point.set(x, y, 0).applyMatrix4(p.matrix);
      left = Math.min(left, p.point.x);
      top = Math.min(top, p.point.y);
      right = Math.max(right, p.point.x);
      bottom = Math.max(bottom, p.point.y);
    }
    const visible = right > 0 && left < size.width && bottom > 0 && top < size.height;
    el.dataset.visible = String(visible);
    if (visible) el.style.transform = `matrix3d(${m.join(',')})`;
  }, 0.5);
  return (
    <group position={layout.center} rotation={layout.euler}>
      <RoundedBox args={[layout.pw + 0.026, layout.ph + 0.026, 0.028]} radius={0.01} smoothness={3}>
        <meshStandardMaterial color="#24232a" roughness={0.72} metalness={0.34} />
      </RoundedBox>
      <mesh ref={glass} position={[0, 0, 0.016]}>
        <planeGeometry args={[layout.pw, layout.ph]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
    </group>
  );
}
