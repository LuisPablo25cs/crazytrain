import { describe, expect, it } from 'vitest';
import { MapSchema, type MapDefinition } from '@rails/shared';
import tiny from '../../../../packages/shared/test/fixtures/tiny.map.json' with { type: 'json' };
import { indexDoc, setRouteBend } from '../editor/mapOps.js';
import { arcMiddle, arcPoints, clampBend, routePolyline, slotTransforms } from './geometry.js';

const A = { x: 0, y: 0 };
const B = { x: 100, y: 0 };
const base = (): MapDefinition => MapSchema.parse(structuredClone(tiny));

describe('arcPoints', () => {
  it('is just the two cities when there is no bend', () => {
    expect(arcPoints(A, B, 0)).toEqual([A, B]);
  });

  it('is a true circle: every point is the same distance from the center, and the middle is the bend away', () => {
    const points = arcPoints(A, B, 20);
    expect(points[0]).toEqual(A);
    expect(points.at(-1)).toEqual(B);
    // Chord 100, bend 20: radius = 100² / (8 × 20) + 20 / 2 = 72.5, center at (50, -52.5).
    for (const p of points) expect(Math.hypot(p.x - 50, p.y + 52.5)).toBeCloseTo(72.5, 6);
    const middle = points[points.length >> 1]!;
    expect(middle.x).toBeCloseTo(50, 6);
    expect(middle.y).toBeCloseTo(20, 6);
    expect(arcMiddle(A, B, 20)).toEqual({ x: 50, y: 20 });
  });

  it('bends to the other side with a negative value', () => {
    expect(arcPoints(A, B, -20)[16]!.y).toBeCloseTo(-20, 6);
    expect(arcMiddle(A, B, -20)).toEqual({ x: 50, y: -20 });
  });

  it('keeps its direction when the cities run the other way, so the side flips', () => {
    expect(arcPoints(B, A, 20)[16]!.y).toBeCloseTo(-20, 6);
  });
});

describe('clampBend', () => {
  it('limits the bend to 45% of the distance between the cities', () => {
    expect(clampBend(A, B, 80)).toBe(45);
    expect(clampBend(A, B, -80)).toBe(-45);
  });

  it('snaps tiny bends to a straight line', () => {
    expect(clampBend(A, B, 0.3)).toBe(0);
    expect(clampBend(A, B, 12.34)).toBe(12.3);
  });
});

describe('bent routes', () => {
  const ROUTE = 'bravo-charlie'; // bravo (300, 100) to charlie (500, 100), 3 slots

  it('draws the route along the arc instead of its bend points', () => {
    const doc = setRouteBend(base(), ROUTE, 30);
    const index = indexDoc(doc);
    const line = routePolyline(index.routes.get(ROUTE)!, index);
    expect(line.length).toBeGreaterThan(10);
    expect(line[line.length >> 1]!.y).toBeCloseTo(130, 4);
  });

  it('places slots along the curve, turning with it', () => {
    const doc = setRouteBend(base(), ROUTE, 30);
    const index = indexDoc(doc);
    const slots = slotTransforms(index.routes.get(ROUTE)!, index);
    // The middle slot is at the top of the arc, the outer slots are higher up and tilted.
    expect(slots[1]!.y).toBeGreaterThan(slots[0]!.y);
    expect(slots[1]!.angle).toBeCloseTo(0, 1);
    expect(slots[0]!.angle).toBeGreaterThan(0.1);
    expect(slots[2]!.angle).toBeLessThan(-0.1);
  });

  it('leaves an unbent route straight', () => {
    const index = indexDoc(base());
    const slots = slotTransforms(index.routes.get(ROUTE)!, index);
    expect(new Set(slots.map((s) => Math.round(s.y)))).toEqual(new Set([100]));
  });
});

describe('setRouteBend', () => {
  it('bends every lane of a route, mirrored for a lane that runs the other way', () => {
    const doc = base();
    const lane = doc.routes.find((r) => r.id === 'alpha-bravo-2')!;
    [lane.from, lane.to] = [lane.to, lane.from];
    const bent = setRouteBend(doc, 'alpha-bravo-1', 12);
    expect(bent.routes.find((r) => r.id === 'alpha-bravo-1')!.bend).toBe(12);
    expect(bent.routes.find((r) => r.id === 'alpha-bravo-2')!.bend).toBe(-12);
    // Both lanes curve to the same side of the map.
    const index = indexDoc(bent);
    const middleY = (id: string) => {
      const line = routePolyline(index.routes.get(id)!, index);
      return line[line.length >> 1]!.y;
    };
    expect(middleY('alpha-bravo-1')).toBeCloseTo(middleY('alpha-bravo-2'), 4);
  });

  it('drops hand-placed slots so they follow the curve, and straightens with zero', () => {
    const doc = base();
    doc.routes.find((r) => r.id === 'bravo-charlie')!.slots = [
      { x: 330, y: 100, angle: 0 },
      { x: 400, y: 100, angle: 0 },
      { x: 470, y: 100, angle: 0 },
    ];
    const bent = setRouteBend(doc, 'bravo-charlie', 25);
    expect(bent.routes.find((r) => r.id === 'bravo-charlie')).toMatchObject({ bend: 25 });
    expect(bent.routes.find((r) => r.id === 'bravo-charlie')!.slots).toBeUndefined();
    const straight = setRouteBend(bent, 'bravo-charlie', 0);
    expect(straight.routes.find((r) => r.id === 'bravo-charlie')!.bend).toBeUndefined();
  });
});
