import { useFrame, useThree } from '@react-three/fiber';
import { useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { City, Theme } from '@rails/shared';
import { cityLabelUrl, cityPinUrl, type CityPin } from './cityLabelArt.js';
import { LAND_HEIGHT } from './Terrain.js';
import '@fontsource/fredoka/600.css';

export type LabelRefs = MutableRefObject<Map<string, HTMLDivElement>>;

const v = new THREE.Vector3();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

interface Placed {
  city: City;
  /** The element that is shown or hidden: the name picture of a pin, or the whole plain label. */
  el: HTMLElement;
  sx: number;
  sy: number;
  /** Spots to try, best first, as boxes relative to the city's screen point. */
  spots: Box[];
  pin: boolean;
}

/**
 * Inside the canvas: moves each DOM label to its city's screen position every frame.
 * With Seasons pins on the board, names are also kept apart: each name takes the first free spot
 * around its marker (above, below, right, left; then the same a little smaller), major cities first.
 * A name with no free spot waits until the player zooms in; its marker always shows.
 */
export function LabelProjector({ cities, refs, centered }: { cities: City[]; refs: LabelRefs; centered?: Map<string, CityPin> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const spread = !!centered?.size;
    const blocked: Box[] = [];
    const labels: Placed[] = [];
    for (const c of cities) {
      const el = refs.current.get(c.id);
      if (!el) continue;
      // Pins (Seasons) sit on the city itself; plain labels anchor just north of the city marker.
      const pin = centered?.get(c.id);
      v.set(c.x, LAND_HEIGHT, pin ? c.y : c.y - (c.major ? 7 : 5.5)).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) {
        el.style.visibility = 'hidden';
        continue;
      }
      el.style.visibility = '';
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      const at = `translate(${sx}px, ${sy}px)`;
      el.style.transform = pin ? at : `translate(-50%, calc(-100% - 2px)) ${at}`;
      if (!spread) continue;
      if (pin) {
        const s = c.major ? PIN.major : PIN.minor;
        const d = s.marker + 2;
        blocked.push({ x: sx - d / 2, y: sy - d / 2, w: d, h: d });
        const img = el.querySelector<HTMLImageElement>('.city-pin-name');
        if (!img || img.classList.contains('hidden')) continue;
        // Around the marker at full size, then a little smaller where cities crowd together.
        const spots: Box[] = [];
        for (const k of [1, 0.75, 0.6]) {
          const b = pinNameBox(pin, c.major);
          const w = b.width * k;
          const h = b.height * k;
          const r = s.marker / 2 + s.gap;
          spots.push(
            { x: -w / 2, y: -r - h, w, h },
            { x: -w / 2, y: r, w, h },
            { x: r, y: -h / 2, w, h },
            { x: -r - w, y: -h / 2, w, h },
          );
        }
        labels.push({ city: c, el: img, sx, sy, spots, pin: true });
      } else if (!el.classList.contains('hidden')) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        labels.push({ city: c, el, sx, sy, spots: [{ x: -w / 2, y: -h - 2, w, h }], pin: false });
      }
    }
    if (!spread) return;
    // Major cities first; among them plain names (they have one spot only) before the lettered ones.
    labels.sort((a, b) => Number(b.city.major) - Number(a.city.major) || Number(a.pin) - Number(b.pin));
    for (const l of labels) {
      const boxes = l.spots.map((s) => ({ x: l.sx + s.x, y: l.sy + s.y, w: s.w, h: s.h }));
      const k = boxes.findIndex((b) => !blocked.some((o) => overlaps(b, o)));
      const spot = l.spots[k];
      const box = boxes[k];
      l.el.style.visibility = spot && box ? '' : 'hidden';
      if (!spot || !box) continue;
      if (l.pin) {
        l.el.style.left = `${spot.x}px`;
        l.el.style.top = `${spot.y}px`;
        l.el.style.width = `${spot.w}px`;
        l.el.style.height = `${spot.h}px`;
      }
      blocked.push(box);
    }
  });
  return null;
}

/**
 * Outside the canvas: one DOM layer with a label per city. Minor labels fade out when zoomed out.
 * A city with label art (see cityLabelArt.ts) shows its picture instead of plain text; if the picture fails, the name returns.
 */
