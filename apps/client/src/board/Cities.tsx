import { useState } from 'react';
import type { City, MapIndex, StationState, Theme } from '@rails/shared';
import { playerHex } from '../theme/themes.js';
import { LAND_HEIGHT } from './Terrain.js';

interface CitiesProps {
  map: MapIndex;
  theme: Theme;
  stations: StationState[];
  playerColors: string[];
  /** Cities to ring (ticket highlight, station choices). */
  highlighted: Set<string>;
  selected: string | null;
  onCityClick?: (cityId: string) => void;
}

function CityModel({ city, theme, ring, clickable, onClick }: { city: City; theme: Theme; ring: 'none' | 'soft' | 'strong'; clickable: boolean; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  const r = city.major ? 5 : 3.8;
  const h = city.major ? 4.2 : 2.6;
  return (
    <group
      position={[city.x, LAND_HEIGHT, city.y]}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation();
              onClick?.();
            }
          : undefined
      }
      onPointerOver={clickable ? () => setHover(true) : undefined}
      onPointerOut={clickable ? () => setHover(false) : undefined}
    >
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[r + 1, r + 1.4, 0.6, 7]} />
        <meshStandardMaterial color="#d8cbb0" flatShading />
      </mesh>
      <mesh position={[0, 0.6 + h / 2, 0]}>
        <cylinderGeometry args={[r * 0.75, r, h, 6]} />
        <meshStandardMaterial color={city.major ? theme.board.majorCity : theme.board.city} flatShading />
      </mesh>
      <mesh position={[0, 0.6 + h + 1, 0]}>
        <coneGeometry args={[r * 0.8, 2.2, 6]} />
        <meshStandardMaterial color="#5a3c2c" flatShading />
      </mesh>
      {(ring !== 'none' || hover) && (
        <mesh position={[0, 0.7, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r + 2, r + (ring === 'strong' || hover ? 4.2 : 3.2), 20]} />
          <meshBasicMaterial color={theme.board.highlight} transparent opacity={hover ? 1 : 0.85} />
        </mesh>
      )}
    </group>
  );
}

function StationModel({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <group position={[x + 5.5, LAND_HEIGHT, y - 5.5]}>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[1.3, 1.7, 5.2, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
      <mesh position={[0, 6.1, 0]}>
        <coneGeometry args={[2.1, 2.4, 6]} />
        <meshStandardMaterial color={color} flatShading />
      </mesh>
    </group>
  );
}

/** City models and stations. Labels live in a DOM layer (see Labels.tsx). */
export function Cities({ map, theme, stations, playerColors, highlighted, selected, onCityClick }: CitiesProps) {
  return (
    <group>
      {map.map.cities.map((c) => {
        const ring = c.id === selected ? 'strong' : highlighted.has(c.id) ? 'soft' : 'none';
        const clickable = !!onCityClick && highlighted.has(c.id);
        return (
          <group key={c.id}>
            <CityModel city={c} theme={theme} ring={ring} clickable={clickable} onClick={() => onCityClick?.(c.id)} />
          </group>
        );
      })}
      {stations.map((s) => {
        const city = map.cities.get(s.cityId);
        return city ? <StationModel key={s.cityId} x={city.x} y={city.y} color={playerHex(theme, playerColors[s.player] ?? '')} /> : null;
      })}
    </group>
  );
}
