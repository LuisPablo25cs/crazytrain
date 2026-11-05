import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEvent, Theme } from '@rails/shared';
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
}

const DROP_MS = 450;
const tmp = new THREE.Object3D();

/** Train cars on claimed routes in the owner's color (R19). New claims drop in as a short cue. */
export function Trains({ slots, owners, playerColors, theme, lastEvents, highlighted }: TrainsProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => slots.filter((s) => owners[s.routeId] !== undefined), [slots, owners]);
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
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cars, owners, playerColors, theme, highlighted]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    let animating = false;
    cars.forEach((s, i) => {
      const start = appear.current.get(s.routeId);
      const t = start === undefined ? 1 : Math.min(1, (now - start) / DROP_MS);
      if (t < 1) animating = true;
      tmp.position.set(s.x, SLOT_Y + 0.35 + (1 - t) * (1 - t) * 18, s.y);
      tmp.rotation.set(0, -s.angle, 0);
      tmp.scale.set(s.length * TRAIN_LENGTH_RATIO, 2.6, s.width * TRAIN_WIDTH_RATIO);
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
