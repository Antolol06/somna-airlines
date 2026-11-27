/**
 * Camera direction for the cabin — a dolly, not a walk.
 *
 * Every shot is a Pose (position + yaw + pitch + fov), and every move is an interpolation
 * between poses as a pure function of progress values (scroll, or the dream timeline).
 * There is no accumulated state, no noise and no look-at target interpolation, so the
 * camera can never drift, wobble or get stuck — scrolling backwards replays the exact
 * same path in reverse, at any speed.
 *
 * Yaw is measured from straight down the aisle (−z) toward +x; pitch is up from level.
 */
import * as THREE from 'three';
import { CAB } from './cabinShading';
import { capsuleFrame, type CapsuleFrame } from './DreamCapsule';
import { panelLayout } from './CapsulePanel';
import { TOUR } from '../../data/capsuleOS';
import type { TierId } from '../../data/capsules';
import { dream, roomLook } from '../../state/runtime';
import { clamp, wrapAngle } from '../../lib/math';
import { fitFov } from '../core';

const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** sine in-out: zero velocity at both ends, gentle acceleration */
export const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

export interface Pose {
  p: THREE.Vector3;
  yaw: number;
  pitch: number;
  fov: number;
  /** where the lens focuses (depth of field) */
  focus: THREE.Vector3;
}
export const makePose = (): Pose => ({ p: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 44, focus: new THREE.Vector3() });

