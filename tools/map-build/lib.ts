import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { geoConicConformal } from 'd3-geo';
import {
  CARD_COLORS,
  indexMap,
  MAP_SCHEMA_VERSION,
  MapSchema,
  suggestTicketPoints,
  validateMap,
  type CardColor,
  type MapInput,
  type RouteColor,
  type ValidationIssue,
} from '@rails/shared';
import { ringArea, simplifyRing, type Pt } from './geometry.js';


interface SourceCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  country?: string;
  major?: boolean;
  /** Map-space offset applied after projection, to keep short routes readable. */
  nudge?: [number, number];
}
interface SourceRoute {
  from: string;
  to: string;
  length: number;
  /** One color per lane; "auto" picks the least-used card color. */
  colors: (RouteColor | 'auto')[];
  kind?: 'normal' | 'tunnel' | 'ferry';
  ferryLocomotives?: number;
  /** Bend points as [lat, lon]. */
  path?: [number, number][];
}
interface SourceTicket {
  from: string;
  to: string;
  points: number | 'auto';
  deck?: 'regular' | 'long';
}

/**
 * Two projections:
 * - "image": the board is a background picture in an equirectangular projection. Pixel position is
 *   x = x0 + sx * (lon - lon0), y = y0 - sy * (lat - lat0); fit those numbers with fit-image.py.
 *   Map space spans the image, scaled to `width` units wide.
 * - "conic" (default): conic conformal fitted to `bounds`, with generated low-poly terrain.
 */
interface ImageProjection {
  kind: 'image';
  src: string;
  pixelWidth: number;
  pixelHeight: number;
  lon0: number;
  lat0: number;
  x0: number;
  y0: number;
  sx: number;
  sy: number;
  surround?: string;
}

export type BuildResult =
  | { ok: true; map: MapInput; report: string[] }
  | { ok: false; map: MapInput; errors: ValidationIssue[]; report: string[] };

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Build a playable map from lat/lon sources (KTD6). This seeds a map; after that the map editor
 * edits the map file directly.
 */
