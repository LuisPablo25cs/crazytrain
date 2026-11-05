import type { City, MapDefinition, Route, Ticket } from './schema.js';

/** Fast lookups over a validated map. Built once per map and shared by engine and renderer. */
export interface MapIndex {
  map: MapDefinition;
  cities: Map<string, City>;
  routes: Map<string, Route>;
  tickets: Map<string, Ticket>;
  /** Routes touching each city. */
  routesByCity: Map<string, Route[]>;
  /** Lanes of each parallel group. */
  groups: Map<string, Route[]>;
}

export function indexMap(map: MapDefinition): MapIndex {
  const cities = new Map(map.cities.map((c) => [c.id, c]));
  const routes = new Map(map.routes.map((r) => [r.id, r]));
  const tickets = new Map(map.tickets.map((t) => [t.id, t]));
  const routesByCity = new Map<string, Route[]>();
  for (const c of map.cities) routesByCity.set(c.id, []);
  const groups = new Map<string, Route[]>();
  for (const r of map.routes) {
    routesByCity.get(r.from)?.push(r);
    routesByCity.get(r.to)?.push(r);
    if (r.parallelGroup) {
      const lanes = groups.get(r.parallelGroup) ?? [];
      lanes.push(r);
      groups.set(r.parallelGroup, lanes);
    }
  }
  return { map, cities, routes, tickets, routesByCity, groups };
}

export function otherEnd(route: Route, cityId: string): string {
  return route.from === cityId ? route.to : route.from;
}

/** Union-find over string keys. */
export class UnionFind {
  private parent = new Map<string, string>();

  find(a: string): string {
    let root = a;
    while (true) {
      const p = this.parent.get(root);
      if (p === undefined || p === root) break;
      root = p;
    }
    let cur = a;
    while (cur !== root) {
      const next = this.parent.get(cur) ?? root;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}

/** Shortest path lengths (in trains) from `start` to every reachable city. Dijkstra on route length. */
export function shortestTrainDistances(index: MapIndex, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const done = new Set<string>();
  while (true) {
    let best: string | undefined;
    let bestD = Infinity;
    for (const [city, d] of dist) {
      if (!done.has(city) && d < bestD) {
        best = city;
        bestD = d;
      }
    }
    if (best === undefined) break;
    done.add(best);
    for (const r of index.routesByCity.get(best) ?? []) {
      const next = otherEnd(r, best);
      const nd = bestD + r.length;
      if (nd < (dist.get(next) ?? Infinity)) dist.set(next, nd);
    }
  }
  return dist;
}

/** Connected components of the full map graph, as arrays of city ids. */
export function components(index: MapIndex): string[][] {
  const uf = new UnionFind();
  for (const c of index.map.cities) uf.find(c.id);
  for (const r of index.map.routes) {
    if (index.cities.has(r.from) && index.cities.has(r.to)) uf.union(r.from, r.to);
  }
  const groups = new Map<string, string[]>();
  for (const c of index.map.cities) {
    const root = uf.find(c.id);
    const list = groups.get(root) ?? [];
    list.push(c.id);
    groups.set(root, list);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}
