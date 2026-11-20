import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEvent, RouteDamage, Theme } from '@rails/shared';
import { playerHex } from '../theme/themes.js';
import { TRAIN_LENGTH_RATIO, TRAIN_WIDTH_RATIO } from './geometry.js';
import { glyphPlane, glyphTexture, isEmoji, markGeometry, markInk, signIndex, typedChar } from './playerMarks.js';
import { SLOT_Y, type Slot } from './Routes.js';

interface TrainsProps {
  slots: Slot[];
  owners: Record<string, number>;
  playerColors: string[];
  /** Each player's sign id (PLAYER_SIGNS), by player index; missing ones fall back to the index. */
  playerSigns?: (string | undefined)[];
  theme: Theme;
  lastEvents: GameEvent[];
  highlighted?: string[];
  /** Seasons mode: broken pieces are missing, damaged or ash-covered cars are darker. */
  damage?: Record<string, RouteDamage>;
  blocked?: Record<string, number>;
  /** How a new claim appears: cars dropping in (Seasons) or the train rolling in along the track (Classic). */
  spawn?: 'drop' | 'roll';
  /** Classic mode: cars get a dark outline and the owner's roof mark, so they never read as empty track. */
  classic?: boolean;
  /** Classic mode: while a plaque is pointed at, that player's trains stay lit and the rest dim. */
  focusPlayer?: number | null;
}

const DROP_MS = 450;
/** Rolling in: each car slides along the route, overshoots a little and brakes; the lead car starts first. */
const ROLL_MS = 950;
const ROLL_GAP_MS = 35;
const CAR_HEIGHT = 2.6;
/** Top of the roof, as a share of the car height (see the body geometry). */
const ROOF_TOP = 1.06;
const tmp = new THREE.Object3D();
const DIM = new THREE.Color('#20343b');

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

/** A low-poly car: a box with a raised roof. The roof is lighter (vertex colors) so a car reads as a car. */
function carBody(shaded: boolean): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(1, 0.65, 1).translate(0, 0.325, 0).toNonIndexed();
  const roof = new THREE.CylinderGeometry(0.42, 0.5, 1, 6, 1).rotateZ(Math.PI / 2).scale(0.92, 0.55, 0.85).translate(0, 0.78, 0).toNonIndexed();
  const positions = [...base.getAttribute('position').array, ...roof.getAttribute('position').array];
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (shaded) {
    const nBase = base.getAttribute('position').count;
    const nRoof = roof.getAttribute('position').count;
    const colors = [...Array(nBase).fill([0.78, 0.78, 0.78]).flat(), ...Array(nRoof).fill([1, 1, 1]).flat()];
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  merged.computeVertexNormals();
  return merged;
}

