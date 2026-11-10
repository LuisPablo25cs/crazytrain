import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { effectiveRoute, routeStatus, type BoardShape, type MapIndex, type Route, type Theme } from '@rails/shared';
import { slotTransforms, type SlotTransform } from './geometry.js';
import { LAND_HEIGHT } from './Terrain.js';

export const SLOT_Y = LAND_HEIGHT + 0.45;

export interface Slot extends SlotTransform {
  routeId: string;
  index: number;
}

export function buildSlots(map: MapIndex): Slot[] {
  return map.map.routes.flatMap((r) => slotTransforms(r, map).map((t, index) => ({ ...t, routeId: r.id, index })));
}

/** Artwork file for a route's slots: assets/web/slots/<color>_<kind>.webp, served under /art. */
export function slotArtKey(route: Pick<Route, 'color' | 'kind'>): string {
  return `${route.color}_${route.kind}`;
}

export function slotArtUrl(key: string): string {
  return `/art/slots/${key}.webp`;
}

/** Load each slot image once. Missing images fall back to a plain color. */
function useSlotTextures(keys: string[]): Map<string, THREE.Texture> {
  const [textures, setTextures] = useState(() => new Map<string, THREE.Texture>());
  const wanted = keys.join('|');
  useEffect(() => {
    let alive = true;
    const loaded = new Map<string, THREE.Texture>();
    const loader = new THREE.TextureLoader();
    for (const key of wanted.split('|')) {
      loader.load(slotArtUrl(key), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        if (!alive) return t.dispose();
        loaded.set(key, t);
        setTextures(new Map(loaded));
      });
    }
    return () => {
      alive = false;
      for (const t of loaded.values()) t.dispose();
    };
  }, [wanted]);
  return textures;
}

/** A flat quad whose image runs lengthwise along +X: scale x = slot length, z = slot width. */
function slotQuad(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2) as THREE.PlaneGeometry;
}

const tmp = new THREE.Object3D();

function place(mesh: THREE.InstancedMesh, i: number, s: SlotTransform, y: number, length: number, width: number): void {
  tmp.position.set(s.x, y, s.y);
  tmp.rotation.set(0, -s.angle, 0);
  tmp.scale.set(length, 1, width);
  tmp.updateMatrix();
  mesh.setMatrixAt(i, tmp.matrix);
}

interface SlotGroupProps {
  slots: Slot[];
  texture: THREE.Texture | undefined;
  fallbackColor: string;
  tints: THREE.Color[];
  onHover: (routeId: string | null) => void;
  onSelect: (routeId: string) => void;
  hovered: string | null;
}

