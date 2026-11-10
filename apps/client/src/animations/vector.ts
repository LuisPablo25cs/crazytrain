/** Small drawing and math helpers shared by the animations. */

export const TAU = Math.PI * 2;
export type Pt = [number, number];
export type Ctx = CanvasRenderingContext2D;

/** Seeded random numbers from 0 up to 1 (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
/** The fractional part: 1.25 becomes 0.25, -0.25 becomes 0.75. */
export const wrap = (v: number): number => v - Math.floor(v);
export function smooth(a: number, b: number, v: number): number {
  const k = clamp((v - a) / (b - a));
  return k * k * (3 - 2 * k);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** A color between two `#rrggbb` colors. */
export function mix(a: string, b: string, k: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const part = (i: number) => Math.round(lerp(ca[i]!, cb[i]!, clamp(k))).toString(16).padStart(2, '0');
  return `#${part(0)}${part(1)}${part(2)}`;
}
/** A `#rrggbb` color with opacity. */
export function fade(hex: string, opacity: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${clamp(opacity)})`;
}

/**
 * A wiggle made of sine waves. `f` is how many waves fit across x = 0..1 and `c` how many pass per
 * loop; both are whole numbers, which is what makes the wiggle return exactly to its start.
 */
export interface Wave {
  a: number;
  f: number;
  c: number;
  p: number;
}
export function makeWaves(r: () => number, count: number, maxFreq: number, cycles: number): Wave[] {
  return Array.from({ length: count }, (_, i) => ({
    a: (0.5 + r() * 0.5) / (i + 1),
    f: 1 + Math.floor(r() * maxFreq),
    c: Math.round(r() * cycles),
    p: r() * TAU,
  }));
}
export function waves(list: readonly Wave[], x: number, t: number): number {
  let sum = 0;
  for (const w of list) sum += w.a * Math.sin(TAU * (w.f * x + w.c * t) + w.p);
  return sum;
}

/** Add a smooth curve through the points to the current path. */
export function trace(ctx: Ctx, pts: readonly Pt[], closed = false): void {
  const n = pts.length;
  if (n < 2) return;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (closed) {
    const start = mid(pts[n - 1]!, pts[0]!);
    ctx.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i]!, pts[(i + 1) % n]!);
      ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], m[0], m[1]);
    }
    ctx.closePath();
    return;
  }
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < n - 1; i++) {
    const m = mid(pts[i]!, pts[i + 1]!);
    ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], m[0], m[1]);
  }
  ctx.lineTo(pts[n - 1]![0], pts[n - 1]![1]);
}

/** Fill a shape of straight edges. */
export function polygon(ctx: Ctx, pts: readonly Pt[], fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
}

/** Add a puffy cloud shape to the current path. */
export function puff(ctx: Ctx, x: number, y: number, r: number, turn = 0, lobes = 7): void {
  ctx.moveTo(x + r * 0.72, y);
  ctx.arc(x, y, r * 0.72, 0, TAU);
  for (let i = 0; i < lobes; i++) {
    const a = turn + (i / lobes) * TAU;
    const lobe = r * (0.34 + 0.1 * Math.sin(i * 2.4));
    const px = x + Math.cos(a) * r * 0.66;
    const py = y + Math.sin(a) * r * 0.66;
    ctx.moveTo(px + lobe, py);
    ctx.arc(px, py, lobe, 0, TAU);
  }
}

/** A sky of flat color stripes, top color to bottom color. */
export function skyBands(ctx: Ctx, w: number, h: number, top: string, bottom: string, count = 6, margin = 0): void {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = mix(top, bottom, i / (count - 1));
    ctx.fillRect(-margin, -margin + (i / count) * (h + margin), w + margin * 2, (h + margin) / count + 1);
  }
}

/** Stroke a zigzag bolt from (x, y) heading along `angle`, with a side branch. */
export function bolt(ctx: Ctx, r: () => number, x: number, y: number, angle: number, length: number, color: string, width = 1.6): void {
  const zig = (sx: number, sy: number, a: number, len: number) => {
    let cx = sx;
    let cy = sy;
    ctx.moveTo(cx, cy);
    const steps = 6;
    const pts: Pt[] = [];
    for (let i = 1; i <= steps; i++) {
      const side = (r() - 0.5) * 1.5;
      cx += (Math.cos(a + side) * len) / steps;
      cy += (Math.sin(a + side) * len) / steps;
      ctx.lineTo(cx, cy);
      pts.push([cx, cy]);
    }
    return pts;
  };
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  const main = zig(x, y, angle, length);
  const fork = main[Math.floor(main.length / 2)]!;
  zig(fork[0], fork[1], angle + 0.7, length * 0.45);
  ctx.stroke();
}
