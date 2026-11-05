import { useFrame, useThree } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { City, Theme } from '@rails/shared';
import { LAND_HEIGHT } from './Terrain.js';

export type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;

const v = new THREE.Vector3();

/** Inside the canvas: moves each DOM label to its city's screen position every frame. */
export function LabelProjector({ cities, refs }: { cities: City[]; refs: LabelRefs }) {
  const { camera, size } = useThree();
  useFrame(() => {
    for (const c of cities) {
      const el = refs.current.get(c.id);
      if (!el) continue;
      // Anchor just north of the city marker (map units), so the gap scales with zoom.
      v.set(c.x, LAND_HEIGHT, c.y - (c.major ? 7 : 5.5)).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      el.style.transform = `translate(-50%, calc(-100% - 2px)) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

/** Outside the canvas: one DOM layer with a label per city. Minor labels fade out when zoomed out. */
export function LabelLayer({
  cities,
  refs,
  theme,
  showMinor,
  emphasized,
}: {
  cities: City[];
  refs: LabelRefs;
  theme: Theme;
  showMinor: boolean;
  emphasized: Set<string>;
}) {
  const style = { color: theme.board.label, textShadow: `0 0 3px ${theme.board.labelOutline}, 0 0 2px ${theme.board.labelOutline}` };
  return (
    <div className="labels-layer" aria-hidden="true">
      {cities.map((c) => (
        <div
          key={c.id}
          ref={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
          className={`city-label ${c.major ? 'major' : ''} ${c.major || showMinor || emphasized.has(c.id) ? '' : 'hidden'}`}
          style={style}
        >
          {c.name}
        </div>
      ))}
    </div>
  );
}
