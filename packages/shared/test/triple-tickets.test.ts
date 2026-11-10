import { describe, expect, it } from 'vitest';
import { indexMap, suggestTicketPoints, ticketCities, ticketDone, UnionFind, validateMap } from '../src/index.js';
import { looseTiny, tinyIndex } from './helpers.js';

function network(edges: [string, string][]): UnionFind {
  const uf = new UnionFind();
  for (const [a, b] of edges) uf.union(a, b);
  return uf;
}

describe('triple tickets', () => {
  const triple = { from: 'alpha', via: 'bravo', to: 'charlie' };

  it('lists the cities in reading order', () => {
    expect(ticketCities(triple)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(ticketCities({ from: 'alpha', to: 'charlie' })).toEqual(['alpha', 'charlie']);
  });

  it('is not done until the network joins all three cities', () => {
    expect(ticketDone(network([['alpha', 'bravo']]), triple)).toBe(false);
    expect(ticketDone(network([['bravo', 'charlie']]), triple)).toBe(false);
    expect(ticketDone(network([['alpha', 'bravo'], ['bravo', 'charlie']]), triple)).toBe(true);
    // Any order of connecting works: the middle city need not sit between the others.
    expect(ticketDone(network([['alpha', 'charlie'], ['charlie', 'bravo']]), triple)).toBe(true);
  });

  it('keeps two-city tickets working as before', () => {
    expect(ticketDone(network([['alpha', 'charlie']]), { from: 'alpha', to: 'charlie' })).toBe(true);
    expect(ticketDone(network([['alpha', 'bravo']]), { from: 'alpha', to: 'charlie' })).toBe(false);
  });

  it('suggests points from the cheapest way to join the three cities', () => {
    const index = tinyIndex();
    // alpha-bravo 2, bravo-charlie 3, alpha-charlie 5: the two shortest gaps add to 5.
    expect(suggestTicketPoints(index, 'alpha', 'charlie', 'bravo')).toBe(5);
    expect(suggestTicketPoints(index, 'alpha', 'charlie')).toBe(5);
  });

  it('validates the third city', () => {
    const map = looseTiny();
    map.tickets.push({ id: 'trip', from: 'alpha', to: 'charlie', via: 'bravo', points: 5 });
    expect(validateMap(map).ok).toBe(true);
    map.tickets.push({ id: 'ghost', from: 'alpha', to: 'charlie', via: 'nowhere', points: 5 });
    map.tickets.push({ id: 'twice', from: 'alpha', to: 'charlie', via: 'alpha', points: 5 });
    const result = validateMap(map);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.errors.map((e) => e.message).join('\n');
    expect(text).toContain('missing city "nowhere"');
    expect(text).toContain('same city twice');
    expect(indexMap(looseTiny() as never).cities.size).toBeGreaterThan(0);
  });
});
