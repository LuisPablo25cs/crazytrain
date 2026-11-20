import * as THREE from 'three';
import { PLAYER_SIGNS, isCharSign, signChar, type PlayerSign } from '@rails/shared';

/**
 * Each seat has a roof mark as well as a color, so a train's owner never depends on color alone.
 * The same shapes are drawn on the plaques (as SVG) and on every car roof (as flat meshes).
 * Points are in a -1..1 square; x runs along the car.
 */
export interface MarkShape {
  /** Outer outlines, each a closed polygon. */
  outlines: [number, number][][];
  /** Holes cut out of the first outline. */
  holes?: [number, number][][];
}

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

type Pt = [number, number];
const circleAt = (cx: number, cy: number, r: number, n = 20): Pt[] =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);
const rotate = (pts: Pt[], a: number): Pt[] =>
  pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
const area = (pts: Pt[]) => pts.reduce((sum, [x, y], i) => {
  const [x2, y2] = pts[(i + 1) % pts.length]!;
  return sum + x * y2 - x2 * y;
}, 0);
/** Outlines counter-clockwise, holes clockwise: overlapping outlines then fill solid (nonzero rule). */
const ccw = (pts: Pt[]) => (area(pts) < 0 ? [...pts].reverse() : pts);
const cw = (pts: Pt[]) => (area(pts) > 0 ? [...pts].reverse() : pts);

const PLUS: Pt[] = [
  [-0.22, -0.75], [0.22, -0.75], [0.22, -0.22], [0.75, -0.22], [0.75, 0.22], [0.22, 0.22],
  [0.22, 0.75], [-0.22, 0.75], [-0.22, 0.22], [-0.75, 0.22], [-0.75, -0.22], [-0.22, -0.22],
];

function star(points: number, outer: number, inner: number): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });
}

function heart(): Pt[] {
  return Array.from({ length: 36 }, (_, i) => {
    const t = (i / 36) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [x / 18, y / 18 + 0.12] as Pt;
  });
}

/** A crescent: the big circle with a smaller offset circle bitten out of it. */
function moon(): Pt[] {
  const R = 0.82;
  const c: Pt = [0.36, 0.2];
  const r = 0.66;
  const inBite = ([x, y]: Pt) => Math.hypot(x - c[0], y - c[1]) < r;
  const inBody = ([x, y]: Pt) => Math.hypot(x, y) < R;
  const n = 96;
  const outer = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * R, Math.sin((i / n) * Math.PI * 2) * R] as Pt);
  const bite = Array.from({ length: n }, (_, i) => [c[0] + Math.cos((i / n) * Math.PI * 2) * r, c[1] + Math.sin((i / n) * Math.PI * 2) * r] as Pt);
  // Start the outer arc just after it leaves the bite, so the kept part is one run.
  const k = outer.findIndex((p, i) => inBite(outer[(i - 1 + n) % n]!) && !inBite(p));
  const arc = [...outer.slice(k), ...outer.slice(0, k)].filter((p) => !inBite(p));
  const j = bite.findIndex((p, i) => !inBody(bite[(i - 1 + n) % n]!) && inBody(p));
  const inner = [...bite.slice(j), ...bite.slice(0, j)].filter(inBody).reverse();
  return [...arc, ...inner];
}

function drop(): Pt[] {
  const r = 0.55;
  const cy = -0.25;
  const arc = Array.from({ length: 24 }, (_, i) => {
    const a = (-30 + (i / 23) * 240) * (Math.PI / 180);
    return [Math.cos(a) * r, cy - Math.sin(a) * r] as Pt;
  });
  return [...arc, [0, 0.88]];
}

const HOURGLASS: Pt[] = [[-0.65, 0.8], [0.65, 0.8], [0.08, 0], [0.65, -0.8], [-0.65, -0.8], [-0.08, 0]];
const shift = (pts: Pt[], dx: number, dy = 0): Pt[] => pts.map(([x, y]) => [x + dx, y + dy]);
const CHEVRON: Pt[] = [[-0.45, -0.75], [-0.1, -0.75], [0.4, 0], [-0.1, 0.75], [-0.45, 0.75], [0.05, 0]];

