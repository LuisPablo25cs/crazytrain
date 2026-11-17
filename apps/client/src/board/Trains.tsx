import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEvent, RouteDamage, Theme } from '@rails/shared';
import { playerHex } from '../theme/themes.js';
import { TRAIN_LENGTH_RATIO, TRAIN_WIDTH_RATIO } from './geometry.js';
import { SLOT_Y, type Slot } from './Routes.js';

interface TrainsProps {
  slots: Slot[];
  owners: Record<string, number>;
  playerColors: string[];
  theme: Theme;
  lastEvents: GameEvent[];
  highlighted?: string[];
  /** Seasons mode: broken pieces are missing, damaged or ash-covered cars are darker. */
  damage?: Record<string, RouteDamage>;
  blocked?: Record<string, number>;
  /** How a new claim appears: cars dropping in (Seasons) or the train rolling in along the track (Classic). */
  spawn?: 'drop' | 'roll';
}

const DROP_MS = 450;
/** Rolling in: each car slides along the route, overshoots a little and brakes; the lead car starts first. */
const ROLL_MS = 950;
const ROLL_GAP_MS = 35;
const tmp = new THREE.Object3D();

/** Where a rolling car is along its route at `p` (0..1): from `-from` up to a small overshoot, then back to 0. */
export function rollOffset(p: number, from: number, overshoot: number): number {
  if (p <= 0) return -from;
  if (p >= 1) return 0;
  if (p < 0.82) {
    const u = p / 0.82;
    return -from + (from + overshoot) * (1 - Math.pow(1 - u, 3));
  }
  return overshoot * (1 - (p - 0.82) / 0.18);
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Train cars on claimed routes in the owner's color (R19). New claims drop in as a short cue. */
export function Trains({ slots, owners, playerColors, theme, lastEvents, highlighted, damage, blocked, spawn = 'drop' }: TrainsProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(
    () => slots.filter((s) => owners[s.routeId] !== undefined && !damage?.[s.routeId]?.broken.includes(s.index)),
    [slots, owners, damage],
  );
  const body = useMemo(() => {
    // A low-poly car: a box with a raised roof, merged into one geometry.
    const base = new THREE.BoxGeometry(1, 0.65, 1).translate(0, 0.325, 0);
    const roof = new THREE.CylinderGeometry(0.42, 0.5, 1, 6, 1).rotateZ(Math.PI / 2).scale(0.92, 0.55, 0.85).translate(0, 0.78, 0);
    const parts = [base.toNonIndexed(), roof.toNonIndexed()];
    const positions = parts.flatMap((g) => Array.from(g.getAttribute('position').array));
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.computeVertexNormals();
    return merged;
  }, []);
  const appear = useRef(new Map<string, number>());
  // Per route: its direction from the first city (slot 0) and how far apart its cars sit.
  const tracks = useMemo(() => {
    const byRoute = new Map<string, Slot[]>();
    for (const s of slots) byRoute.set(s.routeId, [...(byRoute.get(s.routeId) ?? []), s]);
    const out = new Map<string, { dx: number; dy: number; step: number; count: number }>();
    for (const [id, list] of byRoute) {
      list.sort((a, b) => a.index - b.index);
      const a = list[0]!;
      const b = list[list.length - 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = len > 0 ? (b.x - a.x) / len : Math.cos(a.angle);
      const dy = len > 0 ? (b.y - a.y) / len : Math.sin(a.angle);
      out.set(id, { dx, dy, step: list.length > 1 ? len / (list.length - 1) : a.length, count: list.length });
    }
    return out;
  }, [slots]);

  useLayoutEffect(() => {
    const now = performance.now();
    for (const e of lastEvents) if (e.type === 'claimedRoute') appear.current.set(e.routeId, now);
  }, [lastEvents]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new THREE.Color();
    const glow = new THREE.Color(theme.board.highlight);
    const marked = new Set(highlighted ?? []);
    cars.forEach((s, i) => {
      color.set(playerHex(theme, playerColors[owners[s.routeId]!] ?? ''));
      if (marked.has(s.routeId)) color.lerp(glow, 0.55);
      if (damage?.[s.routeId]) color.lerp(new THREE.Color('#3b2a24'), 0.45);
      if (blocked?.[s.routeId] !== undefined) color.lerp(new THREE.Color('#5d5555'), 0.7);
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cars, owners, playerColors, theme, highlighted, damage, blocked]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    let animating = false;
    const roll = spawn === 'roll' && !reducedMotion();
    cars.forEach((s, i) => {
      const start = appear.current.get(s.routeId);
      let x = s.x;
      let y = s.y;
      let lift = 0;
      let visible = true;
      const track = roll ? tracks.get(s.routeId) : undefined;
      if (start !== undefined && track) {
        // Nose first: the car at the far end leads, so it starts earliest.
        const delay = (track.count - 1 - s.index) * ROLL_GAP_MS;
        const p = Math.max(0, Math.min(1, (now - start - delay) / ROLL_MS));
        if (p < 1) animating = true;
        const off = rollOffset(p, track.step * (track.count + 1), s.length * 0.1);
        x += track.dx * off;
        y += track.dy * off;
        // Hidden until it rolls out of the first city.
        visible = s.index * track.step + off > -track.step * 0.5;
      } else if (start !== undefined) {
        const t = Math.min(1, (now - start) / DROP_MS);
        if (t < 1) animating = true;
        lift = (1 - t) * (1 - t) * 18;
      }
      tmp.position.set(x, SLOT_Y + 0.35 + lift, y);
      tmp.rotation.set(0, -s.angle, 0);
      const k = visible ? 1 : 0;
      tmp.scale.set(s.length * TRAIN_LENGTH_RATIO * k, 2.6 * k, s.width * TRAIN_WIDTH_RATIO * k);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (!animating && appear.current.size > 0) appear.current.clear();
  });

  if (cars.length === 0) return null;
  return (
    <instancedMesh key={cars.length} ref={mesh} args={[body, undefined, cars.length]} raycast={() => null}>
      <meshStandardMaterial flatShading />
    </instancedMesh>
  );
}
