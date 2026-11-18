import { describe, expect, it } from 'vitest';
import { indexMap, suggestTicketPoints, validateMap } from '../src/index.js';
import { looseTiny as fixture } from './helpers.js';

function messages(input: unknown): string[] {
  const result = validateMap(input);
  return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`);
}

describe('validateMap', () => {
  it('accepts the tiny fixture and reports stats', () => {
    const result = validateMap(fixture());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.cityCount).toBe(8);
    expect(result.stats.routeCount).toBe(16);
    expect(result.stats.byColor.gray.routes).toBe(7);
    expect(result.stats.byKind).toEqual({ normal: 13, tunnel: 2, ferry: 1 });
    expect(result.stats.tickets.long).toBe(7);
    expect(result.stats.totalTrains).toBe(
      fixture().routes.reduce((sum, r) => sum + (r.length as number), 0),
    );
  });

  it('names the route and the missing city when an endpoint does not exist', () => {
    const map = fixture();
    map.routes[0]!.to = 'nowhere';
    const errs = messages(map).filter((m) => m.includes('missing city'));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('alpha-bravo-1');
    expect(errs[0]).toContain('nowhere');
  });

  it('rejects a ferry that needs more locomotives than its length', () => {
    const map = fixture();
    const ferry = map.routes.find((r) => r.id === 'foxtrot-hotel')!;
    ferry.length = 2;
    ferry.ferryLocomotives = 3;
    expect(messages(map).some((m) => m.includes('needs 3 locomotives but is only 2 long'))).toBe(true);
  });

  it('rejects parallel lanes with different lengths', () => {
    const map = fixture();
    map.routes.find((r) => r.id === 'alpha-bravo-2')!.length = 3;
    expect(messages(map).some((m) => m.includes('different lengths'))).toBe(true);
  });

  it('reports unreachable cities when the map has two islands', () => {
    const map = fixture();
    map.cities.push({ id: 'island-a', name: 'Island A', x: 10, y: 10 }, { id: 'island-b', name: 'Island B', x: 20, y: 20 });
    map.routes.push({ id: 'island-link', from: 'island-a', to: 'island-b', length: 1, color: 'gray' });
    const errs = messages(map).filter((m) => m.includes('not connected'));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('island-a');
    expect(errs[0]).toContain('island-b');
  });

  it('fails when the one ticket deck cannot deal to 7 players', () => {
    const map = fixture();
    const have = map.tickets.length;
    const needed = 7 * 4;
    map.tickets = map.tickets.slice(0, Math.min(have, needed) - 3);
    expect(messages(map).some((m) => m.includes(`needs at least ${needed} tickets`))).toBe(true);
  });

  it('rejects a route of length 11 when the scoring table stops at 10', () => {
    const map = fixture();
    map.routes.find((r) => r.id === 'delta-hotel')!.length = 11;
    expect(messages(map).some((m) => m.includes('length 11') && m.includes('stops at 10'))).toBe(true);
  });

  it('reports schema errors with a path', () => {
    const map = fixture();
    (map.routes[2] as Record<string, unknown>).color = 'pink';
    const errs = messages(map);
    expect(errs.some((m) => m.startsWith('routes[2].color'))).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const map = fixture();
    map.routes[1]!.id = 'alpha-bravo-1';
    expect(messages(map).some((m) => m.includes('duplicate route id'))).toBe(true);
  });
});

describe('terrain.image', () => {
  const withImage = (src: string) => {
    const map = fixture();
    map.terrain = { ...(map.terrain as object), image: { src, width: 800, height: 500 } };
    return map;
  };

  it('accepts a /maps/ file or a data:image URI', () => {
    expect(validateMap(withImage('/maps/board.jpg')).ok).toBe(true);
    expect(validateMap(withImage('data:image/png;base64,iVBORw0KGgo=')).ok).toBe(true);
  });

  it('rejects images from other sites or other paths', () => {
    for (const src of ['https://example.com/board.jpg', '/etc/passwd', '/maps/../secret.png', 'javascript:alert(1)']) {
      const result = validateMap(withImage(src));
      expect(result.ok, src).toBe(false);
      expect(result.errors.some((e) => e.path === 'terrain.image.src'), src).toBe(true);
    }
  });
});

describe('suggestTicketPoints', () => {
  it('returns the shortest path length in trains', () => {
    const result = validateMap(fixture());
    if (!result.ok) throw new Error('fixture invalid');
    const index = indexMap(result.map);
    // alpha -> bravo (2) -> echo (2) -> foxtrot (2) = 6; alpha -> delta -> echo is 5 + 2 = 7.
    expect(suggestTicketPoints(index, 'alpha', 'foxtrot')).toBe(6);
    expect(suggestTicketPoints(index, 'golf', 'hotel')).toBe(1);
  });
});