function lens(): Pt[] {
  const n = 16;
  const right = Array.from({ length: n + 1 }, (_, i) => [0.48 * Math.sin((Math.PI * i) / n), -0.9 + (1.8 * i) / n] as Pt);
  const left = right.slice(1, -1).reverse().map(([x, y]) => [-x, y] as Pt);
  return rotate([...right, ...left], -Math.PI / 4);
}

function gear(): Pt[] {
  return Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2 + Math.PI / 32;
    const r = Math.floor(i / 2) % 2 === 0 ? 0.9 : 0.66;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });
}

/** The shapes, in the order of PLAYER_SIGNS (packages/shared). Points in a -1..1 square, x along the car. */
const SHAPES: Record<PlayerSign, MarkShape> = {
  dot: { outlines: [circleAt(0, 0, 0.55)] },
  bar: { outlines: [rect(-0.85, -0.28, 0.85, 0.28)] },
  diamond: { outlines: [[[0, -0.8], [0.8, 0], [0, 0.8], [-0.8, 0]]] },
  twin: { outlines: [rect(-0.6, -0.65, -0.18, 0.65), rect(0.18, -0.65, 0.6, 0.65)] },
  triangle: { outlines: [[[0.8, 0], [-0.6, 0.7], [-0.6, -0.7]]] },
  ring: { outlines: [circleAt(0, 0, 0.75)], holes: [circleAt(0, 0, 0.38)] },
  plus: { outlines: [PLUS] },
  star: { outlines: [star(5, 0.9, 0.38)] },
  heart: { outlines: [heart()] },
  moon: { outlines: [moon()] },
  bolt: { outlines: [[[0.2, 0.92], [-0.55, -0.06], [-0.06, -0.06], [-0.22, -0.92], [0.58, 0.12], [0.08, 0.12]]] },
  cross: { outlines: [rotate(PLUS, Math.PI / 4)] },
  square: { outlines: [rect(-0.62, -0.62, 0.62, 0.62)] },
  hexagon: { outlines: [rotate(circleAt(0, 0, 0.8, 6), Math.PI / 6)] },
  chevron: { outlines: [[[-0.7, -0.78], [-0.18, -0.78], [0.62, 0], [-0.18, 0.78], [-0.7, 0.78], [0.1, 0]]] },
  crown: { outlines: [[[-0.82, -0.6], [0.82, -0.6], [0.82, 0.6], [0.4, 0.05], [0, 0.75], [-0.4, 0.05], [-0.82, 0.6]]] },
  frame: { outlines: [rect(-0.75, -0.75, 0.75, 0.75)], holes: [rect(-0.38, -0.38, 0.38, 0.38)] },
  trio: { outlines: [circleAt(-0.48, -0.36, 0.3), circleAt(0.48, -0.36, 0.3), circleAt(0, 0.48, 0.3)] },
  drop: { outlines: [drop()] },
  clover: {
    outlines: [circleAt(0, 0.4, 0.33), circleAt(-0.4, -0.04, 0.33), circleAt(0.4, -0.04, 0.33), rect(-0.08, -0.88, 0.08, -0.1)],
  },
  pentagon: { outlines: [rotate(circleAt(0, 0, 0.84, 5), Math.PI / 2)] },
  octagon: { outlines: [rotate(circleAt(0, 0, 0.8, 8), Math.PI / 8)] },
  sparkle: { outlines: [star(4, 0.95, 0.26)] },
  star6: { outlines: [star(6, 0.88, 0.48)] },
  burst: { outlines: [star(8, 0.9, 0.56)] },
  target: { outlines: [circleAt(0, 0, 0.84), circleAt(0, 0, 0.22)], holes: [circleAt(0, 0, 0.54)] },
  half: { outlines: [Array.from({ length: 21 }, (_, i) => [Math.cos((Math.PI * i) / 20) * 0.84, Math.sin((Math.PI * i) / 20) * 0.84 - 0.36] as Pt)] },
  hourglass: { outlines: [HOURGLASS] },
  bowtie: { outlines: [rotate(HOURGLASS, Math.PI / 2)] },
  arrow: { outlines: [[[-0.85, -0.2], [0.2, -0.2], [0.2, -0.62], [0.9, 0], [0.2, 0.62], [0.2, 0.2], [-0.85, 0.2]]] },
  double: { outlines: [shift(CHEVRON, -0.3), shift(CHEVRON, 0.38)] },
  house: { outlines: [[[-0.7, -0.78], [0.7, -0.78], [0.7, 0.12], [0, 0.86], [-0.7, 0.12]]] },
  shield: { outlines: [[[0.72, 0.78], [-0.72, 0.78], [-0.72, 0.05], [-0.5, -0.42], [0, -0.88], [0.5, -0.42], [0.72, 0.05]]] },
  flag: { outlines: [rect(-0.72, -0.88, -0.52, 0.88), [[-0.56, 0.88], [0.82, 0.52], [-0.56, 0.14]]] },
  tree: {
    outlines: [[[0, 0.92], [0.58, 0.22], [-0.58, 0.22]], [[0, 0.5], [0.76, -0.4], [-0.76, -0.4]], rect(-0.14, -0.88, 0.14, -0.36)],
  },
  spade: { outlines: [heart().map(([x, y]) => [x, 0.08 - y] as Pt), [[0, -0.2], [0.34, -0.9], [-0.34, -0.9]]] },
  leaf: { outlines: [lens()] },
  gear: { outlines: [gear()], holes: [circleAt(0, 0, 0.26)] },
  gem: { outlines: [[[0, -0.88], [0.88, 0], [0, 0.88], [-0.88, 0]]], holes: [[[0, -0.38], [0.38, 0], [0, 0.38], [-0.38, 0]]] },
  stripes: { outlines: [rect(-0.82, -0.72, 0.82, -0.4), rect(-0.82, -0.16, 0.82, 0.16), rect(-0.82, 0.4, 0.82, 0.72)] },
};

