import { describe, expect, it } from 'vitest';
import { indexMap, MapSchema, type MapInput } from '@rails/shared';
import { DEFAULT_SLOT_OPTIONS, laneOffset, slotTransforms } from './geometry.js';

function mapWith(routes: MapInput['routes']) {
  return indexMap(
    MapSchema.parse({
      schemaVersion: 1,
      id: 'geo',
      name: 'Geometry',
      height: 200,
      cities: [
        { id: 'a', name: 'A', x: 0, y: 0 },
        { id: 'b', name: 'B', x: 100, y: 0 },
        { id: 'c', name: 'C', x: 0, y: 100 },
      ],
      routes,
      tickets: [{ id: 't', from: 'a', to: 'b', points: 1 }],
    }),
  );
}

const opts = { ...DEFAULT_SLOT_OPTIONS, cityRadius: 10, gap: 2 };

describe('slotTransforms', () => {
  it('spaces 4 slots evenly between the city edges of a straight route', () => {
    const map = mapWith([{ id: 'ab', from: 'a', to: 'b', length: 4, color: 'red' }]);
    const slots = slotTransforms(map.routes.get('ab')!, map, opts);
    expect(slots).toHaveLength(4);
    // Usable length is 100 - 2 * 10 = 80, so 20 per slot, centered at 20, 40, 60, 80.
    expect(slots.map((s) => Math.round(s.x))).toEqual([20, 40, 60, 80]);
    for (const s of slots) {
      expect(s.y).toBeCloseTo(0);
      expect(s.angle).toBeCloseTo(0);
      expect(s.length).toBeCloseTo(18);
    }
  });

  it('follows a bend point across both segments and keeps the total length', () => {
    const map = mapWith([{ id: 'cb', from: 'c', to: 'b', length: 4, color: 'red', path: [{ x: 100, y: 100 }] }]);
    const slots = slotTransforms(map.routes.get('cb')!, map, opts);
    // Polyline C(0,100) -> (100,100) -> B(100,0): 200 long, 180 after trimming, 45 per slot.
    expect(slots[0]!.y).toBeCloseTo(100);
    expect(slots[0]!.angle).toBeCloseTo(0);
    expect(slots[3]!.x).toBeCloseTo(100);
    expect(slots[3]!.angle).toBeCloseTo(-Math.PI / 2);
    expect(slots[0]!.length).toBeCloseTo(43);
  });

  it('gives two lanes of a group mirrored, non-overlapping offsets', () => {
    const map = mapWith([
      { id: 'ab-1', from: 'a', to: 'b', length: 2, color: 'red', parallelGroup: 'ab' },
      { id: 'ab-2', from: 'b', to: 'a', length: 2, color: 'blue', parallelGroup: 'ab' },
    ]);
    const one = slotTransforms(map.routes.get('ab-1')!, map, opts);
    const two = slotTransforms(map.routes.get('ab-2')!, map, opts);
    expect(one[0]!.y).toBeCloseTo(-two[0]!.y);
    expect(Math.abs(one[0]!.y - two[0]!.y)).toBeCloseTo(opts.laneSpacing);
  });

  it('puts the middle of three lanes on the center line', () => {
    const map = mapWith([
      { id: 'ab-1', from: 'a', to: 'b', length: 1, color: 'red', parallelGroup: 'ab' },
      { id: 'ab-2', from: 'a', to: 'b', length: 1, color: 'blue', parallelGroup: 'ab' },
      { id: 'ab-3', from: 'a', to: 'b', length: 1, color: 'green', parallelGroup: 'ab' },
    ]);
    const offsets = ['ab-1', 'ab-2', 'ab-3'].map((id) => laneOffset(map.routes.get(id)!, map, 5));
    expect(offsets).toEqual([-5, 0, 5]);
    const ys = ['ab-1', 'ab-2', 'ab-3'].map((id) => slotTransforms(map.routes.get(id)!, map, opts)[0]!.y);
    expect(new Set(ys.map((y) => Math.round(y))).size).toBe(3);
    expect(ys[1]).toBeCloseTo(0);
  });
});
