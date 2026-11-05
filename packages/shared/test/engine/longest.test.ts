import { describe, expect, it } from 'vitest';
import { longestTrail, longestTrailPath } from '../../src/index.js';

const e = (from: string, to: string, length: number) => ({ from, to, length });

describe('longestTrail', () => {
  it('returns 0 for no routes', () => {
    expect(longestTrail([])).toBe(0);
  });

  it('follows a simple path', () => {
    expect(longestTrail([e('a', 'b', 2), e('b', 'c', 3)])).toBe(5);
  });

  it('counts every route of a loop once, plus a branch (A-B-C-A-D)', () => {
    expect(longestTrail([e('a', 'b', 2), e('b', 'c', 3), e('c', 'a', 4), e('a', 'd', 1)])).toBe(10);
  });

  it('picks the best branch at a fork', () => {
    expect(longestTrail([e('a', 'b', 1), e('b', 'c', 5), e('b', 'd', 2), e('d', 'e', 1)])).toBe(8);
  });

  it('handles disconnected pieces', () => {
    expect(longestTrail([e('a', 'b', 6), e('x', 'y', 2), e('y', 'z', 2)])).toBe(6);
  });
});

describe('longestTrailPath', () => {
  it('returns the edges of a best trail', () => {
    const edges = [e('a', 'b', 1), e('b', 'c', 5), e('b', 'd', 2), e('d', 'e', 1)];
    const best = longestTrailPath(edges);
    expect(best.length).toBe(8);
    expect(best.edges.map((i) => edges[i]!.length).reduce((a, b) => a + b, 0)).toBe(8);
    expect(new Set(best.edges)).toEqual(new Set([1, 2, 3]));
  });
});
