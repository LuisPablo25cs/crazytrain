import type { MapIndex } from '../map/graph.js';
import { routePoints } from '../rules/resolve.js';
import { nextRandom, randomInt } from './rng.js';
import { monthOfYear, piecesInside, repairCost } from './seasons.js';
import { boardOf } from './legal.js';
import { DISASTER_KINDS, type DisasterKind, type GameEvent, type GameState, type RouteDamage } from './types.js';

/**
 * Seasons mode, the parts that change the game: disasters striking, damage getting worse, and
 * routes being lost. Everything runs on a draft state inside `applyAction`.
 */

export interface Strike {
  kind: DisasterKind;
  cityId: string;
  x: number;
  y: number;
}

function chance(s: GameState, p: number): boolean {
  const [value, next] = nextRandom(s.rng);
  s.rng = next;
  return value < p;
}

/** Take a route from its owner: points come off, the trains go back to their supply. */
export function loseRoute(
  s: GameState,
  map: MapIndex,
  routeId: string,
  reason: 'deadline' | 'destroyed' | 'volcano',
  events: GameEvent[],
  abandonCost?: number,
): void {
  const owner = s.routeOwners[routeId];
  const route = map.routes.get(routeId);
  delete s.damage[routeId];
  if (owner === undefined || !route) return;
  delete s.routeOwners[routeId];
  const p = s.players[owner]!;
  p.routePoints -= routePoints(s.rules, route.length);
  p.trains += route.length;
  if (abandonCost !== undefined) s.abandoned[routeId] = abandonCost;
  events.push({ type: 'routeLost', player: owner, routeId, reason, claimable: abandonCost !== undefined });
}

function damage(s: GameState, routeId: string, cause: RouteDamage['cause'], broken: number[]): void {
  const before = s.damage[routeId];
  const deadline = s.month + s.rules.seasons.repairMonths;
  s.damage[routeId] = {
    cause,
    since: before?.since ?? s.month,
    deadline: before ? Math.min(before.deadline, deadline) : deadline,
    broken: [...new Set([...(before?.broken ?? []), ...broken])].sort((a, b) => a - b),
  };
}

/** Routes that touch a city within `radius` of the point. */
function routesNear(map: MapIndex, x: number, y: number, radius: number): string[] {
  const ids = new Set<string>();
  for (const c of map.map.cities) {
    if (Math.hypot(c.x - x, c.y - y) > radius) continue;
    for (const r of map.routesByCity.get(c.id) ?? []) ids.add(r.id);
  }
  return [...ids];
}

/** Built routes that a disaster can hurt: owned and not already under ash. */
function builtRoutes(s: GameState, ids: Iterable<string>): string[] {
  return [...ids].filter((id) => s.routeOwners[id] !== undefined && s.blocked[id] === undefined);
}

/** Strike a disaster at a point. Exported so tests (and a future debug tool) can force one. */
export function applyDisaster(s: GameState, map: MapIndex, strike: Strike, events: GameEvent[]): void {
  const cfg = s.rules.seasons;
  const { kind, x, y } = strike;
  const radius = cfg[kind].radius;
  const hit = { damaged: [] as string[], lost: [] as string[], blocked: [] as string[] };
  const zone = (months: number) => {
    s.zones.push({ id: s.nextZoneId++, kind, cityId: strike.cityId, x, y, radius, from: s.month, until: s.month + Math.max(1, months) });
  };
  const allRoutes = map.map.routes.map((r) => r.id);

  switch (kind) {
    case 'earthquake': {
      for (const id of builtRoutes(s, routesNear(map, x, y, radius))) {
        const route = map.routes.get(id)!;
        damage(s, id, 'earthquake', Array.from({ length: route.length }, (_, i) => i));
        hit.damaged.push(id);
      }
      zone(1);
      break;
    }
    case 'hurricane': {
      for (const id of builtRoutes(s, allRoutes)) {
        const route = map.routes.get(id)!;
        const inside = piecesInside(map, route, x, y, radius);
        if (!inside.length) continue;
        const intact = inside.filter((i) => !s.damage[id]?.broken.includes(i));
        const pick = intact.length ? intact[randomInt(s, intact.length)]! : inside[0]!;
        damage(s, id, 'hurricane', [pick]);
        hit.damaged.push(id);
      }
      zone(cfg.hurricane.zoneMonths);
      break;
    }
    case 'tornado': {
      for (const id of builtRoutes(s, allRoutes)) {
        const route = map.routes.get(id)!;
        const flown = piecesInside(map, route, x, y, radius).filter(() => chance(s, cfg.tornado.pieceChance));
        if (!flown.length) continue;
        damage(s, id, 'tornado', flown);
        hit.damaged.push(id);
      }
      zone(cfg.tornado.zoneMonths);
      break;
    }
    case 'tsunami': {
      for (const id of builtRoutes(s, allRoutes)) {
        const route = map.routes.get(id)!;
        const washed = piecesInside(map, route, x, y, radius);
        if (!washed.length) continue;
        if (washed.length >= route.length) {
          loseRoute(s, map, id, 'destroyed', events);
          hit.lost.push(id);
        } else {
          damage(s, id, 'tsunami', washed);
          hit.damaged.push(id);
        }
      }
      zone(1);
      break;
    }
    case 'volcano': {
      const until = s.month + cfg.volcano.blockMonths;
      for (const id of routesNear(map, x, y, radius)) {
        s.blocked[id] = Math.max(s.blocked[id] ?? 0, until);
        delete s.damage[id];
        delete s.abandoned[id];
        hit.blocked.push(id);
      }
      zone(cfg.volcano.blockMonths);
      break;
    }
  }
  events.push({ type: 'disaster', kind, cityId: strike.cityId, x, y, radius, ...hit });
}

