import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Aircraft } from '../models/Aircraft';
import { CapsuleModel, makeControls } from '../models/CapsuleModel';
import { AC } from '../models/aircraftGeometry';
import { LAYOUT, SLOT, TIERS } from '../../data/capsules';
import { aimCamera, director, dofTarget, fitFov, isOn, post, rig, setPoint, sharedFog } from '../core';
import { domRegistry } from '../../state/runtime';
import { getState, useStore } from '../../state/store';
import { audio } from '../../lib/audio';
import { damp, easeInOut, lerp, wrapAngle } from '../../lib/math';

const FLOOR = AC.floorY;
const selectionState = { drag: 0, pointerId: -1, lastX: 0, lastY: 0, moved: 0, focus: 0, topView: 0, hover: -1 };

const noRaycast = () => {};
const CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.32);

function trayGeometry() {
  // unit open-top tray: floor + 3 walls (aisle side open), x ∈ [-.5,.5] (across), z ∈ [-.5,.5] (along), y ∈ [0,1]
  const t = 0.04;
  const parts = [
    new THREE.BoxGeometry(1, t, 1).translate(0, t / 2, 0),
    new THREE.BoxGeometry(t, 1, 1).translate(-0.5 + t / 2, 0.5, 0), // outer wall (x = -0.5 is the fuselage side)
    new THREE.BoxGeometry(1, 1, t).translate(0, 0.5, -0.5 + t / 2),
    new THREE.BoxGeometry(1, 1, t).translate(0, 0.5, 0.5 - t / 2),
    new THREE.BoxGeometry(t, 0.22, 1).translate(0.5 - t / 2, 0.11, 0), // low sill on the aisle side
  ];
  return mergeGeometries(parts)!;
}