/** All slots that share one artwork, drawn as one instanced mesh. */
function SlotGroup({ slots, texture, fallbackColor, tints, onHover, onSelect, hovered }: SlotGroupProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(slotQuad, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    slots.forEach((s, i) => {
      place(m, i, s, SLOT_Y, s.length, s.width);
      m.setColorAt(i, tints[i]!);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [slots, tints, texture]);

  const routeAt = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : (slots[e.instanceId]?.routeId ?? null);

  return (
    <instancedMesh
      key={texture ? texture.uuid : 'plain'}
      ref={mesh}
      args={[geometry, undefined, slots.length]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const id = routeAt(e);
        if (id !== hovered) onHover(id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        const id = routeAt(e);
        if (id) onSelect(id);
      }}
    >
      {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color={fallbackColor} />}
    </instancedMesh>
  );
}

interface RoutesProps {
  map: MapIndex;
  slots: Slot[];
  theme: Theme;
  board: BoardShape | null;
  viewer: number | null;
  hovered: string | null;
  selected: string | null;
  onHover: (routeId: string | null) => void;
  onSelect: (routeId: string) => void;
}

/**
 * Route slots drawn with the slot artwork (assets/web/slots), one instanced mesh per image.
 * Closed lanes are dimmed; the hovered and selected routes get a glow behind their slots.
 */
export function Routes({ map, slots, theme, board, viewer, hovered, selected, onHover, onSelect }: RoutesProps) {
  const groups = useMemo(() => {
    const byKey = new Map<string, { route: Route; slots: Slot[] }>();
    for (const s of slots) {
      // A volcano may have turned the route gray.
      const route = (board ? effectiveRoute(board, map, s.routeId) : undefined) ?? map.routes.get(s.routeId)!;
      const key = slotArtKey(route);
      const g = byKey.get(key) ?? { route, slots: [] };
      g.slots.push(s);
      byKey.set(key, g);
    }
    return [...byKey.entries()].map(([key, g]) => ({ key, ...g }));
  }, [slots, map, board]);
  const textures = useSlotTextures(useMemo(() => groups.map((g) => g.key).sort(), [groups]));

  const tintsByKey = useMemo(() => {
    const out = new Map<string, THREE.Color[]>();
    const dim = new THREE.Color(0.38, 0.38, 0.38);
    const white = new THREE.Color(1, 1, 1);
    const ash = new THREE.Color(0.3, 0.27, 0.27);
    const frost = new THREE.Color(0.72, 0.86, 1);
    const broken = new THREE.Color(1, 0.3, 0.25);
    const cracked = new THREE.Color(1, 0.62, 0.5);
    for (const g of groups) {
      out.set(
        g.key,
        g.slots.map((s) => {
          const status = board ? routeStatus(board, map, s.routeId, viewer) : { kind: 'free' as const };
          const damage = board?.damage?.[s.routeId];
          if (damage) return damage.broken.includes(s.index) ? broken : cracked;
          if (status.kind === 'ash' || (status.kind === 'owned' && status.blocked)) return ash;
          if (status.kind === 'abandoned') return cracked;
          if (status.kind === 'winter') return frost;
          return status.kind === 'closed' || status.kind === 'blockedForYou' ? dim : white;
        }),
      );
    }
    return out;
  }, [groups, board, map, viewer]);

  const glowSlots = useMemo(
    () => slots.filter((s) => s.routeId === hovered || s.routeId === selected),
    [slots, hovered, selected],
  );
  const glow = useRef<THREE.InstancedMesh>(null);
  const plainQuad = useMemo(slotQuad, []);
  useLayoutEffect(() => {
    const m = glow.current;
    if (!m) return;
    glowSlots.forEach((s, i) => place(m, i, s, SLOT_Y - 0.1, s.length + 1.8, s.width + 1.8));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [glowSlots]);

  const ferrySlots = useMemo(
    () =>
      slots.filter((s) => {
        const r = map.routes.get(s.routeId)!;
        return r.kind === 'ferry' && s.index < r.ferryLocomotives;
      }),
    [slots, map],
  );
  const ferryMesh = useRef<THREE.InstancedMesh>(null);
  const diamond = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  useLayoutEffect(() => {
    const m = ferryMesh.current;
    if (!m) return;
    ferrySlots.forEach((s, i) => {
      tmp.position.set(s.x, SLOT_Y + 0.9, s.y);
      tmp.rotation.set(0, -s.angle, 0);
      tmp.scale.set(1.3, 0.7, 1.3);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ferrySlots]);

  return (
    <group>
      {glowSlots.length > 0 && (
        <instancedMesh key={glowSlots.length} ref={glow} args={[plainQuad, undefined, glowSlots.length]} raycast={() => null}>
          <meshBasicMaterial color={theme.board.highlight} toneMapped={false} />
        </instancedMesh>
      )}
      {groups.map((g) => (
        <SlotGroup
          key={g.key}
          slots={g.slots}
          texture={textures.get(g.key)}
          fallbackColor={theme.cardColors[g.route.color]}
          tints={tintsByKey.get(g.key)!}
          hovered={hovered}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
      {ferrySlots.length > 0 && (
        <instancedMesh ref={ferryMesh} args={[diamond, undefined, ferrySlots.length]} raycast={() => null}>
          <meshStandardMaterial color={theme.cardColors.locomotive} flatShading />
        </instancedMesh>
      )}
    </group>
  );
}