/** Train cars on claimed routes in the owner's color (R19). New claims drop or roll in as a short cue. */
export function Trains({
  slots,
  owners,
  playerColors,
  playerSigns,
  theme,
  lastEvents,
  highlighted,
  damage,
  blocked,
  spawn = 'drop',
  classic = false,
  focusPlayer = null,
}: TrainsProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useRef<THREE.InstancedMesh>(null);
  const markMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const cars = useMemo(
    () => slots.filter((s) => owners[s.routeId] !== undefined && !damage?.[s.routeId]?.broken.includes(s.index)),
    [slots, owners, damage],
  );
  const body = useMemo(() => carBody(classic), [classic]);
  const outlineBody = useMemo(() => new THREE.BoxGeometry(1, 0.5, 1).translate(0, 0.25, 0), []);
  // Cars of each mark shape, by index into `cars`.
  // One roof mark per player: a shape, or a character they typed. `of` maps a player to its mark.
  const marks = useMemo(() => {
    const keys = playerColors.map((_, i) => {
      const c = typedChar(playerSigns?.[i]);
      return c ? `c${c}` : `s${signIndex(playerSigns?.[i], i)}`;
    });
    const unique = [...new Set(keys)];
    const list = unique.map((k) => {
      const char = k[0] === 'c' ? k.slice(1) : null;
      return char
        ? { char, emoji: isEmoji(char), geom: glyphPlane(), tex: glyphTexture(char) }
        : { char: null, emoji: false, geom: markGeometry(Number(k.slice(1))), tex: null };
    });
    return { of: keys.map((k) => unique.indexOf(k)), list };
  }, [playerSigns, playerColors]);
  const shapeOf = useMemo(() => (owner: number) => marks.of[owner] ?? 0, [marks]);
  const byMark = useMemo(() => {
    const out: number[][] = marks.list.map(() => []);
    cars.forEach((s, i) => out[shapeOf(owners[s.routeId]!)]!.push(i));
    return out;
  }, [cars, owners, shapeOf, marks]);
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
    const ink = new THREE.Color();
    cars.forEach((s, i) => {
      const owner = owners[s.routeId]!;
      const hex = playerHex(theme, playerColors[owner] ?? '');
      color.set(hex);
      if (marked.has(s.routeId)) color.lerp(glow, 0.55);
      if (damage?.[s.routeId]) color.lerp(new THREE.Color('#3b2a24'), 0.45);
      if (blocked?.[s.routeId] !== undefined) color.lerp(new THREE.Color('#5d5555'), 0.7);
      const dim = focusPlayer !== null && owner !== focusPlayer;
      if (dim) color.lerp(DIM, 0.7);
      m.setColorAt(i, color);
      if (classic) {
        const shape = shapeOf(owner);
        // An emoji keeps its own colors (white leaves the texture as drawn).
        ink.set(marks.list[shape]?.emoji ? '#ffffff' : markInk(hex));
        if (dim) ink.lerp(DIM, 0.7);
        const k = byMark[shape]!.indexOf(i);
        markMeshes.current[shape]?.setColorAt(k, ink);
      }
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    for (const mm of markMeshes.current) if (mm?.instanceColor) mm.instanceColor.needsUpdate = true;
  }, [cars, owners, playerColors, theme, highlighted, damage, blocked, focusPlayer, classic, byMark, shapeOf, marks]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now();
    let animating = false;
    const roll = spawn === 'roll' && !reducedMotion();
    const slotInMark = new Map<number, number>();
    if (classic) byMark.forEach((list) => list.forEach((carIndex, k) => slotInMark.set(carIndex, k)));
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
      const k = visible ? 1 : 0;
      const len = s.length * TRAIN_LENGTH_RATIO;
      const wid = s.width * TRAIN_WIDTH_RATIO;
      const base = SLOT_Y + 0.35 + lift;
      tmp.rotation.set(0, -s.angle, 0);
      tmp.position.set(x, base, y);
      tmp.scale.set(len * k, CAR_HEIGHT * k, wid * k);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      if (classic) {
        // A dark border: a slightly larger flat box under the car.
        tmp.position.set(x, base - 0.2, y);
        tmp.scale.set((len + wid * 0.28) * k, CAR_HEIGHT * 0.5 * k, wid * 1.3 * k);
        tmp.updateMatrix();
        outline.current?.setMatrixAt(i, tmp.matrix);
        const shape = shapeOf(owners[s.routeId]!);
        const mm = markMeshes.current[shape];
        if (mm) {
          tmp.position.set(x, base + CAR_HEIGHT * ROOF_TOP + 0.05, y);
          // A typed character is turned so it never reads upside down.
          if (marks.list[shape]?.char) tmp.rotation.set(0, -s.angle + (Math.cos(s.angle) < 0 ? Math.PI : 0), 0);
          const size = wid * (marks.list[shape]?.char ? 0.7 : 0.62) * k;
          tmp.scale.set(size, 1, size);
          tmp.updateMatrix();
          mm.setMatrixAt(slotInMark.get(i)!, tmp.matrix);
        }
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (outline.current) outline.current.instanceMatrix.needsUpdate = true;
    for (const mm of markMeshes.current) if (mm) mm.instanceMatrix.needsUpdate = true;
    if (!animating && appear.current.size > 0) appear.current.clear();
  });

  if (cars.length === 0) return null;
  return (
    <group>
      {classic && (
        <instancedMesh key={`o${cars.length}`} ref={outline} args={[outlineBody, undefined, cars.length]} raycast={() => null}>
          <meshBasicMaterial color="#0a1a20" toneMapped={false} />
        </instancedMesh>
      )}
      <instancedMesh key={cars.length} ref={mesh} args={[body, undefined, cars.length]} raycast={() => null}>
        <meshStandardMaterial flatShading vertexColors={classic} />
      </instancedMesh>
      {classic &&
        byMark.map((list, shape) =>
          list.length === 0 ? null : (
            <instancedMesh
              key={`m${shape}-${marks.list[shape]!.char ?? 's'}-${list.length}`}
              ref={(el) => {
                markMeshes.current[shape] = el;
              }}
              args={[marks.list[shape]!.geom, undefined, list.length]}
              raycast={() => null}
            >
              {marks.list[shape]!.tex ? (
                <meshBasicMaterial map={marks.list[shape]!.tex} transparent alphaTest={0.35} toneMapped={false} />
              ) : (
                <meshBasicMaterial toneMapped={false} />
              )}
            </instancedMesh>
          ),
        )}
    </group>
  );
}
