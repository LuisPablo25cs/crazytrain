import type { MapIndex } from './graph.js';
import type { Point, Route } from './schema.js';

export interface SlotTransform {
  /** Slot center in map space. */
  x: number;
  y: number;
  /** Direction along the route, in radians, in map space (x right, y down). */
  angle: number;
  /** Visual slot length in map units (along the route). */
  length: number;
  /** Visual slot width in map units (across the route). */
  width: number;
}

export interface SlotOptions {
  /** Distance kept free around each city. */
  cityRadius: number;
  /** Gap between neighboring slots. */
  gap: number;
  /** Sideways distance between neighboring lanes of a parallel group. */
  laneSpacing: number;
  /** Slot width across the route. */
  slotWidth: number;
}

/** A claimed train car covers this share of its slot (length and width). Shared by game and editor. */
export const TRAIN_LENGTH_RATIO = 0.82;
export const TRAIN_WIDTH_RATIO = 0.62;

export const DEFAULT_SLOT_OPTIONS: SlotOptions = { cityRadius: 5.5, gap: 1.4, laneSpacing: 6.4, slotWidth: 5.6 };

/** Slot options for a map: the defaults, overridden by the map's display settings. */
export function slotOptionsFor(map: MapIndex): SlotOptions {
  const display = map.map.display ?? {};
  return {
    ...DEFAULT_SLOT_OPTIONS,
    ...(display.slotWidth ? { slotWidth: display.slotWidth } : {}),
    ...(display.laneSpacing ? { laneSpacing: display.laneSpacing } : {}),
  };
}

/** Largest bend, as a share of the distance between the cities (a bit under a half circle). */
export const MAX_BEND_RATIO = 0.45;

/** Unit normal of the way from a to b, pointing to its left (y down). */
export function chordNormal(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** The middle of an arc bent by `bend`: the point the editor's circle handle sits on. */
export function arcMiddle(a: Point, b: Point, bend: number): Point {
  const n = chordNormal(a, b);
  return { x: (a.x + b.x) / 2 + n.x * bend, y: (a.y + b.y) / 2 + n.y * bend };
}

/** Clamp a bend to what looks sensible, and snap tiny values to a straight line. */
export function clampBend(a: Point, b: Point, bend: number): number {
  const limit = Math.hypot(b.x - a.x, b.y - a.y) * MAX_BEND_RATIO;
  const clamped = Math.max(-limit, Math.min(limit, bend));
  return Math.abs(clamped) < 0.6 ? 0 : Math.round(clamped * 10) / 10;
}

/**
 * Points along the circular arc from a to b whose middle is `bend` away from the straight line.
 * A bend of zero gives the two end points.
 */
export function arcPoints(a: Point, b: Point, bend: number, segments = 32): Point[] {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  const s = Math.abs(bend);
  if (s < 1e-6 || chord < 1e-6) return [a, b];
  const n = chordNormal(a, b);
  const sign = Math.sign(bend);
  const radius = (chord * chord) / 4 / (2 * s) + s / 2;
  // The center lies on the opposite side of the chord from the arc's middle.
  const offset = s - radius;
  const cx = (a.x + b.x) / 2 + n.x * sign * offset;
  const cy = (a.y + b.y) / 2 + n.y * sign * offset;
  const start = Math.atan2(a.y - cy, a.x - cx);
  const end = Math.atan2(b.y - cy, b.x - cx);
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const out: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = start + (sweep * i) / segments;
    out.push({ x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) });
  }
  // Land exactly on the cities.
  out[0] = a;
  out[segments] = b;
  return out;
}

/** Center line of a route: city, then an arc (bend) or bend points (path), then city. */
export function routePolyline(route: Route, map: MapIndex): Point[] {
  const a = map.cities.get(route.from)!;
  const b = map.cities.get(route.to)!;
  const start = { x: a.x, y: a.y };
  const end = { x: b.x, y: b.y };
  if (route.bend) return arcPoints(start, end, route.bend);
  return [start, ...(route.path ?? []), end];
}

/**
 * Sideways offset of a lane within its parallel group: lanes sit side by side like on the
 * physical board (KTD7). Lanes are ordered by id so every client agrees.
 */
export function laneOffset(route: Route, map: MapIndex, spacing: number): number {
  if (!route.parallelGroup) return 0;
  const lanes = [...(map.groups.get(route.parallelGroup) ?? [route])].sort((a, b) => a.id.localeCompare(b.id));
  const i = lanes.findIndex((l) => l.id === route.id);
  return (i - (lanes.length - 1) / 2) * spacing;
}

/** Offset a polyline sideways. The side is fixed by sorted endpoints so reversed lanes still line up. */
export function offsetPolyline(points: Point[], offset: number, flip: boolean): Point[] {
  if (offset === 0) return points;
  const sign = flip ? -1 : 1;
  const normalAt = (i: number): Point => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (-dy / len) * sign, y: (dx / len) * sign };
  };
  return points.map((p, i) => {
    const n = normalAt(i);
    return { x: p.x + n.x * offset, y: p.y + n.y * offset };
  });
}

function trim(points: Point[], fromStart: number, fromEnd: number): Point[] {
  const cut = (pts: Point[], amount: number): Point[] => {
    let remaining = amount;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (seg > remaining) {
        const t = remaining / seg;
        return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ...pts.slice(i)];
      }
      remaining -= seg;
    }
    return [pts[pts.length - 1]!];
  };
  const start = cut(points, fromStart);
  return cut([...start].reverse(), fromEnd).reverse();
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return total;
}

/** Point and direction at distance `d` along a polyline. */
function pointAt(points: Point[], d: number): { x: number; y: number; angle: number } {
  let remaining = d;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1]!;
  return { x: last.x, y: last.y, angle: 0 };
}

/** Evenly spaced train slots along a route, between the two city edges. */
export function autoSlotTransforms(route: Route, map: MapIndex, options: SlotOptions = DEFAULT_SLOT_OPTIONS): SlotTransform[] {
  const base = routePolyline(route, map);
  const flip = route.from > route.to;
  const line = offsetPolyline(base, laneOffset(route, map, options.laneSpacing), flip);
  const usable = trim(line, options.cityRadius, options.cityRadius);
  const total = polylineLength(usable);
  const step = total / route.length;
  const length = Math.max(step * 0.35, step - options.gap);
  return Array.from({ length: route.length }, (_, i) => {
    const p = pointAt(usable, (i + 0.5) * step);
    return { x: p.x, y: p.y, angle: p.angle, length, width: options.slotWidth };
  });
}

/**
 * The slots to draw for a route: hand-placed ones from the map editor when the route has them,
 * otherwise evenly spaced ones. Placed slots without a size take the automatic size.
 */
export function slotTransforms(route: Route, map: MapIndex, options: SlotOptions = slotOptionsFor(map)): SlotTransform[] {
  const auto = autoSlotTransforms(route, map, options);
  if (!route.slots || route.slots.length !== route.length) return auto;
  return route.slots.map((s, i) => ({
    x: s.x,
    y: s.y,
    angle: s.angle,
    length: s.length ?? auto[i]!.length,
    width: s.width ?? options.slotWidth,
  }));
}

