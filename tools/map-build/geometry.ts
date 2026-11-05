export type Pt = [number, number];

function perpendicularDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function douglasPeucker(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  let maxD = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD <= tolerance) return [first, last];
  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** Simplify a closed ring (first point not repeated at the end). */
export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  if (ring.length < 4) return ring;
  // Split at the point farthest from the first one so both halves are open polylines.
  let far = 0;
  let farD = -1;
  ring.forEach((p, i) => {
    const d = Math.hypot(p[0] - ring[0]![0], p[1] - ring[0]![1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const a = douglasPeucker(ring.slice(0, far + 1), tolerance);
  const b = douglasPeucker([...ring.slice(far), ring[0]!], tolerance);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

export function ringArea(ring: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** Drop a repeated closing point, as GeoJSON rings have. */
export function openRing(ring: Pt[]): Pt[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}
