import { slotTransforms } from '../map/geometry.js';
import type { MapIndex } from '../map/graph.js';
import type { Route } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';
import type { BoardShape } from './routes.js';

/**
 * Seasons mode, read-only helpers shared by the engine and the board: the calendar, winter,
 * where train pieces sit, and what building or repairing a route needs.
 */

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 0 is January. */
export function monthOfYear(month: number): number {
  return ((month % 12) + 12) % 12;
}

/** 1 for the first year. */
export function yearOf(month: number): number {
  return Math.floor(month / 12) + 1;
}

export function isSeasons(rules: RulesConfig): boolean {
  return rules.mode === 'seasons';
}

// Latitude per city: its own when the map has it, otherwise estimated from its place on the map
// (a straight-line fit of latitude against y over the cities that do have one).
const latitudes = new WeakMap<MapIndex, Map<string, number>>();
export function cityLatitude(map: MapIndex, cityId: string): number {
  let cache = latitudes.get(map);
  if (!cache) {
    cache = new Map();
    const known = map.map.cities.filter((c) => c.geo);
    const n = known.length;
    const my = known.reduce((s, c) => s + c.y, 0) / Math.max(1, n);
    const ml = known.reduce((s, c) => s + c.geo!.lat, 0) / Math.max(1, n);
    const cov = known.reduce((s, c) => s + (c.y - my) * (c.geo!.lat - ml), 0);
    const vy = known.reduce((s, c) => s + (c.y - my) ** 2, 0);
    const slope = vy > 0 ? cov / vy : 0;
    for (const c of map.map.cities) cache.set(c.id, c.geo ? c.geo.lat : ml + slope * (c.y - my));
    latitudes.set(map, cache);
  }
  return cache.get(cityId) ?? 0;
}

/** Whether snow stops building at this city in this month. Further north, the winter is longer. */
export function inWinter(map: MapIndex, rules: RulesConfig, cityId: string, month: number): boolean {
  if (!isSeasons(rules)) return false;
  const level = map.cities.get(cityId)?.hazards?.snow;
  if (!level) return false;
  const snow = rules.seasons.snow;
  const moy = monthOfYear(month);
  if (level === 'medium') return snow.shortWinter.includes(moy);
  const north = cityLatitude(map, cityId) >= snow.northLatitude;
  return (north ? snow.longWinter : snow.winter).includes(moy);
}

export function routeInWinter(board: BoardShape, map: MapIndex, route: Route): boolean {
  return inWinter(map, board.rules, route.from, board.month ?? 0) || inWinter(map, board.rules, route.to, board.month ?? 0);
}

/** The route as it plays now: a volcano may have turned it gray. */
export function effectiveRoute(board: Pick<BoardShape, 'recolored'>, map: MapIndex, routeId: string): Route | undefined {
  const route = map.routes.get(routeId);
  if (!route) return undefined;
  return board.recolored?.[routeId] ? { ...route, color: 'gray' } : route;
}

// Where each train piece sits: the same positions the board draws.
const pieces = new WeakMap<MapIndex, Map<string, { x: number; y: number }[]>>();
export function piecePositions(map: MapIndex, route: Route): { x: number; y: number }[] {
  let cache = pieces.get(map);
  if (!cache) {
    cache = new Map();
    pieces.set(map, cache);
  }
  let list = cache.get(route.id);
  if (!list) {
    list = slotTransforms(route, map).map((s) => ({ x: s.x, y: s.y }));
    cache.set(route.id, list);
  }
  return list;
}

/** Indexes of the route's pieces inside a circle. */
export function piecesInside(map: MapIndex, route: Route, x: number, y: number, radius: number): number[] {
  const out: number[] = [];
  piecePositions(map, route).forEach((p, i) => {
    if (Math.hypot(p.x - x, p.y - y) <= radius) out.push(i);
  });
  return out;
}

/** Excavator cards needed on top of the usual cards to build this route now. */
export function excavatorsNeeded(board: BoardShape, map: MapIndex, route: Route): number {
  if (!isSeasons(board.rules)) return 0;
  const month = board.month ?? 0;
  const s = board.rules.seasons;
  let hurricane = 0;
  let tornado = 0;
  for (const z of board.zones ?? []) {
    if (z.from > month || z.until <= month) continue;
    if (z.kind !== 'hurricane' && z.kind !== 'tornado') continue;
    if (piecesInside(map, route, z.x, z.y, z.radius).length === 0) continue;
    if (z.kind === 'hurricane') hurricane = s.hurricane.excavators;
    else tornado = Math.ceil(route.length / s.tornado.lengthPerExcavator);
  }
  return hurricane + tornado;
}

export function earthquakeRepairCost(rules: RulesConfig, route: Route): number {
  const table = rules.seasons.earthquake.repairCost;
  const base = table[Math.min(route.length, table.length) - 1] ?? 1;
  const cost = route.kind === 'tunnel' ? Math.ceil(base * rules.seasons.earthquake.tunnelFactor) : base;
  return Math.max(1, cost);
}

/** What fixing a route costs: cards of its color (or locomotives), or excavators for tsunami damage. */
export type RepairCost = { cards: number; excavators: 0 } | { cards: 0; excavators: number };

export function repairCost(board: BoardShape, map: MapIndex, routeId: string): RepairCost | null {
  const route = map.routes.get(routeId);
  if (!route) return null;
  const abandoned = board.abandoned?.[routeId];
  if (abandoned !== undefined) return { cards: abandoned, excavators: 0 };
  const damage = board.damage?.[routeId];
  if (!damage) return null;
  switch (damage.cause) {
    case 'earthquake':
      return { cards: earthquakeRepairCost(board.rules, route), excavators: 0 };
    case 'tsunami':
      return { cards: 0, excavators: Math.max(1, Math.ceil(damage.broken.length / board.rules.seasons.tsunami.piecesPerExcavator)) };
    default:
      return { cards: Math.max(1, damage.broken.length), excavators: 0 };
  }
}

/** Why `player` cannot repair this route now (ignoring cards), or null when they can. */
export function repairError(board: BoardShape, map: MapIndex, routeId: string, player: number, trainsLeft: number): string | null {
  if (!isSeasons(board.rules)) return 'routes only need repairs in Seasons mode';
  const route = map.routes.get(routeId);
  if (!route) return `unknown route "${routeId}"`;
  if (board.blocked?.[routeId] !== undefined) return 'volcanic ash covers this route';
  if (routeInWinter(board, map, route)) return 'snow: nothing can be built here until winter ends';
  if (board.abandoned?.[routeId] !== undefined) {
    if (trainsLeft < route.length) return `you have ${trainsLeft} trains left, this route needs ${route.length}`;
    return null;
  }
  if (!board.damage?.[routeId]) return 'this route is not damaged';
  if (board.routeOwners[routeId] !== player) return 'only the owner can repair this route';
  return null;
}