export function poseDir(yaw: number, pitch: number, out: THREE.Vector3) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
function aim(pose: Pose, target: THREE.Vector3) {
  const dx = target.x - pose.p.x;
  const dy = target.y - pose.p.y;
  const dz = target.z - pose.p.z;
  pose.yaw = Math.atan2(dx, -dz);
  pose.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
/** out = a → b at t (out may be a) */
export function mixPose(out: Pose, a: Pose, b: Pose, t: number) {
  out.p.lerpVectors(a.p, b.p, t);
  out.yaw = lerp(a.yaw, b.yaw, t);
  out.pitch = lerp(a.pitch, b.pitch, t);
  out.fov = lerp(a.fov, b.fov, t);
  out.focus.lerpVectors(a.focus, b.focus, t);
  return out;
}

// ---------------------------------------------------------------- the dolly tour (scroll)
export const DOLLY = { y: 1.5, pitch: -3 * DEG, fov: 44 };
/**
 * The dolly stops this far before a featured capsule, then turns to it. Scaled to the
 * capsule, so each one fills a similar share of the frame in a three-quarter view.
 */
const STOP_AHEAD: Record<TierId, number> = { essential: 2.2, signature: 2.6, grand: 3.0 };

const frames: Partial<Record<TierId, CapsuleFrame>> = {};
const frameOf = (t: TierId) => (frames[t] ??= capsuleFrame(t));
const STOPS = TOUR.stops.map((s) => ({ ...s, z: frameOf(s.tier).zc + STOP_AHEAD[s.tier] }));
const Z0 = CAB.zStart;
const Z_END = frameOf('grand').zc - 1.1;
const MARKS = [Z0, ...STOPS.map((s) => s.z), Z_END];

const _t = new THREE.Vector3();
const _d = new THREE.Vector3();

/** The composed view of a featured capsule: stepped to the far side of the aisle, lowered to it. */
function showcasePose(fr: CapsuleFrame, landscape: boolean, out: Pose) {
  out.p.set(-fr.side * 0.45, fr.yc + 0.55, fr.zc + STOP_AHEAD[fr.zone.id] - 0.3);
  _t.set(fr.side * (fr.face + 0.3), fr.yc - 0.04, fr.zc);
  aim(out, _t);
  // on wide screens the capsule sits right of centre, leaving the left for its story
  if (landscape) out.yaw -= fr.side * 9 * DEG;
  else out.pitch -= 7 * DEG;
  out.fov = DOLLY.fov;
  out.focus.copy(_t);
  return out;
}

/**
 * Scroll progress → camera. Between marks the dolly glides straight down the centre of
 * the aisle; at a mark it stops, turns (and cranes down) to the featured capsule, holds
 * with a slow push-in, then returns to the centre line and carries on.
 */
export function tourPose(p: number, landscape: boolean, out: Pose, tmp: Pose) {
  let z = Z0;
  let sigma = 0;
  let stop = -1;
  let push = 0;
  for (let i = 0; i < STOPS.length; i++) {
    const sh = STOPS[i].show;
    if (p >= sh[0] && p <= sh[3]) {
      stop = i;
      z = STOPS[i].z;
      sigma = p < sh[1] ? ease((p - sh[0]) / (sh[1] - sh[0])) : p <= sh[2] ? 1 : 1 - ease((p - sh[2]) / (sh[3] - sh[2]));
      push = ease((p - sh[1]) / (sh[2] - sh[1]));
      break;
    }
  }
  if (stop < 0) {
    // which dolly segment are we in?
    const bounds = [0, ...STOPS.flatMap((s) => [s.show[0], s.show[3]]), 1];
    for (let k = 0; k < MARKS.length - 1; k++) {
      const a = bounds[k * 2];
      const b = bounds[k * 2 + 1];
      if (p <= b || k === MARKS.length - 2) {
        z = lerp(MARKS[k], MARKS[k + 1], ease((p - a) / Math.max(1e-6, b - a)));
        break;
      }
    }
  }
  out.p.set(0, DOLLY.y, z);
  out.yaw = 0;
  out.pitch = DOLLY.pitch - (landscape ? 0 : 2 * DEG);
  out.fov = DOLLY.fov;
  out.focus.set(0, 1.2, z - 6);
  if (stop >= 0 && sigma > 0) {
    showcasePose(frameOf(STOPS[stop].tier), landscape, tmp);
    tmp.p.addScaledVector(poseDir(tmp.yaw, tmp.pitch, _d), 0.16 * push);
    mixPose(out, out, tmp, sigma);
  }
  return { sigma, stop: stop >= 0 ? STOPS[stop].tier : null };
}

/** How open each featured capsule's shade is at a scroll position (monotonic in scroll). */
export function shadeOpen(tier: TierId, p: number) {
  const s = STOPS.find((x) => x.tier === tier)!;
  return ease((p - s.show[0]) / (s.show[1] - s.show[0]));
}

// ---------------------------------------------------------------- the dream
const layouts: Partial<Record<TierId, ReturnType<typeof panelLayout>>> = {};
const layoutOf = (t: TierId) => (layouts[t] ??= panelLayout(t));
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const P = { axis: new THREE.Vector3(), inside: new THREE.Vector3() };
const roomViewPose = makePose();
const roomTarget = new THREE.Vector3();
export type RoomAngles = { yaw: number; pitch: number };

/** Resting view: sitting up against the pillow, looking along the capsule, panel at hand. */
function restPose(fr: CapsuleFrame, tier: TierId, landscape: boolean, out: Pose) {
  const lay = layoutOf(tier);
  fr.toWorld(lay.eye, out.p);
  out.yaw = fr.side * 90 * DEG + (landscape ? 16 : 30) * DEG;
  out.pitch = -6 * DEG;
  out.fov = 54;
  fr.toWorld(lay.center, _a);
  fr.toWorld(_b.set(0, 0, -fr.l / 2), _c);
  out.focus.lerpVectors(_a, _c, 0.5);
  return out;
}

/** The presets turn the guest's head toward a feature without moving through the cabin walls. */
export function roomLookTarget(fr: CapsuleFrame, tier: TierId, landscape: boolean, out: RoomAngles) {
  const pose = restPose(fr, tier, landscape, roomViewPose);
  const yaw = pose.yaw;
  const pitch = pose.pitch;
  switch (roomLook.view) {
    case 'window':
      fr.toWorld(roomTarget.set(0, fr.h * 0.12, -fr.l / 2), roomTarget);
      aim(pose, roomTarget);
      break;
    case 'bed':
      fr.toWorld(roomTarget.set(0, -fr.h / 2 + 0.23, -0.1), roomTarget);
      aim(pose, roomTarget);
      break;
    case 'entrance':
      fr.toWorld(roomTarget.set(0, 0.08, fr.l / 2 + 0.4), roomTarget);
      aim(pose, roomTarget);
      break;
  }
  out.yaw = wrapAngle(pose.yaw + roomLook.yaw - yaw);
  out.pitch = clamp(pose.pitch + roomLook.pitch, -1.12, 1.07) - pitch;
}

/** Move square to the glass so the wall controls are large enough for touch. */
export function tabletPose(fr: CapsuleFrame, tier: TierId, aspect: number, out: Pose) {
  const layout = layoutOf(tier);
  const center = fr.toWorld(layout.center, _a);
  const normal = fr.dirToWorld(layout.normal, _b);
  center.addScaledVector(normal, 0.016);
  const fov = 42;
  const vertical = Math.tan(fitFov(fov, aspect, 1) * DEG / 2);
  const distance = Math.max(layout.ph / (2 * vertical * 0.67), layout.pw / (2 * vertical * aspect * 0.86));
  out.p.copy(center).addScaledVector(normal, distance);
  aim(out, center);
  out.fov = fov;
  out.focus.copy(center);
}

/**
 * Boarding → settling in → (touchscreen) → sleep → waking, as one physically coherent move.
 * Each stage starts exactly where the previous one ended, so there is never a jump.
 */
export function dreamPose(fr: CapsuleFrame, tier: TierId, aspect: number, look: RoomAngles, out: Pose, t1: Pose, t2: Pose) {
  const s = fr.side;
  const landscape = aspect >= 1;
  // boarding stops closer than the showcase: this is an approach, not a portrait
  const stopZ = fr.zc + 1.15;
  const into = s * 90 * DEG;

  // A · glide down the centre of the aisle to the capsule's mark
  out.p.set(0, DOLLY.y, lerp(Z0, stopZ, dream.boardT));
  out.yaw = 0;
  out.pitch = DOLLY.pitch;
  out.fov = DOLLY.fov;
  out.focus.set(0, 1.2, out.p.z - 6);

  // B · approach: crane down and turn to the entrance, arriving on its centre line
  fr.toWorld(_a.set(0, 0.08, fr.l / 2 + 0.9), P.axis);
  const door = dream.door;
  if (door > 0) {
    // quadratic Bézier from wherever the glide is → (slightly across the aisle) → the entrance axis
    _b.copy(out.p);
    _c.set(-s * 0.22, (DOLLY.y + P.axis.y) / 2 + 0.08, fr.zc + 0.45);
    const u = door;
    const k0 = (1 - u) * (1 - u);
    const k1 = 2 * u * (1 - u);
    const k2 = u * u;
    out.p.set(_b.x * k0 + _c.x * k1 + P.axis.x * k2, _b.y * k0 + _c.y * k1 + P.axis.y * k2, _b.z * k0 + _c.z * k1 + P.axis.z * k2);
    out.yaw = lerp(out.yaw, into, door);
    out.pitch = lerp(out.pitch, -3 * DEG, door);
    out.fov = lerp(DOLLY.fov, 46, door);
    fr.toWorld(_a.set(0, 0, fr.l / 2 - 0.8), _b);
    out.focus.lerp(_b, door);
  }

  // C · through the opening along its axis — the only path that clears the bezel everywhere
  if (dream.enter > 0) {
    fr.toWorld(_a.set(0, 0.08, fr.l / 2 - 0.25), P.inside);
    out.p.lerp(P.inside, dream.enter);
    out.yaw = lerp(out.yaw, into, dream.enter);
    out.pitch = lerp(out.pitch, -3 * DEG, dream.enter);
    out.fov = lerp(out.fov, 50, dream.enter);
  }

  // D · settle against the pillow
  if (dream.lie > 0) {
    const rest = restPose(fr, tier, landscape, t1);
    rest.yaw += look.yaw;
    rest.pitch += look.pitch;
    rest.focus.copy(rest.p).addScaledVector(poseDir(rest.yaw, rest.pitch, _d), 1.1);
    mixPose(out, out, rest, dream.lie);
  }

  // F · lie back to sleep, gaze drifting up to the ceiling
  if (dream.recline > 0) {
    const lay = layoutOf(tier);
    fr.toWorld(_a.set(lay.eye.x, lay.floor + 0.42, fr.l / 2 - 0.36), t2.p);
    t2.yaw = into + 4 * DEG;
    t2.pitch = 20 * DEG;
    t2.fov = 56;
    fr.toWorld(_a.set(0, fr.h / 2, -fr.l / 4), t2.focus);
    mixPose(out, out, t2, dream.recline);
  }

  // G · waking: sit up, turn toward the entrance (the shade rises in view), step out
  const ex = dream.exit;
  if (ex > 0) {
    const lay = layoutOf(tier);
    const turn = ease(ex / 0.45);
    const step = ease((ex - 0.45) / 0.55);
    const y0 = out.yaw;
    const p0 = out.pitch;
    const outward = into + Math.PI; // facing the aisle
    fr.toWorld(_a.set(lay.eye.x * 0.4, lay.floor + 0.71, fr.l / 2 - 0.5), _b);
    out.p.lerp(_b, turn);
    out.yaw = lerp(y0, outward, turn);
    // a calm yaw; the gaze lifts to the ceiling light line while sweeping past the side wall
    out.pitch = lerp(p0, -4 * DEG, turn) + 24 * DEG * Math.sin(Math.PI * turn);
    out.fov = lerp(out.fov, 48, turn);
    fr.toWorld(_a.set(0, 0, fr.l / 2), out.focus);
    if (step > 0) {
      _c.set(s * (fr.face - 0.85), 1.44, fr.zc);
      out.p.lerp(_c, step);
      out.yaw = lerp(outward, s > 0 ? 2 * Math.PI : 0, step);
      out.pitch = lerp(-4 * DEG, DOLLY.pitch, step);
      out.fov = lerp(48, DOLLY.fov, step);
      out.focus.set(0, 1.2, fr.zc - 6);
    }
  }
  return out;
}
