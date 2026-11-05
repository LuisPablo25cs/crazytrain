import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openRing, ringArea, simplifyRing, type Pt } from './geometry.js';

/**
 * Clip and simplify Natural Earth 1:50m land and lakes (public domain) to the map area and write
 * small lon/lat source files. Run once after downloading; see tools/map-build/README.md.
 * Usage: tsx tools/map-build/prepare-terrain.ts <natural-earth-dir> <map-source-dir>
 */
const [neDir, sourceDir] = process.argv.slice(2);
if (!neDir || !sourceDir) {
  console.error('usage: prepare-terrain <natural-earth-dir> <map-source-dir>');
  process.exit(1);
}
const meta = JSON.parse(readFileSync(resolve(sourceDir, 'meta.json'), 'utf8'));
const pad = 4;
const rect = {
  minX: meta.bounds.west - pad,
  maxX: meta.bounds.east + pad,
  minY: meta.bounds.south - pad,
  maxY: meta.bounds.north + pad,
};

interface Geometry {
  type: string;
  coordinates: unknown;
}

function outerRings(geometry: Geometry): Pt[][] {
  if (geometry.type === 'Polygon') return [(geometry.coordinates as Pt[][])[0]!];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as Pt[][][]).map((p) => p[0]!);
  return [];
}

function overlaps(ring: Pt[]): boolean {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return Math.min(...xs) <= rect.maxX && Math.max(...xs) >= rect.minX && Math.min(...ys) <= rect.maxY && Math.max(...ys) >= rect.minY;
}

function prepare(file: string, minArea: number, tolerance: number): Pt[][] {
  const data = JSON.parse(readFileSync(resolve(neDir!, file), 'utf8')) as { features: { geometry: Geometry }[] };
  const rings: Pt[][] = [];
  for (const f of data.features) {
    for (const raw of outerRings(f.geometry)) {
      // Keep whole polygons that overlap the map area. Clipping a concave coastline to a rectangle
      // leaves overlapping edges that break triangulation, and the renderer does not need it.
      const ring = openRing(raw);
      if (!overlaps(ring) || ringArea(ring) < minArea) continue;
      const simple = simplifyRing(ring, tolerance).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as Pt);
      if (simple.length >= 3) rings.push(simple);
    }
  }
  return rings;
}

function write(name: string, rings: Pt[][]): void {
  const fc = {
    type: 'FeatureCollection',
    features: rings.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...r, r[0]]] } })),
  };
  writeFileSync(resolve(sourceDir!, name), JSON.stringify(fc) + '\n');
  console.log(`${name}: ${rings.length} polygons, ${rings.reduce((n, r) => n + r.length, 0)} points`);
}

write('land.geojson', prepare('ne_50m_land.geojson', 0.05, 0.04));
write('lakes.geojson', prepare('ne_50m_lakes.geojson', 0.35, 0.04));