export const PLAYER_MARKS: MarkShape[] = PLAYER_SIGNS.map((id) => {
  const m = SHAPES[id];
  return { outlines: m.outlines.map(ccw), holes: m.holes?.map(cw) };
});

/** A typed sign's character (`char:A` → `A`), or null for a shape. */
export function typedChar(sign: string | number | undefined): string | null {
  return typeof sign === 'string' && isCharSign(sign) ? signChar(sign) : null;
}

/** Emoji keep their own colors; letters and symbols take the ink color. */
export const isEmoji = (c: string) => /\p{Extended_Pictographic}/u.test(c);

export const GLYPH_FONT = "'Fredoka', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', system-ui, sans-serif";

const glyphs = new Map<string, THREE.CanvasTexture>();
/** A typed character drawn white on transparent, to tint per car (an emoji keeps its colors). */
export function glyphTexture(c: string): THREE.CanvasTexture {
  const hit = glyphs.get(c);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 104px ${GLYPH_FONT}`;
  g.fillText(c, 64, 70, 120);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  glyphs.set(c, tex);
  return tex;
}

/** A flat square lying on the ground plane, the same -1..1 size as the shapes. */
export const glyphPlane = () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

/** A sign by id, or (for a player without one) by player index. */
export function signIndex(sign: string | undefined, player: number): number {
  const i = sign ? PLAYER_SIGNS.indexOf(sign as PlayerSign) : -1;
  return i >= 0 ? i : player % PLAYER_MARKS.length;
}

export function markOf(key: number | string): MarkShape {
  return PLAYER_MARKS[typeof key === 'number' ? key % PLAYER_MARKS.length : signIndex(key, 0)]!;
}

/** SVG path data for a mark in a 0..size box (y down). Draw with fill-rule nonzero. */
export function markPath(key: number | string, size = 16): string {
  const m = markOf(key);
  const k = size / 2;
  const ring = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(k + x * k).toFixed(2)} ${(k - y * k).toFixed(2)}`).join(' ') + ' Z';
  return [...m.outlines, ...(m.holes ?? [])].map(ring).join(' ');
}

/** A flat mesh geometry for a mark, lying on the ground plane (XZ), x along the car. */
export function markGeometry(key: number | string): THREE.BufferGeometry {
  const m = markOf(key);
  const shapes = m.outlines.map((pts, i) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    if (i === 0) for (const h of m.holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  });
  return new THREE.ShapeGeometry(shapes).rotateX(-Math.PI / 2);
}

/** Dark ink on light player colors, ivory on dark ones. */
export function markInk(hex: string): string {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.45 ? '#0a1a20' : '#f4ebd3';
}
