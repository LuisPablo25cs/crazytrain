import { describe, expect, it } from 'vitest';
import { latticeTriangles, ScanlineClassifier } from './terrainMesh.js';

const square: [number, number][] = [[10, 10], [90, 10], [90, 90], [10, 90]];
const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60]];

describe('ScanlineClassifier', () => {
  it('tells inside from outside with the even-odd rule', () => {
    const c = new ScanlineClassifier([square]);
    expect(c.inside(50, 50)).toBe(true);
    expect(c.inside(5, 50)).toBe(false);
    expect(c.inside(95, 50)).toBe(false);
  });

  it('works for a concave shape', () => {
    const u: [number, number][] = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]];
    const c = new ScanlineClassifier([u]);
    expect(c.inside(5, 20)).toBe(true);
    expect(c.inside(15, 20)).toBe(false);
    expect(c.inside(25, 20)).toBe(true);
  });
});

describe('latticeTriangles', () => {
  it('keeps only land triangles and marks lakes', () => {
    const tris = latticeTriangles(100, 100, [square], [hole], 5, 0);
    expect(tris.length).toBeGreaterThan(0);
    expect(tris.some((t) => t.kind === 'lake')).toBe(true);
    for (const t of tris) {
      const cx = (t.corners[0][0] + t.corners[1][0] + t.corners[2][0]) / 3;
      const cy = (t.corners[0][1] + t.corners[1][1] + t.corners[2][1]) / 3;
      expect(cx).toBeGreaterThanOrEqual(10);
      expect(cx).toBeLessThanOrEqual(90);
      expect(cy).toBeGreaterThanOrEqual(10);
      expect(cy).toBeLessThanOrEqual(90);
      const inHole = cx >= 40 && cx <= 60 && cy >= 40 && cy <= 60;
      if (t.kind === 'lake') expect(inHole).toBe(true);
    }
  });
});
