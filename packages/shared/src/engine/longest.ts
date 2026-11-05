export interface TrailEdge {
  from: string;
  to: string;
  length: number;
}

/**
 * Longest trail through a set of edges (KTD9): each edge is used at most once, cities may repeat.
 * Returns the length and the indices of the edges on one best trail. Brute-force depth-first
 * search; a player's network is small enough for this.
 */
export function longestTrailPath(edges: TrailEdge[]): { length: number; edges: number[] } {
  const adjacency = new Map<string, number[]>();
  edges.forEach((e, i) => {
    for (const city of [e.from, e.to]) {
      const list = adjacency.get(city) ?? [];
      list.push(i);
      adjacency.set(city, list);
    }
  });
  const used = new Array<boolean>(edges.length).fill(false);
  const path: number[] = [];
  let best = 0;
  let bestPath: number[] = [];
  const walk = (city: string, total: number) => {
    if (total > best) {
      best = total;
      bestPath = [...path];
    }
    for (const i of adjacency.get(city) ?? []) {
      if (used[i]) continue;
      const e = edges[i]!;
      used[i] = true;
      path.push(i);
      walk(e.from === city ? e.to : e.from, total + e.length);
      path.pop();
      used[i] = false;
    }
  };
  for (const city of adjacency.keys()) walk(city, 0);
  return { length: best, edges: bestPath };
}

export function longestTrail(edges: TrailEdge[]): number {
  return longestTrailPath(edges).length;
}
