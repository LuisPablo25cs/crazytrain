import * as THREE from 'three';

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

const circle = (r: number, n = 20): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export const PLAYER_MARKS: MarkShape[] = [
  { outlines: [circle(0.55)] }, // dot
  { outlines: [rect(-0.85, -0.28, 0.85, 0.28)] }, // bar
  { outlines: [[[0, -0.8], [0.8, 0], [0, 0.8], [-0.8, 0]]] }, // diamond
  { outlines: [rect(-0.6, -0.65, -0.18, 0.65), rect(0.18, -0.65, 0.6, 0.65)] }, // twin bars
  { outlines: [[[0.8, 0], [-0.6, 0.7], [-0.6, -0.7]]] }, // triangle, pointing along the car
  { outlines: [circle(0.75)], holes: [circle(0.38).reverse()] }, // ring
  {
    outlines: [
      [
        [-0.22, -0.75], [0.22, -0.75], [0.22, -0.22], [0.75, -0.22], [0.75, 0.22], [0.22, 0.22],
        [0.22, 0.75], [-0.22, 0.75], [-0.22, 0.22], [-0.75, 0.22], [-0.75, -0.22], [-0.22, -0.22],
      ],
    ],
  }, // plus
];

export function markOf(player: number): MarkShape {
  return PLAYER_MARKS[player % PLAYER_MARKS.length]!;
}

/** SVG path data for a mark in a 0..size box (y down). */
export function markPath(player: number, size = 16): string {
  const m = markOf(player);
  const k = size / 2;
  const ring = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(k + x * k).toFixed(2)} ${(k - y * k).toFixed(2)}`).join(' ') + ' Z';
  return [...m.outlines, ...(m.holes ?? [])].map(ring).join(' ');
}

/** A flat mesh geometry for a mark, lying on the ground plane (XZ), x along the car. */
export function markGeometry(player: number): THREE.BufferGeometry {
  const m = markOf(player);
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