export function LabelLayer({
  cities,
  refs,
  theme,
  showMinor,
  emphasized,
  art,
  pins,
  rounded = false,
}: {
  cities: City[];
  refs: LabelRefs;
  theme: Theme;
  showMinor: boolean;
  emphasized: Set<string>;
  /** City ids that have label art. */
  art?: Set<string>;
  /** Seasons mode: cities drawn with their marker and name art instead. */
  pins?: Map<string, CityPin>;
  /** Classic mode: every name in the white rounded lettering (no label pictures). */
  rounded?: boolean;
}) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const style = { color: theme.board.label, textShadow: `0 0 3px ${theme.board.labelOutline}, 0 0 2px ${theme.board.labelOutline}` };
  return (
    <div className="labels-layer" aria-hidden="true">
      {cities.map((c) => {
        const pictured = !!art?.has(c.id) && !broken.has(c.id);
        const shown = c.major || showMinor || emphasized.has(c.id);
        const pin = pins?.get(c.id);
        if (pin && !broken.has(c.id)) {
          return (
            <PinLabel
              key={c.id}
              city={c}
              pin={pin}
              showName={shown}
              refFn={(el) => {
                if (el) refs.current.set(c.id, el);
                else refs.current.delete(c.id);
              }}
              onError={() => setBroken((b) => new Set(b).add(c.id))}
            />
          );
        }
        return (
          <div
            key={c.id}
            ref={(el) => {
              if (el) refs.current.set(c.id, el);
              else refs.current.delete(c.id);
            }}
            className={`city-label ${c.major ? 'major' : ''} ${pictured ? 'pictured' : ''} ${rounded ? 'rounded' : ''} ${shown ? '' : 'hidden'}`}
            style={pictured || rounded ? undefined : style}
          >
            {pictured ? (
              <img
                className="city-label-art"
                src={cityLabelUrl(c.id)}
                alt={c.name}
                draggable={false}
                onError={() => setBroken((b) => new Set(b).add(c.id))}
              />
            ) : (
              c.name
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Seasons-mode city size on screen (px), the same at every zoom like the plain labels: the marker's
 * diameter, the gap between the marker and the name, the name's height, and the widest a name may get
 * (a long name shrinks to fit instead of covering its neighbors).
 */
export const PIN = {
  major: { marker: 16, gap: 3, name: 20, maxWidth: 120 },
  minor: { marker: 12, gap: 2, name: 15, maxWidth: 90 },
};

/** Where the name picture goes, relative to the city: centered over the marker, one gap above it. */
export function pinNameBox(pin: CityPin, major: boolean): { left: number; top: number; width: number; height: number } {
  const size = major ? PIN.major : PIN.minor;
  const scale = Math.min(size.name / pin.name[1], size.maxWidth / pin.name[0]);
  const width = pin.name[0] * scale;
  const height = pin.name[1] * scale;
  return { left: -width / 2, top: -size.marker / 2 - size.gap - height, width, height };
}

/**
 * A Seasons-mode city: a round marker centered on the city (drawn here, in the colors from the art)
 * and the name lettering above it. The marker always shows; the name follows the usual zoom rules.
 */
function PinLabel({ city, pin, showName, refFn, onError }: { city: City; pin: CityPin; showName: boolean; refFn: (el: HTMLDivElement | null) => void; onError: () => void }) {
  const size = city.major ? PIN.major : PIN.minor;
  const d = size.marker;
  const box = pinNameBox(pin, city.major);
  return (
    <div ref={refFn} className={`city-pin ${city.major ? 'major' : ''}`}>
      <span
        className="city-pin-marker"
        style={{
          width: d,
          height: d,
          left: -d / 2,
          top: -d / 2,
          background: pin.fill,
          borderWidth: Math.max(2, Math.round(d * 0.16)),
          borderColor: pin.ring,
        }}
      />
      <img
        className={`city-pin-name ${showName ? '' : 'hidden'}`}
        src={cityPinUrl(city.id)}
        alt={city.name}
        draggable={false}
        style={box}
        onError={onError}
      />
    </div>
  );
}
