import { nextRandom } from '@rails/shared';

type Ring = [number, number][];

/**
 * Even-odd point-in-polygon tests by scanline. Crossings are computed once per y value, so testing
 * many points on a few rows stays fast even with thousands of coastline points.
 */
export class ScanlineClassifier {
  private cache = new Map<number, number[]>();

  constructor(private readonly rings: Ring[]) {}

  private crossings(y: number): number[] {
    let xs = this.cache.get(y);
    if (xs) return xs;
    xs = [];
    for (const ring of this.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    this.cache.set(y, xs);
    return xs;
  }

  inside(x: number, y: number): boolean {
    const xs = this.crossings(y);
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    return lo % 2 === 1;
  }
}

export type CellKind = 'land' | 'lake' | 'water';

export interface TerrainTriangle {
  kind: CellKind;
  /** Three corners as [x, y] in map space. */
  corners: [[number, number], [number, number], [number, number]];
}

/**
 * Cover the map (plus a margin) with a triangular lattice and classify each triangle by its
 * centroid. The result is a faceted, low-poly coastline (KTD12) without polygon triangulation,
 * which is fragile for huge projected coastlines.
 */
export function latticeTriangles(
  width: number,
  height: number,
  land: Ring[],
  lakes: Ring[],
  cell: number,
  margin: number,
): TerrainTriangle[] {
  const isLand = new ScanlineClassifier(land);
  const isLake = new ScanlineClassifier(lakes);
  const rowH = cell * 0.866;
  const x0 = -margin;
  const y0 = -margin;
  const cols = Math.ceil((width + 2 * margin) / cell) + 1;
  const rows = Math.ceil((height + 2 * margin) / rowH) + 1;
  const vertex = (r: number, c: number): [number, number] => [x0 + c * cell + (r % 2 ? cell / 2 : 0), y0 + r * rowH];
  const out: TerrainTriangle[] = [];
  const classify = (corners: TerrainTriangle['corners']) => {
    const cx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
    const cy = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
    if (!isLand.inside(cx, cy)) return;
    out.push({ kind: isLake.inside(cx, cy) ? 'lake' : 'land', corners });
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = vertex(r, c);
      const b = vertex(r, c + 1);
      const d = vertex(r + 1, c);
      const e = vertex(r + 1, c + 1);
      if (r % 2 === 0) {
        classify([a, d, b]);
        classify([b, d, e]);
      } else {
        classify([a, d, e]);
        classify([a, e, b]);
      }
    }
  }
  return out;
}

/** Small deterministic height offset per lattice vertex, so facets catch the light. */
export function vertexJitter(x: number, y: number, amount: number): number {
  const seed = (Math.round(x * 10) * 73856093) ^ (Math.round(y * 10) * 19349663);
  return (nextRandom(seed >>> 0)[0] - 0.5) * amount;
}
