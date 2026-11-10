import type { MapIndex } from '../map/graph.js';
import { openLanes } from '../rules/resolve.js';
import type { RulesConfig } from '../rules/schema.js';
import { routeInWinter } from './seasons.js';
import type { DisasterZone, RouteDamage } from './types.js';

/** The parts of a game (full state or a player view) that decide route availability. */
export interface BoardShape {
  rules: RulesConfig;
  routeOwners: Record<string, number>;
  playerCount: number;
  /** Seasons mode; missing in classic games. */
  month?: number;
  zones?: DisasterZone[];
  damage?: Record<string, RouteDamage>;
  blocked?: Record<string, number>;
  abandoned?: Record<string, number>;
  recolored?: Record<string, 'gray'>;
}

export type RouteStatus =
  /** `damaged`: needs repair and does not connect until then. `blocked`: under volcanic ash. */
  | { kind: 'owned'; owner: number; damaged: boolean; blocked: boolean }
  /** Closed for everyone: enough lanes of its group are taken for this player count (R7). */
  | { kind: 'closed' }
  /** Free in general, but this player already owns another lane of the group (R7). */
  | { kind: 'blockedForYou' }
  /** Under volcanic ash until `until`; then it turns gray and is free. */
  | { kind: 'ash'; until: number }
  /** An earthquake took it from its owner: claim it by repairing it. */
  | { kind: 'abandoned'; cost: number }
  /** Snow: nothing can be built here this month. */
  | { kind: 'winter' }
  | { kind: 'free' };

export function routeStatus(board: BoardShape, map: MapIndex, routeId: string, viewer: number | null): RouteStatus {
  const owner = board.routeOwners[routeId];
  if (owner !== undefined) {
    return { kind: 'owned', owner, damaged: board.damage?.[routeId] !== undefined, blocked: board.blocked?.[routeId] !== undefined };
  }
  const ash = board.blocked?.[routeId];
  if (ash !== undefined) return { kind: 'ash', until: ash };
  const route = map.routes.get(routeId);
  if (route?.parallelGroup) {
    const lanes = map.groups.get(route.parallelGroup) ?? [];
    const owners = lanes.map((l) => board.routeOwners[l.id]).filter((o): o is number => o !== undefined);
    if (owners.length >= openLanes(board.rules, board.playerCount)) return { kind: 'closed' };
    if (viewer !== null && owners.includes(viewer)) return { kind: 'blockedForYou' };
  }
  const abandoned = board.abandoned?.[routeId];
  if (abandoned !== undefined) return { kind: 'abandoned', cost: abandoned };
  if (route && routeInWinter(board, map, route)) return { kind: 'winter' };
  return { kind: 'free' };
}

/** Why `player` cannot claim the route right now (ignoring cards), or null when they can. */
export function routeClaimError(
  board: BoardShape,
  map: MapIndex,
  routeId: string,
  player: number,
  trainsLeft: number,
): string | null {
  const route = map.routes.get(routeId);
  if (!route) return `unknown route "${routeId}"`;
  const status = routeStatus(board, map, routeId, player);
  switch (status.kind) {
    case 'owned':
      return 'this route is already claimed';
    case 'closed':
      return `only ${openLanes(board.rules, board.playerCount)} lane(s) of this route can be used with ${board.playerCount} players`;
    case 'blockedForYou':
      return 'you already own a lane of this route';
    case 'ash':
      return 'volcanic ash covers this route';
    case 'abandoned':
      return 'an earthquake broke this route: repair it to claim it';
    case 'winter':
      return 'snow: nothing can be built here until winter ends';
    case 'free':
      break;
  }
  if (trainsLeft < route.length) return `you have ${trainsLeft} trains left, this route needs ${route.length}`;
  return null;
}