export function buildMap(sourceDir: string): BuildResult {
  const read = (name: string) => JSON.parse(readFileSync(resolve(sourceDir, name), 'utf8'));
  const meta = read('meta.json');
  const sourceCities: SourceCity[] = read('cities.json');
  const sourceRoutes: SourceRoute[] = read('routes.json');
  const sourceTickets: SourceTicket[] = read('tickets.json');
  const landSource = read('land.geojson');
  const lakeSource = read('lakes.geojson');

  const width: number = meta.width;
  const imageProjection: ImageProjection | null = meta.projection.kind === 'image' ? meta.projection : null;
  let projectRaw: (lon: number, lat: number) => Pt;
  let height: number;
  if (imageProjection) {
    const p = imageProjection;
    const scale = width / p.pixelWidth;
    projectRaw = (lon, lat) => [(p.x0 + p.sx * (lon - p.lon0)) * scale, (p.y0 - p.sy * (lat - p.lat0)) * scale];
    height = Math.round(p.pixelHeight * scale * 10) / 10;
  } else {
    const { west, east, south, north } = meta.bounds;
    const margin: number = meta.margin;
    const boundary: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      boundary.push([west + (east - west) * t, south], [west + (east - west) * t, north]);
      boundary.push([west, south + (north - south) * t], [east, south + (north - south) * t]);
    }
    const projection = geoConicConformal()
      .parallels(meta.projection.parallels)
      .rotate([-meta.projection.rotate, 0])
      .fitWidth(width - 2 * margin, { type: 'MultiPoint', coordinates: boundary });
    projectRaw = (lon, lat) => {
      const q = projection([lon, lat]);
      if (!q) throw new Error(`cannot project ${lat}, ${lon}`);
      return [q[0] + margin, q[1] + margin];
    };
    height = Math.ceil(Math.max(...boundary.map(([lon, lat]) => projectRaw(lon, lat)[1])) + margin);
  }
  const project = (lon: number, lat: number): Pt => {
    const [x, y] = projectRaw(lon, lat);
    return [round(x), round(y)];
  };

  // Cities.
  const cities = sourceCities.map((c) => {
    const [x, y] = project(c.lon, c.lat);
    return {
      id: c.id,
      name: c.name,
      x: round(x + (c.nudge?.[0] ?? 0)),
      y: round(y + (c.nudge?.[1] ?? 0)),
      geo: { lat: c.lat, lon: c.lon },
      country: c.country,
      major: c.major ?? false,
    };
  });

  // Routes, with automatic colors balanced by trains per color.
  const trainsByColor = new Map<CardColor, number>(CARD_COLORS.map((c) => [c, 0]));
  for (const r of sourceRoutes) {
    for (const color of r.colors) {
      if (color !== 'auto' && color !== 'gray') trainsByColor.set(color, trainsByColor.get(color)! + r.length);
    }
  }
  const routes: MapInput['routes'] = [];
  for (const r of sourceRoutes) {
    const base = `${r.from}-${r.to}`;
    const lanes = r.colors.length;
    const used = new Set<RouteColor>(r.colors.filter((c): c is RouteColor => c !== 'auto'));
    r.colors.forEach((wanted, i) => {
      let color: RouteColor;
      if (wanted === 'auto') {
        const pick = [...CARD_COLORS]
          .filter((c) => !used.has(c))
          .sort((a, b) => trainsByColor.get(a)! - trainsByColor.get(b)!)[0]!;
        trainsByColor.set(pick, trainsByColor.get(pick)! + r.length);
        used.add(pick);
        color = pick;
      } else {
        color = wanted;
      }
      routes.push({
        id: lanes > 1 ? `${base}-${i + 1}` : base,
        from: r.from,
        to: r.to,
        length: r.length,
        color,
        kind: r.kind ?? 'normal',
        ferryLocomotives: r.ferryLocomotives ?? 0,
        ...(lanes > 1 ? { parallelGroup: base } : {}),
        ...(r.path
          ? {
              path: r.path.map(([lat, lon]) => {
                const [x, y] = project(lon, lat);
                return { x, y };
              }),
            }
          : {}),
      });
    });
  }

  // Terrain: project and simplify in map units. Polygons may extend past the map edge.
  const terrainRings = (fc: { features: { geometry: { coordinates: Pt[][] } }[] }, minArea: number) => {
    const out: [number, number][][] = [];
    for (const f of fc.features) {
      const ring = f.geometry.coordinates[0]!.slice(0, -1).map(([lon, lat]) => projectRaw(lon, lat));
      const simple = simplifyRing(ring, 1.2).map(([x, y]) => [round(x), round(y)] as [number, number]);
      if (simple.length >= 3 && ringArea(simple) >= minArea) out.push(simple);
    }
    return out;
  };
  const land = terrainRings(landSource, 30);
  const lakes = terrainRings(lakeSource, 40);

  // Tickets: "auto" points come from the shortest path in trains.
  const draft: MapInput = {
    schemaVersion: MAP_SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    author: meta.author,
    description: meta.description,
    width,
    height,
    cities,
    routes,
    tickets: [{ id: 'draft', from: cities[0]!.id, to: cities[1]!.id, points: 1 }],
    terrain: {
      land,
      lakes,
      ...(imageProjection
        ? {
            image: {
              src: imageProjection.src,
              x: 0,
              y: 0,
              width,
              height,
              ...(imageProjection.surround ? { surround: imageProjection.surround } : {}),
            },
          }
        : {}),
    },
  };
  const draftIndex = indexMap(MapSchema.parse(draft));
  const tickets = sourceTickets.map((t) => {
    const points = t.points === 'auto' ? suggestTicketPoints(draftIndex, t.from, t.to) : t.points;
    if (points === null) throw new Error(`ticket ${t.from}-${t.to}: cities are not connected`);
    return { id: `${t.from}-${t.to}`, from: t.from, to: t.to, points, deck: t.deck ?? 'regular' };
  });
  const map: MapInput = { ...draft, tickets };

  const result = validateMap(map);
  if (!result.ok) return { ok: false, map, errors: result.errors, report: [] };

  // Readability report for routes without placed slots: map units per train should stay between
  // 0.6x and 2x the median.
  const cityAt = new Map(result.map.cities.map((c) => [c.id, c]));
  const perTrain = result.map.routes
    .filter((r) => !r.slots)
    .map((r) => {
      const pts = [cityAt.get(r.from)!, ...(r.path ?? []), cityAt.get(r.to)!];
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      return { id: r.id, ratio: d / r.length };
    });
  const sorted = perTrain.map((p) => p.ratio).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const outliers = perTrain.filter((p) => p.ratio < median * 0.6 || p.ratio > median * 2);

  const { stats } = result;
  const report = [
    `${stats.cityCount} cities, ${stats.routeCount} routes, ${stats.totalTrains} trains, ${stats.tickets.regular} regular + ${stats.tickets.long} long tickets`,
    `trains per color: ${CARD_COLORS.map((c) => `${c} ${stats.byColor[c].trains}`).join(', ')}, gray ${stats.byColor.gray.trains}`,
    `terrain: ${land.length} land, ${lakes.length} lakes`,
    `median map units per train: ${median.toFixed(1)}`,
    ...outliers.map((o) => `  outlier ${o.id}: ${o.ratio.toFixed(1)} per train (${(o.ratio / median).toFixed(2)}x)`),
    `long tickets: ${tickets
      .filter((t) => t.deck === 'long')
      .map((t) => `${t.id} ${t.points}`)
      .join(', ')}`,
  ];
  return { ok: true, map, report };
}

export function writeMap(outFile: string, map: MapInput): void {
  writeFileSync(outFile, JSON.stringify(map, null, 1) + '\n');
}
