import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { BoardShape, GameEvent, MapIndex, StationState, Theme } from '@rails/shared';
import { CameraRig } from './CameraRig.js';
import { useCityLabelArt, useCityPins } from './cityLabelArt.js';
import { Cities } from './Cities.js';
import { LabelLayer, LabelProjector } from './Labels.js';
import { buildSlots, Routes } from './Routes.js';
import { Terrain } from './Terrain.js';
import { Trains } from './Trains.js';
import { Zones } from './Zones.js';
import { PingArrow, PingProjector, PingRing, useRivalPing } from './RivalPing.js';
import { playerHex } from '../theme/themes.js';

export interface BoardSceneProps {
  map: MapIndex;
  theme: Theme;
  board: BoardShape | null;
  viewer: number | null;
  playerColors: string[];
  playerSigns?: (string | undefined)[];
  stations: StationState[];
  lastEvents: GameEvent[];
  hoveredRoute: string | null;
  selectedRoute: string | null;
  highlightedCities: Set<string>;
  /** Claimed routes to emphasize, such as a longest trail at the end. */
  highlightedRoutes?: string[];
  selectedCity: string | null;
  focus: { x: number; y: number; zoom: number; nonce: number } | null;
  onHoverRoute: (id: string | null) => void;
  onSelectRoute: (id: string) => void;
  onCityClick?: (id: string) => void;
  onBackgroundClick?: () => void;
  /** Classic HUD: the player whose plaque is pointed at; other trains dim. */
  focusPlayer?: number | null;
}

/** The board, seen flat from above. Everything it draws comes from map and theme data (R18, R19). */
export function BoardScene(props: BoardSceneProps) {
  const { map, theme } = props;
  const slots = useMemo(() => buildSlots(map), [map]);
  const [zoomedIn, setZoomedIn] = useState(false);
  const owners = props.board?.routeOwners ?? {};
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const labelArt = useCityLabelArt();
  // Seasons mode draws every city as a marker with its name lettering (plain name while it has none);
  // Classic keeps its look.
  const seasons = props.board?.rules.mode === 'seasons';
  const pinArt = useCityPins(seasons);
  const pins = useMemo(
    () => (seasons ? new Map(map.map.cities.map((c) => [c.id, pinArt.get(c.id) ?? null])) : undefined),
    [seasons, pinArt, map],
  );
  // Classic mode: point out rival claims (a ring on the route, an arrow at the edge when off screen),
  // draw claimed track as a dark rail bed and closed lanes as hatched, and give each player a roof mark.
  const classic = !!props.board && !seasons;
  const ping = useRivalPing(
    props.lastEvents,
    props.viewer,
    slots,
    map,
    (p) => playerHex(theme, props.playerColors[p] ?? ''),
    classic,
  );
  const arrow = useRef<HTMLButtonElement>(null);

  return (
    <div className="board">
      <Canvas
        className="board-canvas"
        dpr={[1, 2]}
        orthographic
        camera={{ near: 1, far: 2000, position: [map.map.width / 2, 500, map.map.height / 2], up: [0, 0, -1] }}
        gl={{ antialias: true }}
        onPointerMissed={() => props.onBackgroundClick?.()}
      >
        <color attach="background" args={[theme.terrain.background]} />
        <ambientLight intensity={theme.lighting.ambient} />
        <hemisphereLight args={[theme.terrain.background, theme.terrain.land, 0.35]} />
        <directionalLight
          position={[map.map.width * 0.2, 600, -200]}
          intensity={theme.lighting.sun}
          color={theme.lighting.sunColor}
        />
        <Terrain map={map.map} theme={theme} />
        <Routes
          map={map}
          slots={slots}
          theme={theme}
          board={props.board}
          viewer={props.viewer}
          hovered={props.hoveredRoute}
          selected={props.selectedRoute}
          onHover={props.onHoverRoute}
          onSelect={props.onSelectRoute}
          classic={classic}
        />
        <Trains
          slots={slots}
          owners={owners}
          playerColors={props.playerColors}
          playerSigns={props.playerSigns}
          theme={theme}
          lastEvents={props.lastEvents}
          highlighted={props.highlightedRoutes}
          damage={props.board?.damage}
          blocked={props.board?.blocked}
          spawn={seasons ? 'drop' : 'roll'}
          classic={classic}
          focusPlayer={props.focusPlayer ?? null}
        />
        {classic && <PingRing ping={ping} />}
        {classic && <PingProjector ping={ping} arrow={arrow} />}
        {props.board?.zones && <Zones zones={props.board.zones} month={props.board.month ?? 0} />}
        <Cities
          map={map}
          theme={theme}
          stations={props.stations}
          playerColors={props.playerColors}
          highlighted={props.highlightedCities}
          selected={props.selectedCity}
          onCityClick={props.onCityClick}
          hideModels={pins}
        />
        <CameraRig
          width={map.map.width}
          height={map.map.height}
          focus={props.focus}
          onZoomChange={setZoomedIn}
        />
        <LabelProjector cities={map.map.cities} refs={labelRefs} centered={pins} />
      </Canvas>
      <LabelLayer
        cities={map.map.cities}
        refs={labelRefs}
        theme={theme}
        // Classic mode names every city at every zoom; Seasons shows minor cities once zoomed in.
        showMinor={zoomedIn || !seasons}
        emphasized={props.highlightedCities}
        // Classic mode writes every name in the rounded lettering instead of the label pictures.
        art={seasons ? labelArt : undefined}
        pins={pins}
        rounded={!seasons}
      />
      {classic && <PingArrow ping={ping} arrow={arrow} />}
    </div>
  );
}
