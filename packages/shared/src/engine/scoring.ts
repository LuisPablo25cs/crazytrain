import { UnionFind, type MapIndex } from '../map/graph.js';
import { ticketCities, type Ticket } from '../map/schema.js';
import { longestTrail, longestTrailPath, type TrailEdge } from './longest.js';
import type { GameResults, GameState, PlayerResult } from './types.js';

/** A ticket is done when one network joins all of its cities (two, or three for a triple ticket). */
export function ticketDone(network: UnionFind, ticket: Pick<Ticket, 'from' | 'to' | 'via'>): boolean {
  const [first, ...rest] = ticketCities(ticket);
  return rest.every((c) => network.connected(first!, c));
}

type Network = Pick<GameState, 'routeOwners'> & Partial<Pick<GameState, 'damage' | 'blocked'>>;

/** Whether a route carries trains now: not waiting for repairs and not under volcanic ash (Seasons). */
export function routeWorks(state: Partial<Pick<GameState, 'damage' | 'blocked'>>, routeId: string): boolean {
  return state.damage?.[routeId] === undefined && state.blocked?.[routeId] === undefined;
}

/** Routes a player owns and can use, as trail edges that remember their route id. */
export function ownedEdges(state: Network, map: MapIndex, player: number): (TrailEdge & { routeId: string })[] {
  const edges: (TrailEdge & { routeId: string })[] = [];
  for (const [routeId, owner] of Object.entries(state.routeOwners)) {
    if (owner !== player || !routeWorks(state, routeId)) continue;
    const r = map.routes.get(routeId);
    if (r) edges.push({ routeId, from: r.from, to: r.to, length: r.length });
  }
  return edges;
}

/** Route ids on one of the player's longest trails, for highlighting at the end. */
export function longestTrailRoutes(state: Network, map: MapIndex, player: number): string[] {
  const edges = ownedEdges(state, map, player);
  return longestTrailPath(edges).edges.map((i) => edges[i]!.routeId);
}

/**
 * Routes a player may use for tickets: their own, plus each station's chosen route when another
 * player owns it (R10, KTD8). Borrowed routes never count for the longest trail.
 */
export function ticketNetwork(
  state: Pick<GameState, 'routeOwners' | 'stations' | 'rules'> & Partial<Pick<GameState, 'damage' | 'blocked'>>,
  map: MapIndex,
  player: number,
): UnionFind {
  const uf = new UnionFind();
  for (const e of ownedEdges(state, map, player)) uf.union(e.from, e.to);
  if (state.rules.expansions.stations) {
    for (const s of state.stations) {
      if (s.player !== player) continue;
      const owner = state.routeOwners[s.borrowRouteId];
      const r = map.routes.get(s.borrowRouteId);
      if (r && owner !== undefined && owner !== player && routeWorks(state, s.borrowRouteId)) uf.union(r.from, r.to);
    }
  }
  return uf;
}

export function computeResults(state: GameState, map: MapIndex): GameResults {
  const { rules } = state;
  const trails = state.players.map((_, i) => longestTrail(ownedEdges(state, map, i)));
  const bestTrail = Math.max(0, ...trails);

  const players: PlayerResult[] = state.players.map((p, i) => {
    const network = ticketNetwork(state, map, i);
    const tickets = p.tickets.map((id) => {
      const t = map.tickets.get(id);
      const completed = t ? ticketDone(network, t) : false;
      return { id, points: t?.points ?? 0, completed };
    });
    const ticketPoints = tickets.reduce((sum, t) => sum + (t.completed ? t.points : -t.points), 0);
    const stationsUnused = rules.expansions.stations ? p.stationsLeft : 0;
    const stationPoints = stationsUnused * rules.stationValue;
    const longestTrailBonus = bestTrail > 0 && trails[i] === bestTrail ? rules.longestTrailBonus : 0;
    return {
      player: i,
      routePoints: p.routePoints,
      tickets,
      ticketPoints,
      completedTickets: tickets.filter((t) => t.completed).length,
      stationsUnused,
      stationPoints,
      longestTrail: trails[i]!,
      longestTrailBonus,
      total: p.routePoints + ticketPoints + stationPoints + longestTrailBonus,
    };
  });

  // Ranking (R13): total, then completed tickets, then longest trail.
  const compare = (a: PlayerResult, b: PlayerResult) =>
    b.total - a.total || b.completedTickets - a.completedTickets || b.longestTrail - a.longestTrail;
  const ranked = [...players].sort((a, b) => compare(a, b) || a.player - b.player);
  const top = ranked[0]!;
  const winners = ranked.filter((r) => compare(r, top) === 0).map((r) => r.player);
  return { players, ranking: ranked.map((r) => r.player), winners };
}