export function SelectionScene() {
  const group = useRef<THREE.Group>(null);
  const capsuleId = useStore((s) => s.guestCapsules[s.activeGuest]);
  const quality = useStore((s) => s.quality);
  const gl = useThree((s) => s.gl);
  const trays = useRef<THREE.InstancedMesh>(null);
  const beds = useRef<THREE.InstancedMesh>(null);
  const controls = useMemo(() => makeControls('relax'), []);
  const detail = useRef<THREE.Group>(null);
  const hiddenSet = useRef<number[]>([]);
  const hiddenKey = useRef('');
  const wasActive = useRef(false);

  const res = useMemo(() => {
    const tray = trayGeometry();
    const bed = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
    const trayMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0 });
    const bedMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const floorMat = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.9, clippingPlanes: [CLIP] });
    const gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uFade: { value: 1 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vW;
        float line(float x, float w){ float d = abs(fract(x) - 0.5); return 1.0 - smoothstep(0.0, w, 0.5 - d); }
        void main(){ vec2 p = vW.xz / 4.0; float g = max(line(p.x, 0.02), line(p.y, 0.02)) * 0.35 + max(line(p.x / 5.0, 0.006), line(p.y / 5.0, 0.006)) * 0.5;
          float r = length(vW.xz) / 90.0; float a = g * (1.0 - smoothstep(0.1, 1.0, r)) * uFade;
          gl_FragColor = vec4(vec3(0.78, 0.68, 0.52) * 0.6, a * 0.26); }`,
    });
    return { tray, bed, trayMat, bedMat, floorMat, gridMat };
  }, []);

  // instance transforms
  const setupInstances = () => {
    const tm = trays.current;
    const bm = beds.current;
    if (!tm || !bm || tm.userData.ready) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    LAYOUT.forEach((s, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.side < 0 ? 0 : Math.PI);
      m.compose(new THREE.Vector3(s.x, FLOOR + s.y + 0.02, s.z), q, new THREE.Vector3(s.d, s.h, s.w));
      tm.setMatrixAt(i, m);
      tm.setColorAt(i, new THREE.Color('#efe7da'));
      m.compose(new THREE.Vector3(s.x - s.side * 0.05, FLOOR + s.y + 0.14, s.z), q, new THREE.Vector3(s.d - 0.3, 0.18, s.w - 0.22));
      bm.setMatrixAt(i, m);
      bm.setColorAt(i, new THREE.Color('#ffffff'));
    });
    tm.instanceMatrix.needsUpdate = true;
    bm.instanceMatrix.needsUpdate = true;
    tm.userData.ready = true;
  };
  useEffect(setupInstances);

  // drag to orbit
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (director.scene !== 'selection' || getState().selectionView !== 'aircraft' || e.button !== 0 || selectionState.pointerId !== -1) return;
      selectionState.pointerId = e.pointerId;
      selectionState.lastX = e.clientX;
      selectionState.lastY = e.clientY;
      selectionState.moved = 0;
    };
    const move = (e: PointerEvent) => {
      if (selectionState.pointerId !== e.pointerId) return;
      const dx = e.clientX - selectionState.lastX;
      const dy = e.clientY - selectionState.lastY;
      selectionState.lastX = e.clientX;
      selectionState.lastY = e.clientY;
      selectionState.moved += Math.hypot(dx, dy);
      if (!getState().selectionFocus) selectionState.drag = wrapAngle(selectionState.drag + dx * 0.006);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === selectionState.pointerId) selectionState.pointerId = -1;
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

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (director.scene !== 'selection' || getState().selectionView !== 'aircraft') return;
    e.stopPropagation();
    const id = e.instanceId ?? -1;
    if (id !== selectionState.hover) {
      selectionState.hover = id;
      if (id >= 0) audio.blip(1200);
    }
    const st = getState();
    const owner = id >= 0 ? st.guestCapsules.indexOf(LAYOUT[id].id) : -1;
    document.body.style.cursor = id >= 0 && !LAYOUT[id].reserved && (owner < 0 || owner === st.activeGuest) ? 'pointer' : id >= 0 ? 'not-allowed' : '';
    const tip = domRegistry.get('sel-tip');
    if (tip && id >= 0) {
      const s = LAYOUT[id];
      tip.style.transform = `translate3d(${e.nativeEvent.clientX + 16}px, ${e.nativeEvent.clientY + 14}px, 0)`;
      tip.dataset.visible = '1';
      const t = tip.querySelector('[data-k="id"]');
      const d = tip.querySelector('[data-k="desc"]');
      if (t) t.textContent = `${s.id} · ${TIERS[s.tier].short}`;
      if (d) d.textContent = s.reserved ? 'Reserved' : owner >= 0 ? `Guest ${owner + 1}` : s.level ? 'Upper tier · available' : 'Available';
    }
  };
  const onOut = () => {
    selectionState.hover = -1;
    document.body.style.cursor = '';
    const tip = domRegistry.get('sel-tip');
    if (tip) tip.dataset.visible = '0';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (director.scene !== 'selection' || getState().selectionView !== 'aircraft' || selectionState.moved > 6) return;
    e.stopPropagation();
    const id = e.instanceId;
    if (id == null) return;
    const s = LAYOUT[id];
    if (s.reserved || (s.level === 1 && !getState().selectionUpperDeck)) return;
    if (getState().selectCapsule(s.id)) audio.blip(660);
  };

  const _p = useMemo(() => new THREE.Vector3(), []);
  const _t = useMemo(() => new THREE.Vector3(), []);
  const _c = useMemo(() => new THREE.Color(), []);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const C = useMemo(
    () => ({
      avail: new THREE.Color('#ece4d6'),
      reserved: new THREE.Color('#4a4642'),
      hover: new THREE.Color('#ffd9a3').multiplyScalar(1.25),
      sel: new THREE.Color('#ffb76a').multiplyScalar(1.4),
      bedOn: new THREE.Color('#ffd4a0').multiplyScalar(1.3),
      bedOff: new THREE.Color('#d9d2c6').multiplyScalar(0.55),
      bedRes: new THREE.Color('#3a3733'),
    }),
    [],
  );
  const zones = useMemo(
    () =>
      (['grand', 'signature', 'essential'] as const).map((t) => {
        const ss = LAYOUT.filter((s) => s.tier === t);
        const z = ss.reduce((a, s) => a + s.z, 0) / ss.length;
        return { t, pos: new THREE.Vector3(0, FLOOR + 2.4, z) };
      }),
    [],
  );

  useFrame((s, dt) => {
    const g = group.current!;
    const st = getState();
    const active = director.scene === 'selection' && st.selectionView === 'aircraft';
    g.visible = active || (isOn('selection') && director.prewarm > 0);
    // only raycast the capsules while this chapter is on screen (pointer moves elsewhere stay free)
    const tr = trays.current;
    if (tr) {
      const want = active ? THREE.InstancedMesh.prototype.raycast : noRaycast;
      if (tr.raycast !== want) tr.raycast = want;
    }
    if (!active) {
      if (wasActive.current) {
        wasActive.current = false;
        selectionState.pointerId = -1;
        selectionState.drag = 0;
        selectionState.focus = 0;
        selectionState.topView = 0;
        onOut();
      }
      if (director.scene === 'selection') s.scene.background = _bg;
      return;
    }
    wasActive.current = true;
    const t = s.clock.elapsedTime;
    const selectedId = st.guestCapsules[st.activeGuest];
    const sel = selectedId ? SLOT[selectedId] : null;
    const selIdx = sel ? LAYOUT.indexOf(sel) : -1;
    const wantFocus = st.selectionFocus && !!sel;
    selectionState.focus = st.reducedMotion ? Number(wantFocus) : damp(selectionState.focus, Number(wantFocus), 4.8, dt);
    const f = easeInOut(selectionState.focus);

    // instance colours
    if (!trays.current?.userData.ready) setupInstances();
    const tm = trays.current!;
    const bm = beds.current!;
    if (!tm.instanceColor || !bm.instanceColor) return;
    // hide the tray the detailed capsule replaces, plus the trays between it and the camera
    const hideSet: number[] = [];
    LAYOUT.forEach((sl, i) => {
      const hiddenLevel = !st.selectionUpperDeck && sl.level === 1;
      const blocksInterior = sel && f > 0.33 && (i === selIdx || (sl.side !== sel.side && Math.abs(sl.z - sel.z) < 3.4));
      if (hiddenLevel || blocksInterior) hideSet.push(i);
    });
    const hideKey = hideSet.join(',');
    if (hideKey !== hiddenKey.current) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const restore = (i: number, zero: boolean) => {
        if (i < 0) return;
        const sl = LAYOUT[i];
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, sl.side < 0 ? 0 : Math.PI);
        const sc = zero ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : new THREE.Vector3(sl.d, sl.h, sl.w);
        m4.compose(new THREE.Vector3(sl.x, FLOOR + sl.y + 0.02, sl.z), q, sc);
        tm.setMatrixAt(i, m4);
        const bs = zero ? new THREE.Vector3(0.0001, 0.0001, 0.0001) : new THREE.Vector3(sl.d - 0.3, 0.18, sl.w - 0.22);
        m4.compose(new THREE.Vector3(sl.x - sl.side * 0.05, FLOOR + sl.y + 0.14, sl.z), q, bs);
        bm.setMatrixAt(i, m4);
      };
      hiddenSet.current.forEach((i) => restore(i, false));
      hideSet.forEach((i) => restore(i, true));
      hiddenSet.current = hideSet;
      hiddenKey.current = hideKey;
      tm.instanceMatrix.needsUpdate = true;
      bm.instanceMatrix.needsUpdate = true;
    }
    LAYOUT.forEach((sl, i) => {
      const hover = i === selectionState.hover && !sl.reserved;
      const isSel = st.guestCapsules.includes(sl.id);
      if (sl.reserved) _c.copy(C.reserved);
      else if (isSel) _c.copy(C.sel);
      else if (hover) _c.copy(C.hover);
      else _c.copy(C.avail).multiplyScalar(0.84 * (1 - 0.35 * f));
      tm.setColorAt(i, _c);
      if (sl.reserved) _c.copy(C.bedRes);
      else if (isSel || hover) _c.copy(C.bedOn);
      else _c.copy(C.bedOff).multiplyScalar(sl.tier === sel?.tier ? 1.3 : 1);
      bm.setColorAt(i, _c);
    });
    tm.instanceColor!.needsUpdate = true;
    bm.instanceColor!.needsUpdate = true;

    // detailed capsule replaces the selected tray
    const d = detail.current;
    if (d) {
      d.visible = !!sel && f > 0.02;
      if (sel) {
        const dims = TIERS[sel.tier].dims;
        d.position.set(sel.x + sel.side * 0.05, FLOOR + sel.y + dims.h / 2 + 0.09, sel.z);
        d.rotation.y = sel.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        d.scale.setScalar(lerp(0.85, 1, f));
      }
    }
    controls.blind = 0;
    controls.level = 1.1;

    // camera: orbit the cutaway, or fly to the selected capsule
    const portrait = s.size.width <= 760;
    selectionState.topView = st.reducedMotion ? Number(st.selectionTopDown) : damp(selectionState.topView, Number(st.selectionTopDown), 7, dt);
    const topView = selectionState.topView;
    const az = lerp(-1.0, -Math.PI / 2, topView) + selectionState.drag;
    const el = lerp(0.78, 1.53, topView);
    const R = portrait ? lerp(106, 127, topView) : lerp(89, 111, topView);
    const cz = 0;
    _p.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, cz + Math.cos(az) * Math.cos(el) * R);
    _t.set(0, -1, cz);
    if (sel && f > 0.001) {
      const side = sel.side;
      const dims = TIERS[sel.tier].dims;
      const doorX = sel.x - side * dims.l * 0.35;
      const back = 3.2 + dims.w * 0.8 + (portrait ? 1.4 : 0);
      const fp = new THREE.Vector3(doorX - side * back, FLOOR + sel.y + dims.h * 0.72 + 0.64, sel.z + 1.3);
      const ft = new THREE.Vector3(doorX, FLOOR + sel.y + dims.h * 0.50, sel.z);
      _p.lerp(fp, f);
      _t.lerp(ft, f);
    }
    aimCamera(s.camera as THREE.PerspectiveCamera, _p, _t, fitFov(lerp(34, 42, f), director.aspect, 1.0), 0, portrait ? 0 : lerp(0.16, 0.20, f), portrait ? 0.025 : 0);
    const cam = s.camera as THREE.PerspectiveCamera;
    if (cam.near !== 0.05 || cam.far !== 3000) {
      cam.near = 0.05;
      cam.far = 3000;
      cam.updateProjectionMatrix();
    }

    cam.updateMatrixWorld();
    // zone labels
    const w = s.size.width;
    const h = s.size.height;
    zones.forEach((z) => {
      const elz = domRegistry.get(`zone-${z.t}`);
      if (!elz) return;
      _v.copy(z.pos).project(cam);
      elz.style.transform = `translate3d(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h - 37 * topView}px, 0)`;
      elz.dataset.visible = f < 0.2 ? '1' : '0';
      elz.dataset.active = z.t === sel?.tier ? '1' : '0';
    });

    // lights
    rig.key!.color.set('#fff1de');
    rig.key!.intensity = 1.25;
    rig.key!.position.set(20, 40, 10);
    rig.rim!.color.set('#8ea3d6');
    rig.rim!.intensity = 0.9;
    rig.rim!.position.set(-30, 20, -40);
    rig.hemi!.color.set('#c9cfdc');
    rig.hemi!.groundColor.set('#1d1915');
    rig.hemi!.intensity = 0.85;
    rig.ambient!.intensity = 0.08;
    if (sel) setPoint(0, '#ffbe7a', 3 * f + 0.8, sel.x, FLOOR + sel.y + 0.9, sel.z, 4);
    setPoint(1, '#ffd2a0', 1.2, 0, 0.8, cz + Math.sin(t * 0.2) * 10, 30);
    s.scene.environmentIntensity = 0.5;
    sharedFog.near = 1e4;
    sharedFog.far = 1e5;
    s.scene.background = _bg;
    res.gridMat.uniforms.uFade.value = 1 - f;
    if (sel) dofTarget.set(sel.x, FLOOR + sel.y + 0.5, sel.z);
    else dofTarget.set(0, -1, cz);
    post.bokeh = quality === 'high' ? 1.6 * f : 0;
    post.focusRange = 2;
  });

  const selSlot = capsuleId ? SLOT[capsuleId] : null;
  return (
    <group ref={group}>
      <Aircraft cutaway={CLIP} navLights={false} windowGlow={0.5} />
      <mesh material={res.floorMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR, -4]}>
        <planeGeometry args={[5.8, 36]} />
      </mesh>
      <instancedMesh ref={trays} args={[res.tray, res.trayMat, LAYOUT.length]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      <instancedMesh ref={beds} args={[res.bed, res.bedMat, LAYOUT.length]} raycast={() => null} />
      <group ref={detail}>{selSlot && <CapsuleModel tier={selSlot.tier} controls={controls} label={selSlot.id} />}</group>
      <mesh material={res.gridMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, -3]}>
        <planeGeometry args={[220, 220]} />
      </mesh>
    </group>
  );
}

const _bg = new THREE.Color('#07080c');