/** Maybe pick this month's disaster: a kind in season, then a city weighted by its rating. */
export function rollDisaster(s: GameState, map: MapIndex): Strike | null {
  const cfg = s.rules.seasons;
  if (!chance(s, cfg.disasterChance)) return null;
  const moy = monthOfYear(s.month);
  const kinds = DISASTER_KINDS.filter((k) => cfg[k].months.includes(moy) && map.map.cities.some((c) => c.hazards?.[k]));
  if (!kinds.length) return null;
  const kind = kinds[randomInt(s, kinds.length)]!;
  const candidates = map.map.cities.flatMap((c) => {
    const level = c.hazards?.[kind];
    const weight = level ? cfg.weights[level] : 0;
    return weight > 0 ? [{ city: c, weight }] : [];
  });
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;
  let roll = (randomInt(s, 1_000_000) / 1_000_000) * total;
  let city = candidates[candidates.length - 1]!.city;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll < 0) {
      city = c.city;
      break;
    }
  }
  let x = city.x;
  let y = city.y;
  if (kind === 'tornado') {
    // Tornados touch down somewhere near the city, not on it.
    const angle = (randomInt(s, 3600) / 3600) * Math.PI * 2;
    const dist = (randomInt(s, 1000) / 1000) * cfg.tornado.drift;
    x += Math.cos(angle) * dist;
    y += Math.sin(angle) * dist;
  }
  return { kind, cityId: city.id, x, y };
}

/**
 * A new month: damage gets worse or runs out of time, ash settles, old zones clear, and a
 * disaster may strike. Returns true when the game has reached its last month.
 */
export function advanceMonth(s: GameState, map: MapIndex, events: GameEvent[]): boolean {
  s.month += 1;
  events.push({ type: 'monthStarted', month: s.month });
  if (s.month >= s.rules.seasons.years * 12) return true;
  const cfg = s.rules.seasons;

  for (const [id, d] of Object.entries(s.damage)) {
    const route = map.routes.get(id);
    const owner = s.routeOwners[id];
    if (!route || owner === undefined) {
      delete s.damage[id];
      continue;
    }
    if (s.month >= d.deadline) {
      if (d.cause === 'earthquake') {
        const cost = repairCost(boardOf(s), map, id)?.cards ?? 1;
        loseRoute(s, map, id, 'deadline', events, cost);
      } else {
        loseRoute(s, map, id, 'deadline', events);
      }
      continue;
    }
    if (d.cause === 'hurricane' && (s.month - d.since) % cfg.hurricane.spreadEvery === 0) {
      const intact = Array.from({ length: route.length }, (_, i) => i).filter((i) => !d.broken.includes(i));
      if (intact.length) {
        d.broken = [...d.broken, intact[randomInt(s, intact.length)]!].sort((a, b) => a - b);
        events.push({ type: 'damageSpread', player: owner, routeId: id, broken: d.broken.length });
      }
      if (d.broken.length >= route.length) loseRoute(s, map, id, 'destroyed', events);
    }
  }

  for (const [id, until] of Object.entries(s.blocked)) {
    if (s.month < until) continue;
    delete s.blocked[id];
    loseRoute(s, map, id, 'volcano', events);
    s.recolored[id] = 'gray';
    events.push({ type: 'routeGrayed', routeId: id });
  }

  s.zones = s.zones.filter((z) => z.until > s.month);

  const strike = rollDisaster(s, map);
  if (strike) applyDisaster(s, map, strike, events);
  return false;
}
