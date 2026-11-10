import { useMemo } from 'react';
import * as THREE from 'three';
import type { DisasterKind, DisasterZone } from '@rails/shared';
import { LAND_HEIGHT } from './Terrain.js';

/** Fill and edge color of each disaster's circle on the board. */
export const ZONE_COLORS: Record<DisasterKind, string> = {
  earthquake: '#b5651d',
  volcano: '#d84315',
  tsunami: '#1e88e5',
  hurricane: '#5e35b1',
  tornado: '#546e7a',
};

/** Disaster areas still in effect, as tinted circles under the routes (Seasons mode). */
export function Zones({ zones, month }: { zones: DisasterZone[]; month: number }) {
  const active = useMemo(() => zones.filter((z) => z.from <= month && z.until > month), [zones, month]);
  const disc = useMemo(() => new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), []);
  const ring = useMemo(() => new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), []);
  return (
    <group>
      {active.map((z) => (
        <group key={z.id} position={[z.x, LAND_HEIGHT + 0.2, z.y]} scale={[z.radius, 1, z.radius]}>
          <mesh geometry={disc} raycast={() => null}>
            <meshBasicMaterial color={ZONE_COLORS[z.kind]} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh geometry={ring} position={[0, 0.05, 0]} raycast={() => null}>
            <meshBasicMaterial color={ZONE_COLORS[z.kind]} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
